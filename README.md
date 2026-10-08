# Repaso C1 — Spanish exam revision

A small static site for revising C1 Spanish: vocabulary, grammar, writing and practice exams.
Plain HTML/CSS/JavaScript, no build step. All content lives in JSON files under `data/`,
and your progress is saved in your browser (localStorage).

**Status:** Vocabulary, Grammar, Writing and a first exam mode are built. The Progress dashboard comes next.

---

## Run it locally

Browsers won't load the data files if you just double-click `index.html`, so start a tiny local server
from the project folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Stop the server with `Ctrl+C`.
After editing a data file, just reload the page.

## Deploy to GitHub Pages

1. Create an empty repository on GitHub (e.g. `repaso-c1`).
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/repaso-c1.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
4. After a minute the site is live at `https://<your-username>.github.io/repaso-c1/`.

Every later `git push` updates the site automatically.

---

## Project layout

```
index.html              the single page; sections are shown via #/vocab, #/grammar, …
css/styles.css          all styling (colours per section/topic are defined at the top)
js/
  app.js                router + data-error banner
  home.js               home page
  vocab.js              vocabulary practice and word list
  grammar.js            grammar topics, rule summaries and practice
  writing.js            writing prompts with live checks
  exam.js               exam mode: random 5-word tests
  data.js               loads + checks the data files
  progress.js           per-item progress in localStorage
  text.js               answer comparison (accents, word forms)
  ui.js                 shared helpers (tags, colours, shuffle)
data/
  index.json            ← lists every content file the site should load
  vocab/*.json          vocabulary lists
  grammar/*.json        grammar topics
  writing/*.json        writing prompts
scripts/
  check_vocab_ids.py    checks a vocabulary change keeps every studied word's progress
```

---

## Adding content yourself

### 1. The index file

`data/index.json` lists which files are loaded. **A new file does nothing until it is listed here.**

```json
{
  "vocab": [
    "vocab/venezuela-eeuu.json",
    "vocab/unidad-3-salud.json"
  ],
  "grammar": [],
  "writing": []
}
```

Paths are relative to the `data/` folder.

### 2. Vocabulary files

One file per list or unit works well (e.g. `data/vocab/unidad-3-salud.json`):

```json
{
  "source": "Unidad 3 — Salud (clase 02/10)",
  "topic": "Salud",
  "entries": [
    {
      "word": "paliar",
      "type": "verbo",
      "definition": "Atenuar o reducir los efectos negativos de algo sin eliminar su causa.",
      "synonyms": ["mitigar", "atenuar"],
      "example": "Las ayudas pretenden paliar los efectos de la sequía."
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `source` | no | Where the list came from. Only for your reference. |
| `topic` | recommended | Default topic for every entry in the file. Used for the filters and the colour of the tag. |
| `entries[].word` | **yes** | The word or expression, as you want it shown. |
| `entries[].fr` | recommended | French translation. Shown when you learn the word and after each answer, and used in two exercise types. |
| `entries[].definition` | **yes** | Definition in Spanish. |
| `entries[].synonyms` | recommended | List of 1–2 synonyms. The *Sinónimo* question checks your answer against these. |
| `entries[].example` | recommended | One example sentence. The word is highlighted automatically. |
| `entries[].context` | no | Where/how the word appeared in the class text. Shown as *Contexto*. |
| `entries[].connotation` | no | Function or connotation (peyorativa, metáfora, ironía…). Shown as *Función / connotación*. |
| `entries[].type` | no | Part of speech, e.g. `"verbo"`, `"locución adverbial"`. Shown as a small hint. |
| `entries[].topic` | no | Overrides the file's `topic` for this one entry. |
| `entries[].accept` | no | Extra answers accepted in the *¿Qué palabra es?* question, e.g. `["gato por liebre"]`. |
| `entries[].related` | no | Near-synonyms in other entries, e.g. `["catábasis"]` for «descenso órfico», so they never appear as each other's wrong options in multiple choice. |
| `entries[].notes` | no | Any extra note (register, regional use, false friends…). |
| `entries[].id` | no | Only needed if the same word appears twice (e.g. two meanings). See below. |

**Topics** get their colour automatically. To create a new topic, just type a new name, and it
appears as a filter. Keep the spelling identical across files ("Medio ambiente" ≠ "Medioambiente").

**IDs and progress.** Each entry is identified by its word (`"desbordarse"` → `desbordarse`). Your progress
is attached to that ID, so:
- Fixing a definition, synonym or example keeps your progress.
- Changing the `word` itself starts that word's progress from zero.
- If the same word appears twice, give one of them an `"id"`, e.g. `"id": "plantilla-modelo"`.
  Otherwise the site warns about a duplicate and skips the second one.
- **Adding words or whole new lists never touches the progress of words you've already studied.**
  To double-check a change before committing it, run `python3 scripts/check_vocab_ids.py`: it lists any
  studied word whose ID would disappear (renamed, deleted, or its file removed from `index.json`).
  To rename a word and keep its progress, add `"id": "<old id>"` to it.

### JSON gotchas

- Text goes in `"double quotes"`. Straight quotes only; curly quotes (“ ”) from Word won't work as delimiters (inside text they're fine).
- Items are separated by commas, **but there is no comma after the last item** in a list or object.
- If you make a mistake, the site shows a yellow banner at the top naming the file and line. The rest
  of the content keeps working.

---

## How the vocabulary practice works

Open **Vocabulario** and a question is waiting: no settings to choose. It works like Anki:

- **New words** first appear on a *Palabra nueva* card: French translation, definition, synonyms,
  example, context and connotation. After *Entendido*, the word comes back as an exercise a couple of cards later.
  Up to 20 new words per day.
- **What comes next** is decided for you: reviews that are due first, then new words, then words you just missed.
- **Every answer is checked automatically** when you press Enter or pick an option. Missing accents are
  accepted but pointed out. If a typed answer is marked wrong but you're sure it's right (e.g. another valid
  form), click *Mi respuesta era correcta*.
- **Exercises get harder as you learn the word**, and never repeat the type used last time:
  - new or recently missed: multiple choice. Pick the French meaning, the word for a definition,
    the missing words in the example sentence, or a synonym.
  - seen once: French → Spanish, fill the gap in the sentence (with first letters as a hint),
    and definition → word.
  - well known: fill the gap with no hint, write your own sentence with the word, French → Spanish,
    definition → word.
- **After a mistake you type the correct answer** before moving on (accents included), so the right form
  sticks. This applies to every exercise whose answer is Spanish. It doesn't apply to "pick the French meaning"
  or to your own sentence, which has no single answer.
- **Your own sentence** is checked for what software can check: it uses the word (any form),
  has at least 6 words, and isn't the example copied. Compare the meaning with the example shown.
- **Feedback is short**: right or wrong, the word, its French, and the completed sentence. The full card is
  one click away (*Ver la ficha completa*).
- **Spacing**: a right answer schedules the next review in 1 day, then 3 days, then roughly 7, 18, 45 days…
  A wrong answer brings the word back in about a minute and makes it come back more often from then on.
- When nothing is due you get **¡Todo al día!**. *Seguir practicando* keeps going with your weakest words.
  In that free practice, right answers don't push words further into the future, but misses count.
- **Status** in the word list: *Sin intentar* (not introduced yet), *Por reforzar* (interval under 7 days),
  *Dominado* (7 days or more).
- Progress is stored **in this browser only**. A different browser or device, or clearing site data, starts from zero.

## Exam mode

**Modo examen** generates a test of 5 random words from all your vocabulary lists:

- **Sinónimos**: write a synonym for each word. Answers are checked against the entry's synonyms
  (missing accents are flagged but accepted). If yours is valid but not listed, mark it correct.
- **Frases de ejemplo**: write your own sentence with each word. Checked for what software can check
  (uses the word in any form, at least 6 words, not the example copied). The example is shown to compare with.

Nothing is corrected until you click **Corregir**, like in an exam. A clock shows the time taken. Exam
results don't change your spaced-repetition schedule. *Otras 5 palabras* draws a new set.

## Grammar files

One file per topic in `data/grammar/`, listed under `"grammar"` in `data/index.json`.
Every answer shows an explanation; every wrong option shows why it's wrong.

```json
{
  "topic": "Expresar y matizar la opinión",
  "summary": "Shown on the topic card and at the top of the rule summary.",
  "fiche": {
    "rules": [
      { "title": "Opinión negada → subjuntivo", "text": "**no creer que** + subjuntivo…", "examples": ["No creo que **tenga** razón."] }
    ],
    "pitfalls": ["*Creo que **sea** → Creo que **es**."]
  },
  "exercises": [
    {
      "prompt": "No creo que la autora ___ objetiva.",
      "options": ["es", "sea", "será"],
      "answer": "sea",
      "explanation": "**No creo que** niega la opinión → subjuntivo.",
      "whyNot": { "es": "Solo con la opinión afirmativa.", "será": "…" },
      "alsoAccepted": { }
    },
    {
      "instruction": "Conjuga el verbo entre paréntesis.",
      "prompt": "Es lógico que los ceutíes ___ (sentirse) preocupados.",
      "answers": ["se sientan"],
      "traps": { "se sienten": "Es indicativo: tras «es lógico que» va subjuntivo." },
      "explanation": "Valoración → subjuntivo."
    }
  ]
}
```

- **Multiple choice**: an exercise with `options` + `answer`. `whyNot` gives the reason for each wrong option.
  `alsoAccepted` lists options that are also correct, with a note on the nuance. They count as right.
- **Typed answer** (fill the gap, correct the sentence, transform…): no `options`, and `answers` lists every
  accepted answer. `traps` maps typical wrong answers to a specific explanation. If your answer isn't
  listed and isn't a trap, you can mark it correct yourself.
- `___` (3+ underscores) in `prompt` shows as a gap and is filled with the answer afterwards.
- `label` (e.g. `"Corrige el error"`) and `instruction` are optional. `**bold**` works in all texts.
- `"source": "class"` marks an exercise copied from class material (default `"generated"`).
- Progress is tracked per exercise by its `prompt` text (or its `id` if given), with the same
  spaced repetition as vocabulary: each round of 10 starts with what's due and what you got wrong.

## Writing files

One file per prompt in `data/writing/`, listed under `"writing"`. A prompt is split into `parts`,
each with its own writing box:

```json
{
  "title": "Presentación de un artículo de opinión",
  "description": "…",
  "notes": { "title": "Para enviar el lunes", "items": ["…"] },
  "parts": [
    {
      "id": "reflexion",
      "title": "Reflexión personal",
      "minutes": 5,
      "guidance": ["Tu posición", { "title": "A. El artículo", "items": ["¿Dónde…?"] }],
      "phrases": ["A mi juicio,", "Si bien es cierto que …, no es menos cierto que"],
      "checks": [ … ],
      "model": "Example text. Use \n for a new paragraph."
    }
  ]
}
```

`minutes` shows an estimated speaking time (130 words/min). Phrases are clickable and insert into the text.
For a classic ~250-word essay, use a single part with a word-count check.

**Checks** (shown live as ✓ / ✗ while you write):

| Check | Example | Passes when |
|---|---|---|
| word count | `{ "label": "Máx. 10 palabras", "maxWords": 10 }` | within `minWords` / `maxWords` |
| phrases | `{ "label": "Contraargumento", "anyOf": [["si bien"], ["sin embargo", "no obstante"]], "min": 1 }` | at least `min` of the entries are found. An entry can be a list of variants that counts once. Case and accents are ignored. |
| pattern | `{ "label": "Tres preguntas", "pattern": "¿[^?]+\\?", "min": 3 }` | the regular expression matches at least `min` times |
| mistake | `{ "label": "«No creo que» + indicativo", "avoid": "…", "max": 0 }` | shown as ⚠ only when it matches more than `max` times |
| self-check | `{ "label": "Respondo al contraargumento", "self": true }` | you tick it |

Add `"hint"` to any check to show advice while it fails. Drafts are saved automatically in this browser.
**Copiar todo** copies every part, and **Borrar borrador** clears the page.

