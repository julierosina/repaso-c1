// Per-item progress, stored in this browser's localStorage.
// Keys look like "vocab:paliar" (later: "grammar:...", "writing:...").

const KEY = 'c1esp:progress:v1';

// An item counts as mastered after this many correct answers in a row.
export const MASTERY_STREAK = 3;

let store = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked: progress just won't persist */
  }
}

// Keep in sync if the site is open in two tabs.
window.addEventListener('storage', e => {
  if (e.key === KEY) store = load();
});

export function get(key) {
  return store[key] || null;
}

export function record(key, correct, kind) {
  const r = store[key] || (store[key] = { attempts: 0, correct: 0, streak: 0, byType: {} });
  r.attempts++;
  if (correct) {
    r.correct++;
    r.streak++;
  } else {
    r.streak = 0;
  }
  r.last = new Date().toISOString();
  r.lastCorrect = correct;
  if (kind) {
    const t = r.byType[kind] || (r.byType[kind] = { attempts: 0, correct: 0 });
    t.attempts++;
    if (correct) t.correct++;
  }
  save();
}

// 'new' | 'learning' | 'mastered'
export function status(key) {
  const r = store[key];
  if (!r || !r.attempts) return 'new';
  return r.streak >= MASTERY_STREAK ? 'mastered' : 'learning';
}

export function summarize(keys) {
  const counts = { new: 0, learning: 0, mastered: 0 };
  for (const k of keys) counts[status(k)]++;
  return counts;
}
