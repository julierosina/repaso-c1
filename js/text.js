// Text helpers: normalising answers, comparing them, and finding a word inside a sentence.

export function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function norm(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[¿?¡!.,;:"“”«»()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(s) {
  return stripAccents(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Compare a typed answer against a list of accepted answers.
// Returns 'exact', 'accents' (right except for tildes), 'wrong' or 'empty'.
export function compare(answer, targets) {
  const a = norm(answer);
  if (!a) return { result: 'empty' };
  for (const t of targets) if (norm(t) === a) return { result: 'exact', match: t };
  const bare = stripAccents(a);
  for (const t of targets) if (stripAccents(norm(t)) === bare) return { result: 'accents', match: t };
  return { result: 'wrong' };
}

// Very common verbs/pronouns inside expressions that are conjugated too irregularly to stem.
const STOP = new Set(['algo', 'alguien', 'estar', 'tener', 'hacer', 'poner', 'echar', 'llevar', 'quedar', 'haber', 'para', 'como']);

// Rough stems for the meaningful words of an entry ("desbordarse" -> "desbo"),
// so conjugated or plural forms in a sentence still count as the word.
export function stemsOf(word) {
  return stripAccents(norm(word))
    .split(' ')
    .filter(w => w.length > 3 && !STOP.has(w))
    .map(w => (w.length > 6 && w.endsWith('se') ? w.slice(0, -2) : w))
    .map(w => w.slice(0, Math.max(4, w.length - 4)));
}

// true / false, or null when the word has nothing we can reliably look for.
export function containsWord(sentence, word) {
  const stems = stemsOf(word);
  if (!stems.length) return null;
  const tokens = stripAccents(norm(sentence)).split(' ');
  return stems.every(stem => tokens.some(t => t.startsWith(stem)));
}

// Escaped HTML of `text` with the forms of `word` wrapped in <mark>.
export function highlight(text, word) {
  const stems = stemsOf(word);
  return String(text ?? '')
    .split(/(\p{L}+)/u)
    .map((part, i) => {
      const safe = escapeHTML(part);
      if (i % 2 === 1 && stems.some(st => stripAccents(part.toLowerCase()).startsWith(st))) return `<mark>${safe}</mark>`;
      return safe;
    })
    .join('');
}

// Checks for a sentence the learner wrote with `word`: what software can verify, not the meaning.
// Returns [[ok, labelHTML], ...].
export function sentenceChecks(answer, word, example, minWords = 6) {
  const words = String(answer).split(/\s+/).filter(Boolean).length;
  return [
    [containsWord(answer, word) !== false, `Usa «${escapeHTML(word)}» (en cualquier forma)`],
    [words >= minWords, `Tiene al menos ${minWords} palabras (${words})`],
    [norm(answer) !== norm(example), 'Es una frase tuya, no el ejemplo copiado'],
  ];
}

// Split a sentence around the shortest stretch that contains every stem of `word`,
// e.g. "…las compañías se [quedaron con la tajada del león] de…". null if not found.
export function cloze(text, word) {
  const stems = stemsOf(word);
  if (!stems.length) return null;
  const parts = String(text ?? '').split(/(\p{L}+)/u); // odd indexes are words
  const hit = i => stems.findIndex(st => stripAccents(parts[i].toLowerCase()).startsWith(st));
  let best = null;
  for (let s = 1; s < parts.length; s += 2) {
    if (hit(s) < 0) continue;
    const found = new Set();
    for (let e = s; e < parts.length && e - s <= 20; e += 2) {
      const h = hit(e);
      if (h >= 0) found.add(h);
      if (found.size === stems.length) {
        if (!best || e - s < best[1] - best[0]) best = [s, e];
        break;
      }
    }
  }
  if (!best) return null;
  return {
    before: parts.slice(0, best[0]).join(''),
    answer: parts.slice(best[0], best[1] + 1).join(''),
    after: parts.slice(best[1] + 1).join(''),
  };
}

// "quedaron con la tajada del león" -> "q… con la t… del l…"
export function clozeHint(answer) {
  return answer
    .split(/\s+/)
    .map(w => (w.length <= 3 ? w : w[0] + '…'))
    .join(' ');
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
