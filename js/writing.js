// Writing: prompts split into parts, each with guidance, useful phrases, a writing area,
// live automatic checks, self-checks and an optional model. Drafts are saved in this browser.

import { loadWriting } from './data.js';
import { esc, fmt, hueFor, topicTag } from './ui.js';
import { norm, stripAccents } from './text.js';

// Average speaking rate used to estimate how long a part takes to say aloud.
const WORDS_PER_MIN = 130;

// Each part of a prompt gets its own colour, to make the page easier to scan.
const PART_HUES = [12, 38, 172, 215, 262, 330, 140];

const draftKey = id => `c1esp:writing:v1:${id}`;

function loadDraft(id) {
  try {
    return { text: {}, self: {}, ...JSON.parse(localStorage.getItem(draftKey(id))) };
  } catch {
    return { text: {}, self: {} };
  }
}

function saveDraft(id, draft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export const countWords = s => (String(s).match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;

function duration(words) {
  const secs = Math.round((words / WORDS_PER_MIN) * 60);
  if (secs < 60) return `${secs} s`;
  return `${Math.floor(secs / 60)} min${secs % 60 ? ` ${secs % 60} s` : ''}`;
}

const bare = s => stripAccents(norm(s));

// Evaluate one check against a text. Returns { state: 'ok' | 'fail' | 'warn' | 'pending' | 'hidden', found }
export function evaluate(check, text, words) {
  if (check.broken) return { state: 'hidden' };
  const empty = !text.trim();

  if (check.avoid) {
    const n = (text.match(new RegExp(check.avoid, 'giu')) || []).length;
    return { state: n > (check.max ?? 0) ? 'warn' : 'hidden' };
  }
  if (empty) return { state: 'pending' };

  if (check.minWords != null || check.maxWords != null) {
    const ok = (check.minWords == null || words >= check.minWords) && (check.maxWords == null || words <= check.maxWords);
    return { state: ok ? 'ok' : 'fail', found: [`${words} palabras`] };
  }
  if (check.anyOf) {
    // Each entry is a phrase or a group of variants (["ironía", "irónico"]) that counts once.
    // Matching ignores case and accents and only needs the phrase to start a word.
    const t = ' ' + bare(text) + ' ';
    const has = phrase => new RegExp(`(^|[^\\p{L}])${bare(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(t);
    const found = check.anyOf
      .map(entry => (Array.isArray(entry) ? entry : [entry]).find(has))
      .filter(Boolean);
    return { state: found.length >= (check.min ?? 1) ? 'ok' : 'fail', found };
  }
  if (check.pattern) {
    const matches = text.match(new RegExp(check.pattern, 'giu')) || [];
    return { state: matches.length >= (check.min ?? 1) ? 'ok' : 'fail', found: matches.length > 1 ? [`${matches.length}`] : [] };
  }
  return { state: 'hidden' };
}

// ---------- Prompt list ----------

export async function renderWritingHome(root) {
  const { prompts } = await loadWriting();
  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow">Expresión escrita</p>
      <h1>Expresión escrita</h1>
      <p class="lede">Prepara tus textos y presentaciones parte por parte. Las comprobaciones automáticas se actualizan mientras escribes.</p>
    </section>
    ${prompts.length ? `<div class="topic-grid">${prompts.map(promptCard).join('')}</div>`
      : '<div class="panel empty-state">Aún no hay temas. Añádelos en <code>data/writing/</code> (el README explica cómo).</div>'}`;
}

function promptCard(p) {
  const draft = loadDraft(p.id);
  const written = p.parts.filter(part => (draft.text[part.id] || '').trim()).length;
  const minutes = p.parts.reduce((n, part) => n + (part.minutes || 0), 0);
  return `
    <a class="topic-card" href="#/writing/${p.id}" style="--h:${hueFor(p.id)}">
      <h2>${esc(p.title)}</h2>
      ${p.description ? `<p>${fmt(p.description)}</p>` : ''}
      <p class="card-stats">${p.parts.length} partes${minutes ? ` · ${minutes} min` : ''} · ${written ? `${written}/${p.parts.length} empezadas` : 'sin empezar'}</p>
    </a>`;
}

// ---------- One prompt ----------

export async function renderWritingPrompt(root, id) {
  const { prompts } = await loadWriting();
  const p = prompts.find(x => x.id === id);
  if (!p) {
    root.innerHTML = `<section class="page-head"><h1>Tema no encontrado</h1><p class="lede"><a href="#/writing">Volver</a></p></section>`;
    return;
  }
  const draft = loadDraft(p.id);
  const targetMin = p.parts.reduce((n, part) => n + (part.minutes || 0), 0);

  root.innerHTML = `
    <section class="page-head">
      <p class="eyebrow"><a href="#/writing">Expresión escrita</a></p>
      <h1>${esc(p.title)}</h1>
      ${p.description ? `<p class="lede">${fmt(p.description)}</p>` : ''}
      ${p.topic ? `<p>${topicTag(p.topic, p.topic)}</p>` : ''}
    </section>

    <div class="w-layout">
      <aside class="w-aside">
        <div class="panel w-summary">
          <h3>Resumen</h3>
          <div class="w-score"><strong data-score>0</strong><span data-score-of></span></div>
          <p class="muted small" data-warn-total></p>
          ${targetMin ? `<p class="small"><span class="label">Duración estimada</span><br><span data-total-time>0 s</span> de ${targetMin} min</p>
            <div class="progress-track"><span data-total-bar style="width:0%"></span></div>` : ''}
          <ol class="w-nav">${p.parts.map(part => `<li><a href="#part-${part.id}" data-nav="${part.id}">${esc(part.title)}</a></li>`).join('')}</ol>
          <div class="w-aside-actions">
            <button type="button" class="btn ghost" data-copy>Copiar todo</button>
            <button type="button" class="link small" data-clear>Borrar borrador</button>
          </div>
        </div>
        ${p.notes ? `
          <div class="panel w-notes">
            <h3>${esc(p.notes.title || 'Recuerda')}</h3>
            <ul>${(p.notes.items || []).map(n => `<li>${fmt(n)}</li>`).join('')}</ul>
          </div>` : ''}
      </aside>

      <div class="w-parts">
        ${p.parts.map((part, n) => partHTML(part, n, draft)).join('')}
      </div>
    </div>`;

  // Hash links would trigger the router, so scroll to parts manually.
  root.querySelectorAll('[data-nav]').forEach(a =>
    a.addEventListener('click', ev => {
      ev.preventDefault();
      root.querySelector(`#part-${a.dataset.nav}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
  );

  let saveTimer;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(p.id, draft), 300);
  };

  const refreshAll = () => {
    let ok = 0;
    let total = 0;
    let warns = 0;
    let words = 0;
    for (const part of p.parts) {
      const r = refreshPart(part);
      ok += r.ok;
      total += r.total;
      warns += r.warns;
      words += r.words;
    }
    root.querySelector('[data-score]').textContent = ok;
    root.querySelector('[data-score-of]').textContent = ` / ${total} comprobaciones`;
    root.querySelector('[data-warn-total]').textContent = warns ? `⚠ ${warns} ${warns === 1 ? 'aviso' : 'avisos'} por revisar` : '';
    const tt = root.querySelector('[data-total-time]');
    if (tt) {
      tt.textContent = duration(words);
      root.querySelector('[data-total-bar]').style.width = `${Math.min(100, (words / WORDS_PER_MIN / targetMin) * 100)}%`;
    }
  };

  function refreshPart(part) {
    const el = root.querySelector(`#part-${part.id}`);
    const text = draft.text[part.id] || '';
    const words = countWords(text);
    const selfDone = draft.self[part.id] || [];

    el.querySelector('[data-count]').textContent = `${words} ${words === 1 ? 'palabra' : 'palabras'}`;
    const timeEl = el.querySelector('[data-time]');
    if (timeEl) {
      timeEl.textContent = `≈ ${duration(words)} hablando`;
      const ratio = words / WORDS_PER_MIN / part.minutes;
      timeEl.dataset.fit = !words ? '' : ratio < 0.7 ? 'short' : ratio > 1.3 ? 'long' : 'ok';
    }

    let ok = 0;
    let total = 0;
    let warns = 0;
    const items = (part.checks || []).map((c, k) => {
      if (c.self) {
        total++;
        const done = selfDone.includes(k);
        if (done) ok++;
        return `<li class="check self ${done ? 'ok' : ''}">
          <label><input type="checkbox" data-self="${k}" ${done ? 'checked' : ''}><span>${fmt(c.label)}</span></label></li>`;
      }
      const r = evaluate(c, text, words);
      if (r.state === 'hidden') return '';
      if (r.state === 'warn') {
        warns++;
        return `<li class="check warn"><span class="ic">⚠</span><span>${fmt(c.label)}${c.hint ? `<small>${fmt(c.hint)}</small>` : ''}</span></li>`;
      }
      total++;
      if (r.state === 'ok') ok++;
      const icon = r.state === 'ok' ? '✓' : r.state === 'fail' ? '✗' : '○';
      const found = r.state === 'ok' && r.found?.length && c.anyOf ? `<small>${r.found.map(esc).join(' · ')}</small>` : '';
      const hint = r.state === 'fail' && c.hint ? `<small>${fmt(c.hint)}</small>` : '';
      return `<li class="check ${r.state}"><span class="ic">${icon}</span><span>${fmt(c.label)}${found}${hint}</span></li>`;
    });
    el.querySelector('[data-checks]').innerHTML = items.join('');
    el.querySelectorAll('[data-self]').forEach(cb =>
      cb.addEventListener('change', () => {
        const k = Number(cb.dataset.self);
        const list = new Set(draft.self[part.id] || []);
        cb.checked ? list.add(k) : list.delete(k);
        draft.self[part.id] = [...list];
        persist();
        refreshAll();
      })
    );
    el.querySelector('.w-part-score').textContent = total ? `${ok}/${total}` : '';
    el.querySelector('.w-part-score').dataset.done = total && ok === total ? 'yes' : '';
    return { ok, total, warns, words };
  }

  root.querySelectorAll('textarea[data-part]').forEach(ta => {
    const autosize = () => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 2 + 'px';
    };
    ta.addEventListener('input', () => {
      draft.text[ta.dataset.part] = ta.value;
      autosize();
      persist();
      refreshAll();
    });
    requestAnimationFrame(autosize);
  });

  // Clicking a phrase inserts it at the cursor.
  root.querySelectorAll('[data-phrase]').forEach(chip =>
    chip.addEventListener('click', () => {
      const ta = root.querySelector(`textarea[data-part="${chip.dataset.for}"]`);
      const phrase = chip.dataset.phrase;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const sep = before && !/\s$/.test(before) ? ' ' : '';
      ta.value = before + sep + phrase + ' ' + ta.value.slice(end);
      const caret = (before + sep + phrase).length + 1;
      ta.focus();
      ta.setSelectionRange(caret, caret);
      ta.dispatchEvent(new Event('input'));
    })
  );

  root.querySelector('[data-copy]').addEventListener('click', async ev => {
    const all = p.parts
      .map(part => `${part.title}\n\n${(draft.text[part.id] || '').trim()}`)
      .join('\n\n\n');
    try {
      await navigator.clipboard.writeText(all);
      ev.target.textContent = '¡Copiado!';
    } catch {
      ev.target.textContent = 'No se pudo copiar';
    }
    setTimeout(() => (ev.target.textContent = 'Copiar todo'), 1800);
  });

  root.querySelector('[data-clear]').addEventListener('click', () => {
    if (!confirm('¿Borrar todo lo que has escrito en este tema? No se puede deshacer.')) return;
    draft.text = {};
    draft.self = {};
    saveDraft(p.id, draft);
    renderWritingPrompt(root, id);
  });

  refreshAll();
}

function partHTML(part, n, draft) {
  const guidance = (part.guidance || []).map(g =>
    typeof g === 'string'
      ? `<li>${fmt(g)}</li>`
      : `<li class="g-group"><strong>${fmt(g.title)}</strong><ul>${(g.items || []).map(it => `<li>${fmt(it)}</li>`).join('')}</ul></li>`
  );
  return `
    <section class="panel w-part" id="part-${part.id}" style="--h:${PART_HUES[n % PART_HUES.length]}">
      <header class="w-head">
        <span class="w-num">${n + 1}</span>
        <h2>${esc(part.title)}</h2>
        ${part.minutes ? `<span class="pill">${part.minutes} min</span>` : ''}
        <span class="w-part-score"></span>
      </header>
      ${part.intro ? `<p class="muted">${fmt(part.intro)}</p>` : ''}
      ${guidance.length ? `<ul class="guidance">${guidance.join('')}</ul>` : ''}
      ${part.phrases?.length ? `
        <div class="phrases">
          <span class="label">Frases útiles</span>
          ${part.phrases.map(ph => `<button type="button" class="phrase" data-for="${part.id}" data-phrase="${esc(ph)}">${esc(ph)}</button>`).join('')}
        </div>` : ''}
      <textarea data-part="${part.id}" rows="${part.rows || 5}" placeholder="${esc(part.placeholder || 'Escribe aquí…')}" spellcheck="true" lang="es">${esc(draft.text[part.id] || '')}</textarea>
      <div class="w-meta">
        <span data-count>0 palabras</span>
        ${part.minutes ? `<span data-time></span>` : ''}
      </div>
      <ul class="checks" data-checks></ul>
      ${part.model ? `
        <details class="model">
          <summary>Ver un modelo</summary>
          <div>${fmt(part.model)}</div>
        </details>` : ''}
    </section>`;
}
