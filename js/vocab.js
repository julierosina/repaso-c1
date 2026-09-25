// Vocabulary: session setup, type-the-answer quiz with self-check, session summary, and word list.

import { loadVocab } from './data.js';
import * as progress from './progress.js';
import { esc, hueFor, topicTag, statusBadge, statusBar, shuffle, readPref, writePref } from './ui.js';
import { compare, containsWord, highlight } from './text.js';

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
  ejemplo: {
    label: 'Frase de ejemplo',
    prompt: 'Úsala en una frase',
    input: 'textarea',
    placeholder: 'Escribe una frase que use la palabra en contexto…',
    applies: () => true,
  },
  inversa: {
    label: '¿Qué palabra es?',
    prompt: '¿Qué palabra o expresión corresponde a esta definición?',
    input: 'text',
    placeholder: 'La palabra…',
    applies: e => !!e.definition,
  },
};

const COUNTS = [10, 20, 30, 0]; // 0 = todas
const POOLS = { todas: 'Todas', pendientes: 'Sin dominar', nuevas: 'Solo nuevas' };
const DEFAULTS = { excludedTopics: [], types: Object.keys(TYPES), count: 10, pool: 'todas' };

// ---------- Setup ----------

export async function renderVocabSetup(root) {
  const data = await loadVocab();
  const s = { ...DEFAULTS, ...readPref('vocab-settings', {}) };
  if (!s.types.length) s.types = DEFAULTS.types;
  const c = progress.summarize(data.entries.map(e => e.key));

  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow">Vocabulario</p>
      <h1>Practica tu vocabulario</h1>
      <p class="lede">${data.entries.length} palabras en ${data.topics.length} temas. Escribe tu respuesta, compárala con la solución y di si la sabías.</p>
      <div class="head-row">
        <div class="head-stats">${statusBar(c)}
          <p class="legend"><span class="dot dot-mastered"></span>${c.mastered} dominadas <span class="dot dot-learning"></span>${c.learning} por reforzar <span class="dot dot-new"></span>${c.new} sin intentar</p>
        </div>
        <a class="btn ghost" href="#/vocab/lista">Ver la lista completa →</a>
      </div>
    </section>

    <form class="panel setup" id="setup">
      <fieldset>
        <legend>Temas <span class="mini-actions"><button type="button" class="link" data-topics="all">todos</button> · <button type="button" class="link" data-topics="none">ninguno</button></span></legend>
        <div class="chips">
          ${data.topics.map(t => `
            <label class="chip" style="--h:${hueFor(t.id)}">
              <input type="checkbox" name="topic" value="${esc(t.id)}" ${s.excludedTopics.includes(t.id) ? '' : 'checked'}>
              <span>${esc(t.name)} <small>${t.count}</small></span>
            </label>`).join('')}
        </div>
      </fieldset>

      <fieldset>
        <legend>Tipos de pregunta</legend>
        <div class="chips">
          ${Object.entries(TYPES).map(([id, t]) => `
            <label class="chip chip-plain">
              <input type="checkbox" name="type" value="${id}" ${s.types.includes(id) ? 'checked' : ''}>
              <span>${t.label}</span>
            </label>`).join('')}
        </div>
      </fieldset>

      <div class="setup-row">
        <fieldset>
          <legend>Preguntas</legend>
          <div class="segmented">
            ${COUNTS.map(n => `<label><input type="radio" name="count" value="${n}" ${s.count === n ? 'checked' : ''}><span>${n || 'Todas'}</span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Palabras</legend>
          <div class="segmented">
            ${Object.entries(POOLS).map(([id, label]) => `<label><input type="radio" name="pool" value="${id}" ${s.pool === id ? 'checked' : ''}><span>${label}</span></label>`).join('')}
          </div>
        </fieldset>
      </div>

      <div class="setup-foot">
        <p class="muted" id="setup-count"></p>
        <button class="btn primary" type="submit">Empezar</button>
      </div>
    </form>`;

  const form = root.querySelector('#setup');
  const countEl = root.querySelector('#setup-count');
  const startBtn = form.querySelector('[type=submit]');

  const read = () => {
    const fd = new FormData(form);
    const on = new Set(fd.getAll('topic'));
    return {
      excludedTopics: data.topics.map(t => t.id).filter(id => !on.has(id)),
      types: fd.getAll('type'),
      count: Number(fd.get('count')),
      pool: fd.get('pool'),
    };
  };

  const update = () => {
    const settings = read();
    writePref('vocab-settings', settings);
    const n = candidates(data.entries, settings).length;
    const q = settings.count ? Math.min(n, settings.count) : n;
    if (!settings.types.length) countEl.textContent = 'Elige al menos un tipo de pregunta.';
    else if (!n) countEl.textContent = 'No hay palabras con estos filtros.';
    else countEl.textContent = `${n} ${n === 1 ? 'palabra disponible' : 'palabras disponibles'} · sesión de ${q} ${q === 1 ? 'pregunta' : 'preguntas'}`;
    startBtn.disabled = !n || !settings.types.length;
  };

  form.addEventListener('change', update);
  form.querySelectorAll('[data-topics]').forEach(b =>
    b.addEventListener('click', () => {
      form.querySelectorAll('input[name=topic]').forEach(i => (i.checked = b.dataset.topics === 'all'));
      update();
    })
  );
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const settings = read();
    startQuiz(root, buildSession(data.entries, settings), settings);
  });
  update();
}

function candidates(entries, s) {
  return entries.filter(e => {
    if (s.excludedTopics.includes(e.topicId)) return false;
    const st = progress.status(e.key);
    if (s.pool === 'pendientes') return st !== 'mastered';
    if (s.pool === 'nuevas') return st === 'new';
    return true;
  });
}

// Words you keep missing come first, then new ones, then mastered ones (least recently seen first).
function buildSession(entries, s) {
  const pool = candidates(entries, s);
  const by = st => pool.filter(e => progress.status(e.key) === st);
  const lastSeen = e => progress.get(e.key)?.last || '';
  const ordered = [
    ...shuffle(by('learning')),
    ...shuffle(by('new')),
    ...by('mastered').sort((a, b) => lastSeen(a).localeCompare(lastSeen(b))),
  ];
  return shuffle(s.count ? ordered.slice(0, s.count) : ordered);
}

function pickType(entry, enabled) {
  const ok = enabled.filter(t => TYPES[t].applies(entry));
  if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
  return 'ejemplo';
}

// ---------- Quiz ----------

function startQuiz(root, entries, settings) {
  const questions = entries.map(entry => ({ entry, type: pickType(entry, settings.types) }));
  const results = [];
  let i = 0;
  let awaitingGrade = false;
  let grade = null;

  const onKey = ev => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    if (!awaitingGrade || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === '1') grade(true);
    else if (ev.key === '2') grade(false);
  };
  document.addEventListener('keydown', onKey);
  const stop = () => document.removeEventListener('keydown', onKey);

  show();

  function show() {
    const { entry: e, type } = questions[i];
    const t = TYPES[type];
    const pct = (i / questions.length) * 100;

    root.innerHTML = `
      <div class="quiz">
        <div class="quiz-top">
          <button type="button" class="link" data-quit>← Terminar</button>
          <div class="progress-track"><span style="width:${pct}%"></span></div>
          <span class="muted">${i + 1} / ${questions.length}</span>
        </div>

        <article class="panel q-card">
          <div class="q-meta">
            <span class="qtype">${t.label}</span>
            ${topicTag(e.topicId, e.topic)}
          </div>
          <p class="q-prompt">${t.prompt}</p>
          ${type === 'inversa'
            ? `<p class="q-definition">${esc(e.definition)}</p>`
            : `<h2 class="q-word">${esc(e.word)}</h2>`}
          ${e.type ? `<p class="q-pos">${esc(e.type)}</p>` : ''}

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
    field.focus();

    root.querySelector('[data-quit]').addEventListener('click', () => {
      if (results.length) summary();
      else {
        stop();
        renderVocabSetup(root);
      }
    });

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
      reveal(field.value.trim());
    });
    root.querySelector('[data-dunno]').addEventListener('click', () => reveal(''));
  }

  function reveal(answer) {
    const { entry: e, type } = questions[i];
    const form = root.querySelector('.q-form');
    form.querySelectorAll('textarea, input, button').forEach(el => (el.disabled = true));
    form.querySelector('.q-actions').hidden = true;

    const v = autoCheck(type, e, answer);
    const box = root.querySelector('.reveal');
    box.hidden = false;
    box.innerHTML = `
      ${answer ? '' : '<p class="verdict verdict-neutral">Sin respuesta. Aquí tienes la solución:</p>'}
      ${v.message ? `<p class="verdict verdict-${v.suggest === true ? 'good' : v.suggest === false ? 'bad' : 'neutral'}">${v.message}</p>` : ''}
      <dl class="solution">
        ${type === 'inversa' ? `<div class="sol-focus"><dt>Palabra</dt><dd class="sol-word">${esc(e.word)}</dd></div>` : ''}
        ${e.definition && type !== 'inversa' ? `<div class="${type === 'definicion' ? 'sol-focus' : ''}"><dt>Definición</dt><dd>${esc(e.definition)}</dd></div>` : ''}
        ${e.synonyms.length ? `<div class="${type === 'sinonimo' ? 'sol-focus' : ''}"><dt>Sinónimos</dt><dd>${e.synonyms.map(esc).join(' · ')}</dd></div>` : ''}
        ${e.example ? `<div class="${type === 'ejemplo' ? 'sol-focus' : ''}"><dt>Ejemplo</dt><dd class="example">${highlight(e.example, e.word)}</dd></div>` : ''}
        ${e.context ? `<div><dt>Contexto</dt><dd>${esc(e.context)}</dd></div>` : ''}
        ${e.connotation ? `<div><dt>Función / connotación</dt><dd>${esc(e.connotation)}</dd></div>` : ''}
        ${e.notes ? `<div><dt>Nota</dt><dd>${esc(e.notes)}</dd></div>` : ''}
      </dl>
      <div class="grade">
        <p>${answer ? '¿Tu respuesta era correcta?' : '¿La sabías?'}</p>
        <div class="grade-buttons">
          <button type="button" class="btn good ${v.suggest === true ? 'suggested' : ''}" data-grade="1">✓ Sí <kbd>1</kbd></button>
          <button type="button" class="btn bad ${v.suggest === false ? 'suggested' : ''}" data-grade="0">✗ A repasar <kbd>2</kbd></button>
        </div>
      </div>`;

    grade = correct => {
      if (!awaitingGrade) return;
      awaitingGrade = false;
      progress.record(e.key, correct, type);
      results.push({ entry: e, type, correct, answer });
      i++;
      if (i < questions.length) show();
      else summary();
    };
    box.querySelectorAll('[data-grade]').forEach(b => b.addEventListener('click', () => grade(b.dataset.grade === '1')));
    awaitingGrade = true;

    const suggested = box.querySelector('.suggested');
    (suggested || box.querySelector('.grade')).focus?.();
    if (!suggested) document.activeElement?.blur();
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function summary() {
    stop();
    awaitingGrade = false;
    const right = results.filter(r => r.correct).length;
    const missed = results.filter(r => !r.correct).map(r => r.entry);
    const ratio = results.length ? right / results.length : 0;
    const msg = ratio === 1 ? '¡Perfecto! Todo correcto.' : ratio >= 0.75 ? '¡Muy bien! Repasa las que se te resistieron.' : ratio >= 0.5 ? 'Vas por buen camino.' : 'Sigue practicando: la repetición funciona.';

    root.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">Sesión terminada</p>
        <h1>${right} de ${results.length}</h1>
        <p class="lede">${msg}</p>
      </section>
      <div class="panel">
        <ul class="result-list">
          ${results.map(r => `
            <li class="${r.correct ? 'ok' : 'ko'}">
              <span class="mark">${r.correct ? '✓' : '✗'}</span>
              <span class="rl-word">${esc(r.entry.word)}</span>
              <span class="muted rl-type">${TYPES[r.type].label}</span>
              ${statusBadge(progress.status(r.entry.key))}
            </li>`).join('')}
        </ul>
      </div>
      <div class="actions">
        ${missed.length ? `<button type="button" class="btn primary" data-retry>Repetir las ${missed.length} falladas</button>` : ''}
        <button type="button" class="btn ${missed.length ? 'ghost' : 'primary'}" data-again>Nueva sesión</button>
        <a class="btn ghost" href="#/vocab/lista">Ver la lista</a>
      </div>`;

    root.querySelector('[data-retry]')?.addEventListener('click', () => startQuiz(root, shuffle(missed), settings));
    root.querySelector('[data-again]').addEventListener('click', () => renderVocabSetup(root));
    window.scrollTo(0, 0);
  }
}

// Suggest a verdict where the computer can reasonably judge; you always have the final say.
function autoCheck(type, e, answer) {
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
        ${p ? `<span class="muted small">${p.correct}/${p.attempts} aciertos</span>` : ''}
      </footer>
    </article>`;
}
