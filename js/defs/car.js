import { flat, flatSettlement, reducing, reducingSettlement } from '../calc/hp.js';
import { byYear } from '../calc/loan.js';
import { loanRows, yearRows, MONTH_COLS, YEAR_COLS } from './home.js';

export default {
  id: 'car',
  icon: 'car',
  rules: ['hire-purchase'],
  fields: [
    { id: 'method', type: 'select', def: 'reducing', options: [{ v: 'reducing' }, { v: 'flat' }] },
    { id: 'price', type: 'money', def: 120000, min: 0 },
    { id: 'downpayment', type: 'money', def: 12000, min: 0 },
    { id: 'years', type: 'int', def: 9, min: 1, max: 9 },
    { id: 'rate', type: 'pct', def: 5.5, min: 0, max: 30 },
    { type: 'section', id: 'settlement' },
    { id: 'settleAfter', type: 'int', def: 0, min: 0, max: 108 },
  ],

  compute(v, R) {
    const i = { principal: Math.max(0, v.price - v.downpayment), rate: v.rate, years: v.years };
    const isFlat = v.method === 'flat';
    const r = isFlat ? flat(i) : reducing(i);
    const other = isFlat ? reducing(i) : flat(i);
    const settle = v.settleAfter > 0 && v.settleAfter < r.months
      ? (isFlat ? flatSettlement(i, v.settleAfter) : reducingSettlement(i, v.settleAfter)) : null;
    const yearly = byYear(r.rows);
    const notes = [{ key: 'noteHpLaw', params: { from: R['hire-purchase'].reducingBalanceFrom, grace: R['hire-purchase'].graceUntil } }];
    notes.push({ key: isFlat ? 'noteFlat' : 'noteReducing' });

    return {
      headline: [
        { key: 'monthlyInstalment', value: r.payment, kind: 'money' },
        { key: 'totalInterest', value: r.totalInterest, kind: 'money' },
        { key: 'eir', value: r.eir, kind: 'pct' },
      ],
      groups: [
        { key: 'loan', rows: [
          { key: 'loanAmount', value: i.principal, kind: 'money' },
          { key: 'tenure', value: r.months, kind: 'months' },
          { key: 'totalInterest', value: r.totalInterest, kind: 'money' },
          { key: 'totalRepaid', value: r.totalPaid, kind: 'money', strong: true },
          { key: 'eir', value: r.eir, kind: 'pct' },
        ] },
        { key: 'compare', params: { rate: v.rate }, rows: [
          { key: isFlat ? 'interestFlat' : 'interestReducing', value: r.totalInterest, kind: 'money' },
          { key: isFlat ? 'interestReducing' : 'interestFlat', value: other.totalInterest, kind: 'money' },
          { key: 'difference', value: Math.abs(r.totalInterest - other.totalInterest), kind: 'money', strong: true },
        ] },
        ...(settle ? [{ key: 'settleGroup', params: { n: v.settleAfter }, rows: [
          { key: 'stillOwed', value: settle.owed, kind: 'money' },
          { key: isFlat ? 'rebate78' : 'interestAvoided', value: settle.saved, kind: 'money' },
          { key: 'settleAmount', value: settle.settle, kind: 'money', strong: true },
        ] }] : []),
      ],
      charts: [{ key: 'balanceChart', type: 'line', xKind: 'year', x: yearly.map(y => y.year),
        series: [{ key: 'balance', values: yearly.map(y => y.balance) }] }],
      tables: [{ key: 'schedule', cols: YEAR_COLS, rows: yearRows(r.rows), monthly: { cols: MONTH_COLS, rows: loanRows(r.rows) } }],
      notes,
    };
  },
};
