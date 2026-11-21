"""Configuration for the academic search server.

All user-facing values come from the DSH plugin settings, injected as
environment variables. The skill has no config file and never writes one.

Environment:
    NCBI_EMAIL / PUBMED_EMAIL  contact email for PubMed
    NCBI_API_KEY               optional PubMed API key
    CROSSREF_MAILTO            optional Crossref polite-pool email
"""

import os


class Config:
    """Read-only view over the plugin-injected environment."""

    @property
    def pubmed_email(self) -> str:
        return (os.environ.get("NCBI_EMAIL") or os.environ.get("PUBMED_EMAIL") or "").strip()

    @property
    def pubmed_api_key(self) -> str:
        return (os.environ.get("NCBI_API_KEY") or "").strip()

    @property
    def crossref_mailto(self) -> str:
        return (os.environ.get("CROSSREF_MAILTO") or "").strip()

    @property
    def crossref_timeout(self) -> int:
        return 15

    @property
    def arxiv_timeout(self) -> int:
        return 30

    @property
    def default_rows(self) -> int:
        return 5

    @property
    def max_rows(self) -> int:
        return 50


_config: Config | None = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
    return _config
