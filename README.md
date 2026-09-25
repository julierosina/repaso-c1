# Repaso C1 — Spanish exam revision

A small static site for revising C1 Spanish: vocabulary, grammar, writing and practice exams.
Plain HTML/CSS/JavaScript, no build step. All content lives in JSON files under `data/`,
and your progress is saved in your browser (localStorage).

**Status:** Vocabulary is built. Grammar, Writing, Practice exam and the Progress dashboard come next.

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
  vocab.js              vocabulary quiz, summary and word list
  data.js               loads + checks the data files
  progress.js           per-item progress in localStorage
  text.js               answer comparison (accents, word forms)
  ui.js                 shared helpers (tags, colours, shuffle)
data/
  index.json            ← lists every content file the site should load
  vocab/*.json          vocabulary lists
```

---

## Adding content yourself

### 1. The index file

`data/index.json` lists which files are loaded. **A new file does nothing until it is listed here.**

```json
{
  "vocab": [
    "vocab/ejemplo-medio-ambiente.json",
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
| `entries[].definition` | **yes** | Definition in Spanish. |
| `entries[].synonyms` | recommended | List of 1–2 synonyms. The *Sinónimo* question checks your answer against these. |
| `entries[].example` | recommended | One example sentence. The word is highlighted automatically. |
| `entries[].type` | no | Part of speech, e.g. `"verbo"`, `"locución adverbial"`. Shown as a small hint. |
| `entries[].topic` | no | Overrides the file's `topic` for this one entry. |
| `entries[].accept` | no | Extra answers accepted in the *¿Qué palabra es?* question, e.g. `["gato por liebre"]`. |
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

### JSON gotchas

- Text goes in `"double quotes"`. Straight quotes only; curly quotes (“ ”) from Word won't work as delimiters (inside text they're fine).
- Items are separated by commas, **but there is no comma after the last item** in a list or object.
- If you make a mistake, the site shows a yellow banner at the top naming the file and line. The rest
  of the content keeps working.

---

## How the vocabulary quiz works

- **Question types** (mixed randomly, choose which ones in the setup):
  - *Definición*: see the word, explain it. Self-checked against the definition.
  - *Sinónimo*: see the word, type a synonym. Auto-checked against the list (tildes are flagged
    but accepted). If your synonym is valid but not listed, you can still mark it correct.
  - *Frase de ejemplo*: see the word, write a sentence. The site warns you if your sentence doesn't seem
    to contain the word; you judge the rest.
  - *¿Qué palabra es?*: see the definition, type the word. Auto-checked.
- After each answer you see the full card and decide **✓ Sí** or **✗ A repasar** (keys `1` / `2`).
  When the site can judge, it highlights its suggestion; you always have the final say.
- **Progress**: an item is *Dominado* (mastered) after **3 correct answers in a row**. One miss puts it
  back to *Por reforzar*. Sessions prioritise words you're struggling with, then new ones, then
  mastered ones you haven't seen for a while.
- Progress is stored **in this browser only**. A different browser or device starts from zero.
  Clearing site data erases it. An export/import option will come with the Progress dashboard.

---

## Planned data formats (draft, not used yet)

These will be finalised when each section is built; they're here so you can see where things are headed.

**Grammar**: `data/grammar/<topic>.json`
```json
{
  "topic": "de ahí que + subjuntivo",
  "fiche": {
    "use": "Introduce una consecuencia de algo ya mencionado.",
    "structure": "de ahí que + subjuntivo",
    "pitfalls": ["No se usa con indicativo: *de ahí que es → de ahí que sea"],
    "examples": ["Llovió toda la noche; de ahí que las calles estén inundadas."]
  },
  "exercises": [
    { "kind": "fill", "source": "class", "prompt": "No estudió nada; de ahí que ___ (suspender).", "answers": ["suspendiera", "suspendiese"] },
    { "kind": "transform", "source": "generated", "prompt": "Reescribe con «de ahí que»: …", "answers": ["…"] }
  ]
}
```

**Writing**: `data/writing/<exam-or-theme>.json`: prompts with a checklist, connectors,
target C1 phrases and optional scaffolding exercises.
