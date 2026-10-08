// Exam mode: generate a short test of random vocabulary words. Answers are only corrected
// when you submit, like in an exam. Results don't change the spaced-repetition schedule.

import { loadVocab } from './data.js';
import { esc, hueFor, topicTag, shuffle } from './ui.js';
import { compare, highlight, norm, sentenceChecks } from './text.js';

const SIZE = 5;
const MIN_SENTENCE_WORDS = 6;

const KINDS = {
  sinonimos: {
    title: 'Sinónimos',
    intro: `Escribe un sinónimo para cada una de estas ${SIZE} palabras o expresiones.`,
    card: `${SIZE} palabras al azar: escribe un sinónimo de cada una.`,
    placeholder: 'Un sinónimo…',
    applies: e => e.synonyms.length > 0,
  },
  frases: {
    title: 'Frases de ejemplo',
    intro: `Escribe una frase propia (${MIN_SENTENCE_WORDS} palabras o más) con cada una de estas ${SIZE} palabras o expresiones.`,
    card: `${SIZE} palabras al azar: escribe una frase con cada una.`,
    placeholder: 'Tu frase…',
    applies: e => true,
  },
};

export async function renderExam(root) {
  const { entries } = await loadVocab();
  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow">Modo examen</p>
      <h1>Modo examen</h1>
      <p class="lede">Genera un ejercicio con ${SIZE} palabras al azar de tu vocabulario. Las respuestas se corrigen al final, como en un examen.</p>
    </section>
    <div class="topic-grid">
      ${Object.entries(KINDS).map(([id, k]) => `
        <div class="topic-card exam-card" style="--h:${hueFor(id)}">
          <h2>${k.title}</h2>
          <p>${k.card}</p>
          <p class="card-stats">${entries.filter(k.applies).length} palabras disponibles</p>
          <div><button type="button" class="btn primary" data-kind="${id}">Generar ejercicio</button></div>
        </div>`).join('')}
    </div>`;
  root.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => sheet(root, entries, b.dataset.kind)));
}

function sheet(root, entries, kindId) {
  const kind = KINDS[kindId];
  const items = shuffle(entries.filter(kind.applies)).slice(0, SIZE);
  const started = Date.now();

  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow"><a href="#/exam" data-back>Modo examen</a></p>
      <h1>${kind.title}</h1>
      <p class="lede">${kind.intro}</p>
      <p class="exam-clock" aria-live="off">⏱ <span data-clock>0:00</span></p>
    </section>
    <form class="exam-sheet" autocomplete="off" style="--h:${hueFor(kindId)}">
      <ol class="exam-list">
        ${items.map((e, i) => `
          <li class="panel exam-item" style="--h:${hueFor(e.topicId)}">
            <div class="exam-q">
              <span class="exam-num">${i + 1}</span>
              <div>
                <h2 class="exam-word">${esc(e.word)}</h2>
                ${e.type ? `<p class="q-pos">${esc(e.type)}</p>` : ''}
              </div>
              ${topicTag(e.topicId, e.topic)}
            </div>
            ${kindId === 'frases'
              ? `<textarea name="a${i}" rows="2" placeholder="${kind.placeholder}" spellcheck="false"></textarea>`
              : `<input name="a${i}" type="text" placeholder="${kind.placeholder}" spellcheck="false" autocapitalize="off">`}
            <div class="exam-result" hidden></div>
          </li>`).join('')}
      </ol>
      <div class="actions exam-actions">
        <button type="submit" class="btn primary">Corregir</button>
        <button type="button" class="btn ghost" data-new>Otras ${SIZE} palabras</button>
      </div>
    </form>`;

  const form = root.querySelector('.exam-sheet');
  const fields = [...form.querySelectorAll('input, textarea')];
  fields[0].focus({ preventScroll: true });

  // Enter moves to the next answer (Shift+Enter for a new line in a sentence).
  fields.forEach((f, i) =>
    f.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
      ev.preventDefault();
      (fields[i + 1] || form.querySelector('[type=submit]')).focus();
    })
  );

  const clock = root.querySelector('[data-clock]');
  const tick = setInterval(() => {
    if (!clock.isConnected) return clearInterval(tick);
    const s = Math.floor((Date.now() - started) / 1000);
    clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);

  root.querySelector('[data-back]').addEventListener('click', ev => {
    ev.preventDefault();
    clearInterval(tick);
    renderExam(root);
  });
  root.querySelector('[data-new]').addEventListener('click', () => {
    clearInterval(tick);
    sheet(root, entries, kindId);
  });

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    clearInterval(tick);
    const results = items.map((e, i) => grade(kindId, e, fields[i].value.trim()));
    fields.forEach(f => (f.readOnly = true));
    showResults(root, form, items, results, kindId, entries);
  });
}

// Synonyms are checked against the entry's list; sentences against what software can verify.
function grade(kindId, e, answer) {
  if (!answer) return { correct: false, html: '<p class="verdict verdict-bad">✗ Sin respuesta.</p>', canOverride: false };

  if (kindId === 'sinonimos') {
    if (norm(answer) === norm(e.word)) {
      return { correct: false, canOverride: false, html: `<p class="verdict verdict-bad">✗ Es la misma palabra: hace falta un sinónimo.</p>` };
    }
    const r = compare(answer, e.synonyms);
    const list = `<p class="exam-solution"><span class="label">Sinónimos</span> ${e.synonyms.map(esc).join(' · ')}</p>`;
    if (r.result === 'exact') return { correct: true, html: `<p class="verdict verdict-good">✓ ¡Correcto!</p>${list}` };
    if (r.result === 'accents') return { correct: true, html: `<p class="verdict verdict-good">✓ Correcto, pero revisa las tildes: <strong>${esc(r.match)}</strong></p>${list}` };
    return {
      correct: false,
      canOverride: true,
      html: `<p class="verdict verdict-bad">✗ «${esc(answer)}» no está en la lista de sinónimos.</p>${list}`,
    };
  }

  const checks = sentenceChecks(answer, e.word, e.example, MIN_SENTENCE_WORDS);
  const correct = checks.every(([ok]) => ok);
  return {
    correct,
    canOverride: !correct,
    html: `
      <p class="verdict verdict-${correct ? 'good' : 'bad'}">${correct ? '✓ Tu frase cumple los requisitos.' : '✗ Tu frase no cumple todos los requisitos.'}</p>
      <ul class="checks">${checks.map(([ok, label]) => `<li class="check ${ok ? 'ok' : 'fail'}"><span class="ic">${ok ? '✓' : '✗'}</span><span>${label}</span></li>`).join('')}</ul>
      ${e.example ? `<p class="exam-solution"><span class="label">Ejemplo</span> <span class="example">${highlight(e.example, e.word)}</span></p>` : ''}`,
  };
}

function showResults(root, form, items, results, kindId, entries) {
  const score = () => results.filter(r => r.correct).length;
  const header = document.createElement('div');
  header.className = 'panel exam-score';
  const drawScore = () => {
    header.innerHTML = `<strong>${score()} / ${items.length}</strong>
      <span class="muted">${score() === items.length ? '¡Perfecto!' : 'Repasa las que has fallado.'}${kindId === 'frases' ? ' El sitio no puede juzgar el sentido: compara tus frases con los ejemplos.' : ''}</span>`;
  };
  drawScore();
  form.before(header);

  form.querySelectorAll('.exam-item').forEach((li, i) => {
    const r = results[i];
    li.classList.add(r.correct ? 'is-correct' : 'is-wrong');
    const box = li.querySelector('.exam-result');
    box.hidden = false;
    box.innerHTML = r.html + (r.canOverride ? `<button type="button" class="link small" data-override>Mi respuesta también es correcta</button>` : '');
    box.querySelector('[data-override]')?.addEventListener('click', ev => {
      r.correct = true;
      li.classList.replace('is-wrong', 'is-correct');
      box.querySelector('.verdict').outerHTML = '<p class="verdict verdict-good">✓ Marcada como correcta.</p>';
      ev.currentTarget.remove();
      drawScore();
    });
  });

  const actions = form.querySelector('.exam-actions');
  actions.innerHTML = `
    <button type="button" class="btn primary" data-again>Otras ${items.length} palabras</button>
    <button type="button" class="btn ghost" data-home>Volver al modo examen</button>`;
  actions.querySelector('[data-again]').addEventListener('click', () => sheet(root, entries, kindId));
  actions.querySelector('[data-home]').addEventListener('click', () => renderExam(root));
  header.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
