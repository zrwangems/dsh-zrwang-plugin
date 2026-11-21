"""DSH plugin bridge: map ZRWANG_*_CRED to the names upstream scripts expect.

The plugin injects secrets as ``ZRWANG_*_CRED`` because DSH strips environment
variables whose names contain KEY/TOKEN/SECRET/PASSWORD. This file is static and
version-controlled; Python imports it at startup via PYTHONPATH.
"""
import os as _os

_MAP = {
    "ZRWANG_IMAGE_CRED": ("OPENAI_API_KEY", "OPENROUTER_API_KEY"),
    "ZRWANG_OCR_CRED": ("PADDLE_OCR_TOKEN",),
    "ZRWANG_NCBI_CRED": ("NCBI_API_KEY",),
    "ZRWANG_FIRECRAWL_CRED": ("FIRECRAWL_API_KEY",),
    "ZRWANG_PEXELS_CRED": ("PEXELS_API_KEY",),
    "ZRWANG_PIXABAY_CRED": ("PIXABAY_API_KEY",),
    "ZRWANG_OPENALEX_CRED": ("OPENALEX_API_KEY",),
    "ZRWANG_ELSEVIER_CRED": ("ELSEVIER_API_KEY",),
    "ZRWANG_ELSEVIER_INST_CRED": ("ELSEVIER_INSTTOKEN",),
    "ZRWANG_ELSEVIER_AUTH_CRED": ("ELSEVIER_AUTHTOKEN",),
    "ZRWANG_SPRINGER_FULLTEXT_CRED": ("SPRINGER_FULLTEXT_API_KEY",),
    "ZRWANG_SPRINGER_OA_CRED": ("SPRINGER_OA_API_KEY",),
    "ZRWANG_SPRINGER_METADATA_CRED": ("SPRINGER_METADATA_API_KEY",),
    "ZRWANG_IEEE_CRED": ("IEEE_API_KEY",),
    "ZRWANG_PATENT_EMBEDDING_CRED": ("ZHIPUAI_API_KEY", "DASHSCOPE_API_KEY", "OPENAI_API_KEY"),
}


def _apply_plugin_credentials():
    for name, value in list(_os.environ.items()):
        if name.startswith("DSH_ZRWANG_") and value:
            _os.environ.setdefault(name[4:], value)
    qwen = _os.environ.get("ZRWANG_IMAGE_BACKEND") == "qwen"
    for source, targets in _MAP.items():
        value = _os.environ.get(source)
        if not (isinstance(value, str) and value.strip()):
            continue
        if qwen and source == "ZRWANG_IMAGE_CRED":
            targets = tuple(t for t in targets if not (t.startswith("OPENAI") or t.startswith("OPENROUTER"))) + ("QWEN_API_KEY",)
        for name in targets:
            if not _os.environ.get(name):
                _os.environ[name] = value.strip()
    if qwen and _os.environ.get("QWEN_API_KEY"):
        _os.environ.setdefault("IMAGE_BACKEND", "qwen")
    elif _os.environ.get("OPENAI_API_KEY"):
        _os.environ.setdefault("IMAGE_BACKEND", "openai")
        _os.environ.setdefault("OPENAI_QUALITY", "omit")


_apply_plugin_credentials()
