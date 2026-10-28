#!/usr/bin/env python3
"""Flag high-risk academic style patterns without rewriting the manuscript."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


PATTERNS: dict[str, tuple[str, str]] = {
    "overclaim": (
        r"\b(?:unprecedented|revolutionary|groundbreaking|breakthrough|"
        r"prove[sd]?|universally|definitively|completely)\b|"
        r"前所未有|革命性|突破性|完全证明",
        "Check whether the evidence supports this strength of claim.",
    ),
    "stock_phrase": (
        r"\b(?:delve into|pave(?:s|d)? the way|shed(?:s)? light on|"
        r"paradigm shift|it is worth noting that|in today's rapidly evolving)\b",
        "Replace stock phrasing with the specific scientific relation.",
    ),
    "booster": (
        r"\b(?:remarkably|strikingly|dramatically|extremely|highly|"
        r"very|clearly|obviously)\b",
        "Verify that the intensifier adds evidence rather than promotion.",
    ),
    "significance": (
        r"\bsignificant(?:ly)?\b|显著(?:地)?",
        "Confirm that statistical significance is reported with an identified test.",
    ),
    "transition_density": (
        r"\b(?:Moreover|Furthermore|Additionally|Notably|Interestingly)\b",
        "Check whether the transition states a real logical relation.",
    ),
}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")


def split_sentences(text: str) -> list[str]:
    return [
        value.strip()
        for value in re.split(r"(?<=[.!?。！？])\s+|(?<=[。！？])", text)
        if value.strip()
    ]


def token_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z]+(?:[-'][A-Za-z]+)*|[\u4e00-\u9fff]", text))


def audit(text: str) -> dict[str, object]:
    lines = text.splitlines()
    findings: list[dict[str, object]] = []
    for number, line in enumerate(lines, start=1):
        for check_id, (pattern, advice) in PATTERNS.items():
            matches = sorted(
                {match.group(0) for match in re.finditer(pattern, line, re.IGNORECASE)}
            )
            if matches:
                findings.append(
                    {
                        "check": check_id,
                        "line": number,
                        "matches": matches,
                        "context": line.strip()[:220],
                        "advice": advice,
                    }
                )

    long_sentences = [
        {"tokens": token_count(sentence), "text": sentence[:240]}
        for sentence in split_sentences(text)
        if token_count(sentence) > 45
    ]
    repeated_openers: list[dict[str, object]] = []
    openers: list[str] = []
    for sentence in split_sentences(text):
        match = re.match(r"(?:[\"'“‘(]\s*)?([A-Za-z]+)", sentence)
        openers.append(match.group(1).lower() if match else "")
    for index in range(len(openers) - 2):
        window = openers[index : index + 3]
        if window[0] and len(set(window)) == 1:
            repeated_openers.append(
                {"sentence": index + 1, "opener": window[0], "run": 3}
            )

    counts = {
        check_id: sum(1 for item in findings if item["check"] == check_id)
        for check_id in PATTERNS
    }
    return {
        "summary": {
            "lines": len(lines),
            "sentences": len(split_sentences(text)),
            "tokens_approx": token_count(text),
        },
        "counts": counts,
        "findings": findings,
        "long_sentences": long_sentences,
        "repeated_openers": repeated_openers,
        "note": "Findings require human review; this tool never performs automatic replacement.",
    }


def render(report: dict[str, object]) -> str:
    summary = report["summary"]
    lines = [
        "Qinyan Nature style audit",
        f"tokens≈{summary['tokens_approx']} sentences={summary['sentences']} "
        f"lines={summary['lines']}",
    ]
    for key, value in report["counts"].items():
        lines.append(f"- {key}: {value}")
    lines.append(f"- long_sentence: {len(report['long_sentences'])}")
    lines.append(f"- repeated_opener_runs: {len(report['repeated_openers'])}")
    lines.append(str(report["note"]))
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="UTF-8 manuscript text")
    parser.add_argument("--json", action="store_true", help="Emit JSON details")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"input file not found: {args.input}")
    report = audit(read_text(args.input))
    print(
        json.dumps(report, ensure_ascii=False, indent=2)
        if args.json
        else render(report)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
