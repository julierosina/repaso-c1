# Notes for Claude

Static C1 Spanish revision site (plain HTML/CSS/JS ES modules, no build). Content in `data/*.json`, listed in `data/index.json`. The README documents the data format for the user; keep it in sync when schemas change.

## Converting class materials

When the user uploads a vocab list:
- Create a new file `data/vocab/<unidad-o-tema>.json` (or append to the matching existing one) and add it to `data/index.json`.
- Generate `definition`, 1–2 `synonyms`, one `example`, and `type` yourself: natural, accurate, C1-appropriate peninsular Spanish (note regional variants in `notes`). Definitions must not contain the headword itself (it breaks the "¿Qué palabra es?" question).
- Synonyms should be genuinely interchangeable in at least one common context; the quiz auto-checks against them.
- For reflexive/phrasal headwords, add `accept` variants (e.g. `"desbordar"` for `"desbordarse"`).
- If the material has context / connotation columns, map them to `context` and `connotation` (fix typos, keep the user's meaning).
- Reuse existing topic names exactly (check other files) unless the material is a new topic.
- Never change an existing entry's `word` (it's the progress ID) without flagging it to the user.
- Validate afterwards: `python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('data/**/*.json', recursive=True)]"` and check for duplicate words across files.

Grammar exercises: include the class exercises verbatim (`"source": "class"`) plus original ones testing the same rule with different vocabulary/context (`"source": "generated"`).

## Conventions

- UI text is in Spanish; README is in English.
- Vocab practice is a no-settings spaced-repetition stream (simplified SM-2 in `js/progress.js`; card/exercise-type selection in `js/vocab.js`). Keep it zero-config.
- Progress keys are `<section>:<id>` in localStorage key `c1esp:progress:v1` (see `js/progress.js`). Don't change the key format without a migration.
- Colours derive from `--h` (hue) per section/topic; see tokens at top of `css/styles.css`.
- Preview locally with `python3 -m http.server 8000` (`.claude/launch.json` has a `site` config).
