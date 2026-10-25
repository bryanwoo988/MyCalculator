import { epf, ACCOUNTS } from '../calc/epf.js';
import { drawdown } from '../calc/drawdown.js';

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
    { id: 'bonusMonths', type: 'number', def: 0, min: 0, max: 24, step: 0.5 },
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
    // Optional: turn the balance at "Project until age" into a monthly income.
    { type: 'section', id: 'retirement' },
    { id: 'planRetire', type: 'toggle', def: false },
    { id: 'lifeAge', type: 'int', def: R => R.epf.retirement.lifeAge, min: 18, max: 110, show: v => v.planRetire },
    { id: 'inflation', type: 'pct', def: R => R.epf.retirement.inflation, min: 0, max: 20, show: v => v.planRetire },
    { id: 'drawReturn', type: 'pct', def: R => R.epf.retirement.returnPct, min: 0, max: 20, show: v => v.planRetire },
  ],

  compute(v, R) {
    const e = epf(v, R.epf);
    const d = v.planRetire
      ? drawdown({ balance: e.total, nowAge: v.age, startAge: v.endAge, lifeAge: v.lifeAge, returnPct: v.drawReturn, inflation: v.inflation })
      : null;
    const m55 = e.milestones[55], m60 = e.milestones[60];
    const headline = [{ key: 'epfAtEnd', value: e.total, kind: 'money', params: { age: v.endAge } }];
    if (m55 && v.endAge > 55) headline.push({ key: 'epfAt', value: m55.total, kind: 'money', params: { age: 55 } });
    if (m60 && v.endAge > 60) headline.push({ key: 'epfAt', value: m60.total, kind: 'money', params: { age: 60 } });
    // Accounts that ever hold money in this projection (Akaun 55 and Emas only past 55).
    const accounts = ACCOUNTS.filter(k => e.years.some(y => y[k] > 0.005));
    const held = accounts.filter(k => e.balances[k] > 0.005);
    const out = {
      headline,
      groups: [
        { key: 'accountsAt', params: { age: v.endAge }, rows: [
          ...held.map(k => ({ key: 'acc_' + k, value: e.balances[k], kind: 'money' })),
          { key: 'epfTotal', value: e.total, kind: 'money', strong: true },
        ] },
        { key: 'moneyIn', rows: [
          { key: 'employeeIn', value: e.totals.employee, kind: 'money' },
          { key: 'employerIn', value: e.totals.employer, kind: 'money' },
          { key: 'voluntaryIn', value: e.totals.voluntary, kind: 'money' },
          ...(v.bonusMonths > 0 ? [{ key: 'bonusPaid', value: e.totals.bonus, kind: 'money' }] : []),
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
      notes: [{ key: 'noteEpfSplit' }, ...(v.endAge > 55 ? [{ key: 'noteEpf55' }] : []), ...(v.bonusMonths > 0 ? [{ key: 'noteEpfBonus' }] : []), { key: 'noteEpfDividend' }, { key: v.employerMode === 'custom' ? 'noteEpfEmployerCustom' : 'noteEpf60' }],
    };
    if (v.planRetire) addRetirement(out, v, d);
    return out;
  },
};

function addRetirement(out, v, d) {
  if (!d) { out.notes.push({ key: 'noteRetireNeedsAge', params: { from: v.endAge } }); return; }
  const span = { from: v.endAge, to: v.lifeAge };
  // Both figures up top: the far-future ringgit alone reads as more than it buys.
  out.headline.splice(1, 0,
    { key: 'retireMonthly', value: d.monthly, kind: 'money', params: span },
    { key: 'retireMonthlyTodayShort', value: d.monthlyToday, kind: 'money' });
  out.groups.push({ key: 'retireGroup', params: span, rows: [
    { key: 'retireMonthlyFirst', value: d.monthly, kind: 'money', params: { age: v.endAge }, strong: true },
    { key: 'retireMonthlyToday', value: d.monthlyToday, kind: 'money' },
    { key: 'retireMonthlyLast', value: d.lastMonthly, kind: 'money', params: { age: v.lifeAge - 1 } },
    { key: 'retireLevel', value: d.level, kind: 'money' },
    { key: 'retireTotal', value: d.totalWithdrawn, kind: 'money' },
    { key: 'retireEarned', value: d.totalEarned, kind: 'money' },
    { key: 'retireAssumptions', value: `${v.inflation}% · ${v.drawReturn}%`, kind: 'raw' },
  ] });
  out.charts.push({ key: 'retireChart', type: 'line', xKind: 'age', x: d.years.map(y => y.age),
    series: [{ key: 'colBalance', values: d.years.map(y => y.balance) }] });
  out.tables.push({ key: 'retireTable',
    cols: [{ key: 'colAge', kind: 'int' }, { key: 'colMonthlySpend', kind: 'money' }, { key: 'colWithdrawn', kind: 'money' },
      { key: 'colDividend', kind: 'money' }, { key: 'colBalance', kind: 'money' }],
    rows: d.years.map(y => [y.age, y.monthly, y.withdrawn, y.earned, y.balance]) });
  out.notes.push({ key: 'noteRetire' });
}
