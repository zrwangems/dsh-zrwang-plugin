# -*- coding: utf-8 -*-
"""Patent-search pagination defaults (in code; dialog / CLI may override)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

DEFAULTS: dict[str, Any] = {
    "max_pages": 3,
    "max_pages_hard": 20,
    "page_delay_ms": 800,
    "http_error_retries": 2,
    "http_error_backoff_ms": 1500,
    "page_size": 3,
}

_INT_KEYS = frozenset(DEFAULTS)

GOOGLE_PATENTS_DEFAULTS: dict[str, Any] = {
    "num": 10,
    "timeout_s": 20,
}


def load_google_patents_config(path: Path | None = None) -> dict[str, Any]:
    """Defaults are in code; the old config.yaml is gone."""
    del path
    return dict(GOOGLE_PATENTS_DEFAULTS)


def load_search_config(path: Path | None = None) -> dict[str, Any]:
    """Defaults are in code; the old config.yaml is gone."""
    del path
    return dict(DEFAULTS)


def resolve_max_pages(
    *,
    requested: int | None = None,
    want_complete: bool = False,
    cfg: dict[str, Any] | None = None,
) -> int:
    settings = cfg or load_search_config()
    hard = max(1, int(settings["max_pages_hard"]))
    if want_complete:
        return hard
    if requested is None:
        return max(1, min(int(settings["max_pages"]), hard))
    return max(1, min(int(requested), hard))


def resolve_page_budget(
    *,
    requested: int | None = None,
    want_complete: bool = False,
    total_pages: int | None = None,
    cfg: dict[str, Any] | None = None,
) -> int:
    """第一页采到「共 N 页」后的实际翻页预算。

    ``--complete``：有总页数则按总页数翻完（硬上限随总页数）；探测不到才用 ``max_pages_hard``。
    普通检索：仍用 ``max_pages`` / ``--max-pages``，且不超过总页数。
    """
    settings = {**DEFAULTS, **(cfg or {})}
    hard = max(1, int(settings["max_pages_hard"]))
    pages = int(total_pages) if total_pages and int(total_pages) > 0 else None
    if want_complete:
        return pages if pages is not None else hard
    if requested is None:
        budget = max(1, min(int(settings["max_pages"]), hard))
    else:
        budget = max(1, min(int(requested), hard))
    if pages is not None:
        return min(budget, pages)
    return budget
