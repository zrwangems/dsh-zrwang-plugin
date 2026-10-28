#!/usr/bin/env python3
"""Run dependency-free source and artifact preflight checks for scientific figures."""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class Finding:
    check: str
    level: str
    message: str
    evidence: list[str]


def result(check: str, level: str, message: str, *evidence: str) -> Finding:
    return Finding(check, level, message, list(evidence))


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")


def detect_backend(path: Path, requested: str) -> str:
    if requested != "auto":
        return requested
    if path.suffix.lower() == ".py":
        return "python"
    if path.suffix.lower() in {".r", ".rmd"}:
        return "r"
    raise ValueError("Cannot infer backend; pass --backend python or r.")


def check_syntax(source: str, backend: str) -> Finding:
    if backend == "python":
        try:
            ast.parse(source)
        except SyntaxError as exc:
            return result("syntax", "FAIL", f"Python syntax error: {exc.msg}", str(exc.lineno))
        return result("syntax", "PASS", "Python source parses successfully")
    if source.count("(") != source.count(")"):
        return result("syntax", "WARN", "R source has unbalanced parentheses")
    return result("syntax", "PASS", "No obvious delimiter imbalance detected")


def check_font(source: str, backend: str) -> Finding:
    patterns = (
        (r"font\.(?:family|sans-serif)|fontfamily\s*=|rcParams",)
        if backend == "python"
        else (r"base_family\s*=|family\s*=|theme_[a-z]+\s*\(",)
    )
    if any(re.search(pattern, source, re.IGNORECASE) for pattern in patterns):
        return result("font", "PASS", "An explicit font strategy is present")
    return result("font", "WARN", "No explicit publication font strategy detected")


def check_exports(source: str) -> list[Finding]:
    lower = source.lower()
    vector = [ext for ext in (".svg", ".pdf") if ext in lower]
    raster = [ext for ext in (".tif", ".tiff", ".png") if ext in lower]
    findings = [
        result(
            "vector-export",
            "PASS" if vector else "WARN",
            "Vector export configured" if vector else "No SVG/PDF export detected",
            *vector,
        ),
        result(
            "raster-export",
            "PASS" if raster else "WARN",
            "Raster export configured" if raster else "No TIFF/PNG export detected",
            *raster,
        ),
    ]
    dpi_values = [int(value) for value in re.findall(r"(?:dpi|res)\s*[:=]\s*(\d+)", source, re.IGNORECASE)]
    if not dpi_values:
        findings.append(result("raster-resolution", "WARN", "No explicit raster resolution detected"))
    elif max(dpi_values) < 300:
        findings.append(result("raster-resolution", "FAIL", "Raster resolution is below 300 dpi", str(max(dpi_values))))
    else:
        findings.append(result("raster-resolution", "PASS", "Raster resolution meets the 300 dpi preflight floor", str(max(dpi_values))))
    return findings


def check_colour(source: str) -> Finding:
    risky = sorted(
        set(
            re.findall(
                r"\b(?:jet|rainbow|gist_rainbow|nipy_spectral|hsv)\b",
                source,
                re.IGNORECASE,
            )
        )
    )
    if risky:
        return result("colour-map", "WARN", "Potentially non-uniform/risky colour map detected", *risky)
    return result("colour-map", "PASS", "No common high-risk colour map detected")


def check_integrity(source: str) -> list[Finding]:
    findings = []
    exclusion_hits = re.findall(
        r"\b(?:dropna|na\.omit|filter\s*\(|query\s*\(|sample\s*\(|head\s*\()",
        source,
        re.IGNORECASE,
    )
    if exclusion_hits:
        findings.append(
            result(
                "data-exclusion",
                "WARN",
                "Data exclusion/subsetting operation detected; record rules and row counts",
                *sorted(set(exclusion_hits)),
            )
        )
    else:
        findings.append(result("data-exclusion", "PASS", "No obvious exclusion/subsetting operation detected"))
    if re.search(r"(?:random_state|set\.seed|np\.random\.seed|default_rng)", source, re.IGNORECASE):
        findings.append(result("randomness", "PASS", "A reproducibility seed or random-state control is present"))
    elif re.search(r"\b(?:random|sample|jitter)\b", source, re.IGNORECASE):
        findings.append(result("randomness", "WARN", "Random operation detected without an obvious seed"))
    return findings


def check_artifact(path: Path) -> Finding:
    if not path.is_file():
        return result("artifact", "FAIL", f"Artifact not found: {path}")
    size = path.stat().st_size
    if size == 0:
        return result("artifact", "FAIL", f"Artifact is empty: {path}")
    level = "WARN" if size < 1024 else "PASS"
    return result("artifact", level, f"{path.name}: {size} bytes", path.suffix.lower())


def validate(source: str, backend: str, artifacts: list[Path]) -> list[Finding]:
    findings = [check_syntax(source, backend), check_font(source, backend), check_colour(source)]
    findings.extend(check_exports(source))
    findings.extend(check_integrity(source))
    findings.extend(check_artifact(path) for path in artifacts)
    return findings


def summary(findings: list[Finding]) -> dict[str, object]:
    counts = {
        level: sum(finding.level == level for finding in findings)
        for level in ("PASS", "WARN", "FAIL")
    }
    return {
        "counts": counts,
        "ready": counts["FAIL"] == 0,
        "findings": [asdict(finding) for finding in findings],
    }


def render(report: dict[str, object], backend: str) -> str:
    lines = [
        "Qinyan Nature figure preflight",
        f"backend={backend} ready={str(report['ready']).lower()} counts={report['counts']}",
    ]
    lines.extend(
        f"[{item['level']}] {item['check']}: {item['message']}"
        for item in report["findings"]
    )
    return "\n".join(lines)


def self_test() -> int:
    good = """
import matplotlib.pyplot as plt
plt.rcParams["font.family"] = "Arial"
fig, ax = plt.subplots()
fig.savefig("figure.svg")
fig.savefig("figure.pdf")
fig.savefig("figure.tiff", dpi=600)
"""
    report = summary(validate(good, "python", []))
    if not report["ready"]:
        raise AssertionError(report)
    print("self-test: PASS")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, help="Python or R plotting source")
    parser.add_argument("--backend", choices=("auto", "python", "r"), default="auto")
    parser.add_argument("--artifact", action="append", type=Path, default=[], help="Rendered artifact to inspect; repeatable")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failure")
    parser.add_argument("--self-test", action="store_true", help="Run built-in checks")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        return self_test()
    if not args.source or not args.source.is_file():
        raise SystemExit("A valid plotting source is required.")
    backend = detect_backend(args.source, args.backend)
    report = summary(validate(read_text(args.source), backend, args.artifact))
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else render(report, backend))
    if report["counts"]["FAIL"] or (args.strict and report["counts"]["WARN"]):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
