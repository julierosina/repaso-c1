import { loadVocab } from './data.js';
import * as progress from './progress.js';
import { statusBar } from './ui.js';

const SECTIONS = [
  { id: 'vocab', title: 'Vocabulario', text: 'Definiciones, sinónimos y frases de ejemplo, por temas.', ready: true },
  { id: 'grammar', title: 'Gramática', text: 'Mini-fichas y ejercicios de cada punto gramatical.' },
  { id: 'writing', title: 'Expresión escrita', text: 'Temas de redacción con estructura y conectores.' },
  { id: 'exam', title: 'Modo examen', text: 'Mezcla de todo, con las respuestas al final.' },
];

export async function renderHome(root) {
  let vocabStats = '';
  try {
    const { entries } = await loadVocab();
    const c = progress.summarize(entries.map(e => e.key));
    vocabStats = `
      ${statusBar(c)}
      <p class="card-stats"><strong>${entries.length}</strong> palabras · ${c.mastered} dominadas · ${c.learning} por reforzar</p>`;
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
          ${s.id === 'vocab' ? vocabStats : '<p class="soon-label">Próximamente</p>'}
        </a>`).join('')}
    </div>`;
}
