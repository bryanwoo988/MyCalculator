# MyCalculator

Free Malaysian finance calculators that install on a phone's home screen and
work offline, in English, 中文 and Bahasa Melayu. No subscription, no ads, no
account; everything stays on the device.

Live: <https://bryanwoo988.github.io/MyCalculator/>

## Calculators

- **Compound interest**: starting amount, monthly or yearly contributions at
  the start or end of the period, yearly / quarterly / monthly / daily
  compounding, a yearly step-up, inflation (today's money), and a goal mode
  ("how much must I save to reach RM1 million?").
- **EPF**: salary growth, the three accounts (Persaraan / Sejahtera /
  Fleksibel, 75/15/10), employer 13% or 12% by wage, the reduced rates from 60,
  voluntary top-ups, and balances at 55 and 60.
- **Home loan**: instalment, several rate changes, one-off or repeating extra
  payments (finish sooner or pay less), interest and time saved, buying costs
  (SRO 2023 legal fees, 8% SST, MOT and loan stamp duty, the first-home
  exemption, foreign buyers) and DSR.
- **Car loan**: reducing balance (the Hire Purchase (Amendment) Act 2026, in
  force from 1 June 2026) or the old flat rate with its EIR, both side by side,
  and early settlement with the Rule of 78 rebate.
- **Income tax**: resident individuals with every YA 2025 relief and its cap,
  the RM400 rebates, zakat and PCB (to pay or refund); non-residents; companies
  at SME or standard rates.

Every calculator has charts, a year-by-year (and month-by-month) schedule,
**Save** (named projections, reopened later and recalculated if the rates
have changed since), **PDF** (print → Save as PDF) and **Excel** (a real
`.xlsx` written in the browser, numbers kept as numbers).

House conventions shared with the other Woo Brothers apps: first-run language
picker (English by default), System / Light / Dark with four looks each side,
text size, QR code and share link, version and "what's new", updates offered
and never forced ([APP-STANDARDS](https://github.com/bryanwoo988/woobrothers.my/blob/main/APP-STANDARDS.md)).

## Rates and sources

Every rate lives in `data/rules/*.json` with its sources, the date it was
checked (`asOf`) and a `reviewBy` date after which the app warns that it may
be out of date. Sources that could only be checked through search results
(the official LHDN, KWSP and BNM sites were not reachable from the build
environment) are marked `"via": "search"` and labelled so in the app.

## Development

A static site with no build step and no dependencies:

```bash
python3 tools/serve.py        # http://127.0.0.1:4191/ (service worker off; add ?sw=1)
node --test 'tests/*.test.js' # formulas, rules, translations, storage, service worker
node tools/build-sw.mjs       # CI does this on every push
python3 tools/make-icons.py   # icons from docs/reference/app-logo.png
```

Every push to `main` is tested and deployed to GitHub Pages
(`.github/workflows/deploy.yml`).
