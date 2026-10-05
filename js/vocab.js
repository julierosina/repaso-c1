// Vocabulary: a continuous spaced-repetition stream (open the page → a question), and the word list.
// New words are introduced on a "Palabra nueva" card (with the French translation), then practised with
// exercises that get harder as the word matures. Every answer is checked automatically.

import { loadVocab } from './data.js';
import * as progress from './progress.js';
import { esc, hueFor, topicTag, statusBadge, shuffle } from './ui.js';
import { compare, containsWord, highlight, cloze, clozeHint, norm } from './text.js';

// New words introduced per day (the rest wait until tomorrow, or until you ask for more).
const NEW_PER_DAY = 20;
const MIN_OWN_SENTENCE_WORDS = 6;

const TYPES = {
  'elige-fr': { label: 'Traducción', prompt: '¿Qué significa en francés?', kind: 'choice' },
  'elige-palabra': { label: '¿Qué palabra es?', prompt: 'Elige la palabra o expresión que corresponde a la definición', kind: 'choice' },
  'elige-hueco': { label: 'Completa la frase', prompt: 'Elige lo que falta en la frase', kind: 'choice' },
  'elige-sinonimo': { label: 'Sinónimo', prompt: 'Elige un sinónimo', kind: 'choice' },
  'fr-es': { label: 'Del francés al español', prompt: '¿Cómo se dice en español?', kind: 'text' },
  hueco: { label: 'Completa la frase', prompt: 'Escribe lo que falta, en la forma adecuada', kind: 'text' },
  'hueco-libre': { label: 'Completa la frase', prompt: 'Escribe lo que falta, en la forma adecuada. Esta vez, sin pistas', kind: 'text' },
  inversa: { label: '¿Qué palabra es?', prompt: 'Escribe la palabra o expresión que corresponde a esta definición', kind: 'text' },
  ordena: { label: 'Ordena la frase', prompt: 'Toca las palabras en el orden correcto para reconstruir la frase', kind: 'order' },
  frase: { label: 'Tu propia frase', prompt: `Escribe una frase propia (${MIN_OWN_SENTENCE_WORDS} palabras o más) que use`, kind: 'text' },
};

// Multiple choice while a word is new, recall next, then production (index = correct reviews in a row).
const LEVELS = [
  ['elige-fr', 'elige-palabra', 'elige-hueco', 'elige-sinonimo'],
  ['fr-es', 'hueco', 'inversa', 'ordena'],
  ['hueco-libre', 'frase', 'fr-es', 'inversa', 'ordena'],
];

// ---------- Building one exercise ----------

// Up to `n` distinct wrong options, preferring words from the same topic.
// Words marked as `related` (near-synonyms) are never offered as wrong options for each other.
function distractors(e, entries, value, correct, n = 3) {
  const others = entries.filter(x => x !== e && !e.related.includes(x.word) && !x.related.includes(e.word));
  const pool = [...shuffle(others.filter(x => x.topicId === e.topicId)), ...shuffle(others.filter(x => x.topicId !== e.topicId))];
  const taken = new Set([norm(correct), ...(e.synonyms || []).map(norm)]);
  const out = [];
  for (const x of pool) {
    const v = value(x);
    if (!v || taken.has(norm(v))) continue;
    taken.add(norm(v));
    out.push(v);
    if (out.length === n) break;
  }
  return out.length === n ? out : null;
}

const tokensOf = s => String(s).trim().split(/\s+/);

// Returns a ready-to-show question, or null when this word can't support that exercise type.
function build(type, e, entries) {
  const q = { type, entry: e };
  const choice = (correct, value) => {
    const wrong = distractors(e, entries, value, correct);
    if (!correct || !wrong) return null;
    return Object.assign(q, { correct, options: shuffle([correct, ...wrong]) });
  };
  switch (type) {
    case 'elige-fr':
      return choice(e.fr, x => x.fr);
    case 'elige-palabra':
      return e.definition ? choice(e.word, x => x.word) : null;
    case 'elige-sinonimo':
      return e.synonyms.length ? choice(shuffle(e.synonyms)[0], x => x.synonyms[0]) : null;
    case 'elige-hueco': {
      q.gap = cloze(e.example, e.word);
      return q.gap ? choice(q.gap.answer, x => cloze(x.example, x.word)?.answer) : null;
    }
    case 'fr-es':
      return e.fr ? Object.assign(q, { answers: [e.word, ...e.accept] }) : null;
    case 'inversa':
      return e.definition ? Object.assign(q, { answers: [e.word, ...e.accept] }) : null;
    case 'hueco':
    case 'hueco-libre':
      q.gap = cloze(e.example, e.word);
      return q.gap ? Object.assign(q, { answers: [q.gap.answer] }) : null;
    case 'ordena': {
      const tokens = e.example ? tokensOf(e.example) : [];
      if (tokens.length < 5 || tokens.length > 14) return null;
      let bank = shuffle(tokens.map((t, i) => ({ t, i })));
      while (bank.every((b, k) => b.i === k)) bank = shuffle(bank);
      return Object.assign(q, { tokens, bank });
    }
    case 'frase':
      return q;
  }
  return null;
}

function makeQuestion(e, entries) {
  const r = progress.get(e.key);
  const level = LEVELS[Math.min(r?.reps || 0, LEVELS.length - 1)];
  const tryTypes = list => {
    const varied = shuffle(list.filter(t => t !== r?.lastType));
    for (const t of [...varied, ...list.filter(t => t === r?.lastType)]) {
      const q = build(t, e, entries);
      if (q) return q;
    }
    return null;
  };
  return tryTypes(level) || tryTypes(Object.keys(TYPES));
}

// ---------- Choosing the next card ----------

// Due reviews first (most overdue first), then new words, then words being relearnt.
// With `practice`, when nothing is due it keeps going with the words you've struggled with most.
function nextCard(entries, recent, { practice, extraNew }) {
  const now = Date.now();
  const r = e => progress.get(e.key);
  const last = recent[recent.length - 1];
  const notLast = list => list.find(e => e.key !== last) || null;

  const scheduled = entries.filter(e => progress.isScheduled(e.key));
  const due = scheduled.filter(e => r(e).due <= now).sort((a, b) => r(a).due - r(b).due);
  let c = notLast(due);
  if (c) return { entry: c, scheduled: true };

  const fresh = entries.filter(e => !progress.isScheduled(e.key));
  if (fresh.length && (extraNew || progress.today().newSeen < NEW_PER_DAY)) {
    return { entry: fresh[Math.floor(Math.random() * fresh.length)], isNew: true };
  }

  const relearning = scheduled.filter(e => r(e).interval === 0).sort((a, b) => r(a).due - r(b).due);
  c = notLast(relearning) || due[0] || relearning[0];
  if (c) return { entry: c, scheduled: true };

  if (practice && scheduled.length) {
    const ranked = scheduled
      .map(e => [e, (r(e).lapses || 0) * 2 + (r(e).ease < 2.5 ? 1 : 0) + Math.random() * 2])
      .sort((a, b) => b[1] - a[1])
      .map(([e]) => e);
    return { entry: notLast(ranked) || ranked[0], scheduled: false };
  }
  return null;
}

function counts(entries) {
  const now = Date.now();
  const day = progress.today();
  const fresh = entries.filter(e => !progress.isScheduled(e.key)).length;
  return {
    due: entries.filter(e => progress.isDue(e.key, now)).length,
    newLeft: Math.min(fresh, Math.max(0, NEW_PER_DAY - day.newSeen)),
    freshTotal: fresh,
    done: day.reviewed,
  };
}

function when(ts) {
  const diff = ts - Date.now();
  if (diff < 60 * 60 * 1000) return 'en unos minutos';
  const d = new Date(ts);
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `hoy a las ${time}`;
  if (d.toDateString() === new Date(Date.now() + 864e5).toDateString()) return 'mañana';
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- Shared bits of markup ----------

const frLine = e => (e.fr ? `<p class="fr-line"><span class="fr-tag">FR</span>${esc(e.fr)}</p>` : '');

const gapSentence = (gap, inner) => `<p class="q-sentence">${esc(gap.before)}${inner}${esc(gap.after)}</p>`;

function fullCard(e) {
  const row = (label, html) => (html ? `<div><dt>${label}</dt><dd>${html}</dd></div>` : '');
  return `<dl class="solution">
    ${row('Francés', esc(e.fr))}
    ${row('Definición', esc(e.definition))}
    ${row('Sinónimos', e.synonyms.map(esc).join(' · '))}
    ${e.example ? `<div><dt>Ejemplo</dt><dd class="example">${highlight(e.example, e.word)}</dd></div>` : ''}
    ${row('Contexto', esc(e.context))}
    ${row('Función / connotación', esc(e.connotation))}
    ${row('Nota', esc(e.notes))}
  </dl>`;
}

// ---------- Practice stream ----------

export async function renderVocab(root) {
  const { entries } = await loadVocab();
  if (!entries.length) {
    root.innerHTML = `<section class="page-head"><p class="eyebrow">Vocabulario</p><h1>Aún no hay palabras</h1>
      <p class="lede">Añade una lista en <code>data/vocab/</code> (el README explica cómo).</p></section>`;
    return;
  }

  const mode = { practice: false, extraNew: false };
  const recent = [];
  let current = null; // { entry, isNew, scheduled, q }
  let answered = false;

  const onKey = ev => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    if (ev.metaKey || ev.ctrlKey || ev.altKey || answered || !current?.q) return;
    if (current.q.options && /^[1-9]$/.test(ev.key)) {
      const b = root.querySelectorAll('.option')[ev.key - 1];
      if (b) b.click();
    }
  };
  document.addEventListener('keydown', onKey);

  next();

  function next() {
    answered = false;
    const pick = nextCard(entries, recent, mode);
    if (!pick) return caughtUp();
    current = pick;
    if (pick.isNew) return intro();
    current.q = makeQuestion(pick.entry, entries);
    show();
  }

  function remember(key) {
    recent.push(key);
    if (recent.length > 3) recent.shift();
  }

  function topBar() {
    const c = counts(entries);
    return `
      <div class="quiz-top">
        <div class="counters">
          <span class="counter c-due"><strong>${c.due}</strong> por repasar</span>
          <span class="counter c-new"><strong>${c.newLeft}</strong> ${c.newLeft === 1 ? 'nueva' : 'nuevas'}</span>
          <span class="counter c-done"><strong>${c.done}</strong> hoy</span>
        </div>
        <a class="link" href="#/vocab/lista">Lista de palabras →</a>
      </div>
      ${current && current.scheduled === false ? '<p class="practice-note">Práctica libre: los aciertos no cambian tu calendario de repaso; los fallos sí.</p>' : ''}`;
  }

  // A new word: study it once before practising it.
  function intro() {
    const e = current.entry;
    root.innerHTML = `
      <div class="quiz">
        ${topBar()}
        <article class="panel q-card intro-card">
          <div class="q-meta"><span class="qtype">Palabra nueva</span>${topicTag(e.topicId, e.topic)}</div>
          <h2 class="q-word">${esc(e.word)}</h2>
          ${e.type ? `<p class="q-pos">${esc(e.type)}</p>` : ''}
          ${frLine(e)}
          ${fullCard({ ...e, fr: '' })}
          <div class="next-row">
            <button type="button" class="btn primary" data-learned>Entendido, a practicar <kbd>↵</kbd></button>
          </div>
        </article>
      </div>`;
    const btn = root.querySelector('[data-learned]');
    btn.addEventListener('click', () => {
      progress.introduce(e.key);
      remember(e.key);
      next();
    });
    btn.focus({ preventScroll: true });
  }

  function show() {
    const { q } = current;
    const e = q.entry;
    const t = TYPES[q.type];

    let prompt = '';
    if (q.type === 'elige-fr' || q.type === 'elige-sinonimo' || q.type === 'frase') {
      prompt = `<h2 class="q-word">${esc(e.word)}</h2>${e.type ? `<p class="q-pos">${esc(e.type)}</p>` : ''}`;
    } else if (q.type === 'elige-palabra' || q.type === 'inversa') {
      prompt = `<p class="q-definition">${esc(e.definition)}</p>`;
    } else if (q.type === 'fr-es') {
      prompt = `<p class="q-definition"><span class="fr-tag">FR</span>${esc(e.fr)}</p>`;
    } else if (q.gap) {
      const n = q.gap.answer.split(/\s+/).length;
      const hint = q.type === 'hueco' ? clozeHint(q.gap.answer) : q.type === 'hueco-libre' ? `${n} ${n === 1 ? 'palabra' : 'palabras'}` : '…';
      prompt = gapSentence(q.gap, `<span class="blank">${esc(hint)}</span>`);
    } else if (q.type === 'ordena') {
      prompt = `<p class="q-pos">Frase con <strong>${esc(e.word)}</strong>${e.fr ? ` (${esc(e.fr)})` : ''}</p>`;
    }

    let input = '';
    if (t.kind === 'choice') {
      input = `<div class="options">${q.options.map((o, k) => `
        <button type="button" class="option" data-opt="${esc(o)}"><kbd>${k + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div>`;
    } else if (t.kind === 'order') {
      input = `
        <div class="tiles-answer" data-answer aria-label="Tu frase"></div>
        <div class="tiles-bank" data-bank>${q.bank.map((b, k) => `<button type="button" class="tile" data-k="${k}">${esc(b.t)}</button>`).join('')}</div>
        <div class="q-actions">
          <button type="button" class="btn ghost" data-reset>Empezar de nuevo</button>
          <button type="button" class="btn primary" data-check disabled>Comprobar</button>
        </div>`;
    } else {
      const area = q.type === 'frase'
        ? `<textarea name="answer" rows="3" placeholder="Escribe tu frase…" spellcheck="false"></textarea>`
        : `<input name="answer" type="text" placeholder="Tu respuesta…" spellcheck="false" autocapitalize="off">`;
      input = `
        <form class="q-form" autocomplete="off">
          ${area}
          <div class="q-actions">
            <span class="hint"><kbd>↵</kbd> comprobar</span>
            <button type="button" class="btn ghost" data-dunno>No lo sé</button>
            <button type="submit" class="btn primary">Comprobar</button>
          </div>
        </form>`;
    }

    root.innerHTML = `
      <div class="quiz">
        ${topBar()}
        <article class="panel q-card">
          <div class="q-meta">
            <span class="qtype">${t.label}</span>
            ${topicTag(e.topicId, e.topic)}
          </div>
          <p class="q-prompt">${t.prompt}</p>
          ${prompt}
          ${input}
          <div class="reveal" hidden></div>
        </article>
      </div>`;

    if (t.kind === 'choice') {
      root.querySelectorAll('.option').forEach(b => b.addEventListener('click', () => checkChoice(b.dataset.opt)));
    } else if (t.kind === 'order') {
      setupTiles();
    } else {
      const form = root.querySelector('.q-form');
      const field = form.elements.answer;
      field.focus({ preventScroll: true });
      if (field.tagName === 'TEXTAREA') {
        field.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
            ev.preventDefault();
            form.requestSubmit();
          }
        });
      }
      form.addEventListener('submit', ev => {
        ev.preventDefault();
        checkText(field.value.trim());
      });
      root.querySelector('[data-dunno]').addEventListener('click', () => checkText(''));
    }
  }

  // ----- Checking -----

  function checkChoice(opt) {
    if (answered) return;
    const { q } = current;
    const correct = opt === q.correct;
    root.querySelectorAll('.option').forEach(b => {
      b.disabled = true;
      if (b.dataset.opt === q.correct) b.classList.add('is-correct');
      else if (b.dataset.opt === opt) b.classList.add('is-wrong');
    });
    feedback({ correct, verdict: correct ? '¡Correcto!' : `No. La respuesta era <strong>${esc(q.correct)}</strong>.` });
  }

  function checkText(answer) {
    if (answered) return;
    const { q } = current;
    const e = q.entry;
    const form = root.querySelector('.q-form');
    form.querySelectorAll('input, textarea, button').forEach(el => (el.disabled = true));
    form.querySelector('.q-actions').hidden = true;

    if (!answer) return feedback({ correct: false, verdict: `Sin respuesta. ${q.answers ? `Era <strong>${esc(q.answers[0])}</strong>.` : ''}` });

    if (q.type === 'frase') {
      const words = answer.split(/\s+/).filter(Boolean).length;
      const checks = [
        [containsWord(answer, e.word) !== false, `Usa «${esc(e.word)}» (en cualquier forma)`],
        [words >= MIN_OWN_SENTENCE_WORDS, `Tiene al menos ${MIN_OWN_SENTENCE_WORDS} palabras (${words})`],
        [norm(answer) !== norm(e.example), 'Es una frase tuya, no el ejemplo copiado'],
      ];
      const correct = checks.every(([ok]) => ok);
      return feedback({
        correct,
        canOverride: !correct,
        verdict: correct ? '¡Bien! Tu frase cumple los requisitos.' : 'Tu frase no cumple todos los requisitos.',
        extra: `<p class="your-sentence">«${esc(answer)}»</p>
          <ul class="checks">${checks.map(([ok, label]) => `<li class="check ${ok ? 'ok' : 'fail'}"><span class="ic">${ok ? '✓' : '✗'}</span><span>${label}</span></li>`).join('')}</ul>
          <p class="muted small">El sitio no puede juzgar el sentido de la frase: compárala con el ejemplo de abajo.</p>`,
      });
    }

    const r = compare(answer, q.answers);
    if (r.result === 'exact') return feedback({ correct: true, verdict: '¡Correcto!' });
    if (r.result === 'accents') return feedback({ correct: true, verdict: `¡Correcto! Ojo a las tildes: <strong>${esc(r.match)}</strong>` });
    if (q.gap && containsWord(answer, e.word)) {
      return feedback({
        correct: false,
        canOverride: true,
        verdict: `Es la palabra correcta, pero no la forma que pide la frase: <strong>${esc(q.gap.answer)}</strong>.`,
      });
    }
    feedback({ correct: false, canOverride: true, verdict: `Tu respuesta: <strong>${esc(answer)}</strong>. Era <strong>${esc(q.answers[0])}</strong>.` });
  }

  function setupTiles() {
    const { q } = current;
    const answerEl = root.querySelector('[data-answer]');
    const bankEl = root.querySelector('[data-bank]');
    const checkBtn = root.querySelector('[data-check]');
    const placed = [];

    const refresh = () => {
      answerEl.innerHTML = placed.map((k, pos) => `<button type="button" class="tile placed" data-pos="${pos}">${esc(q.bank[k].t)}</button>`).join('')
        || '<span class="tiles-placeholder">Toca las palabras de abajo…</span>';
      bankEl.querySelectorAll('.tile').forEach(b => (b.hidden = placed.includes(Number(b.dataset.k))));
      checkBtn.disabled = placed.length !== q.bank.length;
      if (!checkBtn.disabled) checkBtn.focus({ preventScroll: true });
    };
    bankEl.addEventListener('click', ev => {
      const b = ev.target.closest('.tile');
      const k = Number(b?.dataset.k);
      if (!b || answered || placed.includes(k)) return;
      placed.push(k);
      refresh();
    });
    answerEl.addEventListener('click', ev => {
      const b = ev.target.closest('.tile');
      if (!b || answered) return;
      placed.splice(Number(b.dataset.pos), 1);
      refresh();
    });
    root.querySelector('[data-reset]').addEventListener('click', () => {
      placed.length = 0;
      refresh();
    });
    checkBtn.addEventListener('click', () => {
      const built = placed.map(k => q.bank[k].t).join(' ');
      const correct = built === q.tokens.join(' ');
      root.querySelectorAll('.tile').forEach(b => (b.disabled = true));
      root.querySelector('.q-actions').hidden = true;
      answerEl.classList.add(correct ? 'is-correct' : 'is-wrong');
      feedback({ correct, verdict: correct ? '¡Correcto!' : 'El orden no es correcto. La frase era:' });
    });
    refresh();
  }

  // ----- Feedback: short, focused on this word -----

  function feedback({ correct, verdict, extra = '', canOverride = false }) {
    answered = true;
    const { q, scheduled } = current;
    const e = q.entry;
    let state = correct;

    let focus;
    if (q.gap) focus = gapSentence(q.gap, `<mark>${esc(q.gap.answer)}</mark>`);
    else if (e.example && (q.type === 'ordena' || q.type === 'frase')) focus = `<p class="example">${highlight(e.example, e.word)}</p>`;
    else focus = e.definition ? `<p>${esc(e.definition)}</p>` : '';

    const box = root.querySelector('.reveal');
    box.hidden = false;
    box.innerHTML = `
      <div class="verdict-slot"><p class="verdict verdict-${correct ? 'good' : 'bad'}">${correct ? '✓' : '✗'} ${verdict}</p></div>
      ${extra}
      <div class="mini-card">
        <p class="mini-word"><strong>${esc(e.word)}</strong>${e.fr ? ` <span class="fr-tag">FR</span><span class="mini-fr">${esc(e.fr)}</span>` : ''}</p>
        ${focus}
      </div>
      <details class="more"><summary>Ver la ficha completa</summary>${fullCard(e)}</details>
      <div class="next-row">
        ${canOverride ? '<button type="button" class="btn ghost" data-override>Mi respuesta era correcta</button>' : ''}
        <button type="button" class="btn primary" data-next>Siguiente <kbd>↵</kbd></button>
      </div>`;

    box.querySelector('[data-override]')?.addEventListener('click', ev => {
      state = true;
      box.querySelector('.verdict-slot').innerHTML = '<p class="verdict verdict-good">✓ Marcada como correcta.</p>';
      ev.currentTarget.remove();
      box.querySelector('[data-next]').focus();
    });
    const nextBtn = box.querySelector('[data-next]');
    nextBtn.addEventListener('click', () => {
      progress.review(e.key, state, q.type, { practice: !scheduled });
      remember(e.key);
      next();
    });
    nextBtn.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function caughtUp() {
    current = null;
    const c = counts(entries);
    const upcoming = entries.map(e => progress.get(e.key)?.due).filter(Boolean).sort((a, b) => a - b);
    const limitHit = c.freshTotal > 0 && c.newLeft === 0;

    root.innerHTML = `
      <div class="quiz">
        ${topBar()}
        <div class="panel done-card">
          <div class="done-icon">✓</div>
          <h1>¡Todo al día!</h1>
          <p class="lede">
            ${c.done ? `Has hecho ${c.done} ${c.done === 1 ? 'ejercicio' : 'ejercicios'} hoy.` : ''}
            ${upcoming.length ? `Próximo repaso: ${when(upcoming[0])}.` : ''}
            ${limitHit ? `<br>Ya has aprendido ${NEW_PER_DAY} palabras nuevas hoy; quedan ${c.freshTotal} para los próximos días.` : ''}
          </p>
          <div class="actions">
            ${limitHit ? '<button type="button" class="btn primary" data-more>Aprender más palabras nuevas</button>' : ''}
            <button type="button" class="btn ${limitHit ? 'ghost' : 'primary'}" data-practice>Seguir practicando</button>
            <a class="btn ghost" href="#/vocab/lista">Ver la lista</a>
          </div>
        </div>
      </div>`;

    root.querySelector('[data-more]')?.addEventListener('click', () => {
      mode.extraNew = true;
      next();
    });
    root.querySelector('[data-practice]').addEventListener('click', () => {
      mode.practice = true;
      next();
    });
  }
}

// ---------- Word list ----------

export async function renderVocabList(root) {
  const { entries, topics } = await loadVocab();
  let topic = 'all';
  let st = 'all';
  let q = '';

  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow"><a href="#/vocab">Vocabulario</a></p>
      <h1>Lista de palabras</h1>
      <p class="lede">Todas las palabras con su traducción, definición, sinónimos y ejemplo.</p>
    </section>
    <div class="filters">
      <input type="search" class="search" placeholder="Buscar…" aria-label="Buscar palabra">
      <div class="chips" data-filter="topic">
        <button type="button" class="chip-btn is-on" data-v="all">Todos los temas</button>
        ${topics.map(t => `<button type="button" class="chip-btn" style="--h:${hueFor(t.id)}" data-v="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
      </div>
      <div class="chips" data-filter="status">
        <button type="button" class="chip-btn is-on" data-v="all">Todas</button>
        <button type="button" class="chip-btn" data-v="mastered">Dominadas</button>
        <button type="button" class="chip-btn" data-v="learning">Por reforzar</button>
        <button type="button" class="chip-btn" data-v="new">Sin intentar</button>
      </div>
    </div>
    <p class="muted" id="list-count"></p>
    <div class="word-grid" id="grid"></div>`;

  const grid = root.querySelector('#grid');
  const countEl = root.querySelector('#list-count');

  const draw = () => {
    const needle = q.toLowerCase();
    const shown = entries
      .filter(e => (topic === 'all' || e.topicId === topic) && (st === 'all' || progress.status(e.key) === st))
      .filter(e => !needle || [e.word, e.fr, e.definition, ...e.synonyms].some(x => x.toLowerCase().includes(needle)))
      .sort((a, b) => a.word.localeCompare(b.word, 'es'));
    countEl.textContent = `${shown.length} ${shown.length === 1 ? 'palabra' : 'palabras'}`;
    grid.innerHTML = shown.length
      ? shown.map(wordCard).join('')
      : '<div class="panel empty-state">Ninguna palabra coincide con los filtros.</div>';
  };

  root.querySelector('.search').addEventListener('input', ev => {
    q = ev.target.value.trim();
    draw();
  });
  root.querySelectorAll('[data-filter]').forEach(group =>
    group.addEventListener('click', ev => {
      const b = ev.target.closest('.chip-btn');
      if (!b) return;
      group.querySelectorAll('.chip-btn').forEach(x => x.classList.toggle('is-on', x === b));
      if (group.dataset.filter === 'topic') topic = b.dataset.v;
      else st = b.dataset.v;
      draw();
    })
  );
  draw();
}

function wordCard(e) {
  const p = progress.get(e.key);
  return `
    <article class="word-card" style="--h:${hueFor(e.topicId)}">
      <header>
        <h3>${esc(e.word)}</h3>
        ${e.type ? `<span class="pos">${esc(e.type)}</span>` : ''}
      </header>
      ${frLine(e)}
      ${e.definition ? `<p class="def">${esc(e.definition)}</p>` : ''}
      ${e.synonyms.length ? `<p class="syn"><span class="label">Sinónimos</span> ${e.synonyms.map(esc).join(' · ')}</p>` : ''}
      ${e.example ? `<p class="example">${highlight(e.example, e.word)}</p>` : ''}
      ${e.context ? `<p class="syn"><span class="label">Contexto</span> ${esc(e.context)}</p>` : ''}
      ${e.connotation ? `<p class="syn"><span class="label">Connotación</span> ${esc(e.connotation)}</p>` : ''}
      ${e.notes ? `<p class="note">${esc(e.notes)}</p>` : ''}
      <footer>
        ${topicTag(e.topicId, e.topic)}
        ${statusBadge(progress.status(e.key))}
        ${p?.due ? `<span class="muted small">${p.correct}/${p.attempts} aciertos · repaso ${progress.isDue(e.key) ? 'pendiente' : when(p.due)}</span>` : ''}
      </footer>
    </article>`;
}
