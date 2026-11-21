"""Configuration management for academic search server.

默认值直接写在这里（随技能分发），不再生成 config.toml。
需要改参数时改这份代码或在环境变量里给值（PUBMED_EMAIL / NCBI_API_KEY / CROSSREF_MAILTO）。
"""

import os
from pathlib import Path

try:
    import toml
except ImportError:  # toml 只用于读取可选的用户配置文件
    toml = None


DEFAULTS = {
    "pubmed": {"email": "", "api_key": "", "cache_dir": "~/.cache/academic-search", "cache_ttl": 86400},
    "crossref": {"mailto": "", "timeout": 15},
    "arxiv": {"timeout": 30},
    "general": {"default_rows": 5, "max_rows": 50},
}


class Config:
    def __init__(self, config_path: str | Path | None = None):
        self._config = DEFAULTS
        if config_path is None:
            env_path = os.environ.get("ZRWANG_NATURE_ACADEMIC_CONFIG", "").strip()
            config_path = Path(env_path) if env_path else Path(__file__).parent.parent / "config.toml"
        # 没有配置文件就用上面的默认值；设置页只在用户真的填了参数时才写这个文件。
        if toml is not None and Path(config_path).is_file():
            self._config = toml.load(config_path)

    @property
    def pubmed_email(self) -> str:
        return os.environ.get("PUBMED_EMAIL") or self._config.get("pubmed", {}).get("email", "")

    @property
    def pubmed_api_key(self) -> str:
        return os.environ.get("NCBI_API_KEY") or self._config.get("pubmed", {}).get("api_key", "")

    @property
    def crossref_mailto(self) -> str:
        return os.environ.get("CROSSREF_MAILTO") or self._config.get("crossref", {}).get("mailto", "")

    @property
    def crossref_timeout(self) -> int:
        return self._config.get("crossref", {}).get("timeout", 15)

    @property
    def arxiv_timeout(self) -> int:
        return self._config.get("arxiv", {}).get("timeout", 30)

    @property
    def default_rows(self) -> int:
        return self._config.get("general", {}).get("default_rows", 5)

    @property
    def max_rows(self) -> int:
        return self._config.get("general", {}).get("max_rows", 50)


# Global config instance
_config: Config | None = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
    return _config
