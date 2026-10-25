import { epf } from '../calc/epf.js';

const latestDividend = R => R.epf.dividends[0].rate;

export default {
  id: 'epf',
  icon: 'bank',
  rules: ['epf'],
  fields: [
    { id: 'age', type: 'int', def: 30, min: 16, max: 74 },
    { id: 'endAge', type: 'int', def: 60, min: 17, max: 75 },
    { id: 'retireAge', type: 'int', def: 60, min: 16, max: 75 },
    { id: 'salary', type: 'money', def: 5000, min: 0 },
    { id: 'growth', type: 'pct', def: 3, min: 0, max: 50 },
    { type: 'section', id: 'balances' },
    { id: 'persaraan', type: 'money', def: 50000, min: 0 },
    { id: 'sejahtera', type: 'money', def: 10000, min: 0 },
    { id: 'fleksibel', type: 'money', def: 2000, min: 0 },
    { type: 'section', id: 'rates' },
    { id: 'employeeRate', type: 'pct', def: R => R.epf.employee.under60, min: 0, max: 100 },
    { id: 'employerMode', type: 'select', def: 'statutory', options: [{ v: 'statutory' }, { v: 'custom' }] },
    { id: 'employerRate', type: 'pct', def: R => R.epf.employer.under60LowWage, min: 0, max: 100, show: v => v.employerMode === 'custom' },
    { id: 'voluntary', type: 'money', def: 0, min: 0 },
    { id: 'dividend', type: 'pct', def: latestDividend, min: 0, max: 20 },
  ],

  compute(v, R) {
    const e = epf(v, R.epf);
    const m55 = e.milestones[55], m60 = e.milestones[60];
    const headline = [{ key: 'epfAtEnd', value: e.total, kind: 'money', params: { age: v.endAge } }];
    if (m55 && v.endAge > 55) headline.push({ key: 'epfAt', value: m55.total, kind: 'money', params: { age: 55 } });
    if (m60 && v.endAge > 60) headline.push({ key: 'epfAt', value: m60.total, kind: 'money', params: { age: 60 } });
    const accounts = ['persaraan', 'sejahtera', 'fleksibel', 'after55'].filter(k => k !== 'after55' || e.balances.after55 > 0);
    return {
      headline,
      groups: [
        { key: 'accountsAt', params: { age: v.endAge }, rows: [
          ...accounts.map(k => ({ key: 'acc_' + k, value: e.balances[k], kind: 'money' })),
          { key: 'epfTotal', value: e.total, kind: 'money', strong: true },
        ] },
        { key: 'moneyIn', rows: [
          { key: 'employeeIn', value: e.totals.employee, kind: 'money' },
          { key: 'employerIn', value: e.totals.employer, kind: 'money' },
          { key: 'voluntaryIn', value: e.totals.voluntary, kind: 'money' },
          { key: 'dividendIn', value: e.totals.dividend, kind: 'money' },
          ...(v.employerMode === 'custom' ? [{ key: 'employerRateUsed', value: v.employerRate, kind: 'pct' }] : []),
          { key: 'dividendUsed', value: v.dividend, kind: 'pct' },
        ] },
      ],
      charts: [{
        key: 'epfGrowth', type: 'stack', xKind: 'age',
        x: e.years.map(y => Math.round(y.age)),
        series: accounts.map(k => ({ key: 'acc_' + k, values: e.years.map(y => y[k]) })),
      }],
      tables: [{
        key: 'byYear',
        cols: [{ key: 'colAge', kind: 'int' }, { key: 'colSalary', kind: 'money' }, { key: 'colEmployee', kind: 'money' },
          { key: 'colEmployer', kind: 'money' }, { key: 'colVoluntary', kind: 'money' }, { key: 'colDividend', kind: 'money' },
          ...accounts.map(k => ({ key: 'acc_' + k, kind: 'money' })), { key: 'colTotal', kind: 'money' }],
        rows: e.years.map(y => [Math.round(y.age), y.salary, y.employee, y.employer, y.voluntary, y.dividend, ...accounts.map(k => y[k]), y.total]),
      }],
      notes: [{ key: 'noteEpfSplit' }, { key: 'noteEpfDividend' }, { key: v.employerMode === 'custom' ? 'noteEpfEmployerCustom' : 'noteEpf60' }],
    };
  },
};
