// Per-item progress and spaced-repetition schedule, stored in this browser's localStorage.
// Keys look like "vocab:paliar" (later: "grammar:...", "writing:...").
//
// Scheduling is a simplified SM-2 (the algorithm behind Anki):
// - wrong answer  -> the item comes back in ~1 minute, its interval resets and its ease drops a little;
// - right answer  -> next review in 1 day, then 3 days, then interval × ease (≈ 7, 18, 45 days…).

const KEY = 'c1esp:progress:v1';
const DAY_KEY = 'c1esp:today:v1';
const DAY = 24 * 60 * 60 * 1000;
const RELEARN_DELAY = 60 * 1000;

// Interval (days) from which an item counts as mastered.
export const MASTERED_DAYS = 7;

let store = load(KEY, {});

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: progress just won't persist */
  }
}

// Keep in sync if the site is open in two tabs.
window.addEventListener('storage', e => {
  if (e.key === KEY) store = load(KEY, {});
});

export function get(key) {
  return store[key] || null;
}

// Has this item entered the schedule yet?
export const isScheduled = key => store[key]?.due != null;

export function nextInterval(r) {
  const reps = r?.reps || 0;
  if (reps === 0) return 1;
  if (reps === 1) return 3;
  return Math.max(4, Math.round((r.interval || 1) * (r.ease || 2.5)));
}

// A new word has been shown on its "Palabra nueva" card: it enters the schedule, due right away,
// so it gets its first exercise after one or two other cards.
export function introduce(key) {
  const r = store[key] || (store[key] = { attempts: 0, correct: 0, byType: {} });
  if (r.due != null) return;
  Object.assign(r, { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now(), introduced: new Date().toISOString() });
  save(KEY, store);
  const day = today();
  day.newSeen++;
  save(DAY_KEY, day);
}

// practice: free practice outside the schedule. A right answer doesn't push the item further
// into the future (unless it was being relearnt); a wrong answer still counts.
export function review(key, correct, kind, { practice = false } = {}) {
  const r = store[key] || (store[key] = { attempts: 0, correct: 0, byType: {} });
  const wasNew = r.due == null;
  if (r.ease == null) Object.assign(r, { ease: 2.5, interval: 0, reps: 0, lapses: 0 });

  r.attempts++;
  if (correct) r.correct++;
  r.last = new Date().toISOString();
  r.lastCorrect = correct;
  r.lastType = kind;
  const t = r.byType[kind] || (r.byType[kind] = { attempts: 0, correct: 0 });
  t.attempts++;
  if (correct) t.correct++;

  const now = Date.now();
  if (!correct) {
    if (!wasNew) r.lapses++;
    r.reps = 0;
    r.interval = 0;
    r.ease = Math.max(1.3, r.ease - 0.2);
    r.due = now + RELEARN_DELAY;
  } else if (!practice || r.interval === 0 || wasNew) {
    r.interval = nextInterval(r);
    r.reps++;
    r.due = now + r.interval * DAY;
  }
  save(KEY, store);

  const day = today();
  day.reviewed++;
  if (wasNew) day.newSeen++;
  save(DAY_KEY, day);
}

// Counters for the current calendar day.
export function today() {
  const date = new Date().toLocaleDateString('sv'); // YYYY-MM-DD in local time
  const d = load(DAY_KEY, null);
  return d && d.date === date ? d : { date, reviewed: 0, newSeen: 0 };
}

// 'new' | 'learning' | 'mastered'
export function status(key) {
  const r = store[key];
  if (!r || r.due == null) return 'new';
  return r.interval >= MASTERED_DAYS ? 'mastered' : 'learning';
}

export function summarize(keys) {
  const counts = { new: 0, learning: 0, mastered: 0 };
  for (const k of keys) counts[status(k)]++;
  return counts;
}

export const isDue = (key, now = Date.now()) => isScheduled(key) && store[key].due <= now;
