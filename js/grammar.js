// Grammar: topic list, rule summary ("ficha") per topic, and practice rounds where every answer
// comes with an explanation — including why each wrong option is wrong.

import { loadGrammar } from './data.js';
import * as progress from './progress.js';
import { esc, fmt, hueFor, topicTag, statusBar, shuffle } from './ui.js';
import { compare } from './text.js';

const ROUND = 10;

// ---------- Topic list ----------

export async function renderGrammarHome(root) {
  const { topics, exercises } = await loadGrammar();
  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow">Gramática</p>
      <h1>Gramática</h1>
      <p class="lede">Repasa la ficha de cada tema y practica. Cada respuesta viene con su explicación, y cada opción incorrecta, con el porqué.</p>
      ${exercises.length ? `<div class="actions"><a class="btn primary" href="#/grammar/practica">Practicar todos los temas</a></div>` : ''}
    </section>
    ${topics.length ? `<div class="topic-grid">${topics.map(topicCard).join('')}</div>`
      : '<div class="panel empty-state">Aún no hay temas. Añádelos en <code>data/grammar/</code> (el README explica cómo).</div>'}`;
}

function topicCard(t) {
  const c = progress.summarize(t.exercises.map(x => x.key));
  return `
    <a class="topic-card" href="#/grammar/${t.id}" style="--h:${hueFor(t.id)}">
      <h2>${esc(t.name)}</h2>
      ${t.summary ? `<p>${fmt(t.summary)}</p>` : ''}
      ${statusBar(c)}
      <p class="card-stats">${t.exercises.length} ejercicios · ${c.mastered} dominados · ${c.learning} por reforzar</p>
    </a>`;
}

// ---------- Ficha ----------

export async function renderGrammarTopic(root, id) {
  const { topics } = await loadGrammar();
  const t = topics.find(x => x.id === id);
  if (!t) return notFound(root);
  const f = t.fiche;

  root.innerHTML = `
    <section class="page-head" style="--h:${hueFor(t.id)}">
      <p class="eyebrow"><a href="#/grammar">Gramática</a></p>
      <h1>${esc(t.name)}</h1>
      ${t.summary ? `<p class="lede">${fmt(t.summary)}</p>` : ''}
      <div class="actions"><a class="btn primary" href="#/grammar/${t.id}/practica">Practicar este tema</a>
        <span class="muted small">${t.exercises.length} ejercicios</span></div>
    </section>
    <div class="fiche">
      ${(f.rules || []).map(r => `
        <section class="panel rule" style="--h:${hueFor(t.id)}">
          <h3>${fmt(r.title)}</h3>
          ${r.text ? `<p>${fmt(r.text)}</p>` : ''}
          ${r.examples?.length ? `<ul class="examples">${r.examples.map(e => `<li>${fmt(e)}</li>`).join('')}</ul>` : ''}
        </section>`).join('')}
      ${f.pitfalls?.length ? `
        <section class="panel pitfalls">
          <h3>Errores frecuentes</h3>
          <ul>${f.pitfalls.map(p => `<li>${fmt(p)}</li>`).join('')}</ul>
        </section>` : ''}
    </div>`;
}

function notFound(root) {
  root.innerHTML = `<section class="page-head"><h1>Tema no encontrado</h1><p class="lede"><a href="#/grammar">Volver a Gramática</a></p></section>`;
}

// ---------- Practice ----------

// Due exercises first, then unseen ones, then the ones you get wrong most; shuffled.
function pickRound(pool) {
  const now = Date.now();
  const r = x => progress.get(x.key);
  const due = pool.filter(x => progress.isDue(x.key, now)).sort((a, b) => r(a).due - r(b).due);
  const fresh = shuffle(pool.filter(x => !progress.isScheduled(x.key)));
  const rest = pool
    .filter(x => progress.isScheduled(x.key) && !progress.isDue(x.key, now))
    .map(x => [x, r(x).correct / r(x).attempts + Math.random() * 0.3])
    .sort((a, b) => a[1] - b[1])
    .map(([x]) => x);
  return shuffle([...due, ...fresh, ...rest].slice(0, ROUND));
}

export async function renderGrammarPractice(root, topicId) {
  const { topics, exercises } = await loadGrammar();
  const topic = topicId ? topics.find(t => t.id === topicId) : null;
  if (topicId && !topic) return notFound(root);
  const pool = topic ? topic.exercises : exercises;
  const back = topic ? { href: `#/grammar/${topic.id}`, label: 'Ficha' } : { href: '#/grammar', label: 'Gramática' };
  if (!pool.length) {
    root.innerHTML = `<div class="panel empty-state">Este tema aún no tiene ejercicios.</div>`;
    return;
  }

  const round = pickRound(pool);
  const results = [];
  let i = 0;
  let state = null; // { correct, answered, canOverride }

  const onKey = ev => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    if (ev.metaKey || ev.ctrlKey || ev.altKey || state?.answered) return;
    const x = round[i];
    if (x?.kind === 'choice' && /^[1-9]$/.test(ev.key) && x.options[ev.key - 1]) choose(x.options[ev.key - 1]);
  };
  document.addEventListener('keydown', onKey);

  show();

  function show() {
    const x = round[i];
    state = { answered: false };
    root.innerHTML = `
      <div class="quiz" style="--h:${hueFor(x.topicId)}">
        <div class="quiz-top">
          <a class="link" href="${back.href}">← ${back.label}</a>
          <div class="progress-track"><span style="width:${(i / round.length) * 100}%"></span></div>
          <span class="muted">${i + 1} / ${round.length}</span>
        </div>
        <article class="panel q-card">
          <div class="q-meta">
            <span class="qtype">${esc(x.label)}</span>
            ${topicTag(x.topicId, x.topic)}
          </div>
          ${x.instruction ? `<p class="q-prompt">${fmt(x.instruction)}</p>` : ''}
          <p class="g-prompt">${withGap(x.prompt)}</p>
          ${x.kind === 'choice'
            ? `<div class="options">${x.options.map((o, k) => `
                <button type="button" class="option" data-opt="${esc(o)}"><kbd>${k + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div>`
            : `<form class="q-form" autocomplete="off">
                <input name="answer" type="text" placeholder="Tu respuesta…" spellcheck="false" autocapitalize="off">
                <div class="q-actions">
                  <span class="hint"><kbd>↵</kbd> comprobar</span>
                  <button type="button" class="btn ghost" data-dunno>No lo sé</button>
                  <button type="submit" class="btn primary">Comprobar</button>
                </div>
              </form>`}
          <div class="reveal" hidden></div>
        </article>
      </div>`;

    if (x.kind === 'choice') {
      root.querySelectorAll('.option').forEach(b => b.addEventListener('click', () => choose(b.dataset.opt)));
    } else {
      const form = root.querySelector('.q-form');
      form.elements.answer.focus({ preventScroll: true });
      form.addEventListener('submit', ev => {
        ev.preventDefault();
        answerText(form.elements.answer.value.trim());
      });
      root.querySelector('[data-dunno]').addEventListener('click', () => answerText(''));
    }
  }

  function choose(opt) {
    if (state.answered) return;
    const x = round[i];
    const correct = x.answers.includes(opt) || opt in x.alsoAccepted;
    root.querySelectorAll('.option').forEach(b => {
      b.disabled = true;
      const o = b.dataset.opt;
      if (x.answers.includes(o)) b.classList.add('is-correct');
      if (o === opt && !correct) b.classList.add('is-wrong');
      if (o === opt && correct) b.classList.add('is-correct', 'is-chosen');
      if (o in x.alsoAccepted && o !== opt) b.classList.add('is-also');
    });
    let verdict;
    if (x.answers.includes(opt)) verdict = good('¡Correcto!');
    else if (opt in x.alsoAccepted) verdict = good(`También es correcto. ${fmt(x.alsoAccepted[opt])}`);
    else verdict = bad('No es correcto.');
    feedback(x, { correct, chosen: opt, filled: x.answers[0], verdict });
  }

  function answerText(answer) {
    if (state.answered) return;
    const x = round[i];
    const form = root.querySelector('.q-form');
    form.querySelectorAll('input, button').forEach(el => (el.disabled = true));
    form.querySelector('.q-actions').hidden = true;

    const r = compare(answer, x.answers);
    const matchKey = obj => Object.keys(obj).find(k => ['exact', 'accents'].includes(compare(answer, [k]).result));
    const also = matchKey(x.alsoAccepted);
    const trap = matchKey(x.traps);

    let correct = false;
    let verdict;
    let canOverride = false;
    if (!answer) verdict = bad('Sin respuesta.');
    else if (r.result === 'exact') [correct, verdict] = [true, good('¡Correcto!')];
    else if (r.result === 'accents') [correct, verdict] = [true, good(`Correcto, pero revisa las tildes: <strong>${esc(r.match)}</strong>`)];
    else if (also) [correct, verdict] = [true, good(`También es correcto. ${fmt(x.alsoAccepted[also])}`)];
    else if (trap) verdict = bad(`<strong>${esc(answer)}</strong>: ${fmt(x.traps[trap])}`);
    else {
      verdict = bad(`Tu respuesta: <strong>${esc(answer)}</strong>. No coincide con la respuesta esperada.`);
      canOverride = true;
    }
    feedback(x, { correct, answer, filled: correct ? answer : x.answers[0], verdict, canOverride });
  }

  function feedback(x, { correct, chosen, answer, filled, verdict, canOverride }) {
    state = { answered: true, correct };
    root.querySelector('.g-prompt').innerHTML = withGap(x.prompt, filled);

    const others = x.options.filter(o => !x.answers.includes(o));
    const box = root.querySelector('.reveal');
    box.hidden = false;
    box.innerHTML = `
      <div class="verdict-slot">${verdict}</div>
      ${x.kind === 'text' && !correct ? `<p class="expected"><span class="label">Respuesta correcta</span> ${x.answers.map(a => `<strong>${esc(a)}</strong>`).join(' · ')}</p>` : ''}
      ${x.explanation ? `<div class="explanation"><h4>Explicación</h4><p>${fmt(x.explanation)}</p></div>` : ''}
      ${others.length ? `
        <div class="whynot">
          <h4>¿Y las otras opciones?</h4>
          <ul>${others.map(o => `
            <li class="${o === chosen ? 'chosen' : ''} ${o in x.alsoAccepted ? 'also' : ''}">
              <strong>${esc(o)}</strong>${o in x.alsoAccepted ? ' <span class="also-badge">también válida</span>' : ''}
              <span>${fmt(x.alsoAccepted[o] || x.whyNot[o] || '')}</span>
            </li>`).join('')}</ul>
        </div>` : ''}
      <div class="next-row">
        ${canOverride ? '<button type="button" class="btn ghost" data-override>Mi respuesta también es correcta</button>' : ''}
        <button type="button" class="btn primary" data-next>${i + 1 < round.length ? 'Siguiente' : 'Ver resultados'} <kbd>↵</kbd></button>
      </div>`;

    box.querySelector('[data-override]')?.addEventListener('click', ev => {
      state.correct = true;
      box.querySelector('.verdict-slot').innerHTML = good('Marcada como correcta. Si dudas, compárala con la explicación.');
      ev.currentTarget.remove();
      box.querySelector('[data-next]').focus();
    });
    const nextBtn = box.querySelector('[data-next]');
    nextBtn.addEventListener('click', () => {
      progress.review(x.key, state.correct, x.kind);
      results.push({ x, correct: state.correct });
      i++;
      if (i < round.length) show();
      else summary();
    });
    nextBtn.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function summary() {
    document.removeEventListener('keydown', onKey);
    const right = results.filter(r => r.correct).length;
    root.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">${topic ? esc(topic.name) : 'Gramática'}</p>
        <h1>${right} de ${results.length}</h1>
        <p class="lede">${right === results.length ? '¡Perfecto!' : 'Los ejercicios que has fallado volverán en las próximas rondas.'}</p>
      </section>
      <div class="panel">
        <ul class="result-list">
          ${results.map(r => `
            <li class="${r.correct ? 'ok' : 'ko'}">
              <span class="mark">${r.correct ? '✓' : '✗'}</span>
              <span class="rl-text">${/_{2,}/.test(r.x.prompt) ? withGap(r.x.prompt, r.x.answers[0]) : `${fmt(r.x.prompt)} → <mark>${esc(r.x.answers[0])}</mark>`}</span>
            </li>`).join('')}
        </ul>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-again>Otra ronda</button>
        <a class="btn ghost" href="${back.href}">${topic ? 'Volver a la ficha' : 'Volver a Gramática'}</a>
      </div>`;
    root.querySelector('[data-again]').addEventListener('click', () => renderGrammarPractice(root, topicId));
    window.scrollTo(0, 0);
  }
}

const good = html => `<p class="verdict verdict-good">✓ ${html}</p>`;
const bad = html => `<p class="verdict verdict-bad">✗ ${html}</p>`;

// "No creo que ___ razón" -> a visible gap, or the answer filled in.
function withGap(prompt, filled) {
  const html = fmt(prompt);
  if (!/_{2,}/.test(html)) return html;
  return html.replace(/_{2,}/, filled ? `<mark>${esc(filled)}</mark>` : '<span class="gap"></span>');
}
