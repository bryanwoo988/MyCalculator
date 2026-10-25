/* Saved projections, kept on this device only.

   A record stores the inputs (not just the answer), the rule versions it
   was worked out with, and the headline numbers at the time. Opening it
   recomputes with today's rules, so a corrected rate shows up, and the old
   headline is still there to compare with.

   Backup is one JSON file with every record and the preferences; restore
   merges by record id, newest wins. */

export const KEY = 'mycalc.records.v1';
export const MAX = 500;

let store = null;
let list = [];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function validRecord(r) {
  return isObj(r) && typeof r.id === 'string' && typeof r.calc === 'string' && typeof r.name === 'string'
    && isObj(r.inputs) && typeof r.savedAt === 'string';
}

export function init(storage = globalThis.localStorage) {
  store = storage ?? null;
  try {
    const raw = JSON.parse(store?.getItem(KEY) || '[]');
    list = Array.isArray(raw) ? raw.filter(validRecord) : [];
  } catch { list = []; }
  return all();
}

function save() {
  try { store?.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export const all = () => structuredClone(list).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
export const get = id => structuredClone(list.find(r => r.id === id) ?? null);

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function add({ calc, name, inputs, rules, headline }, now = new Date().toISOString()) {
  const r = { id: newId(), calc, name: name.trim().slice(0, 80) || calc, inputs, rules, headline, savedAt: now };
  list.push(r);
  if (list.length > MAX) list = list.slice(-MAX);
  return save() ? r : null;
}

export function update(id, patch, now = new Date().toISOString()) {
  const i = list.findIndex(r => r.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id, savedAt: now };
  if (typeof patch.name === 'string') list[i].name = patch.name.trim().slice(0, 80) || list[i].name;
  save();
  return get(id);
}

export function remove(id) {
  list = list.filter(r => r.id !== id);
  save();
}

export function backup(prefs, version, now = new Date().toISOString()) {
  return { app: 'mycalculator', format: 1, version, exportedAt: now, prefs, records: structuredClone(list) };
}

/* Merge a backup file. Returns { added, updated, skipped } or throws on a
   file that is not ours. Records newer in the file replace local ones. */
export function restore(data) {
  if (!isObj(data) || data.app !== 'mycalculator' || !Array.isArray(data.records)) throw new Error('not-a-backup');
  let added = 0, updated = 0, skipped = 0;
  for (const r of data.records) {
    if (!validRecord(r)) { skipped++; continue; }
    const i = list.findIndex(x => x.id === r.id);
    if (i < 0) { list.push(r); added++; }
    else if (r.savedAt > list[i].savedAt) { list[i] = r; updated++; }
    else skipped++;
  }
  save();
  return { added, updated, skipped, prefs: isObj(data.prefs) ? data.prefs : null };
}
