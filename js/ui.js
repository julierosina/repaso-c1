// Small shared UI helpers.

import { escapeHTML } from './text.js';

export const esc = escapeHTML;

// Topics get a stable colour derived from their name, so new topics need no configuration.
const HUES = [172, 262, 12, 215, 330, 38, 140, 190, 290, 100];
export function hueFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export const topicTag = (id, name) => `<span class="tag" style="--h:${hueFor(id)}">${esc(name)}</span>`;

export const STATUS_LABEL = { new: 'Sin intentar', learning: 'Por reforzar', mastered: 'Dominado' };
export const statusBadge = s => `<span class="status status-${s}">${STATUS_LABEL[s]}</span>`;

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Remembered settings (per browser). Never required for the page to work.
export function readPref(name, fallback) {
  try {
    const v = localStorage.getItem('c1esp:pref:' + name);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(name, value) {
  try {
    localStorage.setItem('c1esp:pref:' + name, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// Stacked bar of mastered / learning / new.
export function statusBar(c) {
  const total = c.mastered + c.learning + c.new || 1;
  const seg = (k, n) => (n ? `<span class="seg seg-${k}" style="width:${(n / total) * 100}%"></span>` : '');
  return `<div class="status-bar" role="img" aria-label="${c.mastered} dominadas, ${c.learning} por reforzar, ${c.new} sin intentar">
    ${seg('mastered', c.mastered)}${seg('learning', c.learning)}${seg('new', c.new)}</div>`;
}
