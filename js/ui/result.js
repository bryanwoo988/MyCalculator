/* Showing a result: headline numbers, charts, grouped figures, notes and
   the schedule table (yearly, or monthly where there is one). */

import { el, infoToggle } from './dom.js';
import { t, explanation } from '../i18n.js';
import { formatValue } from '../format.js';
import { chartSvg } from './chart.js';

export const rowLabel = r => t(r.key, r.params);
export const xLabel = kind => x => (kind === 'age' ? t('ageShort', { a: x }) : kind === 'pctLabel' ? `${x}%` : x);

export function renderResult(result, { detail, onDetail }) {
  const root = el('div', { class: 'result' });

  root.append(el('div', { class: 'headline' }, result.headline.map((h, i) =>
    el('div', { class: 'stat' + (i === 0 ? ' stat-main' : '') },
      el('span', { class: 'stat-label' }, rowLabel(h)),
      el('span', { class: 'stat-value' }, formatValue(h.kind, h.value, t))))));

  for (const c of result.charts) {
    root.append(el('section', { class: 'card' },
      el('h3', {}, t(c.key)),
      el('div', { html: chartSvg(c, { label: k => t(k), xLabel: xLabel(c.xKind), title: t(c.key) }) })));
  }

  for (const g of result.groups) {
    root.append(el('section', { class: 'card' },
      el('h3', {}, t(g.key, g.params)),
      el('dl', { class: 'figures' }, g.rows.map(figure))));
  }

  for (const tb of result.tables) {
    const monthly = detail === 'monthly' && tb.monthly;
    const { cols, rows } = monthly ? tb.monthly : tb;
    const head = el('div', { class: 'card-head' }, el('h3', {}, t(tb.key)));
    if (tb.monthly) {
      head.append(el('div', { class: 'seg seg-small', role: 'group' },
        ['yearly', 'monthly'].map(d => el('button', { type: 'button', 'aria-pressed': String((monthly ? 'monthly' : 'yearly') === d), onclick: () => onDetail(d) }, t(d)))));
    }
    root.append(el('section', { class: 'card card-table' }, head,
      el('div', { class: 'table-wrap', tabindex: '0' }, table(cols, rows))));
  }

  if (result.notes.length) {
    root.append(el('section', { class: 'notes' }, result.notes.map(n => el('p', {}, t(n.key, n.params)))));
  }
  return root;
}

function figure(r) {
  const text = explanation(r.key);
  const row = el('div', { class: 'fig' + (r.strong ? ' strong' : '') });
  const dt = el('dt', {}, rowLabel(r));
  row.append(dt, el('dd', {}, formatValue(r.kind, r.value, t)));
  if (text) {
    const { btn, body } = infoToggle(text, t('explain'));
    dt.append(' ', btn);
    row.append(body);
  }
  return row;
}

export function table(cols, rows) {
  return el('table', { class: 'grid-table' },
    el('thead', {}, el('tr', {}, cols.map(c => el('th', { scope: 'col' }, t(c.key))))),
    el('tbody', {}, rows.map(r => el('tr', {}, r.map((x, i) =>
      el('td', {}, x === null ? '∞' : formatValue(cols[i].kind, x, t)))))));
}
