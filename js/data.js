// Loads the content files listed in data/index.json and checks them for mistakes.

import { slugify } from './text.js';

let indexPromise;
let vocabPromise;

async function fetchJSON(path) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-cache' });
  } catch {
    throw new Error(`${path}: no se pudo cargar el archivo.`);
  }
  if (!res.ok) throw new Error(`${path}: no se encontró (HTTP ${res.status}). ¿Está bien escrita la ruta en data/index.json?`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path}: error de formato JSON — ${describeJSONError(e, text)}`);
  }
}

function describeJSONError(err, text) {
  let msg = err.message;
  const pos = /position (\d+)/.exec(msg);
  if (pos && !/line/i.test(msg)) {
    const before = text.slice(0, Number(pos[1]));
    const line = before.split('\n').length;
    msg += ` (línea ${line})`;
  }
  return `${msg}. Suele ser una coma de más o de menos, o unas comillas sin cerrar.`;
}

export function loadIndex() {
  return (indexPromise ||= fetchJSON('data/index.json'));
}

const asList = v => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);

export function loadVocab() {
  return (vocabPromise ||= (async () => {
    const index = await loadIndex();
    const problems = [];
    const entries = [];
    const seen = new Map();

    const files = await Promise.all(
      (index.vocab || []).map(async path => {
        try {
          return { path, data: await fetchJSON('data/' + path) };
        } catch (e) {
          problems.push(e.message);
          return null;
        }
      })
    );

    for (const file of files) {
      if (!file) continue;
      const { path, data } = file;
      const list = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(list)) {
        problems.push(`${path}: falta la lista "entries".`);
        continue;
      }
      list.forEach((raw, i) => {
        const where = `${path}, entrada ${i + 1}${raw && raw.word ? ` («${raw.word}»)` : ''}`;
        if (!raw || typeof raw.word !== 'string' || !raw.word.trim()) {
          problems.push(`${where}: falta "word".`);
          return;
        }
        const topic = raw.topic || data.topic || 'Sin tema';
        const e = {
          id: raw.id || slugify(raw.word),
          word: raw.word.trim(),
          type: raw.type || '',
          definition: raw.definition || '',
          synonyms: asList(raw.synonyms),
          example: raw.example || '',
          context: raw.context || '',
          connotation: raw.connotation || '',
          notes: raw.notes || '',
          accept: asList(raw.accept),
          topic,
          topicId: slugify(topic),
          source: data.source || path,
        };
        if (seen.has(e.id)) {
          problems.push(`${where}: ya existe una entrada con id "${e.id}" (en ${seen.get(e.id)}). Añade un "id" distinto a una de las dos.`);
          return;
        }
        if (!e.definition) problems.push(`${where}: falta "definition".`);
        seen.set(e.id, path);
        e.key = 'vocab:' + e.id;
        entries.push(e);
      });
    }

    const topicMap = new Map();
    for (const e of entries) {
      const t = topicMap.get(e.topicId) || { id: e.topicId, name: e.topic, count: 0 };
      t.count++;
      topicMap.set(e.topicId, t);
    }
    const topics = [...topicMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return { entries, topics, problems };
  })());
}
