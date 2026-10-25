/* The five calculators. Each one declares its form (fields), the rule
   files it needs, and compute(values, rules) → a result the generic page
   renders, saves and exports. Results carry translation keys and raw
   numbers, never formatted text, so a saved record or an export can be
   shown in any language.

   Result shape:
     headline [{ key, value, kind }]                big numbers at the top
     groups   [{ key, rows: [{ key, value, kind, strong, params }] }]
     charts   [{ key, type: 'line'|'stack'|'bar', x: [], xKind, series: [{ key, values }] }]
     tables   [{ key, cols: [{ key, kind }], rows: [[]], monthly?: { cols, rows } }]
     notes    [{ key, params }]
   kind: money | pct | int | months | age | year | text (a translation key) */

import compound from './compound.js';
import epf from './epf.js';
import home from './home.js';
import car from './car.js';
import tax from './tax.js';

export const CALCS = [compound, epf, home, car, tax];
export const byId = id => CALCS.find(c => c.id === id);

// Starting values for a calculator, given its rule files.
export function defaults(def, rules) {
  const v = {};
  for (const f of def.fields) {
    if (f.type === 'section') continue;
    v[f.id] = typeof f.def === 'function' ? f.def(rules) : structuredClone(f.def);
  }
  return v;
}

/* Stored values are checked against the form: unknown keys dropped, wrong
   types replaced by the default, numbers clamped. A record saved by an
   older version therefore always opens. */
export function sanitise(def, raw, rules) {
  const d = defaults(def, rules), v = {};
  for (const f of def.fields) {
    if (f.type === 'section') continue;
    const x = raw?.[f.id];
    if (f.type === 'select') v[f.id] = f.options.some(o => o.v === x) ? x : d[f.id];
    else if (f.type === 'toggle') v[f.id] = typeof x === 'boolean' ? x : d[f.id];
    else if (f.type === 'list') v[f.id] = Array.isArray(x) ? x.filter(r => r && typeof r === 'object').map(r => cleanRow(f, r)).slice(0, 20) : d[f.id];
    else v[f.id] = Number.isFinite(x) ? clamp(f, x) : d[f.id];
  }
  return v;
}

function clamp(f, x) {
  if (f.min !== undefined && x < f.min) return f.min;
  if (f.max !== undefined && x > f.max) return f.max;
  return f.type === 'int' ? Math.round(x) : x;
}

function cleanRow(f, r) {
  const o = {};
  for (const c of f.item) o[c.id] = Number.isFinite(r[c.id]) ? clamp(c, r[c.id]) : c.def;
  return o;
}
