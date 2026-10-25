/* Exports of one calculation: an Excel workbook (inputs and summary on the
   first sheet, each schedule on its own sheet, numbers kept as numbers)
   and a printable page for "Save as PDF". Both use the current language. */

import { t, label } from '../i18n.js';
import { formatValue, money } from '../format.js';
import { chartSvg } from '../ui/chart.js';
import { rowLabel, xLabel } from '../ui/result.js';
import { workbook } from './xlsx.js';

// Visible inputs as [label, value, kind], lists flattened into lines.
export function inputRows(def, v) {
  const rows = [];
  for (const f of def.fields) {
    if (f.type === 'section' || (f.show && !f.show(v))) continue;
    if (f.type === 'list') {
      v[f.id].forEach((row, i) => {
        const parts = f.item.map(c => `${label(def.id, `${f.id}_${c.id}`)} ${c.type === 'money' ? money(row[c.id]) : c.type === 'pct' ? row[c.id] + '%' : row[c.id]}`);
        rows.push([`${label(def.id, 'sec_' + f.id)} ${i + 1}`, parts.join(' · '), 'string']);
      });
    } else if (f.type === 'select') rows.push([label(def.id, f.id), label(def.id, `${f.id}_${v[f.id]}`), 'string']);
    else if (f.type === 'toggle') rows.push([label(def.id, f.id), t(v[f.id] ? 'yes' : 'no'), 'string']);
    else rows.push([label(def.id, f.id), v[f.id], f.type === 'number' ? 'num' : f.type]);
  }
  return rows;
}

const cellFor = (kind, x) => {
  if (x === null || x === undefined) return '∞';
  if (kind === 'money') return { v: x, s: 'money' };
  if (kind === 'pct') return { v: x, s: 'pct' };
  if (kind === 'int' || kind === 'months') return { v: x, s: 'int' };
  if (kind === 'num') return x;
  if (kind === 'text') return t(String(x));
  return x;
};

export function toWorkbook(def, v, result, meta) {
  const title = t(`calc_${def.id}`);
  const s = [
    [{ v: `${t('appName')} — ${title}`, s: 'title' }],
    [meta.name || ''],
    [`${t('generated')}: ${meta.date}`],
    [],
    [{ v: t('inputs'), s: 'bold' }],
    ...inputRows(def, v).map(([l, x, k]) => [l, cellFor(k, x)]),
    [],
    [{ v: t('results'), s: 'bold' }],
    ...result.headline.map(h => [rowLabel(h), cellFor(h.kind, h.value)]),
  ];
  for (const g of result.groups) {
    s.push([], [{ v: t(g.key, g.params), s: 'bold' }]);
    for (const r of g.rows) s.push([rowLabel(r), cellFor(r.kind, r.value)]);
  }
  if (result.notes.length) {
    s.push([], [{ v: t('notes'), s: 'bold' }]);
    for (const n of result.notes) s.push([t(n.key, n.params)]);
  }
  s.push([], [{ v: t('rulesUsed'), s: 'bold' }], ...meta.rules.map(r => [r]), [], [t('disclaimer')]);

  const sheets = [{ name: t('sheetSummary'), widths: [42, 22], rows: s }];
  for (const tb of result.tables) {
    for (const [part, name] of [[tb, t(tb.key) + (tb.monthly ? ` (${t('yearly')})` : '')], [tb.monthly, `${t(tb.key)} (${t('monthly')})`]]) {
      if (!part) continue;
      sheets.push({
        name, widths: part.cols.map(() => 16),
        rows: [part.cols.map(c => ({ v: t(c.key), s: 'bold' })), ...part.rows.map(r => r.map((x, i) => cellFor(part.cols[i].kind, x)))],
      });
    }
  }
  return workbook(sheets);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX_PRINT_ROWS = 120;

export function toPrintHtml(def, v, result, meta) {
  const fmt = (k, x) => esc(k === 'num' ? x : k === 'string' ? x : formatValue(k, x, t));
  const h = [];
  h.push(`<header class="p-head"><img src="icons/icon-192.png" alt="" width="40" height="40"><div><h1>${esc(t(`calc_${def.id}`))}</h1>`
    + `<p>${esc(meta.name ? meta.name + ' · ' : '')}${esc(t('appName'))} · ${esc(meta.date)}</p></div></header>`);
  h.push(`<section class="p-stats">${result.headline.map(x => `<div><span>${esc(rowLabel(x))}</span><b>${fmt(x.kind, x.value)}</b></div>`).join('')}</section>`);
  h.push(`<h2>${esc(t('inputs'))}</h2><table class="p-kv">${inputRows(def, v).map(([l, x, k]) => `<tr><th>${esc(l)}</th><td>${fmt(k, x)}</td></tr>`).join('')}</table>`);
  for (const g of result.groups) {
    h.push(`<h2>${esc(t(g.key, g.params))}</h2><table class="p-kv">${g.rows.map(r => `<tr${r.strong ? ' class="strong"' : ''}><th>${esc(rowLabel(r))}</th><td>${fmt(r.kind, r.value)}</td></tr>`).join('')}</table>`);
  }
  for (const c of result.charts) {
    h.push(`<h2>${esc(t(c.key))}</h2>${chartSvg(c, { label: k => t(k), xLabel: xLabel(c.xKind), title: t(c.key) })}`);
  }
  for (const tb of result.tables) {
    // Monthly schedules run to hundreds of rows: the PDF carries the yearly
    // one and points to the Excel export for the rest.
    const rows = tb.rows.slice(0, MAX_PRINT_ROWS);
    h.push(`<h2>${esc(t(tb.key))}${tb.monthly ? ` (${esc(t('yearly'))})` : ''}</h2><table class="p-grid"><thead><tr>${tb.cols.map(c => `<th>${esc(t(c.key))}</th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map(r => `<tr>${r.map((x, i) => `<td>${x === null ? '∞' : fmt(tb.cols[i].kind, x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    if (tb.monthly) h.push(`<p class="p-small">${esc(t('monthlyInExcel'))}</p>`);
  }
  if (result.notes.length) h.push(`<h2>${esc(t('notes'))}</h2>${result.notes.map(n => `<p class="p-small">${esc(t(n.key, n.params))}</p>`).join('')}`);
  h.push(`<h2>${esc(t('rulesUsed'))}</h2>${meta.rules.map(r => `<p class="p-small">${esc(r)}</p>`).join('')}`);
  h.push(`<p class="p-small p-disclaimer">${esc(t('disclaimer'))}</p>`);
  return h.join('');
}
