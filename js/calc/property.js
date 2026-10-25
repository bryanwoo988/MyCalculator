/* What buying a property costs on top of the price: legal fees, stamp
   duty, service tax and the buyer's own extras. Every rate comes from
   data/rules/property.json. */

import { tiered } from './money.js';

// Solicitors' Remuneration Order 2023 scale for one document (SPA or loan).
export function legalFee(amount, rules) {
  const lf = rules.legalFees;
  if (amount <= 0) return 0;
  return Math.max(lf.minimum, tiered(amount, lf.tiers.map(t => ({ ...t }))).total);
}

export function isFirstHomeExempt(i, rules) {
  const f = rules.firstHome;
  return !!i.firstHome && i.buyer === 'citizen' && i.price <= f.maxPrice;
}

export function motDuty(i, rules) {
  if (i.buyer === 'foreigner') return i.price * rules.foreignResidentialRate.rate / 100;
  const full = tiered(i.price, rules.motStampDuty.tiers).total;
  return isFirstHomeExempt(i, rules) ? full * (1 - rules.firstHome.motExemptPct / 100) : full;
}

export function loanDuty(i, rules) {
  const full = i.loan * rules.loanStampDutyRate.rate / 100;
  return isFirstHomeExempt(i, rules) ? full * (1 - rules.firstHome.loanExemptPct / 100) : full;
}

export function buyingCosts(i, rules) {
  const sst = rules.serviceTaxRate.rate / 100;
  const spaFee = legalFee(i.price, rules);
  const loanFee = i.loan > 0 ? legalFee(i.loan, rules) : 0;
  const items = {
    downpayment: i.price - i.loan,
    spaLegal: spaFee,
    loanLegal: loanFee,
    legalSst: (spaFee + loanFee) * sst,
    motDuty: motDuty(i, rules),
    loanDuty: loanDuty(i, rules),
    valuation: i.valuation || 0,
    insurance: i.insurance || 0,
    disbursement: i.disbursement || 0,
    other: i.otherCosts || 0,
  };
  const upfront = Object.values(items).reduce((a, b) => a + b, 0);
  return { items, upfront, exempt: isFirstHomeExempt(i, rules) };
}

// Debt service ratio: every monthly debt over net monthly income.
export function dsr(newInstalment, commitments, netIncome) {
  if (!(netIncome > 0)) return null;
  return (newInstalment + (commitments || 0)) / netIncome * 100;
}
