"""审查答复：向量检索配置。

配置只来自 DSH 插件设置注入的环境变量（插件设置 → 科研服务 → 专利检索向量模型）：
  PATENT_EMBEDDING_PROVIDER / _MODEL / _BASE_URL / _DIMENSIONS / _API_KEY_ENV
密钥只从环境变量 ZRWANG_PATENT_EMBEDDING_CRED（或 _API_KEY_ENV 指定的变量）读取，
本模块不读写 embedding.config.yaml / embedding.secrets.yaml。

数据目录：只认 PATENT_OA_HOME（插件设置 → 科研服务 → 专利数据目录 下的 oa/），
不写项目目录，也不写用户主目录。
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent

PRESET_ENV = {
    "provider": "PATENT_EMBEDDING_PROVIDER",
    "model": "PATENT_EMBEDDING_MODEL",
    "base_url": "PATENT_EMBEDDING_BASE_URL",
    "dimensions": "PATENT_EMBEDDING_DIMENSIONS",
    "api_key_env": "PATENT_EMBEDDING_API_KEY_ENV",
    "group_id_env": "PATENT_EMBEDDING_GROUP_ID_ENV",
}
DEFAULT_PROVIDER = "openai_compatible"
DEFAULT_API_KEY_ENV = "ZRWANG_PATENT_EMBEDDING_CRED"


def oa_home() -> Path:
    env = (os.environ.get("PATENT_OA_HOME") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    raise SystemExit(
        "PATENT_OA_HOME 未设置：请在 DSH 插件设置 → 科研服务 → 专利数据目录 里填目录，"
        "插件会把审查答复数据放在它下面的 oa/。"
    )


def default_sqlite_path() -> Path:
    return oa_home() / "data" / "oa_vectors.sqlite"


def default_cases_dir() -> Path:
    return oa_home() / "cases"


def embedding_state_path() -> Path:
    return oa_home() / "embedding-state.json"


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or "").strip() or default


def _state() -> dict[str, Any]:
    file = embedding_state_path()
    if not file.is_file():
        return {}
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_state(data: dict[str, Any]) -> None:
    file = embedding_state_path()
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    """返回由插件设置注入的环境变量组成的配置；不读取任何配置文件。"""
    del path  # 保留上游调用签名；配置文件已移除
    state = _state()
    dimensions_raw = _env(PRESET_ENV["dimensions"])
    try:
        dimensions = int(dimensions_raw) if dimensions_raw else 0
    except ValueError:
        dimensions = 0
    provider = _env(PRESET_ENV["provider"], state.get("provider", DEFAULT_PROVIDER))
    model = _env(PRESET_ENV["model"], state.get("model", ""))
    base_url = _env(PRESET_ENV["base_url"], state.get("base_url", ""))
    api_key_env = _env(PRESET_ENV["api_key_env"], DEFAULT_API_KEY_ENV)
    enabled = bool(model and resolve_api_key({"api_key_env": api_key_env}))
    return {
        "version": 1,
        "user_confirmed": True,
        "vector_enabled": enabled,
        "provider": provider,
        "model": model,
        "dimensions": dimensions or int(state.get("dimensions") or 0),
        "base_url": base_url,
        "api_key_env": api_key_env,
        "group_id_env": _env(PRESET_ENV["group_id_env"]),
        "group_id": "",
        "minimax_embed_type": "",
        "preset": "",
        "embedding_timeout_sec": 30,
        "embedding_fingerprint": str(state.get("embedding_fingerprint") or ""),
        "sqlite_path": str(default_sqlite_path()),
        "obsidian_cases_dir": "oa/cases",
        "obsidian_oa_dir": "oa",
        "default_top_k": 5,
        "_oa_home": str(oa_home()),
    }


def resolve_api_key(cfg: dict[str, Any]) -> str:
    env_name = str(cfg.get("api_key_env") or "").strip()
    if env_name:
        key = (os.environ.get(env_name) or "").strip()
        if key:
            return key
    return (os.environ.get(DEFAULT_API_KEY_ENV) or "").strip()


def resolve_group_id(cfg: dict[str, Any]) -> str:
    if str(cfg.get("group_id") or "").strip():
        return str(cfg.get("group_id")).strip()
    env_name = str(cfg.get("group_id_env") or "").strip()
    return (os.environ.get(env_name) or "").strip() if env_name else ""


def needs_user_confirm(cfg: dict[str, Any] | None = None, path: str | Path | None = None) -> bool:
    del cfg, path
    return False


def is_vector_enabled(cfg: dict[str, Any] | None = None, path: str | Path | None = None) -> bool:
    data = cfg if cfg is not None else load_config(path)
    return bool(data.get("vector_enabled"))


def embedding_fingerprint(cfg: dict[str, Any]) -> str:
    return "|".join(
        [
            str(cfg.get("provider") or ""),
            str(cfg.get("model") or ""),
            str(int(cfg.get("dimensions") or 0)),
            str(cfg.get("base_url") or ""),
        ]
    )


def check_rebuild_needed(cfg: dict[str, Any] | None = None, path: str | Path | None = None) -> dict[str, Any]:
    data = cfg if cfg is not None else load_config(path)
    if not data.get("vector_enabled"):
        return {"needed": False, "reason": "vector_disabled", "ask_zh": ""}
    current = embedding_fingerprint(data)
    stored = str(data.get("embedding_fingerprint") or "")
    if not stored:
        return {
            "needed": True,
            "reason": "first_enable",
            "current_fingerprint": current,
            "stored_fingerprint": "",
            "ask_zh": (
                "向量检索已启用，但尚未建立索引。是否扫描 Obsidian `oa/cases` 重建向量？"
                "回复「确认重建」后执行：python skills/patent-oa/tools/rebuild_vectors.py --confirm"
            ),
        }
    if stored != current:
        return {
            "needed": True,
            "reason": "model_changed",
            "current_fingerprint": current,
            "stored_fingerprint": stored,
            "ask_zh": "向量模型已变化，需要重建索引：python skills/patent-oa/tools/rebuild_vectors.py --confirm",
        }
    return {"needed": False, "reason": "up_to_date", "ask_zh": ""}


def sqlite_path_from_config(cfg: dict[str, Any]) -> Path:
    raw = str(cfg.get("sqlite_path") or "").strip()
    return Path(raw).expanduser().resolve() if raw else default_sqlite_path()


def set_vector_enabled(enabled: bool, path: str | Path | None = None) -> Path:
    """兼容上游调用：是否启用由插件设置决定，这里不写任何文件。"""
    del enabled, path
    return embedding_state_path()


def mark_fingerprint_built(
    path: str | Path | None = None, cfg: dict[str, Any] | None = None
) -> str:
    del path
    data = cfg if cfg is not None else load_config()
    fingerprint = embedding_fingerprint(data)
    state = _state()
    state.update(
        {
            "embedding_fingerprint": fingerprint,
            "provider": data.get("provider", ""),
            "model": data.get("model", ""),
            "dimensions": int(data.get("dimensions") or 0),
            "base_url": data.get("base_url", ""),
        }
    )
    _write_state(state)
    return fingerprint
