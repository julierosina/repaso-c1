# Notes for Claude

Static C1 Spanish revision site (plain HTML/CSS/JS ES modules, no build). Content in `data/*.json`, listed in `data/index.json`. The README documents the data format for the user; keep it in sync when schemas change.

## Converting class materials

When the user uploads a vocab list:
- Create a new file `data/vocab/<unidad-o-tema>.json` (or append to the matching existing one) and add it to `data/index.json`.
- Generate `fr` (French translation: the natural French equivalent, with a short gloss in parentheses for figurative expressions), `definition`, 1–2 `synonyms`, one `example`, and `type` yourself: natural, accurate, C1-appropriate peninsular Spanish (note regional variants in `notes`). Definitions must not contain the headword itself (it breaks the "¿Qué palabra es?" question).
- Synonyms should be genuinely interchangeable in at least one common context; the quiz auto-checks against them.
- For reflexive/phrasal headwords, add `accept` variants (e.g. `"desbordar"` for `"desbordarse"`).
- If the material has context / connotation columns, map them to `context` and `connotation` (fix typos, keep the user's meaning).
- When two entries (in any file) mean nearly the same thing, add `related` on both so neither becomes a wrong option in the other's multiple choice.
- When the user supplies their own example sentences, keep them verbatim.
- Reuse existing topic names exactly (check other files) unless the material is a new topic.
- Never change an existing entry's `word` (it's the progress ID) without flagging it to the user.
- Validate afterwards: `python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('data/**/*.json', recursive=True)]"` and check for duplicate words across files.

Grammar: every exercise needs an `explanation`; every wrong option needs a `whyNot` reason; typed exercises should list likely wrong answers in `traps`. Use `alsoAccepted` rather than marking a genuinely valid alternative wrong. Grammar exercises: include the class exercises verbatim (`"source": "class"`) plus original ones testing the same rule with different vocabulary/context (`"source": "generated"`).

Writing: when the user sends an assignment sheet, turn each section into a `part` with guidance, clickable phrases, automatic checks (anyOf / pattern / avoid) and self-checks for what software can't judge. Test every regex against the part's `model` in the browser: the model should pass its own checks except for placeholders like [fecha]. Remember `anyOf` ignores accents (so "cómo" also matches "como").

## Conventions

- UI text is in Spanish; README is in English.
- Vocab practice is a no-settings spaced-repetition stream (simplified SM-2 in `js/progress.js`; card/exercise-type selection in `js/vocab.js`). Keep it zero-config, and every exercise auto-checked (the user doesn't want self-grading). Feedback stays short (word, French, focus line) with the full card behind a toggle. After a wrong answer whose answer is Spanish, the user must retype the correct answer before Siguiente appears.
- Examples must contain the headword so the gap exercises work.
- Progress keys are `<section>:<id>` in localStorage key `c1esp:progress:v1` (see `js/progress.js`). Don't change the key format without a migration.
- Colours derive from `--h` (hue) per section/topic; see tokens at top of `css/styles.css`.
- Preview locally with `python3 -m http.server 8000` (`.claude/launch.json` has a `site` config).
