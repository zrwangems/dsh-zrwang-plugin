#!/usr/bin/env python3
"""Run a dependency-free structural and claim-risk audit on manuscript text."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path


PLACEHOLDER_RE = re.compile(
    r"\b(?:TODO|TBD|XX+|AUTHOR_INPUT_NEEDED)\b|\[(?:insert|add|citation needed)[^\]]*\]",
    re.IGNORECASE,
)
OVERCLAIM_RE = re.compile(
    r"\b(?:first[- ]ever|unprecedented|revolutionary|breakthrough|prove[sd]?|"
    r"universally|always|never|completely|definitively)\b|首次|前所未有|革命性|"
    r"突破性|完全证明|普遍适用",
    re.IGNORECASE,
)
EVIDENCE_RE = re.compile(
    r"(?:Fig(?:ure)?\.?\s*\d|Table\s*\d|Extended Data|Supplementary|"
    r"\[[0-9,\-– ]+\]|\([A-Z][A-Za-z-]+ et al\.,? \d{4}\)|"
    r"\b\d+(?:\.\d+)?\s*(?:%|fold|times|CI|SD|s\.d\.|SEM|s\.e\.m\.)\b)",
    re.IGNORECASE,
)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
EXPECTED_SECTIONS = {
    "abstract": ("abstract", "摘要"),
    "introduction": ("introduction", "引言", "背景"),
    "results": ("results", "结果"),
    "methods": ("methods", "method", "materials and methods", "方法"),
    "discussion": ("discussion", "讨论"),
}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z]+(?:[-'][A-Za-z]+)*|[\u4e00-\u9fff]", text)


def sentences(text: str) -> list[str]:
    return [
        part.strip()
        for part in re.split(r"(?<=[.!?。！？])\s+|(?<=[。！？])", text)
        if part.strip()
    ]


def audit(text: str) -> dict[str, object]:
    lines = text.splitlines()
    headings: list[dict[str, object]] = []
    placeholders: list[dict[str, object]] = []
    risky_claims: list[dict[str, object]] = []

    for number, line in enumerate(lines, start=1):
        heading = HEADING_RE.match(line)
        if heading:
            headings.append(
                {"line": number, "level": len(heading.group(1)), "title": heading.group(2)}
            )
        if PLACEHOLDER_RE.search(line):
            placeholders.append({"line": number, "text": line.strip()[:180]})
        if OVERCLAIM_RE.search(line):
            risky_claims.append(
                {
                    "line": number,
                    "text": line.strip()[:220],
                    "has_evidence_pointer": bool(EVIDENCE_RE.search(line)),
                }
            )

    normalized_headings = " ".join(
        str(item["title"]).lower() for item in headings
    )
    section_presence = {
        section: any(alias in normalized_headings for alias in aliases)
        for section, aliases in EXPECTED_SECTIONS.items()
    }

    sentence_lengths = [len(words(sentence)) for sentence in sentences(text)]
    long_sentences = [
        {"words": len(words(sentence)), "text": sentence[:220]}
        for sentence in sentences(text)
        if len(words(sentence)) > 45
    ]
    tokens = [token.lower() for token in re.findall(r"[A-Za-z][A-Za-z-]{4,}", text)]
    frequent_terms = Counter(tokens).most_common(15)

    blockers = []
    if not text.strip():
        blockers.append("Input is empty.")
    if placeholders:
        blockers.append(f"{len(placeholders)} unresolved placeholder(s) remain.")

    warnings = []
    unsupported = [item for item in risky_claims if not item["has_evidence_pointer"]]
    if unsupported:
        warnings.append(
            f"{len(unsupported)} high-risk claim line(s) lack a nearby evidence pointer."
        )
    if long_sentences:
        warnings.append(f"{len(long_sentences)} sentence(s) exceed 45 tokens.")
    if headings and sum(section_presence.values()) < 3:
        warnings.append("Fewer than three standard manuscript sections were detected.")

    return {
        "summary": {
            "characters": len(text),
            "tokens_approx": len(words(text)),
            "lines": len(lines),
            "headings": len(headings),
            "mean_sentence_tokens": (
                round(sum(sentence_lengths) / len(sentence_lengths), 1)
                if sentence_lengths
                else 0
            ),
        },
        "section_presence": section_presence,
        "headings": headings,
        "placeholders": placeholders,
        "risky_claims": risky_claims,
        "long_sentences": long_sentences,
        "frequent_terms": frequent_terms,
        "blockers": blockers,
        "warnings": warnings,
        "ready": not blockers,
    }


def render_text(report: dict[str, object]) -> str:
    summary = report["summary"]
    lines = [
        "Qinyan Nature manuscript audit",
        f"tokens≈{summary['tokens_approx']} lines={summary['lines']} "
        f"headings={summary['headings']} mean_sentence_tokens={summary['mean_sentence_tokens']}",
        f"ready={str(report['ready']).lower()}",
    ]
    for label in ("blockers", "warnings"):
        items = report[label]
        lines.append(f"{label}:")
        lines.extend(f"- {item}" for item in items) if items else lines.append("- none")
    lines.append("sections:")
    lines.extend(
        f"- {name}: {'yes' if present else 'no'}"
        for name, present in report["section_presence"].items()
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="UTF-8 Markdown or plain-text manuscript")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    parser.add_argument(
        "--strict", action="store_true", help="Return non-zero when warnings remain"
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"input file not found: {args.input}")
    report = audit(read_text(args.input))
    print(
        json.dumps(report, ensure_ascii=False, indent=2)
        if args.json
        else render_text(report)
    )
    if report["blockers"] or (args.strict and report["warnings"]):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
