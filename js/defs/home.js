import { withSavings, byYear, schedule } from '../calc/loan.js';
import { buyingCosts, dsr } from '../calc/property.js';
import { money } from '../format.js';

export const loanRows = rows => rows.map(r => [r.month, r.rate, r.payment, r.interest, r.principal, r.prepayment, r.balance]);
export const yearRows = rows => byYear(rows).map(y => [y.year, y.payment, y.interest, y.principal, y.prepayment, y.balance]);
export const MONTH_COLS = [{ key: 'colMonth', kind: 'int' }, { key: 'colRate', kind: 'pct' }, { key: 'colPayment', kind: 'money' },
  { key: 'colInterest', kind: 'money' }, { key: 'colPrincipal', kind: 'money' }, { key: 'colPrepay', kind: 'money' }, { key: 'colBalance', kind: 'money' }];
export const YEAR_COLS = [{ key: 'colYear', kind: 'int' }, { key: 'colPayment', kind: 'money' }, { key: 'colInterest', kind: 'money' },
  { key: 'colPrincipal', kind: 'money' }, { key: 'colPrepay', kind: 'money' }, { key: 'colBalance', kind: 'money' }];

export default {
  id: 'home',
  icon: 'house',
  rules: ['property'],
  fields: [
    { id: 'price', type: 'money', def: 500000, min: 0 },
    { id: 'margin', type: 'pct', def: 90, min: 0, max: 100 },
    { id: 'years', type: 'int', def: 35, min: 1, max: 40 },
    { id: 'rate', type: 'pct', def: 4.1, min: 0, max: 30 },
    { type: 'section', id: 'rateChanges' },
    { id: 'segments', type: 'list', def: [], item: [
      { id: 'fromYear', type: 'int', def: 4, min: 1, max: 40 },
      { id: 'rate', type: 'pct', def: 4.5, min: 0, max: 30 },
    ] },
    { type: 'section', id: 'prepayments' },
    { id: 'prepayments', type: 'list', def: [], item: [
      { id: 'month', type: 'int', def: 12, min: 1, max: 480 },
      { id: 'amount', type: 'money', def: 10000, min: 0 },
      { id: 'every', type: 'int', def: 0, min: 0, max: 120 },
    ] },
    { id: 'mode', type: 'select', def: 'term', options: [{ v: 'term' }, { v: 'payment' }] },
    { type: 'section', id: 'buying' },
    { id: 'buyer', type: 'select', def: 'citizen', options: [{ v: 'citizen' }, { v: 'foreigner' }] },
    { id: 'firstHome', type: 'toggle', def: false, show: v => v.buyer === 'citizen' },
    { id: 'valuation', type: 'money', def: 0, min: 0 },
    { id: 'insurance', type: 'money', def: 0, min: 0 },
    { id: 'disbursement', type: 'money', def: 0, min: 0 },
    { id: 'otherCosts', type: 'money', def: 0, min: 0 },
    { type: 'section', id: 'affordability' },
    { id: 'netIncome', type: 'money', def: 0, min: 0 },
    { id: 'commitments', type: 'money', def: 0, min: 0 },
  ],

  compute(v, R) {
    const loan = v.price * v.margin / 100;
    const s = withSavings({ principal: loan, rate: v.rate, years: v.years, segments: v.segments, prepayments: v.prepayments, mode: v.mode });
    const costs = buyingCosts({ ...v, loan }, R.property);
    const ratio = dsr(s.firstPayment, v.commitments, v.netIncome);
    const hasExtras = v.prepayments.length > 0;
    const base = hasExtras ? schedule({ principal: loan, rate: v.rate, years: v.years, segments: v.segments }) : null;
    const yearly = byYear(s.rows), baseYearly = base ? byYear(base.rows) : null;

    const notes = [{ key: 'noteMonthlyRest' }];
    if (v.segments.length) notes.push({ key: 'noteRateChange' });
    if (costs.exempt) notes.push({ key: 'noteFirstHome', params: { max: money(R.property.firstHome.maxPrice, { cents: false }), until: R.property.firstHome.spaUntil } });
    if (v.firstHome && v.buyer === 'citizen' && !costs.exempt) notes.push({ key: 'noteFirstHomeOver', params: { max: money(R.property.firstHome.maxPrice, { cents: false }) } });
    if (v.buyer === 'foreigner') notes.push({ key: 'noteForeigner', params: { rate: R.property.foreignResidentialRate.rate } });
    notes.push({ key: 'noteLegalFees' });
    if (ratio !== null) notes.push({ key: 'noteDsr' });

    return {
      headline: [
        { key: 'monthlyInstalment', value: s.firstPayment, kind: 'money' },
        { key: 'totalInterest', value: s.totalInterest, kind: 'money' },
        { key: 'cashUpfront', value: costs.upfront, kind: 'money' },
      ],
      groups: [
        { key: 'loan', rows: [
          { key: 'loanAmount', value: loan, kind: 'money' },
          { key: 'tenure', value: s.months, kind: 'months' },
          { key: 'totalInterest', value: s.totalInterest, kind: 'money' },
          { key: 'totalRepaid', value: s.totalPaid, kind: 'money', strong: true },
          ...(hasExtras ? [
            { key: 'totalPrepaid', value: s.totalPrepaid, kind: 'money' },
            { key: 'interestSaved', value: s.interestSaved, kind: 'money' },
            { key: 'timeSaved', value: s.monthsSaved, kind: 'months' },
          ] : []),
        ] },
        { key: 'upfront', rows: [
          ...Object.entries(costs.items).filter(([k, x]) => x > 0 || ['downpayment', 'motDuty', 'loanDuty'].includes(k))
            .map(([k, x]) => ({ key: 'cost_' + k, value: x, kind: 'money' })),
          { key: 'cashUpfront', value: costs.upfront, kind: 'money', strong: true },
        ] },
        ...(ratio !== null ? [{ key: 'affordability', rows: [{ key: 'dsr', value: ratio, kind: 'pct', strong: true }] }] : []),
      ],
      charts: [
        { key: 'balanceChart', type: 'line', xKind: 'year', x: yearly.map(y => y.year),
          series: [
            { key: 'balance', values: yearly.map(y => y.balance) },
            ...(baseYearly ? [{ key: 'balanceNoPrepay', values: baseYearly.map(y => y.balance) }] : []),
          ] },
        { key: 'splitChart', type: 'bar', xKind: 'year', x: yearly.map(y => y.year),
          series: [
            { key: 'colPrincipal', values: yearly.map(y => y.principal + y.prepayment) },
            { key: 'colInterest', values: yearly.map(y => y.interest) },
          ] },
      ],
      tables: [{ key: 'schedule', cols: YEAR_COLS, rows: yearRows(s.rows), monthly: { cols: MONTH_COLS, rows: loanRows(s.rows) } }],
      notes,
    };
  },
};
