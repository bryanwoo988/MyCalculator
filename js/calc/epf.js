/* EPF projection.

   Month by month: salary × (employee + employer rate) goes in, split
   75 / 15 / 10 into Akaun Persaraan, Sejahtera and Fleksibel until 55;
   from 55 new money goes to one combined account. Each account earns the
   dividend on its own balance.

   Dividend timing approximates KWSP's daily-balance method at month
   resolution: a month's opening balance earns for the whole month, and a
   contribution starts earning the month after it is credited. Dividends
   are credited once every twelve months. */

export const ACCOUNTS = ['persaraan', 'sejahtera', 'fleksibel', 'after55'];

export function employerRate(rules, age, salary) {
  const e = rules.employer;
  if (age >= 60) return e.from60;
  return salary <= e.wageThreshold ? e.under60LowWage : e.under60HighWage;
}

export function epf(i, rules) {
  const bal = { persaraan: i.persaraan || 0, sejahtera: i.sejahtera || 0, fleksibel: i.fleksibel || 0, after55: 0 };
  const split = rules.split;
  const months = Math.max(0, Math.round((i.endAge - i.age) * 12));
  const dRate = i.dividend / 100 / 12;
  let salary = i.salary;
  const zero = () => ({ persaraan: 0, sejahtera: 0, fleksibel: 0, after55: 0 });
  let accrued = zero();
  let yr = { employee: 0, employer: 0, voluntary: 0, dividend: 0 };
  const tot = { employee: 0, employer: 0, voluntary: 0, dividend: 0 };
  const years = [], milestones = {};

  const put = (amount, age) => {
    if (age < split.untilAge) {
      bal.persaraan += amount * split.persaraan / 100;
      bal.sejahtera += amount * split.sejahtera / 100;
      bal.fleksibel += amount * split.fleksibel / 100;
    } else bal.after55 += amount;
  };
  const total = () => ACCOUNTS.reduce((a, k) => a + bal[k], 0);

  for (let m = 0; m < months; m++) {
    const age = i.age + m / 12;
    if (m > 0 && m % 12 === 0) salary *= 1 + (i.growth || 0) / 100;
    const working = age < (i.retireAge ?? i.endAge);
    const ee = working ? salary * (age >= 60 ? i.employeeRate60 ?? rules.employee.from60 : i.employeeRate) / 100 : 0;
    const er = working ? salary * employerRate(rules, age, salary) / 100 : 0;
    const vol = m % 12 === 0 ? (i.voluntary || 0) : 0;

    // Dividend accrues on the opening balance; this month's money waits.
    for (const k of ACCOUNTS) accrued[k] += bal[k] * dRate;
    put(ee + er + vol, age);
    yr.employee += ee; yr.employer += er; yr.voluntary += vol;

    const endOfYear = m % 12 === 11 || m === months - 1;
    if (endOfYear) {
      let div = 0;
      for (const k of ACCOUNTS) { bal[k] += accrued[k]; div += accrued[k]; }
      accrued = zero();
      yr.dividend = div;
      for (const k of Object.keys(tot)) tot[k] += yr[k];
      const endAge = i.age + (m + 1) / 12;
      years.push({ age: endAge, salary, ...yr, ...bal, total: total() });
      yr = { employee: 0, employer: 0, voluntary: 0, dividend: 0 };
    }
    const ageAfter = i.age + (m + 1) / 12;
    for (const mark of [55, 60]) {
      if (!milestones[mark] && ageAfter >= mark - 1e-9 && endOfYear) milestones[mark] = { ...bal, total: total() };
    }
  }
  return { balances: { ...bal }, total: total(), totals: tot, years, milestones };
}
