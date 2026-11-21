#!/usr/bin/env python3
"""Print the nature-figure plotting backend selected in the DSH plugin settings.

The plugin injects `NATURE_FIGURE_BACKEND` (python or r). This skill has no
config file and no command to persist a preference; choose a backend in the
plugin settings, or follow an explicit language choice in the current request.
"""

from __future__ import annotations

import argparse
import os
import sys

VALID_BACKENDS = {"python", "r"}


def backend() -> str:
    value = os.environ.get("NATURE_FIGURE_BACKEND", "").strip().lower()
    return value if value in VALID_BACKENDS else "python"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", choices=["get"], default="get")
    parser.parse_args()
    print(backend())
    return 0


if __name__ == "__main__":
    sys.exit(main())
