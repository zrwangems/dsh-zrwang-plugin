"""Read the school configuration shipped with the skill.

The DSH plugin fixes the school (BUAA) and injects `LIT_DL_SCHOOL_FILE`.
This module never writes a config file: credentials and contact email come
from the plugin settings through environment variables.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

DEFAULT_SCHOOL_FILE = Path(__file__).resolve().parent.parent / "config" / "school.json"


def school_file() -> Path:
    explicit = os.environ.get("LIT_DL_SCHOOL_FILE", "").strip()
    return Path(explicit) if explicit else DEFAULT_SCHOOL_FILE


def config_exists() -> bool:
    return school_file().is_file()


def load_config() -> Optional[dict[str, Any]]:
    path = school_file()
    if not path.is_file():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
    except (json.JSONDecodeError, OSError):
        return None
    return value if isinstance(value, dict) else None


def get_school_name() -> Optional[str]:
    config = load_config()
    return (config or {}).get("school", {}).get("name")


def get_auth_info() -> Optional[dict[str, Any]]:
    config = load_config()
    return (config or {}).get("auth")
