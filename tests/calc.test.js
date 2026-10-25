/* The arithmetic. Expected values come from outside the code under test:
   closed-form formulas worked separately, or the cumulative figures
   printed in LHDN's rate schedule. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { annuity, tiered, monthlyIrr } from '../js/calc/money.js';
import { compound, contributionFor } from '../js/calc/compound.js';
import { schedule, withSavings, byYear } from '../js/calc/loan.js';
import { legalFee, motDuty, loanDuty, buyingCosts, dsr } from '../js/calc/property.js';
import { flat, flatSettlement, reducing, reducingSettlement } from '../js/calc/hp.js';
import { personal, company, reliefs } from '../js/calc/tax.js';
import { epf, employerRate } from '../js/calc/epf.js';

const rules = name => JSON.parse(readFileSync(new URL(`../data/rules/${name}.json`, import.meta.url)));
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('annuity matches the closed form', () => {
  near(annuity(500000, 0.04 / 12, 420), 2213.87);
  near(annuity(1200, 0, 12), 100);
});

test('tiered splits bands', () => {
  const { total, parts } = tiered(150, [{ upTo: 100, rate: 10 }, { upTo: null, rate: 20 }]);
  assert.equal(total, 20);
  assert.equal(parts.length, 2);
});

test('monthly IRR inverts an annuity', () => {
  const p = annuity(10000, 0.005, 60);
  near(monthlyIrr(10000, p, 60), 0.005, 1e-9);
});

test('compound: lump sums', () => {
  near(compound({ principal: 10000, contribution: 0, rate: 12, compounding: 12, years: 1 }).balance, 11268.25);
  near(compound({ principal: 10000, contribution: 0, rate: 5, compounding: 1, years: 10 }).balance, 16288.95);
});

test('compound: monthly contributions at period end match the annuity formula', () => {
  const r = compound({ principal: 0, contribution: 100, frequency: 'monthly', timing: 'end', rate: 6, compounding: 12, years: 10 });
  near(r.balance, 16387.93);
  near(r.totalPaid, 12000);
  near(r.totalInterest, r.balance - r.totalPaid);
  assert.equal(r.years.length, 10);
});

test('compound: start-of-period contributions earn one more month', () => {
  const end = compound({ principal: 0, contribution: 100, timing: 'end', rate: 6, compounding: 12, years: 10 }).balance;
  const begin = compound({ principal: 0, contribution: 100, timing: 'begin', rate: 6, compounding: 12, years: 10 }).balance;
  near(begin, end * 1.005);
});

test('compound: step-up and inflation', () => {
  const r = compound({ principal: 0, contribution: 100, rate: 0, compounding: 12, years: 2, stepUp: 10, inflation: 0 });
  near(r.totalPaid, 1200 + 1320);
  const real = compound({ principal: 1000, contribution: 0, rate: 0, compounding: 12, years: 1, inflation: 10 });
  near(real.real, 1000 / 1.1);
});

test('compound: goal solver hits the target', () => {
  const i = { principal: 5000, rate: 7, compounding: 12, years: 15, timing: 'end', frequency: 'monthly' };
  const c = contributionFor(250000, i);
  near(compound({ ...i, contribution: c }).balance, 250000);
});

test('loan: schedule clears the balance and adds up', () => {
  const s = schedule({ principal: 500000, rate: 4, years: 35 });
  assert.equal(s.months, 420);
  near(s.firstPayment, 2213.87);
  near(s.rows.at(-1).balance, 0);
  near(s.rows.reduce((a, r) => a + r.principal, 0), 500000);
  near(s.totalPaid, 500000 + s.totalInterest);
});

test('loan: a rate change keeps the original end date', () => {
  const s = schedule({ principal: 300000, rate: 3.9, years: 30, segments: [{ fromYear: 4, rate: 4.5 }] });
  assert.equal(s.months, 360);
  near(s.rows.at(-1).balance, 0);
  assert.equal(s.rows[35].rate, 3.9);
  assert.equal(s.rows[36].rate, 4.5);
  assert.ok(s.rows[36].payment > s.rows[35].payment);
});

test('loan: prepayment shortens the term or lowers the instalment', () => {
  const base = { principal: 300000, rate: 4, years: 30, prepayments: [{ month: 12, amount: 50000, every: 0 }] };
  const term = withSavings({ ...base, mode: 'term' });
  assert.ok(term.months < 360);
  assert.ok(term.interestSaved > 0);
  assert.equal(term.monthsSaved, 360 - term.months);
  near(term.rows.reduce((a, r) => a + r.principal + r.prepayment, 0), 300000);
  const pay = schedule({ ...base, mode: 'payment' });
  assert.equal(pay.months, 360);
  assert.ok(pay.rows[12].payment < pay.rows[10].payment);
});

test('loan: yearly roll-up', () => {
  const s = schedule({ principal: 120000, rate: 0, years: 2 });
  const y = byYear(s.rows);
  assert.equal(y.length, 2);
  near(y[0].principal, 60000);
  near(y[1].balance, 0);
});

test('property: SRO 2023 legal fee scale', () => {
  const r = rules('property');
  near(legalFee(500000, r), 6250);
  near(legalFee(800000, r), 9250);
  near(legalFee(30000, r), 500); // minimum fee
});

test('property: MOT stamp duty tiers and exemptions', () => {
  const r = rules('property');
  near(motDuty({ price: 500000, buyer: 'citizen' }, r), 9000);
  near(motDuty({ price: 1200000, buyer: 'citizen' }, r), 32000);
  near(motDuty({ price: 450000, buyer: 'citizen', firstHome: true }, r), 0);
  near(motDuty({ price: 600000, buyer: 'citizen', firstHome: true }, r), 12000); // over the cap: no exemption
  near(motDuty({ price: 1000000, buyer: 'foreigner' }, r), 80000);
  near(loanDuty({ price: 500000, loan: 450000, buyer: 'citizen' }, r), 2250);
});

test('property: buying costs add up', () => {
  const r = rules('property');
  const c = buyingCosts({ price: 500000, loan: 450000, buyer: 'citizen', valuation: 1000 }, r);
  near(c.items.downpayment, 50000);
  near(c.items.legalSst, (6250 + 5625) * 0.08);
  near(c.upfront, Object.values(c.items).reduce((a, b) => a + b, 0));
  near(dsr(2000, 1000, 6000), 50);
  assert.equal(dsr(1, 1, 0), null);
});

test('hire purchase: flat rate', () => {
  const f = flat({ principal: 100000, rate: 3, years: 9 });
  near(f.totalInterest, 27000);
  near(f.payment, 127000 / 108);
  assert.ok(f.eir > 5 && f.eir < 6.5, `EIR ${f.eir}`); // a flat 3% is roughly 5.6% effective
  near(f.rows.reduce((a, r) => a + r.interest, 0), 27000);
  near(f.rows.at(-1).balance, 0, 0.05);
});

test('hire purchase: Rule of 78 settlement', () => {
  const i = { principal: 100000, rate: 3, years: 9 };
  near(flatSettlement(i, 0).settle, 100000);
  near(flatSettlement(i, 108).settle, 0);
  const mid = flatSettlement(i, 54);
  // 54 of 108 months left: rebate = 27000 × 54·55 / (108·109)
  near(mid.rebate, 27000 * 54 * 55 / (108 * 109));
});

test('hire purchase: reducing balance', () => {
  const i = { principal: 100000, rate: 5, years: 7 };
  const r = reducing(i);
  near(r.payment, annuity(100000, 5 / 1200, 84));
  near(reducingSettlement(i, 0).settle, 100000);
  near(reducingSettlement(i, 84).settle, 0);
});

test('tax: LHDN cumulative figures (YA 2025)', () => {
  const r = rules('tax-personal-YA2025');
  // Chargeable income alone: zero reliefs except the automatic RM9,000.
  const at = c => personal({ employment: c + 9000 }, r);
  near(at(20000).gross, 150);
  near(at(50000).gross, 1500);
  near(at(100000).gross, 9400);
  near(at(400000).gross, 84400);
});

test('tax: RM400 rebate stops one ringgit above RM35,000', () => {
  const r = rules('tax-personal-YA2025');
  near(personal({ employment: 35000 + 9000 }, r).tax, 600 - 400);
  near(personal({ employment: 35001 + 9000 }, r).tax, 600.06);
  near(personal({ employment: 30000 + 9000, spouse: true }, r).rebates.find(x => x.id === 'rebateSpouse')?.amount ?? 0, 0);
});

test('tax: reliefs are capped', () => {
  const r = rules('tax-personal-YA2025');
  const rel = reliefs({ lifestyle: 9999, childUnder18: 2, spouse: true, housingBand: '750', housingInterest: 9000 }, r);
  const get = id => rel.find(x => x.id === id)?.allowed;
  assert.equal(get('self'), 9000);
  assert.equal(get('lifestyle'), 2500);
  assert.equal(get('childUnder18'), 4000);
  assert.equal(get('spouse'), 4000);
  assert.equal(get('housingInterest'), 5000);
});

test('tax: zakat, PCB and non-residents', () => {
  const r = rules('tax-personal-YA2025');
  const z = personal({ employment: 109000, zakat: 100000, pcb: 0 }, r);
  near(z.tax, 0); // zakat rebate never exceeds the tax
  const p = personal({ employment: 109000, pcb: 10000 }, r);
  near(p.balance, 9400 - 10000);
  const nr = personal({ employment: 100000, residency: 'nonresident', lifestyle: 2500 }, r);
  near(nr.tax, 30000);
});

test('tax: companies', () => {
  const r = rules('tax-company-YA2025');
  const sme = company({ chargeable: 600000, paidUp: 100000, grossIncome: 3e6 }, r);
  assert.equal(sme.sme, true);
  near(sme.tax, 150000 * 0.15 + 450000 * 0.17);
  const big = company({ chargeable: 600000, paidUp: 5e6, grossIncome: 3e6 }, r);
  near(big.tax, 144000);
});

test('EPF: contributions split 75/15/10 with no dividend', () => {
  const r = rules('epf');
  const e = epf({ age: 30, endAge: 31, salary: 4000, employeeRate: 11, dividend: 0 }, r);
  const yearIn = 4000 * 0.24 * 12;
  near(e.total, yearIn);
  near(e.balances.persaraan, yearIn * 0.75);
  near(e.balances.sejahtera, yearIn * 0.15);
  near(e.balances.fleksibel, yearIn * 0.10);
});

test('EPF: employer rate by wage and age', () => {
  const r = rules('epf');
  assert.equal(employerRate(r, 30, 5000), 13);
  assert.equal(employerRate(r, 30, 5001), 12);
  assert.equal(employerRate(r, 61, 9000), 4);
});

test('EPF: dividend on an opening balance', () => {
  const r = rules('epf');
  const e = epf({ age: 40, endAge: 41, salary: 0, employeeRate: 11, dividend: 6, persaraan: 100000 }, r);
  near(e.total, 106000);
  assert.equal(e.years.length, 1);
});

test('EPF: money after 55 goes to one account; milestones recorded', () => {
  const r = rules('epf');
  const e = epf({ age: 54, endAge: 61, salary: 3000, employeeRate: 11, dividend: 5 }, r);
  assert.ok(e.balances.after55 > 0);
  assert.ok(e.milestones[55] && e.milestones[60]);
  assert.ok(e.milestones[60].total > e.milestones[55].total);
});

test('EPF: a custom employer rate replaces the statutory one', () => {
  const r = rules('epf');
  const base = { age: 30, endAge: 31, salary: 8000, employeeRate: 11, dividend: 0 };
  near(epf(base, r).totals.employer, 8000 * 0.12 * 12);
  near(epf({ ...base, employerMode: 'custom', employerRate: 17 }, r).totals.employer, 8000 * 0.17 * 12);
  // Statutory mode ignores a stray custom rate.
  near(epf({ ...base, employerMode: 'statutory', employerRate: 17 }, r).totals.employer, 8000 * 0.12 * 12);
});
