/* Spending the savings in retirement.

   From `startAge` to `lifeAge` the balance pays out a monthly amount at the
   start of each month and earns `returnPct` a year (monthly rest) on what
   is left. The payout rises with inflation once a year, so it keeps the
   same buying power. The first-year payout is the one that leaves exactly
   nothing at `lifeAge`; the end balance is linear in it, so two runs pin it. */

function run(i, first, inflation) {
  const months = Math.round((i.lifeAge - i.startAge) * 12);
  const r = i.returnPct / 1200, g = 1 + inflation / 100;
  let balance = i.balance;
  const years = [];
  let y = { withdrawn: 0, earned: 0 };
  for (let m = 0; m < months; m++) {
    const pay = first * Math.pow(g, Math.floor(m / 12));
    balance -= pay;
    const earned = balance * r;
    balance += earned;
    y.withdrawn += pay; y.earned += earned;
    if (m % 12 === 11 || m === months - 1) {
      years.push({ age: i.startAge + Math.floor(m / 12), monthly: pay, ...y, balance });
      y = { withdrawn: 0, earned: 0 };
    }
  }
  return { balance, years, months };
}

const solve = (i, inflation) => {
  const zero = run(i, 0, inflation).balance;
  const unit = zero - run(i, 1, inflation).balance;
  return unit > 0 ? zero / unit : 0;
};

export function drawdown(i) {
  if (!(i.lifeAge > i.startAge) || !(i.balance > 0)) return null;
  const monthly = solve(i, i.inflation);
  const plan = run(i, monthly, i.inflation);
  const deflate = Math.pow(1 + i.inflation / 100, Math.max(0, i.startAge - i.nowAge));
  return {
    monthly,                                  // first year, in the money of that year
    monthlyToday: monthly / deflate,          // the same, in today's money
    lastMonthly: plan.years.at(-1)?.monthly ?? monthly,
    level: solve(i, 0),                       // a fixed payout that never rises
    totalWithdrawn: plan.years.reduce((a, y) => a + y.withdrawn, 0),
    totalEarned: plan.years.reduce((a, y) => a + y.earned, 0),
    years: plan.years,
    months: plan.months,
  };
}
