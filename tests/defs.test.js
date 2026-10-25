/* Every calculator computes from its defaults, from a hostile saved
   record, and in every mode, without throwing or producing NaN. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CALCS, defaults, sanitise } from '../js/defs/index.js';

const R = {};
for (const f of readdirSync(new URL('../data/rules/', import.meta.url))) {
  R[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(new URL(`../data/rules/${f}`, import.meta.url)));
}

function finite(result) {
  const nums = [];
  for (const h of result.headline) nums.push(h.value);
  for (const g of result.groups) for (const r of g.rows) if (r.kind !== 'text') nums.push(r.value);
  for (const c of result.charts) for (const s of c.series) nums.push(...s.values);
  for (const t of result.tables) for (const row of t.rows) for (const x of row) if (x !== null) nums.push(x);
  for (const n of nums) assert.ok(Number.isFinite(n), `not finite: ${n}`);
}

for (const def of CALCS) {
  test(`${def.id}: needs only rule files that exist`, () => {
    for (const r of def.rules) assert.ok(R[r], `missing data/rules/${r}.json`);
  });
  test(`${def.id}: defaults compute`, () => finite(def.compute(defaults(def, R), R)));
  test(`${def.id}: garbage input is sanitised`, () => {
    const junk = Object.fromEntries(def.fields.map(f => [f.id, f.type === 'list' ? [{ x: 'y' }, null] : 'NaN']));
    finite(def.compute(sanitise(def, junk, R), R));
    finite(def.compute(sanitise(def, null, R), R));
  });
  for (const f of def.fields.filter(f => f.type === 'select')) {
    for (const o of f.options) {
      test(`${def.id}: ${f.id}=${o.v} computes`, () => finite(def.compute({ ...defaults(def, R), [f.id]: o.v }, R)));
    }
  }
}

test('home: rate changes and prepayments flow through', () => {
  const def = CALCS.find(c => c.id === 'home');
  const v = { ...defaults(def, R), segments: [{ fromYear: 3, rate: 5 }], prepayments: [{ month: 12, amount: 20000, every: 12 }], netIncome: 10000 };
  const r = def.compute(v, R);
  finite(r);
  assert.ok(r.groups[0].rows.some(x => x.key === 'interestSaved' && x.value > 0));
  assert.ok(r.groups.some(g => g.key === 'affordability'));
});

test('car: early settlement group appears', () => {
  const def = CALCS.find(c => c.id === 'car');
  for (const method of ['flat', 'reducing']) {
    const r = def.compute({ ...defaults(def, R), method, settleAfter: 24 }, R);
    finite(r);
    assert.ok(r.groups.some(g => g.key === 'settleGroup'));
  }
});
