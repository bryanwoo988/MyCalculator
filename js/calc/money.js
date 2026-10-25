/* Shared arithmetic for the calculators.

   Everything is computed in full precision and only rounded for display,
   so a schedule's rows always add up to its totals. */

// Interest per month for an annual nominal rate (%) compounded m times a year.
export function monthlyRate(annualPct, perYear = 12) {
  const r = annualPct / 100;
  if (perYear === 12) return r / 12;
  return Math.pow(1 + r / perYear, perYear / 12) - 1;
}

// The level instalment that clears `principal` in `n` months at monthly rate `r`.
export function annuity(principal, r, n) {
  if (n <= 0) return principal;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

// Tax or duty on progressive bands: [{ upTo, rate }], last upTo is null.
export function tiered(amount, bands) {
  let left = Math.max(0, amount), from = 0, total = 0;
  const parts = [];
  for (const b of bands) {
    const top = b.upTo ?? Infinity;
    const slice = Math.max(0, Math.min(left, top - from));
    const due = slice * b.rate / 100;
    parts.push({ from, upTo: b.upTo, rate: b.rate, slice, due });
    total += due;
    left -= slice;
    from = top;
    if (left <= 0) break;
  }
  return { total, parts };
}

// Monthly IRR of an outflow now and level inflows, found by bisection.
export function monthlyIrr(principal, payment, n) {
  if (payment * n <= principal) return 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const pv = payment * (1 - Math.pow(1 + mid, -n)) / mid;
    if (pv > principal) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
export const sum = xs => xs.reduce((a, b) => a + b, 0);
