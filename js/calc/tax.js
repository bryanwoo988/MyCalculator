/* Malaysian income tax estimates: resident and non-resident individuals,
   and companies. Rates, reliefs and caps come from data/rules/tax-*.json,
   one file per year of assessment. */

import { tiered } from './money.js';

/* Each relief claimed, capped by its rule. `claims` maps relief id to an
   amount (kind "amount"), a number of children ("count") or true ("flag").
   First-home loan interest has a cap that depends on the house price band. */
export function capOf(r, claims) {
  return r.capByBand ? (r.capByBand[claims.housingBand] ?? 0) : r.cap;
}

export function reliefs(claims, rules) {
  const out = [];
  for (const r of rules.reliefs) {
    const cap = capOf(r, claims), raw = claims[r.id];
    let v = 0;
    if (r.auto) v = cap;
    else if (r.kind === 'flag') v = raw ? cap : 0;
    else if (r.kind === 'count') v = Math.max(0, Math.floor(raw || 0)) * cap;
    else v = Math.min(Math.max(0, raw || 0), cap);
    if (v > 0) out.push({ id: r.id, kind: r.kind ?? 'auto', claimed: raw ?? null, allowed: v, cap });
  }
  return out;
}

export function personal(i, rules) {
  const income = (i.employment || 0) + (i.bonus || 0) + (i.otherIncome || 0) - (i.deductions || 0);
  const totalIncome = Math.max(0, income);

  if (i.residency === 'nonresident') {
    const tax = totalIncome * rules.nonResidentRate / 100;
    return finish({ totalIncome, reliefs: [], reliefTotal: 0, chargeable: totalIncome, gross: tax, parts: [], rebates: [], tax }, i);
  }

  const rel = reliefs(i, rules);
  const reliefTotal = rel.reduce((a, r) => a + r.allowed, 0);
  const chargeable = Math.max(0, totalIncome - reliefTotal);
  const { total: gross, parts } = tiered(chargeable, rules.bands);
  const rebates = [];
  if (chargeable <= rules.rebate.threshold) {
    rebates.push({ id: 'rebateSelf', amount: rules.rebate.self });
    if (i.spouse) rebates.push({ id: 'rebateSpouse', amount: rules.rebate.spouse });
  }
  let tax = gross;
  for (const r of rebates) { r.amount = Math.min(r.amount, tax); tax -= r.amount; }
  // Zakat and fitrah: a rebate up to the tax left, never a refund.
  if (i.zakat > 0) { const z = Math.min(i.zakat, tax); rebates.push({ id: 'rebateZakat', amount: z }); tax -= z; }
  return finish({ totalIncome, reliefs: rel, reliefTotal, chargeable, gross, parts, rebates, tax }, i);
}

function finish(r, i) {
  const marginal = r.parts.length ? r.parts[r.parts.length - 1].rate : (i.residency === 'nonresident' ? 30 : 0);
  const paid = i.pcb || 0;
  return {
    ...r,
    effective: r.totalIncome > 0 ? r.tax / r.totalIncome * 100 : 0,
    marginal: r.chargeable > 0 ? marginal : 0,
    paid,
    balance: r.tax - paid, // > 0 to pay, < 0 refund
  };
}

export function smeEligible(i, rules) {
  const s = rules.sme;
  return i.paidUp <= s.paidUpMax && i.grossIncome <= s.grossIncomeMax && (i.foreignPct || 0) <= s.foreignOwnershipMaxPct && !i.inBigGroup;
}

export function company(i, rules) {
  const sme = smeEligible(i, rules);
  const bands = sme ? rules.sme.bands : [{ upTo: null, rate: rules.standardRate }];
  const { total, parts } = tiered(Math.max(0, i.chargeable), bands);
  return { sme, tax: total, parts, effective: i.chargeable > 0 ? total / i.chargeable * 100 : 0, paid: i.cp204 || 0, balance: total - (i.cp204 || 0) };
}
