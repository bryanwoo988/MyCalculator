import { compound, contributionFor } from '../calc/compound.js';

export default {
  id: 'compound',
  icon: 'trend',
  rules: [],
  fields: [
    { id: 'mode', type: 'select', def: 'grow', options: [{ v: 'grow' }, { v: 'goal' }] },
    { id: 'target', type: 'money', def: 1000000, min: 0, show: v => v.mode === 'goal' },
    { id: 'principal', type: 'money', def: 10000, min: 0 },
    { id: 'contribution', type: 'money', def: 500, min: 0, show: v => v.mode === 'grow' },
    { id: 'frequency', type: 'select', def: 'monthly', options: [{ v: 'monthly' }, { v: 'yearly' }] },
    { id: 'timing', type: 'select', def: 'end', options: [{ v: 'end' }, { v: 'begin' }] },
    { id: 'rate', type: 'pct', def: 6, min: -50, max: 100 },
    { id: 'compounding', type: 'select', def: 12, options: [{ v: 1 }, { v: 4 }, { v: 12 }, { v: 365 }] },
    { id: 'years', type: 'number', def: 20, min: 0.5, max: 100, step: 0.5 },
    { type: 'section', id: 'advanced' },
    { id: 'stepUp', type: 'pct', def: 0, min: 0, max: 100 },
    { id: 'inflation', type: 'pct', def: 2, min: 0, max: 50 },
  ],

  compute(v) {
    let input = { ...v };
    let needed = null;
    if (v.mode === 'goal') {
      needed = contributionFor(v.target, { ...v, contribution: 0 });
      input.contribution = needed ?? 0;
    }
    const r = compound(input);
    const headline = [];
    if (v.mode === 'goal') headline.push({ key: v.frequency === 'yearly' ? 'neededYearly' : 'neededMonthly', value: needed, kind: 'money' });
    headline.push(
      { key: 'finalBalance', value: r.balance, kind: 'money' },
      { key: 'totalInterest', value: r.totalInterest, kind: 'money' },
    );
    return {
      headline,
      groups: [{
        key: 'summary', rows: [
          { key: 'totalContributed', value: r.totalPaid, kind: 'money' },
          { key: 'totalInterest', value: r.totalInterest, kind: 'money' },
          { key: 'finalBalance', value: r.balance, kind: 'money', strong: true },
          { key: 'effectiveAnnual', value: r.effectiveAnnual, kind: 'pct' },
          ...(v.inflation > 0 ? [{ key: 'realValue', value: r.real, kind: 'money', params: { pct: v.inflation } }] : []),
        ],
      }],
      charts: [{
        key: 'growth', type: 'stack', xKind: 'year',
        x: r.years.map(y => y.year),
        series: [
          { key: 'totalContributed', values: r.years.map(y => y.totalPaid) },
          { key: 'totalInterest', values: r.years.map(y => y.totalInterest) },
        ],
      }],
      tables: [{
        key: 'byYear',
        cols: [{ key: 'colYear', kind: 'int' }, { key: 'colContributed', kind: 'money' }, { key: 'colInterest', kind: 'money' },
          { key: 'colBalance', kind: 'money' }, { key: 'colReal', kind: 'money' }],
        rows: r.years.map(y => [y.year, y.contributed, y.interest, y.balance, y.real]),
      }],
      notes: [{ key: 'noteCompound' }],
    };
  },
};
