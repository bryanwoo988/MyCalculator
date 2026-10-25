/* MyCalculator — routing, pages and wiring.

   Routes (hash):  #/            the calculator list
                   #/c/<id>      a calculator (last inputs, or defaults)
                   #/r/<record>  a saved projection
                   #/saved       saved projections
                   #/settings    language, theme, backup, share, about */

import * as prefs from './prefs.js';
import * as records from './records.js';
import { t, setLang, getLang } from './i18n.js';
import { loadRules, versionsFor, changedSince, isStale, today } from './rules.js';
import { CALCS, byId, defaults, sanitise } from './defs/index.js';
import { renderForm } from './ui/form.js';
import { renderResult, rowLabel } from './ui/result.js';
import { el, $, icon } from './ui/dom.js';
import { formatValue } from './format.js';
import { toWorkbook, toPrintHtml } from './export/report.js';
import { toPdf } from './export/pdf.js';
import { toSVG } from './qrcode.js';
import { APP_URL } from './config.js';

let R = null;            // rule files
let RELEASES = [];
let firstLaunch = false;
const main = () => $('#main');
const darkMQ = matchMedia('(prefers-color-scheme: dark)');

/* ---------- boot ---------- */

async function boot() {
  try { firstLaunch = !localStorage.getItem(prefs.KEY); } catch { firstLaunch = true; }
  const p = prefs.init();
  records.init();
  setLang(p.lang);
  applyTheme();
  darkMQ.addEventListener?.('change', applyTheme);
  prefs.onChange((_, patch) => {
    if ('lang' in patch) { setLang(prefs.get().lang); chrome(); route(); }
    if ('theme' in patch || 'lightTheme' in patch || 'darkTheme' in patch || 'scale' in patch) applyTheme();
  });

  try {
    [R, RELEASES] = await Promise.all([loadRules(), fetch('data/releases.json').then(r => r.json())]);
  } catch (e) {
    main().replaceChildren(el('p', { class: 'empty' }, t('loadFailed')));
    console.error(e);
    return;
  }

  chrome();
  addEventListener('hashchange', route);
  route();
  const splash = $('#splash');
  splash?.classList.add('is-done');
  setTimeout(() => splash?.remove(), 600); // never left over the page to catch taps
  if (!p.chosen) showPicker();

  window.WhatsNew?.init({
    version: RELEASES[0].v, releases: RELEASES, key: 'mycalc.seenVersion',
    lang: () => getLang(), isNewUser: () => firstLaunch,
  });
  registerWorker();
}

function applyTheme() {
  const p = prefs.get();
  prefs.applyToDocument(document, p, darkMQ.matches);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', bg);
}

function registerWorker() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw=1');
  if (!('serviceWorker' in navigator) || local) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // A new build on the server is offered, never forced (APP-STANDARDS §2).
  window.WhatsNew?.watch();
}

/* ---------- chrome: bottom tabs, picker ---------- */

function chrome() {
  document.title = t('appName');
  for (const b of document.querySelectorAll('[data-nav]')) {
    const k = b.dataset.nav;
    b.replaceChildren(icon({ home: 'grid', saved: 'saved', settings: 'settings' }[k]), el('span', {}, t('nav_' + k)));
  }
}

function showPicker() {
  const pk = $('#picker');
  pk.hidden = false;
  for (const b of pk.querySelectorAll('[data-lang]')) {
    b.onclick = () => { prefs.set({ lang: b.dataset.lang, chosen: true }); pk.hidden = true; };
  }
  pk.querySelector('.is-default')?.focus();
}

/* ---------- routing ---------- */

function route() {
  const [, page, arg] = (location.hash.replace(/^#\/?/, '#/') || '#/').split('/');
  for (const b of document.querySelectorAll('[data-nav]')) {
    const on = (b.dataset.nav === 'home' && (!page || page === 'c')) || b.dataset.nav === page || (page === 'r' && b.dataset.nav === 'saved');
    b.setAttribute('aria-current', on ? 'page' : 'false');
  }
  window.scrollTo(0, 0);
  $('#toast').hidden = true;
  if (page === 'c' && byId(arg)) return calcPage(byId(arg), null);
  if (page === 'r') {
    const rec = records.get(decodeURIComponent(arg || ''));
    if (rec && byId(rec.calc)) return calcPage(byId(rec.calc), rec);
    return go('#/saved');
  }
  if (page === 'saved') return savedPage();
  if (page === 'settings') return settingsPage();
  return homePage();
}

const go = h => { if (location.hash === h) route(); else location.hash = h; };

function topbar(title, back) {
  return el('header', { class: 'topbar' },
    back ? el('a', { class: 'icon-btn', href: back, 'aria-label': t('back') }, icon('back')) : el('img', { src: 'icons/icon-192.png', alt: '', width: 32, height: 32, class: 'brand-icon' }),
    el('h1', { class: 'top-title' }, title));
}

/* ---------- home ---------- */

function homePage() {
  main().replaceChildren(
    topbar(t('appName')),
    el('div', { class: 'page' },
      el('p', { class: 'lead' }, t('homeLead')),
      el('nav', { class: 'calc-list card', 'aria-label': t('nav_home') }, CALCS.map(c =>
        el('a', { class: 'calc-item', href: `#/c/${c.id}` },
          el('span', { class: 'calc-icon' }, icon(c.icon)),
          el('span', { class: 'calc-text' }, el('b', {}, t(`calc_${c.id}`)), el('span', {}, t(`calc_${c.id}_sub`))),
          icon('chevron', 'ico chev')))),
      staleBanner(Object.keys(R)),
    ));
}

function staleBanner(names) {
  const stale = names.filter(n => isStale(R[n], today()));
  if (!stale.length) return null;
  return el('div', { class: 'banner warn' }, icon('info'), el('span', {}, t('rulesStale', { date: R[stale[0]].reviewBy })));
}

/* ---------- calculator ---------- */

function calcPage(def, rec) {
  const p = prefs.get();
  let values = sanitise(def, rec ? rec.inputs : p.drafts[def.id], R);
  let result = def.compute(values, R);
  let detail = p.detail;
  const resultBox = el('div', { class: 'result-box' });
  // On a phone the results sit below a long form; this line keeps the main
  // answer in view while typing, and jumps to the full results.
  const peek = el('button', { type: 'button', class: 'peek', onclick: () => resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' }) });

  const draw = () => {
    const h = result.headline[0];
    peek.replaceChildren(el('span', {}, rowLabel(h)), el('b', {}, formatValue(h.kind, h.value, t)));
    resultBox.replaceChildren(renderResult(result, {
      detail, onDetail: d => { detail = d; prefs.set({ detail: d }); draw(); },
    }));
  };
  let timer = 0;
  const onChange = v => {
    values = v;
    clearTimeout(timer);
    timer = setTimeout(() => {
      result = def.compute(values, R);
      draw();
      if (!rec) prefs.setDraft(def.id, values);
    }, 120);
  };

  const banners = [staleBanner(def.rules)];
  if (rec) {
    banners.unshift(el('div', { class: 'banner' }, icon('saved'),
      el('span', {}, el('b', {}, rec.name), ' · ', t('savedOn', { date: rec.savedAt.slice(0, 10) }))));
    const moved = changedSince(rec.rules, R);
    if (moved.length && rec.headline?.length) banners.push(rulesChangedBanner(rec, result));
  }

  const actions = el('div', { class: 'actionbar' }, peek,
    el('button', { type: 'button', class: 'button', onclick: () => saveSheet(def, () => values, () => result, rec) }, icon('save'), t('save')),
    el('button', { type: 'button', class: 'button button-quiet', onclick: () => exportPdf(def, values, result, rec) }, icon('pdf'), 'PDF'),
    el('button', { type: 'button', class: 'button button-quiet', onclick: () => exportXlsx(def, values, result, rec) }, icon('sheet'), 'Excel'));

  const form = renderForm(def, values, R, onChange);
  const reset = el('button', { type: 'button', class: 'link-btn', onclick: () => {
    if (!confirm(t('resetConfirm'))) return;
    if (!rec) prefs.setDraft(def.id, defaults(def, R));
    calcPage(def, rec && { ...rec, inputs: defaults(def, R) });
  } }, t('resetDefaults'));

  main().replaceChildren(
    topbar(t(`calc_${def.id}`), rec ? '#/saved' : '#/'),
    el('div', { class: 'page calc-page' },
      ...banners.filter(Boolean),
      el('div', { class: 'calc-cols' },
        el('div', { class: 'calc-inputs' }, el('h2', { class: 'section-h' }, t('inputs')), form, reset),
        el('div', { class: 'calc-results' }, el('h2', { class: 'section-h' }, t('results')), resultBox, rulesLine(def))),
    ),
    actions);
  draw();
}

function rulesChangedBanner(rec, result) {
  const now = new Map(result.headline.map(h => [h.key + JSON.stringify(h.params || {}), h]));
  const rows = rec.headline.map(h => {
    const n = now.get(h.key + JSON.stringify(h.params || {}));
    return el('tr', {}, el('th', {}, rowLabel(h)), el('td', {}, formatValue(h.kind, h.value, t)), el('td', {}, n ? formatValue(n.kind, n.value, t) : '—'));
  });
  return el('div', { class: 'banner info' }, icon('info'), el('div', {},
    el('p', {}, t('rulesChanged')),
    el('table', { class: 'compare' }, el('tr', {}, el('th', {}), el('th', {}, t('whenSaved')), el('th', {}, t('withNewRules'))), rows)));
}

function rulesLine(def) {
  if (!def.rules.length) return null;
  const parts = def.rules.map(n => t('rulesAsOf', { name: t('rule_' + n), date: R[n].asOf }));
  return el('p', { class: 'rules-line' }, parts.join(' · '), ' ', el('a', { href: '#/settings', onclick: () => sessionStorage.setItem('scrollTo', 'sources') }, t('seeSources')));
}

function rulesMeta(def) {
  return def.rules.map(n => `${t('rule_' + n)} — ${t('checkedOn', { date: R[n].asOf })}: ${R[n].sources.map(s => s.name).join('; ')}`);
}

/* ---------- save ---------- */

function saveSheet(def, getValues, getResult, rec) {
  const input = el('input', { type: 'text', class: 'text-input', maxlength: 80, value: rec ? rec.name : '', placeholder: t('namePlaceholder'), 'aria-label': t('recordName') });
  const doSave = asNew => {
    const name = input.value.trim() || `${t(`calc_${def.id}`)} ${today()}`;
    const data = { calc: def.id, name, inputs: getValues(), rules: versionsFor(def.rules, R), headline: getResult().headline };
    const saved = rec && !asNew ? records.update(rec.id, data) : records.add(data);
    closeSheet();
    if (!saved) return toast(t('saveFailed'));
    toast(t('savedToast'));
    if (asNew || !rec) go(`#/r/${encodeURIComponent(saved.id)}`);
    else route();
  };
  const buttons = rec
    ? [el('button', { type: 'button', class: 'button', onclick: () => doSave(false) }, t('updateRecord')),
       el('button', { type: 'button', class: 'button button-quiet', onclick: () => doSave(true) }, t('saveAsNew'))]
    : [el('button', { type: 'button', class: 'button', onclick: () => doSave(true) }, t('save'))];
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(!rec); });
  openSheet(t('saveTitle'), el('div', { class: 'stack' }, el('label', { class: 'field-label' }, t('recordName')), input, el('div', { class: 'row' }, buttons)));
  setTimeout(() => input.focus(), 50);
}

/* ---------- export ---------- */

const meta = (def, rec) => ({ name: rec?.name || '', date: today(), rules: rulesMeta(def) });
const fileBase = (def, rec) => `${(rec?.name || t(`calc_${def.id}`)).replace(/[\\/:*?"<>|]+/g, ' ').trim()} ${today()}`;

async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  // On a phone the share sheet is the way to put a file in Files / WhatsApp;
  // desktops download.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) {
      if (e.name === 'AbortError') return;
      // The share sheet needs a fresh tap; building the file may have used up
      // the first one. Offer a button that opens it.
      if (e.name === 'NotAllowedError') {
        const btn = el('button', { type: 'button', class: 'button', onclick: () => {
          closeSheet();
          navigator.share({ files: [file], title: filename }).catch(() => {});
        } }, icon('share'), t('shareFile'));
        openSheet(t('fileReady'), el('div', { class: 'stack' }, el('p', { class: 'muted' }, filename), btn));
        return;
      }
    }
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function exportXlsx(def, values, result, rec) {
  const bytes = toWorkbook(def, values, result, meta(def, rec));
  deliver(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase(def, rec) + '.xlsx');
}

/* An iPhone home-screen app cannot open the print screen (window.print does
   nothing there), so it gets a PDF file built in the page and handed to the
   share sheet. Everywhere else the print layout gives a sharper PDF with
   selectable text. */
const printBlocked = () => navigator.standalone === true;

async function exportPdf(def, values, result, rec) {
  if (printBlocked() || typeof window.print !== 'function') {
    toast(t('pdfMaking'), 10000);
    try {
      const bytes = await toPdf(def, values, result, meta(def, rec));
      $('#toast').hidden = true;
      await deliver(new Blob([bytes], { type: 'application/pdf' }), fileBase(def, rec) + '.pdf');
    } catch (e) {
      console.error(e);
      toast(t('pdfFailed'));
    }
    return;
  }
  const box = $('#print');
  box.innerHTML = toPrintHtml(def, values, result, meta(def, rec));
  const prevTitle = document.title;
  document.title = fileBase(def, rec); // becomes the PDF's file name
  const done = () => { document.title = prevTitle; box.replaceChildren(); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  window.print();
  toast(t('printHint'), 6000);
}

/* ---------- saved ---------- */

function savedPage() {
  const list = records.all();
  const body = el('div', { class: 'page' });
  if (!list.length) {
    body.append(el('div', { class: 'empty card' }, icon('saved', 'ico big'), el('p', {}, t('noSaved')), el('a', { class: 'button', href: '#/' }, t('nav_home'))));
  }
  for (const def of CALCS) {
    const mine = list.filter(r => r.calc === def.id);
    if (!mine.length) continue;
    body.append(el('h2', { class: 'section-h' }, t(`calc_${def.id}`)),
      el('div', { class: 'card saved-list' }, mine.map(r => savedItem(def, r))));
  }
  if (list.length) body.append(backupNudge());
  main().replaceChildren(topbar(t('nav_saved')), body);
}

function savedItem(def, r) {
  const h = r.headline?.[0];
  return el('div', { class: 'saved-item' },
    el('a', { class: 'saved-main', href: `#/r/${encodeURIComponent(r.id)}` },
      el('span', { class: 'calc-icon small' }, icon(def.icon)),
      el('span', { class: 'calc-text' }, el('b', {}, r.name),
        el('span', {}, [r.savedAt.slice(0, 10), h ? `${rowLabel(h)} ${formatValue(h.kind, h.value, t)}` : ''].filter(Boolean).join(' · ')))),
    el('div', { class: 'saved-actions' },
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': t('rename'), onclick: () => {
        const name = prompt(t('recordName'), r.name);
        if (name !== null && name.trim()) { records.update(r.id, { name }); savedPage(); }
      } }, icon('edit')),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': t('duplicate'), onclick: () => {
        records.add({ ...r, name: `${r.name} (${t('copy')})` }); savedPage(); toast(t('duplicated'));
      } }, icon('copy')),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': t('delete'), onclick: () => {
        if (confirm(t('deleteConfirm', { name: r.name }))) { records.remove(r.id); savedPage(); }
      } }, icon('trash'))));
}

function backupNudge() {
  const last = prefs.get().lastBackup;
  return el('p', { class: 'muted small center' }, last ? t('lastBackup', { date: last }) : t('neverBackedUp'), ' ',
    el('a', { href: '#/settings', onclick: () => sessionStorage.setItem('scrollTo', 'data') }, t('backupNow')));
}

/* ---------- settings ---------- */

const LOOK_COLOURS = {
  classic: ['#F1F3EC', '#FFFFFF', '#1F6554'], paper: ['#f6f1e7', '#fffdf8', '#a8571a'],
  mint: ['#eef7f3', '#ffffff', '#0b7f62'], lavender: ['#f5f3fc', '#ffffff', '#5b45c4'],
  midnight: ['#0F1513', '#18211E', '#68CFB2'], oled: ['#000000', '#0d0d0d', '#68CFB2'],
  slate: ['#23272f', '#2c313b', '#8cbcea'], grape: ['#17121f', '#221a2e', '#b89dff'],
};

function seg3(options, current, pick) {
  return el('div', { class: 'seg3', role: 'group' }, options.map(([v, text]) =>
    el('button', { type: 'button', class: v === current ? 'on' : null, 'aria-pressed': String(v === current), onclick: () => pick(v) }, text)));
}

function settingsPage() {
  const p = prefs.get();
  const looks = side => el('div', { class: 'looks' }, (side === 'light' ? prefs.LIGHT_THEMES : prefs.DARK_THEMES).map(n => {
    const c = LOOK_COLOURS[n], cur = side === 'light' ? p.lightTheme : p.darkTheme;
    return el('button', { type: 'button', class: 'look' + (n === cur ? ' on' : ''), 'aria-pressed': String(n === cur), onclick: () => {
      // Picking a look also shows it: a fixed mode on the other side switches over.
      const patch = side === 'light' ? { lightTheme: n } : { darkTheme: n };
      if (p.theme !== 'auto' && p.theme !== side) patch.theme = side;
      prefs.set(patch); settingsPage();
    } },
    el('span', { class: 'look-prev', style: `background:${c[0]}` }, el('span', { class: 'look-card', style: `background:${c[1]}` }, el('i', { style: `background:${c[2]}` }), el('b'))),
    el('span', { class: 'look-name' }, t('look_' + n)));
  }));

  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => restoreFrom(file) });
  const heading = (txt, id) => el('h2', { class: 'section-h', id }, txt);

  const body = el('div', { class: 'page settings' },
    heading(t('language')),
    seg3([['en', 'English'], ['zh', '中文'], ['ms', 'BM']], p.lang, v => prefs.set({ lang: v, chosen: true })),

    heading(t('theme')),
    seg3([['auto', t('modeSystem')], ['light', t('modeLight')], ['dark', t('modeDark')]], p.theme, v => { prefs.set({ theme: v }); settingsPage(); }),
    el('p', { class: 'muted small' }, t('themeNote')),
    el('h3', { class: 'sub-h' }, t('lightLooks')), looks('light'),
    el('h3', { class: 'sub-h' }, t('darkLooks')), looks('dark'),
    el('h3', { class: 'sub-h' }, t('textSize')),
    seg3(prefs.SCALES.map((s, i) => [s, ['A', 'A+', 'A++'][i]]), p.scale, v => { prefs.set({ scale: v }); settingsPage(); }),

    heading(t('data'), 'data'),
    el('div', { class: 'card pad stack' },
      el('p', {}, t('dataNote')),
      el('p', { class: 'muted small' }, p.lastBackup ? t('lastBackup', { date: p.lastBackup }) : t('neverBackedUp')),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'button', onclick: doBackup }, t('backup')),
        el('button', { type: 'button', class: 'button button-quiet', onclick: () => file.click() }, t('restore'))),
      file),

    heading(t('shareH')),
    el('div', { class: 'card pad share' },
      el('div', { class: 'qr' }, toSVG(APP_URL, { quiet: 4, dark: '#111111', light: '#ffffff' })),
      el('p', { class: 'muted small' }, t('shareScan')),
      el('p', { class: 'share-url' }, APP_URL),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'button', onclick: shareApp }, icon('share'), t('shareBtn')))),

    heading(t('about')),
    el('div', { class: 'card pad stack' },
      el('p', {}, el('b', {}, t('appName')), ' ', el('span', { class: 'muted' }, window.WhatsNew?.label(RELEASES) || `v${RELEASES[0].v}`)),
      el('p', {}, t('aboutText')),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'button button-quiet', onclick: () => window.WhatsNew?.history() }, t('whatsNew')))),

    heading(t('sources'), 'sources'),
    el('div', { class: 'card pad stack sources' }, Object.keys(R).map(n => el('div', { class: 'source' },
      el('p', {}, el('b', {}, t('rule_' + n)), ' — ', t('checkedOn', { date: R[n].asOf }),
        isStale(R[n], today()) ? el('span', { class: 'tag warn' }, t('mayBeOutdated')) : null),
      el('ul', {}, R[n].sources.map(s => el('li', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.name),
        s.via === 'search' ? el('span', { class: 'muted small' }, ` (${t('viaSearch')})`) : null)))))),
    el('p', { class: 'muted small' }, t('disclaimer')),
  );
  main().replaceChildren(topbar(t('nav_settings')), body);
  const target = sessionStorage.getItem('scrollTo');
  if (target) { sessionStorage.removeItem('scrollTo'); setTimeout(() => document.getElementById(target)?.scrollIntoView(), 50); }
}

async function shareApp() {
  if (navigator.share) {
    try { await navigator.share({ title: t('appName'), text: t('shareText'), url: APP_URL }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(APP_URL); toast(t('copied')); } catch { prompt(t('shareBtn'), APP_URL); }
}

function doBackup() {
  const p = prefs.get();
  const data = records.backup({ lang: p.lang, theme: p.theme, lightTheme: p.lightTheme, darkTheme: p.darkTheme, scale: p.scale }, RELEASES[0].v);
  deliver(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `MyCalculator-backup-${today()}.json`);
  prefs.set({ lastBackup: today() });
  settingsPage();
}

async function restoreFrom(input) {
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    const r = records.restore(JSON.parse(await f.text()));
    if (r.prefs) prefs.set(prefs.sanitise({ ...prefs.get(), ...r.prefs, chosen: true }));
    toast(t('restored', { added: r.added, updated: r.updated }));
    settingsPage();
  } catch {
    toast(t('restoreFailed'));
  }
}

/* ---------- sheet & toast ---------- */

function openSheet(title, content) {
  const s = $('#sheet');
  s.querySelector('.sheet-title').textContent = title;
  s.querySelector('.sheet-body').replaceChildren(content);
  s.hidden = false;
  s.querySelector('.sheet-close').setAttribute('aria-label', t('close'));
}
function closeSheet() { $('#sheet').hidden = true; }
document.addEventListener('click', e => { if (e.target.closest('[data-action="close-sheet"]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

let toastTimer = 0;
function toast(msg, ms = 2500) {
  const n = $('#toast');
  n.textContent = msg;
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.hidden = true; }, ms);
}

boot();
