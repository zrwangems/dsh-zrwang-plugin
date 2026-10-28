#!/usr/bin/env python3
"""Validate concern identifiers, pointers, and consensus in a review Markdown file."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


FIELD_RE = re.compile(
    r"^\s*(?:[-*]\s*)?(Concern ID|Issue key|Severity|Axis|Claim pointer|"
    r"Evidence pointer|Concern|Why it matters|Resolution test)\s*:\s*(.*?)\s*$",
    re.IGNORECASE,
)
LENS_RE = re.compile(r"^#{1,6}\s+(?:Lens\s+)?([ABC123])\b", re.IGNORECASE)
CONSENSUS_RE = re.compile(r"^#{1,6}\s+Cross-review synthesis\b", re.IGNORECASE)
VALID_SEVERITIES = {"P0", "P1", "P2"}
REQUIRED_FIELDS = {
    "concern id",
    "issue key",
    "severity",
    "axis",
    "claim pointer",
    "evidence pointer",
    "concern",
    "why it matters",
    "resolution test",
}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")


def parse_report(text: str) -> tuple[list[dict[str, object]], bool]:
    records: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    lens = "unassigned"
    has_synthesis = False

    for number, line in enumerate(text.splitlines(), start=1):
        lens_match = LENS_RE.match(line)
        if lens_match:
            lens = lens_match.group(1).upper()
        if CONSENSUS_RE.match(line):
            has_synthesis = True
            lens = "synthesis"
        field_match = FIELD_RE.match(line)
        if not field_match:
            continue
        key = field_match.group(1).lower()
        value = field_match.group(2).strip()
        if key == "concern id":
            if current:
                records.append(current)
            current = {"line": number, "lens": lens}
        if current is not None:
            current[key] = value
    if current:
        records.append(current)
    return records, has_synthesis


def validate(records: list[dict[str, object]], has_synthesis: bool) -> dict[str, object]:
    errors: list[str] = []
    warnings: list[str] = []
    ids = [str(record.get("concern id", "")) for record in records]
    duplicate_ids = [value for value, count in Counter(ids).items() if value and count > 1]
    if duplicate_ids:
        errors.append(f"Duplicate Concern ID(s): {', '.join(duplicate_ids)}")

    by_issue: dict[str, set[str]] = defaultdict(set)
    for record in records:
        concern_id = str(record.get("concern id", f"line {record['line']}"))
        missing = sorted(REQUIRED_FIELDS - set(record))
        if missing:
            errors.append(f"{concern_id} missing field(s): {', '.join(missing)}")
        severity = str(record.get("severity", "")).upper()
        if severity and severity not in VALID_SEVERITIES:
            errors.append(f"{concern_id} has invalid severity: {severity}")
        for pointer in ("claim pointer", "evidence pointer"):
            value = str(record.get(pointer, "")).strip()
            if value.lower() in {"", "none", "n/a", "na"}:
                errors.append(
                    f"{concern_id} has an empty/ambiguous {pointer}; use a location or explicit NOT_* marker"
                )
        issue_key = str(record.get("issue key", "")).strip()
        lens = str(record.get("lens", "unassigned"))
        if issue_key and lens != "synthesis":
            by_issue[issue_key].add(lens)

    consensus_candidates = sorted(
        issue for issue, lenses in by_issue.items() if len(lenses) >= 2
    )
    single_lens_issues = sorted(
        issue for issue, lenses in by_issue.items() if len(lenses) == 1
    )
    if records and not has_synthesis:
        warnings.append("Cross-review synthesis heading was not detected.")
    if len({str(record.get("lens")) for record in records if record.get("lens") not in {"synthesis", "unassigned"}}) < 2:
        warnings.append("Fewer than two review lenses contain structured concerns.")

    return {
        "records": len(records),
        "concern_ids": ids,
        "consensus_candidates": consensus_candidates,
        "single_lens_issues": single_lens_issues,
        "errors": errors,
        "warnings": warnings,
        "valid": not errors,
    }


def render(report: dict[str, object]) -> str:
    lines = [
        "Qinyan Nature review consistency check",
        f"records={report['records']} valid={str(report['valid']).lower()}",
        "consensus candidates:",
    ]
    if report["consensus_candidates"]:
        lines.extend(f"- {item}" for item in report["consensus_candidates"])
    else:
        lines.append("- none")
    for label in ("errors", "warnings"):
        lines.append(f"{label}:")
        if report[label]:
            lines.extend(f"- {item}" for item in report[label])
        else:
            lines.append("- none")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path, help="Review report in Markdown")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failure")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.report.is_file():
        raise SystemExit(f"report file not found: {args.report}")
    records, has_synthesis = parse_report(read_text(args.report))
    report = validate(records, has_synthesis)
    print(
        json.dumps(report, ensure_ascii=False, indent=2)
        if args.json
        else render(report)
    )
    if report["errors"] or (args.strict and report["warnings"]):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
