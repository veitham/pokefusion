"""Extracts an Infinite Fusion sprite pack into sprites/ and builds per-head indexes in data/sprites/.

Usage: python tools/extract_sprites.py "Full Sprite pack 1-129 (August 2026).zip"

Output:
  sprites/custom/{head}.{body}{variant}.png   hand-drawn sprites the online CDN doesn't have
  data/sprites/{head}.json                    {body: {variant: artist}}  ("" = main sprite), all sprites
"""
import csv
import io
import json
import re
import shutil
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CUSTOM_RE = re.compile(r"^CustomBattlers/(\d+)\.(\d+)([a-z]*)\.png$")

# Must match CDN_MAX_ID in js/data.js: pairs within it are served by the online CDN.
CDN_MAX_ID = 501


def main(zip_path):
    custom_dir = ROOT / "sprites" / "custom"
    index_dir = ROOT / "data" / "sprites"
    for d in (custom_dir, index_dir):
        d.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path) as z:
        credits = {}
        if "Sprite_Credits.csv" in z.namelist():
            reader = csv.reader(io.TextIOWrapper(z.open("Sprite_Credits.csv"), encoding="utf-8", errors="replace"))
            credits = {row[0]: row[1] for row in reader if len(row) > 1}

        index = defaultdict(lambda: defaultdict(dict))
        count = 0
        for info in z.infolist():
            m = CUSTOM_RE.match(info.filename)
            if not m:
                continue
            head, body, variant = m.groups()
            index[head][body][variant] = credits.get(f"{head}.{body}{variant}", "")
            if int(head) <= CDN_MAX_ID and int(body) <= CDN_MAX_ID:
                continue
            target = custom_dir / f"{head}.{body}{variant}.png"
            if not target.exists() or target.stat().st_size != info.file_size:
                with z.open(info) as src, open(target, "wb") as dst:
                    shutil.copyfileobj(src, dst)
            count += 1
            if count % 20000 == 0:
                print(f"{count} fichiers…", flush=True)

    for head, bodies in index.items():
        (index_dir / f"{head}.json").write_text(
            json.dumps(bodies, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{count} sprites extraits (hors CDN), index pour {len(index)} têtes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else next(ROOT.glob("*Sprite pack*.zip")))
