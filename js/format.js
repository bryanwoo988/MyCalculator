/* Numbers for people: RM amounts with thousands separators, percentages,
   and durations in years and months. Malaysian English grouping
   (1,234.56) in every language, as on bank statements. */

const nf = (min, max) => new Intl.NumberFormat('en-MY', { minimumFractionDigits: min, maximumFractionDigits: max });
const money2 = nf(2, 2), int0 = nf(0, 0), pct = nf(0, 2);

export function money(x, { cents = true } = {}) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const neg = x <= -0.005; // -0.001 shows as RM0.00, not −RM0.00
  const s = (cents ? money2 : int0).format(Math.abs(x));
  return (neg ? '−' : '') + 'RM' + s;
}

export const number = x => (Number.isFinite(x) ? int0.format(x) : '—');
export const percent = x => (Number.isFinite(x) ? pct.format(x) + '%' : '—');

// Input boxes show plain grouping without "RM"; parsing accepts commas.
export function inputValue(x, type) {
  if (!Number.isFinite(x)) return '';
  if (type === 'money') return nf(0, 2).format(x);
  return String(x);
}

export function parseNumber(s) {
  if (typeof s === 'number') return s;
  const clean = String(s ?? '').replace(/[,\sRMrm%]/g, '').replace(/[−–]/g, '-');
  if (clean === '' || clean === '-' || clean === '.') return NaN;
  return Number(clean);
}

// 30 years 4 months, using the translator for the words.
export function duration(months, t) {
  const y = Math.floor(months / 12), m = Math.round(months % 12);
  if (y && m) return t('yearsMonths', { y, m });
  if (y) return t('yearsOnly', { y });
  return t('monthsOnly', { m });
}

export function formatValue(kind, x, t) {
  switch (kind) {
    case 'money': return money(x);
    case 'pct': return percent(x);
    case 'int': return number(x);
    case 'months': return duration(x, t);
    case 'text': return t(String(x));
    default: return String(x);
  }
}
