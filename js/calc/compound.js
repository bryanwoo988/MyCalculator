/* Compound growth with regular contributions.

   Steps month by month at the monthly rate equivalent to the chosen
   compounding (so yearly, quarterly and daily compounding all give their
   true effective annual yield). Contributions are monthly or yearly, at the
   start or the end of the period, and can step up every year. */

import { monthlyRate } from './money.js';

export function compound(i) {
  const months = Math.round(i.years * 12);
  const r = monthlyRate(i.rate, i.compounding);
  const step = 1 + (i.stepUp || 0) / 100;
  const infl = 1 + (i.inflation || 0) / 100;
  let balance = i.principal, paid = i.principal, interest = 0;
  const years = [];
  let y = { contributed: 0, interest: 0 };

  for (let m = 0; m < months; m++) {
    const year = Math.floor(m / 12);
    const amount = i.contribution * Math.pow(step, year);
    const due = i.frequency === 'yearly'
      ? (i.timing === 'begin' ? m % 12 === 0 : m % 12 === 11)
      : true;
    if (due && i.timing === 'begin') { balance += amount; paid += amount; y.contributed += amount; }
    const earned = balance * r;
    balance += earned; interest += earned; y.interest += earned;
    if (due && i.timing !== 'begin') { balance += amount; paid += amount; y.contributed += amount; }

    if (m % 12 === 11 || m === months - 1) {
      const t = (m + 1) / 12;
      years.push({
        year: Math.ceil(t), contributed: y.contributed, interest: y.interest,
        balance, totalPaid: paid, totalInterest: interest, real: balance / Math.pow(infl, t),
      });
      y = { contributed: 0, interest: 0 };
    }
  }
  return {
    balance, totalPaid: paid, totalInterest: interest,
    real: balance / Math.pow(infl, months / 12),
    effectiveAnnual: (Math.pow(1 + r, 12) - 1) * 100,
    years,
  };
}

/* The monthly (or yearly) contribution that reaches `target`. The end
   balance is linear in the contribution, so two runs pin it exactly. */
export function contributionFor(target, i) {
  const base = compound({ ...i, contribution: 0 }).balance;
  const unit = compound({ ...i, contribution: 1 }).balance - base;
  if (unit <= 0) return null;
  return Math.max(0, (target - base) / unit);
}
