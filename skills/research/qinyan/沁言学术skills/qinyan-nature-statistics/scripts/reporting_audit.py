#!/usr/bin/env python3
"""Audit statistical reporting completeness in Methods, Results, or figure legends."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


CHECKS: dict[str, tuple[str, str]] = {
    "sample_size": (
        r"\b(?:n|N)\s*=\s*\d+|sample size|样本量|独立实验|biological replicate",
        "Define the sample size and what n represents.",
    ),
    "test_or_model": (
        r"\b(?:t[- ]?test|ANOVA|Mann[-– ]Whitney|Wilcoxon|Kruskal[-– ]Wallis|"
        r"regression|mixed[- ]effects?|linear model|logistic|Cox|GEE|"
        r"permutation|bootstrap|Bayesian)\b|检验|回归|混合效应|模型",
        "Name the statistical test or model.",
    ),
    "effect_or_interval": (
        r"\b(?:effect size|confidence interval|credible interval|CI|Cohen'?s d|"
        r"odds ratio|hazard ratio|risk ratio|mean difference|median difference)\b|"
        r"效应量|置信区间|可信区间|均值差|优势比|风险比",
        "Report an effect estimate and uncertainty where applicable.",
    ),
    "p_value": (
        r"\bp\s*(?:[<=>≤≥])\s*(?:0?\.\d+|\d+\s*[×x]\s*10)|p[- ]value|p 值",
        "Report the exact p value or a justified threshold.",
    ),
    "multiplicity": (
        r"\b(?:multiple comparisons?|multiplicity|Bonferroni|Holm|"
        r"Benjamini[-– ]Hochberg|false discovery rate|FDR|family[- ]wise)\b|"
        r"多重比较|多重检验|错误发现率",
        "State the multiple-comparison strategy when more than one inference is made.",
    ),
    "software": (
        r"\b(?:R version|Python version|SPSS|SAS|Stata|GraphPad|Prism|"
        r"statsmodels|scipy|lme4|brms)\b|软件版本",
        "Name statistical software/packages and versions.",
    ),
    "missing_exclusion": (
        r"\b(?:missing data|missing values?|imputation|excluded?|exclusion|outlier)\b|"
        r"缺失|插补|排除|异常值",
        "Describe missing-data and exclusion handling.",
    ),
    "randomization_blinding": (
        r"\b(?:randomi[sz]|blind(?:ed|ing)?|mask(?:ed|ing)?)\b|随机化|盲法",
        "Report randomization and blinding when applicable.",
    ),
    "error_definition": (
        r"\b(?:mean\s*[±+/-]|SD|s\.d\.|SEM|s\.e\.m\.|IQR|interquartile|"
        r"standard deviation|standard error)\b|标准差|标准误|四分位距|误差线",
        "Define centre and error/interval representation.",
    ),
}

REQUIRED_BY_CONTEXT = {
    "methods": {
        "sample_size",
        "test_or_model",
        "multiplicity",
        "software",
        "missing_exclusion",
    },
    "results": {"sample_size", "test_or_model", "effect_or_interval", "p_value"},
    "legend": {"sample_size", "test_or_model", "p_value", "error_definition"},
    "general": {"sample_size", "test_or_model"},
}

RISK_PATTERNS = {
    "p_zero": r"\bp\s*=\s*0(?:\.0+)?(?![\d.])",
    "significance_only": r"\b(?:statistically )?significant(?:ly)?\b|显著(?:地)?",
    "no_difference_claim": r"\b(?:no difference|the same|equivalent)\b|无差异|相同|等效",
    "trend_to_significance": r"\b(?:trend(?:ed)? toward significance|marginally significant|almost significant)\b|接近显著|显著趋势",
}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")


def audit(text: str, context: str) -> dict[str, object]:
    presence = {
        check: bool(re.search(pattern, text, re.IGNORECASE))
        for check, (pattern, _) in CHECKS.items()
    }
    required = REQUIRED_BY_CONTEXT[context]
    missing = [
        {"check": check, "guidance": CHECKS[check][1]}
        for check in sorted(required)
        if not presence[check]
    ]
    risks = []
    for check, pattern in RISK_PATTERNS.items():
        for match in re.finditer(pattern, text, re.IGNORECASE):
            line = text.count("\n", 0, match.start()) + 1
            risks.append({"check": check, "line": line, "match": match.group(0)})

    notes = []
    if any(item["check"] == "significance_only" for item in risks):
        notes.append("Review significant/significantly against the reported test and effect.")
    if context == "methods" and not presence["randomization_blinding"]:
        notes.append("Randomization/blinding not detected; mark not applicable or report it when relevant.")
    if context == "legend" and not presence["effect_or_interval"]:
        notes.append("Consider adding effect estimates or intervals when the panel supports inference.")

    return {
        "context": context,
        "present": presence,
        "missing_required": missing,
        "risk_phrases": risks,
        "notes": notes,
        "complete": not missing,
        "scope_note": "Text matching checks reporting presence, not statistical validity.",
    }


def render(report: dict[str, object]) -> str:
    lines = [
        "Qinyan Nature statistical reporting audit",
        f"context={report['context']} complete={str(report['complete']).lower()}",
        "missing required:",
    ]
    if report["missing_required"]:
        lines.extend(
            f"- {item['check']}: {item['guidance']}"
            for item in report["missing_required"]
        )
    else:
        lines.append("- none")
    lines.append("risk phrases:")
    if report["risk_phrases"]:
        lines.extend(
            f"- line {item['line']} {item['check']}: {item['match']}"
            for item in report["risk_phrases"]
        )
    else:
        lines.append("- none")
    lines.append(str(report["scope_note"]))
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="UTF-8 statistical reporting text")
    parser.add_argument(
        "--context",
        choices=("methods", "results", "legend", "general"),
        default="general",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    parser.add_argument("--strict", action="store_true", help="Return non-zero for risk phrases")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"input file not found: {args.input}")
    report = audit(read_text(args.input), args.context)
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else render(report))
    if report["missing_required"] or (args.strict and report["risk_phrases"]):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
