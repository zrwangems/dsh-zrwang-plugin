#!/usr/bin/env python
"""
阅读模式对话开始前：探测 Obsidian 是否安装、默认/已登记库路径。

不强制依赖 Obsidian——无库时仍可写入 outputs/patent_reader/。
有库时自动解析 PATENT_READER_OBSIDIAN_VAULT，发挥索引/Canvas/术语网最大效果。

用法：
  python skills/patent-reader/tools/vault/check_obsidian_env.py
  python skills/patent-reader/tools/vault/check_obsidian_env.py --json
库路径由 DSH 插件设置（科研服务 → 专利检索向量模型 → Obsidian 专利库路径）指定，
本脚本只探测，不写任何持久化配置。
"""
from __future__ import annotations

# Ensure tools/patent_reader is importable when run as a script.
from pathlib import Path as _Path
import sys as _sys

_PR_ROOT = _Path(__file__).resolve().parents[1]
if str(_PR_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_PR_ROOT))

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from shared.common import (
        probe_obsidian_environment,
        resolve_obsidian_vault,
        write_persisted_vault,
    )
except ImportError:
    from tools.patent_reader.shared.common import (
        probe_obsidian_environment,
        resolve_obsidian_vault,
        write_persisted_vault,
    )


def _print_human(report: dict) -> None:
    print(f"STATUS: {report['status']}")
    print(f"OBSIDIAN_REQUIRED: false  # 可不装；装了效果更好")
    print(f"OBSIDIAN_INSTALLED: {report['obsidian_installed']}")
    resolved = report.get("resolved") or {}
    vault = resolved.get("vault") or ""
    if vault:
        print(f"VAULT: {vault}")
        print(f"VAULT_SOURCE: {resolved.get('source')}")
        print(f"NEEDS_USER_INPUT: false")
    else:
        print("VAULT: (未配置)")
        print("NEEDS_USER_INPUT: true")
        msg = resolved.get("message") or report.get("status")
        print(f"MESSAGE: {msg}")
        cands = resolved.get("candidates") or report.get("vaults") or []
        if cands:
            print("CANDIDATES:")
            for c in cands[:8]:
                print(f"  - {c.get('path')}  (open={c.get('open')}, source={c.get('source')})")
        defaults = resolved.get("suggested_defaults") or []
        if defaults:
            print("SUGGESTED_DEFAULTS:")
            for d in defaults:
                print(f"  - {d}")
        print("ACTION: 在 DSH 插件设置 → 科研服务 → 专利检索向量模型 里填写 Obsidian 专利库路径。")
    print(f"PERSISTED_CONFIG: {report.get('persisted_config')}")
    print(f"ENV_VAR: {report.get('env_var')}")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="输出 JSON 报告")
    ap.add_argument(
        "--require-vault",
        action="store_true",
        help="无库路径时退出码 2（默认仅提示，退出 0；强制入库场景可用）",
    )
    args = ap.parse_args(argv)

    report = probe_obsidian_environment()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_human(report)

    if args.require_vault and (
        report["status"] != "ready" or not (report.get("resolved") or {}).get("vault")
    ):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
