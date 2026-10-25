# Release rule

Every change that ships to users adds an entry at the top of `data/releases.json`:
the new version number, today's date (YYYY-MM-DD), and what changed in plain
words for users, in English, 中文 and BM. Bug fixes bump the last digit, new
features the middle one.

Shared standard for all of Bryan Woo's apps:
https://github.com/bryanwoo988/woobrothers.my/blob/main/APP-STANDARDS.md

# Rates

- Rates, caps and tiers live only in `data/rules/*.json`, never in code.
- Every number cites a source; official sources first (LHDN, KWSP, BNM, the
  Act or gazette). A source opened only through search summaries carries
  `"via": "search"`.
- Correcting a number in a rule file bumps its `rev` (saved projections then
  offer "recalculate with the new rates"). A new year of assessment is a new
  file (`tax-personal-YA2026.json`), added to `js/rules.js` and to `YEARS` in
  `js/defs/tax.js`; old files stay.
- Set `asOf` to the day you checked and `reviewBy` to when it may change.

# Code

- Formulas are pure functions in `js/calc/`, each with tests whose expected
  values come from outside the code (closed forms, published figures).
- Every user-visible string is in `js/strings/{en,zh,ms}.js`; tests fail on a
  missing key.
- No dependencies, no CDN, no build step.
