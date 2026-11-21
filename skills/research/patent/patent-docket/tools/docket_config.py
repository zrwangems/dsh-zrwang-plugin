# -*- coding: utf-8 -*-
"""案卷轮次与输出目录默认值（代码内定义，不再读 config.yaml）。"""
from __future__ import annotations

from typing import Any

DEFAULTS: dict[str, Any] = {
    "max_rounds": 3,
    "output_subdir": "docket",
}

def load_docket_config(path: Path | None = None) -> dict[str, Any]:
    """Defaults are in code; the old config.yaml is gone."""
    del path
    return dict(DEFAULTS)
