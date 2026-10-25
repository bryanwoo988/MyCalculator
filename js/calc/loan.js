/* Reducing-balance loan schedule (home loans, and car loans under the
   Hire Purchase (Amendment) Act 2026).

   Monthly rest: each month's interest is the opening balance × annual
   rate / 12. Banks on daily rest charge slightly different interest per
   month; the note on the result page says so.

   Rate segments: [{ fromYear, rate }] — "years 1–3 at 3.9%, then 4.3%".
   When the rate changes, the instalment is recalculated so the balance
   clears by the original end date.

   Prepayments: [{ month, amount, every }] — a one-off (every 0) or
   repeated every `every` months from `month`. With mode 'term' the
   instalment stays the same and the loan ends early; with 'payment' the
   instalment is recalculated over the remaining original term. */

import { annuity } from './money.js';

export function rateAt(segments, month, base) {
  let rate = base;
  for (const s of [...segments].sort((a, b) => a.fromYear - b.fromYear)) {
    if (month >= (s.fromYear - 1) * 12) rate = s.rate;
  }
  return rate;
}

export function prepaymentAt(prepayments, month) {
  let total = 0;
  for (const p of prepayments) {
    const start = p.month - 1;
    if (month === start || (p.every > 0 && month > start && (month - start) % p.every === 0)) total += p.amount;
  }
  return total;
}

export function schedule(i) {
  const n = Math.round(i.years * 12);
  const segments = i.segments || [];
  const prepayments = i.prepayments || [];
  let balance = i.principal, rate = rateAt(segments, 0, i.rate);
  let payment = annuity(balance, rate / 1200, n);
  const first = payment;
  const rows = [];
  let interest = 0, paid = 0, prepaid = 0;

  for (let m = 0; m < n && balance > 1e-6; m++) {
    const r = rateAt(segments, m, i.rate);
    if (r !== rate) { rate = r; payment = annuity(balance, rate / 1200, n - m); }
    const int = balance * rate / 1200;
    let pay = Math.min(payment, balance + int);
    let princ = pay - int;
    balance -= princ;
    let extra = Math.min(prepaymentAt(prepayments, m), balance);
    balance -= extra;
    if (extra > 0 && i.mode === 'payment' && balance > 1e-6) payment = annuity(balance, rate / 1200, n - m - 1);
    if (balance < 1e-6) balance = 0;
    interest += int; paid += pay + extra; prepaid += extra;
    rows.push({ month: m + 1, rate, payment: pay, interest: int, principal: princ, prepayment: extra, balance });
  }
  return { firstPayment: first, rows, months: rows.length, totalInterest: interest, totalPaid: paid, totalPrepaid: prepaid };
}

// Monthly rows rolled up into loan years.
export function byYear(rows) {
  const out = [];
  for (const r of rows) {
    const y = Math.ceil(r.month / 12);
    const o = out[y - 1] || (out[y - 1] = { year: y, payment: 0, interest: 0, principal: 0, prepayment: 0, balance: 0 });
    o.payment += r.payment; o.interest += r.interest; o.principal += r.principal; o.prepayment += r.prepayment; o.balance = r.balance;
  }
  return out;
}

// The same loan with and without the extras, for "you save RM… and … months".
export function withSavings(i) {
  const plan = schedule(i);
  const base = schedule({ ...i, prepayments: [] });
  return {
    ...plan,
    baseline: { months: base.months, totalInterest: base.totalInterest },
    interestSaved: base.totalInterest - plan.totalInterest,
    monthsSaved: base.months - plan.months,
  };
}
