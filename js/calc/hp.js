/* Car loans (hire purchase).

   From 1 June 2026 new hire-purchase agreements use the reducing balance
   method (loan.js). Agreements signed before then — and some providers
   until the 31 March 2027 grace period ends — use the old flat rate, with
   the Rule of 78 deciding the interest rebate on early settlement. Both
   are here so an existing loan can still be worked out. */

import { annuity, monthlyIrr } from './money.js';
import { schedule } from './loan.js';

export function flat(i) {
  const n = Math.round(i.years * 12);
  const interest = i.principal * i.rate / 100 * i.years;
  const payment = (i.principal + interest) / n;
  const eir = monthlyIrr(i.principal, payment, n) * 1200;
  // Rule of 78: month k carries interest weight (n − k + 1) / (n(n+1)/2).
  const digits = n * (n + 1) / 2;
  const rows = [];
  let balance = i.principal;
  for (let k = 1; k <= n; k++) {
    const int = interest * (n - k + 1) / digits;
    const princ = payment - int;
    balance -= princ;
    rows.push({ month: k, rate: i.rate, payment, interest: int, principal: princ, prepayment: 0, balance: Math.max(0, balance) });
  }
  return { payment, totalInterest: interest, totalPaid: payment * n, eir, months: n, rows };
}

/* Settling a flat-rate loan after `paid` instalments: the instalments
   still owed, less the Rule of 78 rebate on the unearned interest. */
export function flatSettlement(i, paid) {
  const n = Math.round(i.years * 12);
  const f = flat(i);
  const left = Math.max(0, n - paid);
  const owed = f.payment * left;
  const rebate = f.totalInterest * left * (left + 1) / (n * (n + 1));
  return { owed, rebate, settle: owed - rebate, saved: rebate };
}

export function reducing(i) {
  const n = Math.round(i.years * 12);
  const s = schedule({ principal: i.principal, rate: i.rate, years: i.years });
  return { payment: annuity(i.principal, i.rate / 1200, n), totalInterest: s.totalInterest, totalPaid: s.totalPaid, eir: i.rate, months: n, rows: s.rows };
}

// Reducing balance: settle by paying off the balance left after `paid` instalments.
export function reducingSettlement(i, paid) {
  const r = reducing(i);
  const left = Math.max(0, r.months - paid);
  const owed = r.payment * left;
  const settle = paid <= 0 ? i.principal : (r.rows[paid - 1]?.balance ?? 0);
  return { owed, rebate: owed - settle, settle, saved: owed - settle };
}
