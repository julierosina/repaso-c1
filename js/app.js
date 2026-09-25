// Hash router: #/vocab, #/vocab/lista, … Hash routes work on GitHub Pages without any server config.

import { renderHome } from './home.js';
import { renderVocabSetup, renderVocabList } from './vocab.js';
import { loadVocab } from './data.js';
import { esc } from './ui.js';

const app = document.getElementById('app');
const notices = document.getElementById('notices');

const routes = {
  '': renderHome,
  vocab: renderVocabSetup,
  'vocab/lista': renderVocabList,
};

const COMING_SOON = {
  grammar: ['Gramática', 'Mini-fichas de cada punto gramatical y ejercicios para practicarlo.'],
  writing: ['Expresión escrita', 'Temas de redacción con estructura, conectores y ejercicios de preparación.'],
  exam: ['Modo examen', 'Una mezcla de vocabulario, gramática y redacción, con las respuestas al final.'],
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

  const view = routes[path] || (COMING_SOON[section] ? comingSoon(section) : notFound);
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
    const { problems } = await loadVocab();
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
