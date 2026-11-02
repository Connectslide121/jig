"""Combine Chromium's workbench and native page captures at the actual view bounds.

Requires Pillow. First run e2e/user-browser.spec.ts with JIG_SCREENSHOTS=1.
Playwright's renderer screenshot does not include native child WebContentsViews.
"""

import json
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
captures = root / ".tmp/browser-screenshot"
bounds = json.loads((captures / "bounds.txt").read_text(encoding="utf-8"))
shell = Image.open(captures / "shell.png").convert("RGB")
page = Image.open(captures / "page.png").convert("RGB")
page = page.resize((bounds["width"], bounds["height"]), Image.Resampling.LANCZOS)
shell.paste(page, (bounds["x"], bounds["y"]))
shell.save(root / "apps/desktop/src/renderer/features/about/shots/browser.jpg", quality=90)
