// Loads the content files listed in data/index.json and checks them for mistakes.

import { slugify } from './text.js';

let indexPromise;
let vocabPromise;
let grammarPromise;
let writingPromise;

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

// Fetch every file listed for a section; broken files are reported and skipped.
async function loadFiles(paths, problems) {
  const files = await Promise.all(
    (paths || []).map(async path => {
      try {
        return { path, data: await fetchJSON('data/' + path) };
      } catch (e) {
        problems.push(e.message);
        return null;
      }
    })
  );
  return files.filter(Boolean);
}

const asList = v => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);

export function loadVocab() {
  return (vocabPromise ||= (async () => {
    const index = await loadIndex();
    const problems = [];
    const entries = [];
    const seen = new Map();

    const files = await loadFiles(index.vocab, problems);

    for (const { path, data } of files) {
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
          fr: raw.fr || '',
          definition: raw.definition || '',
          synonyms: asList(raw.synonyms),
          example: raw.example || '',
          context: raw.context || '',
          connotation: raw.connotation || '',
          notes: raw.notes || '',
          accept: asList(raw.accept),
          related: asList(raw.related),
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

// ---------- Grammar ----------

export function loadGrammar() {
  return (grammarPromise ||= (async () => {
    const index = await loadIndex();
    const problems = [];
    const topics = [];
    const files = await loadFiles(index.grammar, problems);

    for (const { path, data } of files) {
      if (!data.topic) {
        problems.push(`${path}: falta "topic".`);
        continue;
      }
      const topicId = data.id || slugify(data.topic);
      if (topics.some(t => t.id === topicId)) {
        problems.push(`${path}: ya existe un tema «${data.topic}». Cambia el nombre o añade un "id" distinto.`);
        continue;
      }
      const exercises = [];
      const seen = new Set();
      (data.exercises || []).forEach((raw, i) => {
        const where = `${path}, ejercicio ${i + 1}`;
        if (!raw || !raw.prompt) return problems.push(`${where}: falta "prompt".`);
        const kind = raw.options ? 'choice' : 'text';
        const answers = kind === 'choice' ? asList(raw.answer) : asList(raw.answers ?? raw.answer);
        if (!answers.length) return problems.push(`${where}: falta "answer${kind === 'text' ? 's' : ''}".`);
        if (kind === 'choice' && !answers.every(a => raw.options.includes(a))) {
          return problems.push(`${where}: la respuesta «${answers[0]}» no está entre las "options".`);
        }
        const id = raw.id || slugify(raw.prompt).slice(0, 60);
        if (seen.has(id)) return problems.push(`${where}: hay dos ejercicios con el mismo enunciado; añade un "id" a uno de ellos.`);
        seen.add(id);
        exercises.push({
          id,
          key: `grammar:${topicId}:${id}`,
          kind,
          label: raw.label || (kind === 'choice' ? 'Elige la opción correcta' : 'Completa'),
          instruction: raw.instruction || '',
          prompt: raw.prompt,
          options: kind === 'choice' ? asList(raw.options) : [],
          answers,
          explanation: raw.explanation || '',
          whyNot: raw.whyNot || {},
          alsoAccepted: raw.alsoAccepted || {},
          traps: raw.traps || {},
          source: raw.source || 'generated',
          topicId,
          topic: data.topic,
        });
        if (!raw.explanation) problems.push(`${where}: falta "explanation".`);
      });
      topics.push({ id: topicId, name: data.topic, summary: data.summary || '', fiche: data.fiche || {}, exercises });
    }
    return { topics, exercises: topics.flatMap(t => t.exercises), problems };
  })());
}

// ---------- Writing ----------

export function loadWriting() {
  return (writingPromise ||= (async () => {
    const index = await loadIndex();
    const problems = [];
    const prompts = [];
    const files = await loadFiles(index.writing, problems);

    for (const { path, data } of files) {
      const list = Array.isArray(data.prompts) ? data.prompts : [data];
      for (const raw of list) {
        if (!raw.title || !Array.isArray(raw.parts)) {
          problems.push(`${path}: cada tema necesita "title" y una lista "parts".`);
          continue;
        }
        const id = raw.id || slugify(raw.title);
        for (const [i, part] of raw.parts.entries()) {
          part.id ||= slugify(part.title || `parte-${i + 1}`);
          for (const c of part.checks || []) {
            for (const key of ['pattern', 'avoid']) {
              if (!c[key]) continue;
              try {
                new RegExp(c[key], 'iu');
              } catch (e) {
                problems.push(`${path}, «${part.title}»: la expresión de "${c.label}" no es válida (${e.message}).`);
                c.broken = true;
              }
            }
          }
        }
        prompts.push({ ...raw, id, topic: raw.topic || data.topic || '' });
      }
    }
    return { prompts, problems };
  })());
}
