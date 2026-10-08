"""Check that a vocabulary change keeps every word you have already studied.

Progress is saved per word ID: the entry's "id", or else the slug of its "word"
(the same rule as slugify() in js/text.js). If an ID that exists in the last commit
disappears from the files (a word renamed, deleted or a file dropped from data/index.json),
the progress for that word would no longer be found. This script lists any such IDs.

Run from the project folder before committing vocabulary changes:
    python3 scripts/check_vocab_ids.py
Exit code 1 means some IDs would be lost.
"""

import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def slugify(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not ("̀" <= c <= "ͯ"))
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def ids_from(read):
    """read(path) returns the text of a file under data/, or None if it doesn't exist."""
    index_text = read("data/index.json")
    if index_text is None:
        return set()
    ids = set()
    for path in json.loads(index_text).get("vocab", []):
        text = read("data/" + path)
        if text is None:
            continue
        data = json.loads(text)
        for e in data["entries"] if isinstance(data, dict) else data:
            ids.add(e.get("id") or slugify(e["word"]))
    return ids


def read_committed(path):
    r = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def read_current(path):
    p = ROOT / path
    return p.read_text(encoding="utf-8") if p.exists() else None


before = ids_from(read_committed)
after = ids_from(read_current)
lost = sorted(before - after)

if lost:
    print(f"{len(lost)} word ID(s) from the last commit are missing, so their progress would be lost:")
    for i in lost:
        print("  -", i)
    print('Restore the original "word", or add "id": "<old id>" to the renamed entry.')
    sys.exit(1)

print(f"OK: all {len(before)} existing word IDs kept, {len(after - before)} new.")
