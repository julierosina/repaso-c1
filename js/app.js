// Hash router: #/vocab, #/vocab/lista, … Hash routes work on GitHub Pages without any server config.

import { renderHome } from './home.js';
import { renderVocab, renderVocabList } from './vocab.js';
import { renderGrammarHome, renderGrammarTopic, renderGrammarPractice } from './grammar.js';
import { renderWritingHome, renderWritingPrompt } from './writing.js';
import { renderExam } from './exam.js';
import { loadVocab, loadGrammar, loadWriting } from './data.js';
import { esc } from './ui.js';

const app = document.getElementById('app');
const notices = document.getElementById('notices');

const routes = {
  '': renderHome,
  vocab: renderVocab,
  'vocab/lista': renderVocabList,
  grammar: renderGrammarHome,
  'grammar/practica': root => renderGrammarPractice(root, null),
  writing: renderWritingHome,
  exam: renderExam,
};

// Routes with an id in them: #/grammar/<tema>, #/grammar/<tema>/practica, #/writing/<tema>
function dynamicRoute(path) {
  let m;
  if ((m = path.match(/^grammar\/([\w-]+)\/practica$/))) return root => renderGrammarPractice(root, m[1]);
  if ((m = path.match(/^grammar\/([\w-]+)$/))) return root => renderGrammarTopic(root, m[1]);
  if ((m = path.match(/^writing\/([\w-]+)$/))) return root => renderWritingPrompt(root, m[1]);
  return null;
}

const COMING_SOON = {
  progress: ['Progreso', 'Qué dominas, qué necesitas reforzar y qué te falta por ver.'],
};

function comingSoon(section) {
  const [title, text] = COMING_SOON[section];
  return root => {
    root.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">Próximamente</p>
        <h1>${title}</h1>
        <p class="lede">${text}</p>
      </section>
      <div class="panel empty-state">Esta sección llegará en la siguiente fase.</div>`;
  };
}

function notFound(root) {
  root.innerHTML = `<section class="page-head"><h1>Página no encontrada</h1><p class="lede"><a href="#/">Volver al inicio</a></p></section>`;
}

let current = 0;

async function route() {
  const token = ++current;
  const path = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  const section = path.split('/')[0];

  document.body.dataset.section = section || 'home';
  document.querySelectorAll('.site-nav a').forEach(a => a.classList.toggle('active', a.dataset.section === section));

  const view = routes[path] || dynamicRoute(path) || (COMING_SOON[section] ? comingSoon(section) : notFound);
  const container = document.createElement('div');
  try {
    await view(container);
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="notice error"><strong>No se pudo cargar esta página.</strong><br>${esc(e.message)}</div>`;
  }
  if (token !== current) return;
  app.replaceChildren(container);
  window.scrollTo(0, 0);
}

// Surface data-file mistakes (bad JSON, missing fields) so hand edits are easy to fix.
async function showDataProblems() {
  if (location.protocol === 'file:') {
    notices.innerHTML = `<div class="notice error"><strong>Abre el sitio a través de un servidor local.</strong>
      Los navegadores no dejan leer los archivos de datos desde <code>file://</code>.
      En una terminal, dentro de la carpeta del proyecto: <code>python3 -m http.server 8000</code> y abre <code>http://localhost:8000</code>.</div>`;
    return;
  }
  try {
    const results = await Promise.allSettled([loadVocab(), loadGrammar(), loadWriting()]);
    const problems = results.flatMap(r => (r.status === 'fulfilled' ? r.value.problems : []));
    if (!problems.length) return;
    notices.innerHTML = `<details class="notice warn"><summary><strong>${problems.length} ${problems.length === 1 ? 'problema' : 'problemas'} en los archivos de datos</strong> (el resto del contenido funciona con normalidad)</summary>
      <ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>`;
  } catch {
    /* the view shows the error */
  }
}

window.addEventListener('hashchange', route);
route();
showDataProblems();
