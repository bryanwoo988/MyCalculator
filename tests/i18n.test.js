/* Every piece of text the app can show exists in all three languages. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TABLES, label, t } from '../js/i18n.js';
import { CALCS, defaults } from '../js/defs/index.js';

const R = {};
for (const f of readdirSync(new URL('../data/rules/', import.meta.url))) {
  R[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(new URL(`../data/rules/${f}`, import.meta.url)));
}

test('the three tables have the same keys', () => {
  const en = Object.keys(TABLES.en).sort();
  for (const l of ['zh', 'ms']) {
    const other = Object.keys(TABLES[l]).sort();
    assert.deepEqual(en.filter(k => !other.includes(k)), [], `missing in ${l}`);
    assert.deepEqual(other.filter(k => !en.includes(k)), [], `extra in ${l}`);
  }
});

test('placeholders match across languages', () => {
  for (const [k, s] of Object.entries(TABLES.en)) {
    const want = (s.match(/\{\w+\}/g) || []).sort().join();
    for (const l of ['zh', 'ms']) assert.equal((TABLES[l][k].match(/\{\w+\}/g) || []).sort().join(), want, `${l}.${k}`);
  }
});

// Label resolution falls back to the key itself; a key echoed back is missing.
const missing = [];
const need = (s, key) => { if (s === key || s === 'f_' + key.split('.').pop()) missing.push(key); };

test('every form label, option and section has text', () => {
  for (const def of CALCS) {
    need(t(`calc_${def.id}`), `calc_${def.id}`);
    need(t(`calc_${def.id}_sub`), `calc_${def.id}_sub`);
    for (const f of def.fields) {
      if (f.type === 'section') { need(label(def.id, 'sec_' + f.id), `${def.id}.sec_${f.id}`); continue; }
      // A list sits under its own section heading and has no label of its own.
      if (f.type !== 'list') need(label(def.id, f.id), `${def.id}.${f.id}`);
      for (const o of f.options || []) need(label(def.id, `${f.id}_${o.v}`), `${def.id}.${f.id}_${o.v}`);
      for (const c of f.item || []) need(label(def.id, `${f.id}_${c.id}`), `${def.id}.${f.id}_${c.id}`);
      if (f.item) need(label(def.id, `${f.id}_add`), `${def.id}.${f.id}_add`);
    }
  }
  assert.deepEqual(missing.splice(0), []);
});

test('every result label has text, in every mode', () => {
  const keys = new Set();
  const walk = r => {
    for (const h of r.headline) keys.add(h.key);
    for (const g of r.groups) { keys.add(g.key); for (const x of g.rows) { keys.add(x.key); if (x.kind === 'text') keys.add(x.value); } }
    for (const c of r.charts) { keys.add(c.key); for (const s of c.series) keys.add(s.key); }
    for (const tb of r.tables) { keys.add(tb.key); for (const c of [...tb.cols, ...(tb.monthly?.cols || [])]) keys.add(c.key); }
    for (const n of r.notes) keys.add(n.key);
  };
  for (const def of CALCS) {
    const base = defaults(def, R);
    const variants = [base];
    for (const f of def.fields.filter(f => f.type === 'select')) for (const o of f.options) variants.push({ ...base, [f.id]: o.v });
    if (def.id === 'home') variants.push({ ...base, segments: [{ fromYear: 2, rate: 5 }], prepayments: [{ month: 3, amount: 1000, every: 0 }], firstHome: true, price: 400000, netIncome: 9000, valuation: 1, insurance: 1, disbursement: 1, otherCosts: 1 }, { ...base, firstHome: true, price: 900000 });
    if (def.id === 'epf') variants.push({ ...base, planRetire: true }, { ...base, planRetire: true, lifeAge: 50 });
    if (def.id === 'car') variants.push({ ...base, settleAfter: 12 }, { ...base, method: 'flat', settleAfter: 12 });
    if (def.id === 'tax') variants.push({ ...base, employment: 30000, spouse: true, zakat: 10, pcb: 99999, lifestyle: 1, childUnder18: 1 }, { ...base, mode: 'company', paidUp: 9e6 });
    for (const v of variants) walk(def.compute(v, R));
  }
  for (const k of keys) if (TABLES.en[k] === undefined) missing.push(k);
  assert.deepEqual(missing.splice(0), []);
  // Every ⓘ explanation belongs to a figure some result really shows.
  const orphans = Object.keys(TABLES.en).filter(k => k.startsWith('exp_') && !keys.has(k.slice(4)));
  assert.deepEqual(orphans, []);
});

test('every rule file has a name', () => {
  for (const n of Object.keys(R)) assert.ok(TABLES.en['rule_' + n], n);
});

test('every chart series has a colour', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const most = Math.max(...CALCS.flatMap(def => {
    const v = { ...defaults(def, R), planRetire: true };
    return def.compute(v, R).charts.map(c => c.series.length);
  }));
  for (let k = 1; k <= most; k++) assert.match(css, new RegExp(`\\.chart \\.s${k} \\{ --c: var\\(--c${k}\\)`), `.s${k}`);
});
