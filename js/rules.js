/* Rule files (data/rules/*.json): tax rates, EPF rates, stamp duty and so
   on, each with its sources, the date it was last checked (asOf) and a
   date after which it may be out of date (reviewBy). They ship with the
   app; a change to a rule is a new release. */

export const RULE_FILES = ['epf', 'property', 'hire-purchase', 'tax-personal-YA2025', 'tax-company-YA2025'];

export async function loadRules(fetchFn = fetch) {
  const out = {};
  await Promise.all(RULE_FILES.map(async name => {
    const res = await fetchFn(`data/rules/${name}.json`);
    if (!res.ok) throw new Error(`rules ${name}: ${res.status}`);
    out[name] = await res.json();
  }));
  return out;
}

// "tax-personal-YA2025@1": which version of each rule file a result used.
export const versionsFor = (names, R) => Object.fromEntries(names.map(n => [n, R[n].rev]));

// Rule files whose revision moved on since a record was saved.
export function changedSince(saved, R) {
  return Object.entries(saved || {}).filter(([n, rev]) => R[n] && R[n].rev !== rev).map(([n]) => n);
}

export const isStale = (rule, today) => !!rule.reviewBy && today >= rule.reviewBy;

export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
