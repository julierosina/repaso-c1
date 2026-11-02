import { loadVocab } from './data.js';
import * as progress from './progress.js';
import { statusBar } from './ui.js';
import { palabrasEntries } from './vocab.js';

const SECTIONS = [
  { id: 'vocab', title: 'Vocabulario', text: 'Definiciones, sinónimos y frases de ejemplo, por temas.', ready: true },
  { id: 'palabras', title: 'Palabras', text: 'Solo palabras sueltas: ¿el o la? y sinónimos.', ready: true },
  { id: 'grammar', title: 'Gramática', text: 'Fichas y ejercicios, con la explicación de cada respuesta.', ready: true },
  { id: 'writing', title: 'Expresión escrita', text: 'Prepara textos y presentaciones con comprobaciones automáticas.', ready: true },
  { id: 'exam', title: 'Modo examen', text: 'Ejercicios de 5 palabras al azar: sinónimos o frases, corregidos al final.', ready: true },
];

export async function renderHome(root) {
  const stats = {};
  const statsFor = list => {
    const c = progress.summarize(list.map(e => e.key));
    const due = list.filter(e => progress.isDue(e.key)).length;
    return `
      ${statusBar(c)}
      <p class="card-stats"><strong>${due}</strong> por repasar · ${c.new} nuevas · ${c.mastered} dominadas</p>`;
  };
  try {
    const { entries } = await loadVocab();
    stats.vocab = statsFor(entries);
    stats.palabras = statsFor(palabrasEntries(entries));
  } catch {
    /* data problems are shown in the notice area */
  }

  root.innerHTML = `
    <section class="page-head home-head">
      <p class="eyebrow">Español · Nivel C1</p>
      <h1>Repaso para los exámenes</h1>
      <p class="lede">Practica un poco cada día. Tu progreso se guarda en este navegador.</p>
    </section>
    <div class="section-grid">
      ${SECTIONS.map(s => `
        <a class="section-card ${s.ready ? '' : 'is-soon'}" data-section="${s.id}" href="#/${s.id}">
          <span class="section-dot"></span>
          <h2>${s.title}</h2>
          <p>${s.text}</p>
          ${stats[s.id] || (s.ready ? '' : '<p class="soon-label">Próximamente</p>')}
        </a>`).join('')}
    </div>`;
}
