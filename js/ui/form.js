/* The input form for a calculator, built from its field list.

   Number boxes are text inputs with a numeric keyboard, so "500,000"
   can be typed and shown with grouping. A box that does not parse is
   marked and leaves the last good value in place. Fields with show(v)
   appear and disappear as the other inputs change. */

import { el, icon, infoToggle } from './dom.js';
import { t, label, hint } from '../i18n.js';
import { inputValue, parseNumber, money } from '../format.js';

const NUMERIC = new Set(['money', 'pct', 'number', 'int']);

export function renderForm(def, values, R, onChange) {
  const v = structuredClone(values);
  const root = el('div', { class: 'form' });
  let section = el('div', { class: 'card form-card' });
  const blocks = [];
  root.append(section);

  const changed = () => { refresh(); onChange(structuredClone(v)); };

  for (const f of def.fields) {
    if (f.type === 'section') {
      section = el('div', { class: 'card form-card' }, el('h3', { class: 'form-h' }, label(def.id, 'sec_' + f.id)));
      if (f.show) blocks.push({ f, node: section });
      root.append(section);
      continue;
    }
    const node = field(def, f, v, R, changed);
    blocks.push({ f, node });
    section.append(node);
  }

  function refresh() {
    for (const b of blocks) {
      b.node.hidden = b.f.show ? !b.f.show(v) : false;
      b.node.refreshCap?.();
    }
    // A card whose fields are all hidden hides too.
    for (const card of root.querySelectorAll('.form-card')) {
      if (blocks.some(b => b.node === card && card.hidden)) continue;
      const kids = [...card.children].filter(c => !c.matches('.form-h'));
      card.hidden = kids.length > 0 && kids.every(c => c.hidden);
    }
  }
  refresh();
  return root;
}

function field(def, f, v, R, changed) {
  const id = `f-${def.id}-${f.id}`;
  const text = hint(def.id, f.id);
  const wrap = el('div', { class: `field field-${f.type}`, 'data-field': f.id });
  const capLine = el('p', { class: 'field-cap' });
  const setCap = () => {
    if (!f.cap) return;
    const c = f.cap(R, v);
    capLine.textContent = c === null || c === undefined ? '' : t(f.perChild ? 'capPerChild' : 'capMax', { cap: money(c, { cents: false }) });
  };
  wrap.refreshCap = setCap;

  if (f.type === 'select') {
    const opts = f.options.map(o => ({ v: o.v, text: label(def.id, `${f.id}_${o.v}`) }));
    const short = opts.length <= 3 && opts.every(o => o.text.length <= 14);
    if (short) {
      const seg = el('div', { class: 'seg', role: 'group', 'aria-labelledby': id });
      for (const o of opts) {
        const b = el('button', { type: 'button', 'aria-pressed': String(v[f.id] === o.v), onclick: () => {
          v[f.id] = o.v;
          for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b));
          changed();
        } }, o.text);
        seg.append(b);
      }
      wrap.append(el('span', { class: 'field-label', id }, label(def.id, f.id)), seg);
    } else {
      const sel = el('select', { id, onchange: () => { v[f.id] = f.options[sel.selectedIndex].v; changed(); } },
        opts.map(o => el('option', { selected: v[f.id] === o.v }, o.text)));
      wrap.append(el('label', { class: 'field-label', for: id }, label(def.id, f.id)), el('div', { class: 'select' }, sel));
    }
  } else if (f.type === 'toggle') {
    const box = el('input', { type: 'checkbox', id, role: 'switch', checked: !!v[f.id], onchange: () => { v[f.id] = box.checked; changed(); } });
    wrap.classList.add('field-row');
    wrap.append(el('label', { class: 'field-label', for: id }, label(def.id, f.id)), el('span', { class: 'switch' }, box, el('i')));
  } else if (f.type === 'list') {
    wrap.append(listField(def, f, v, changed));
  } else if (NUMERIC.has(f.type)) {
    wrap.append(el('label', { class: 'field-label', for: id }, label(def.id, f.id)), numberBox(id, f, () => v[f.id], x => { v[f.id] = x; changed(); }));
  }
  const lab = wrap.querySelector(':scope > .field-label');
  if (text && lab) {
    const { btn, body } = infoToggle(text, t('explain'));
    const line = el('div', { class: 'label-line' });
    lab.replaceWith(line);
    line.append(lab, btn);
    wrap.append(body);
  } else if (text) wrap.append(el('p', { class: 'field-hint' }, text));
  if (f.cap) wrap.append(capLine);
  setCap();
  return wrap;
}

function numberBox(id, f, get, set) {
  const unit = f.type === 'money' ? 'RM' : f.type === 'pct' ? '%' : '';
  const input = el('input', {
    id, type: 'text', inputmode: f.type === 'int' ? 'numeric' : 'decimal', autocomplete: 'off', enterkeyhint: 'done',
    value: inputValue(get(), f.type),
  });
  input.addEventListener('input', () => {
    const x = parseNumber(input.value);
    const ok = Number.isFinite(x) && (f.min === undefined || x >= f.min) && (f.max === undefined || x <= f.max);
    input.toggleAttribute('aria-invalid', !ok && input.value.trim() !== '');
    if (ok) set(f.type === 'int' ? Math.round(x) : x);
  });
  input.addEventListener('blur', () => { input.value = inputValue(get(), f.type); input.removeAttribute('aria-invalid'); });
  input.addEventListener('focus', () => input.select());
  const box = el('div', { class: 'num' + (unit ? ` has-${unit === 'RM' ? 'pre' : 'post'}` : '') });
  if (unit === 'RM') box.append(el('span', { class: 'unit pre' }, 'RM'));
  box.append(input);
  if (unit === '%') box.append(el('span', { class: 'unit post' }, '%'));
  return box;
}

function listField(def, f, v, changed) {
  const box = el('div', { class: 'list' });
  const draw = () => {
    box.replaceChildren();
    v[f.id].forEach((row, i) => {
      const cells = f.item.map(c => {
        const id = `f-${def.id}-${f.id}-${i}-${c.id}`;
        return el('div', { class: 'list-cell' },
          el('label', { class: 'field-label small', for: id }, label(def.id, `${f.id}_${c.id}`)),
          numberBox(id, c, () => v[f.id][i][c.id], x => { v[f.id][i][c.id] = x; changed(); }));
      });
      box.append(el('div', { class: 'list-row', style: `grid-template-columns: repeat(${f.item.length}, minmax(0, 1fr)) 40px` }, ...cells,
        el('button', { type: 'button', class: 'icon-btn list-del', 'aria-label': t('remove'), onclick: () => { v[f.id].splice(i, 1); draw(); changed(); } }, icon('trash'))));
    });
    box.append(el('button', { type: 'button', class: 'button button-quiet list-add', onclick: () => {
      const last = v[f.id].at(-1);
      const row = Object.fromEntries(f.item.map(c => [c.id, c.def]));
      // A new rate step starts a year after the last one.
      if (last && 'fromYear' in row) row.fromYear = Math.min(40, last.fromYear + 1);
      v[f.id].push(row); draw(); changed();
    } }, icon('plus'), label(def.id, `${f.id}_add`)));
  };
  draw();
  return box;
}
