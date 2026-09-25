// Vocabulary: a continuous spaced-repetition stream (open the page → a question), and the word list.
// Which word comes next and which kind of exercise it gets are decided automatically.

import { loadVocab } from './data.js';
import * as progress from './progress.js';
import { esc, hueFor, topicTag, statusBadge } from './ui.js';
import { compare, containsWord, highlight, cloze, clozeHint } from './text.js';

// New words introduced per day (the rest wait until tomorrow, or until you ask for more).
const NEW_PER_DAY = 20;

const TYPES = {
  definicion: {
    label: 'Definición',
    prompt: '¿Qué significa?',
    input: 'textarea',
    placeholder: 'Explica el significado con tus palabras…',
    applies: e => !!e.definition,
  },
  sinonimo: {
    label: 'Sinónimo',
    prompt: 'Escribe un sinónimo',
    input: 'text',
    placeholder: 'Un sinónimo…',
    applies: e => e.synonyms.length > 0,
  },
  inversa: {
    label: '¿Qué palabra es?',
    prompt: '¿Qué palabra o expresión corresponde a esta definición?',
    input: 'text',
    placeholder: 'La palabra…',
    applies: e => !!e.definition,
  },
  hueco: {
    label: 'Completa la frase',
    prompt: 'Completa con la palabra o expresión que falta, en la forma adecuada',
    input: 'text',
    placeholder: 'Lo que falta…',
    applies: e => !!cloze(e.example, e.word),
  },
  ejemplo: {
    label: 'Frase de ejemplo',
    prompt: 'Úsala en una frase',
    input: 'textarea',
    placeholder: 'Escribe una frase que use la palabra en contexto…',
    applies: () => true,
  },
};

// Recognition while a word is new, recall and production as it matures (index = correct reviews in a row).
const LEVELS = [
  ['definicion', 'sinonimo'],
  ['sinonimo', 'inversa', 'hueco', 'definicion'],
  ['inversa', 'hueco', 'ejemplo', 'sinonimo'],
];

function pickType(e) {
  const r = progress.get(e.key);
  const usable = list => list.filter(t => TYPES[t].applies(e));
  let options = usable(LEVELS[Math.min(r?.reps || 0, LEVELS.length - 1)]);
  if (!options.length) options = usable(Object.keys(TYPES));
  const varied = options.filter(t => t !== r?.lastType);
  const pool = varied.length ? varied : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Due reviews first (most overdue first), then new words, then words being relearnt.
// With `practice`, when nothing is due it keeps going with the words you've struggled with most.
function nextCard(entries, recent, { practice, extraNew }) {
  const now = Date.now();
  const r = e => progress.get(e.key);
  const avoid = list => list.find(e => !recent.includes(e.key)) || null;

  const scheduled = entries.filter(e => progress.isScheduled(e.key));
  const due = scheduled.filter(e => r(e).due <= now).sort((a, b) => r(a).due - r(b).due);
  let c = avoid(due);
  if (c) return { entry: c, scheduled: true };

  const fresh = entries.filter(e => !progress.isScheduled(e.key));
  if (fresh.length && (extraNew || progress.today().newSeen < NEW_PER_DAY)) {
    return { entry: fresh[Math.floor(Math.random() * fresh.length)], isNew: true, scheduled: true };
  }

  const relearning = scheduled.filter(e => r(e).interval === 0).sort((a, b) => r(a).due - r(b).due);
  c = avoid(relearning) || due[0] || relearning[0];
  if (c) return { entry: c, scheduled: true };

  if (practice && scheduled.length) {
    const ranked = scheduled
      .map(e => [e, (r(e).lapses || 0) * 2 + (r(e).ease < 2.5 ? 1 : 0) + Math.random() * 2])
      .sort((a, b) => b[1] - a[1])
      .map(([e]) => e);
    return { entry: avoid(ranked) || ranked[0], scheduled: false };
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

const inDays = d => (d <= 1 ? 'mañana' : d < 7 ? `en ${d} días` : d < 30 ? `en ${Math.round(d / 7)} sem.` : `en ${Math.round(d / 30)} ${Math.round(d / 30) === 1 ? 'mes' : 'meses'}`);

function when(ts) {
  const diff = ts - Date.now();
  if (diff < 60 * 60 * 1000) return 'en unos minutos';
  const d = new Date(ts);
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `hoy a las ${time}`;
  if (d.toDateString() === new Date(Date.now() + 864e5).toDateString()) return 'mañana';
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
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
  let current = null;
  let grade = null;

  const onKey = ev => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    if (!grade || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === '1') grade(true);
    else if (ev.key === '2') grade(false);
  };
  document.addEventListener('keydown', onKey);

  next();

  function next() {
    grade = null;
    const pick = nextCard(entries, recent, mode);
    if (!pick) return caughtUp();
    current = { ...pick, type: pickType(pick.entry) };
    show();
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
      ${current && !current.scheduled ? '<p class="practice-note">Práctica libre: los aciertos no cambian tu calendario de repaso; los fallos sí.</p>' : ''}`;
  }

  function show() {
    const { entry: e, type, isNew } = current;
    const t = TYPES[type];
    const gap = type === 'hueco' ? cloze(e.example, e.word) : null;

    let prompt;
    if (type === 'inversa') prompt = `<p class="q-definition">${esc(e.definition)}</p>`;
    else if (gap) prompt = `<p class="q-sentence">${esc(gap.before)}<span class="blank">${esc(clozeHint(gap.answer))}</span>${esc(gap.after)}</p>`;
    else prompt = `<h2 class="q-word">${esc(e.word)}</h2>`;

    root.innerHTML = `
      <div class="quiz">
        ${topBar()}
        <article class="panel q-card">
          <div class="q-meta">
            <span class="qtype">${t.label}${isNew ? ' <span class="new-badge">Nueva</span>' : ''}</span>
            ${topicTag(e.topicId, e.topic)}
          </div>
          <p class="q-prompt">${t.prompt}</p>
          ${prompt}
          ${e.type && type !== 'hueco' ? `<p class="q-pos">${esc(e.type)}</p>` : ''}

          <form class="q-form" autocomplete="off">
            ${t.input === 'textarea'
              ? `<textarea name="answer" rows="3" placeholder="${t.placeholder}" spellcheck="false"></textarea>`
              : `<input name="answer" type="text" placeholder="${t.placeholder}" spellcheck="false" autocapitalize="off">`}
            <div class="q-actions">
              <span class="hint">${t.input === 'textarea' ? '<kbd>↵</kbd> comprobar · <kbd>⇧↵</kbd> nueva línea' : '<kbd>↵</kbd> comprobar'}</span>
              <button type="button" class="btn ghost" data-dunno>No lo sé</button>
              <button type="submit" class="btn primary">Comprobar</button>
            </div>
          </form>
          <div class="reveal" hidden></div>
        </article>
      </div>`;

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
      reveal(field.value.trim(), gap);
    });
    root.querySelector('[data-dunno]').addEventListener('click', () => reveal('', gap));
  }

  function reveal(answer, gap) {
    const { entry: e, type, scheduled } = current;
    const form = root.querySelector('.q-form');
    form.querySelectorAll('textarea, input, button').forEach(el => (el.disabled = true));
    form.querySelector('.q-actions').hidden = true;

    const v = autoCheck(type, e, answer, gap);
    const r = progress.get(e.key);
    const keepsSchedule = !scheduled && r?.interval > 0;
    const okLabel = keepsSchedule ? 'sin cambios' : inDays(progress.nextInterval(r));

    const box = root.querySelector('.reveal');
    box.hidden = false;
    box.innerHTML = `
      ${answer ? '' : '<p class="verdict verdict-neutral">Sin respuesta. Aquí tienes la solución:</p>'}
      ${v.message ? `<p class="verdict verdict-${v.suggest === true ? 'good' : v.suggest === false ? 'bad' : 'neutral'}">${v.message}</p>` : ''}
      <dl class="solution">
        ${gap ? `<div class="sol-focus"><dt>Frase</dt><dd>${esc(gap.before)}<mark>${esc(gap.answer)}</mark>${esc(gap.after)}</dd></div>` : ''}
        ${type === 'inversa' || gap ? `<div class="${gap ? '' : 'sol-focus'}"><dt>Palabra</dt><dd class="sol-word">${esc(e.word)}</dd></div>` : ''}
        ${e.definition && type !== 'inversa' ? `<div class="${type === 'definicion' ? 'sol-focus' : ''}"><dt>Definición</dt><dd>${esc(e.definition)}</dd></div>` : ''}
        ${e.synonyms.length ? `<div class="${type === 'sinonimo' ? 'sol-focus' : ''}"><dt>Sinónimos</dt><dd>${e.synonyms.map(esc).join(' · ')}</dd></div>` : ''}
        ${e.example && !gap ? `<div class="${type === 'ejemplo' ? 'sol-focus' : ''}"><dt>Ejemplo</dt><dd class="example">${highlight(e.example, e.word)}</dd></div>` : ''}
        ${e.context ? `<div><dt>Contexto</dt><dd>${esc(e.context)}</dd></div>` : ''}
        ${e.connotation ? `<div><dt>Función / connotación</dt><dd>${esc(e.connotation)}</dd></div>` : ''}
        ${e.notes ? `<div><dt>Nota</dt><dd>${esc(e.notes)}</dd></div>` : ''}
      </dl>
      <div class="grade">
        <p>${answer ? '¿Tu respuesta era correcta?' : '¿La sabías?'}</p>
        <div class="grade-buttons">
          <button type="button" class="btn good ${v.suggest === true ? 'suggested' : ''}" data-grade="1">
            <span>✓ Sí <kbd>1</kbd></span><small>${okLabel}</small></button>
          <button type="button" class="btn bad ${v.suggest === false ? 'suggested' : ''}" data-grade="0">
            <span>✗ A repasar <kbd>2</kbd></span><small>otra vez hoy</small></button>
        </div>
      </div>`;

    grade = correct => {
      grade = null;
      progress.review(e.key, correct, type, { practice: !scheduled });
      recent.push(e.key);
      if (recent.length > 3) recent.shift();
      next();
    };
    box.querySelectorAll('[data-grade]').forEach(b => b.addEventListener('click', () => grade?.(b.dataset.grade === '1')));

    const suggested = box.querySelector('.suggested');
    if (suggested) suggested.focus({ preventScroll: true });
    else document.activeElement?.blur();
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
            ${c.done ? `Has hecho ${c.done} ${c.done === 1 ? 'repaso' : 'repasos'} hoy.` : ''}
            ${upcoming.length ? `Próximo repaso: ${when(upcoming[0])}.` : ''}
            ${limitHit ? `<br>Ya has visto ${NEW_PER_DAY} palabras nuevas hoy; quedan ${c.freshTotal} para los próximos días.` : ''}
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

// Suggest a verdict where the computer can reasonably judge; you always have the final say.
function autoCheck(type, e, answer, gap) {
  if (!answer) return { suggest: false };
  if (type === 'sinonimo') {
    const r = compare(answer, e.synonyms);
    if (r.result === 'exact') return { suggest: true, message: '¡Correcto! Coincide con un sinónimo de la lista.' };
    if (r.result === 'accents') return { suggest: true, message: `Correcto, pero revisa las tildes: <strong>${esc(r.match)}</strong>` };
    return { suggest: null, message: `Tu respuesta: <strong>${esc(answer)}</strong>. No coincide con los sinónimos de la lista; si el tuyo también vale, márcalo como correcto.` };
  }
  if (type === 'inversa') {
    const r = compare(answer, [e.word, ...e.accept]);
    if (r.result === 'exact') return { suggest: true, message: '¡Correcto!' };
    if (r.result === 'accents') return { suggest: true, message: `Correcto, pero revisa las tildes: <strong>${esc(e.word)}</strong>` };
    return { suggest: false, message: `Tu respuesta: <strong>${esc(answer)}</strong>. No es la palabra que se buscaba.` };
  }
  if (type === 'hueco') {
    const r = compare(answer, [gap.answer]);
    if (r.result === 'exact') return { suggest: true, message: '¡Correcto!' };
    if (r.result === 'accents') return { suggest: true, message: `Correcto, pero revisa las tildes: <strong>${esc(gap.answer)}</strong>` };
    if (containsWord(answer, e.word)) {
      return { suggest: null, message: `Tu respuesta: <strong>${esc(answer)}</strong>. Es la palabra correcta; revisa si la forma encaja en la frase.` };
    }
    return { suggest: false, message: `Tu respuesta: <strong>${esc(answer)}</strong>. No es lo que faltaba.` };
  }
  if (type === 'ejemplo') {
    const has = containsWord(answer, e.word);
    const yours = `<span class="your-answer">«${esc(answer)}»</span>`;
    if (has === false) return { suggest: false, message: `${yours}<br>Tu frase no parece incluir «${esc(e.word)}».` };
    return { suggest: null, message: `${yours}<br>Comprueba que el uso y el registro son correctos.` };
  }
  return { suggest: null, message: `<span class="your-answer">«${esc(answer)}»</span><br>Compárala con la definición.` };
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
      <p class="lede">Todas las palabras con su definición, sinónimos y ejemplo.</p>
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
      .filter(e => !needle || [e.word, e.definition, ...e.synonyms].some(x => x.toLowerCase().includes(needle)))
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
