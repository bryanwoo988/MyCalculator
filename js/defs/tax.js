import { personal, company } from '../calc/tax.js';

// Years of assessment with a rule file each, newest first.
export const YEARS = [2025];
const P = (R, v) => R[`tax-personal-YA${v.ya}`];
const C = (R, v) => R[`tax-company-YA${v.ya}`];

const resident = v => v.mode === 'resident';
const individual = v => v.mode !== 'company';

/* Relief fields mirror data/rules/tax-personal-YA*.json: a toggle for
   "flag" reliefs, a count for children, an amount otherwise. The cap shown
   under each comes from the rule file of the chosen year. */
const relief = (id, type) => ({
  id, type, def: type === 'toggle' ? false : 0, min: 0, max: type === 'int' ? 20 : undefined,
  show: resident, cap: (R, v) => {
    const r = P(R, v)?.reliefs.find(x => x.id === id);
    if (!r) return null;
    return r.capByBand ? r.capByBand[v.housingBand] ?? null : r.cap;
  },
  perChild: type === 'int',
});

export default {
  id: 'tax',
  icon: 'receipt',
  rules: YEARS.flatMap(y => [`tax-personal-YA${y}`, `tax-company-YA${y}`]),
  fields: [
    { id: 'mode', type: 'select', def: 'resident', options: [{ v: 'resident' }, { v: 'nonresident' }, { v: 'company' }] },
    { id: 'ya', type: 'select', def: YEARS[0], options: YEARS.map(v => ({ v })) },

    { type: 'section', id: 'income', show: individual },
    { id: 'employment', type: 'money', def: 72000, min: 0, show: individual },
    { id: 'bonus', type: 'money', def: 0, min: 0, show: individual },
    { id: 'otherIncome', type: 'money', def: 0, min: 0, show: individual },

    { type: 'section', id: 'reliefsSelf', show: resident },
    relief('disabledSelf', 'toggle'),
    relief('education', 'money'),
    relief('medical', 'money'),
    relief('disabledEquipment', 'money'),
    relief('lifestyle', 'money'),
    relief('sports', 'money'),
    relief('evCharging', 'money'),
    { type: 'section', id: 'reliefsFamily', show: resident },
    relief('spouse', 'toggle'),
    relief('disabledSpouse', 'toggle'),
    relief('childUnder18', 'int'),
    relief('child18Study', 'int'),
    relief('child18Higher', 'int'),
    relief('disabledChild', 'int'),
    relief('disabledChildHigher', 'int'),
    relief('childcare', 'money'),
    relief('breastfeeding', 'money'),
    relief('sspn', 'money'),
    relief('parentsMedical', 'money'),
    { type: 'section', id: 'reliefsSavings', show: resident },
    relief('epf', 'money'),
    relief('lifeInsurance', 'money'),
    relief('prs', 'money'),
    relief('eduMedInsurance', 'money'),
    relief('socso', 'money'),
    { id: 'housingBand', type: 'select', def: 'none', options: [{ v: 'none' }, { v: '500' }, { v: '750' }], show: resident },
    { ...relief('housingInterest', 'money'), show: v => resident(v) && v.housingBand !== 'none' },

    { type: 'section', id: 'paid', show: individual },
    { id: 'zakat', type: 'money', def: 0, min: 0, show: resident },
    { id: 'pcb', type: 'money', def: 0, min: 0, show: individual },

    { type: 'section', id: 'companySection', show: v => v.mode === 'company' },
    { id: 'chargeable', type: 'money', def: 300000, min: 0, show: v => v.mode === 'company' },
    { id: 'paidUp', type: 'money', def: 100000, min: 0, show: v => v.mode === 'company' },
    { id: 'grossIncome', type: 'money', def: 1000000, min: 0, show: v => v.mode === 'company' },
    { id: 'foreignPct', type: 'pct', def: 0, min: 0, max: 100, show: v => v.mode === 'company' },
    { id: 'inBigGroup', type: 'toggle', def: false, show: v => v.mode === 'company' },
    { id: 'cp204', type: 'money', def: 0, min: 0, show: v => v.mode === 'company' },
  ],

  compute(v, R) {
    return v.mode === 'company' ? companyResult(v, C(R, v)) : personResult(v, P(R, v));
  },
};

const BAND_COLS = [{ key: 'colFrom', kind: 'money' }, { key: 'colTo', kind: 'money' }, { key: 'colRate', kind: 'pct' },
  { key: 'colTaxable', kind: 'money' }, { key: 'colTax', kind: 'money' }];
const bandRows = parts => parts.map(p => [p.from, p.upTo ?? null, p.rate, p.slice, p.due]);

function balanceRow(balance) {
  return balance >= 0
    ? { key: 'toPay', value: balance, kind: 'money', strong: true }
    : { key: 'refund', value: -balance, kind: 'money', strong: true };
}

function personResult(v, rules) {
  const r = personal({ ...v, residency: v.mode }, rules);
  const groups = [
    { key: 'income', rows: [{ key: 'totalIncome', value: r.totalIncome, kind: 'money' }] },
  ];
  if (v.mode === 'resident') {
    groups.push({ key: 'reliefsAllowed', rows: [
      ...r.reliefs.map(x => ({ key: 'f_' + x.id, value: x.allowed, kind: 'money' })),
      { key: 'reliefTotal', value: r.reliefTotal, kind: 'money', strong: true },
    ] });
  }
  groups.push({ key: 'taxCalc', rows: [
    { key: 'chargeable', value: r.chargeable, kind: 'money' },
    { key: 'grossTax', value: r.gross, kind: 'money' },
    ...r.rebates.filter(x => x.amount > 0).map(x => ({ key: x.id, value: -x.amount, kind: 'money' })),
    { key: 'taxPayable', value: r.tax, kind: 'money', strong: true },
    { key: 'pcbPaid', value: r.paid, kind: 'money' },
    balanceRow(r.balance),
    { key: 'effectiveRate', value: r.effective, kind: 'pct' },
    { key: 'marginalRate', value: r.marginal, kind: 'pct' },
  ] });
  return {
    headline: [
      { key: 'taxPayable', value: r.tax, kind: 'money' },
      r.balance >= 0 ? { key: 'toPay', value: r.balance, kind: 'money' } : { key: 'refund', value: -r.balance, kind: 'money' },
      { key: 'effectiveRate', value: r.effective, kind: 'pct' },
    ],
    groups,
    charts: r.parts.length ? [{ key: 'bandChart', type: 'bar', xKind: 'pctLabel', x: r.parts.map(p => p.rate),
      series: [{ key: 'colTax', values: r.parts.map(p => p.due) }] }] : [],
    tables: r.parts.length ? [{ key: 'bands', cols: BAND_COLS, rows: bandRows(r.parts) }] : [],
    notes: [{ key: 'noteTaxEstimate', params: { ya: v.ya } }, ...(v.mode === 'nonresident' ? [{ key: 'noteNonResident' }] : [])],
  };
}

function companyResult(v, rules) {
  const r = company(v, rules);
  return {
    headline: [
      { key: 'taxPayable', value: r.tax, kind: 'money' },
      { key: 'effectiveRate', value: r.effective, kind: 'pct' },
    ],
    groups: [{ key: 'taxCalc', rows: [
      { key: 'smeStatus', value: r.sme ? 'yes' : 'no', kind: 'text' },
      { key: 'chargeable', value: v.chargeable, kind: 'money' },
      { key: 'taxPayable', value: r.tax, kind: 'money', strong: true },
      { key: 'cp204Paid', value: r.paid, kind: 'money' },
      balanceRow(r.balance),
    ] }],
    charts: [],
    tables: [{ key: 'bands', cols: BAND_COLS, rows: bandRows(r.parts) }],
    notes: [{ key: 'noteTaxEstimate', params: { ya: v.ya } }, { key: r.sme ? 'noteSme' : 'noteNotSme' }],
  };
}
