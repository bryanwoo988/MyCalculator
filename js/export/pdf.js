/* A PDF built in the browser, for the iPhone home-screen app.

   A home-screen web app on iOS cannot open the print screen, so there the
   report is drawn page by page onto a canvas with the phone's own fonts
   (Chinese included), each page stored as a JPEG, and the pages wrapped in
   a minimal PDF. The text is a picture, not selectable; browsers that can
   print still use the print layout instead (report.js). */

import { t } from '../i18n.js';
import { formatValue } from '../format.js';
import { chartSvg } from '../ui/chart.js';
import { rowLabel, xLabel } from '../ui/result.js';
import { inputRows } from './report.js';

// A4 at 150 dpi.
const PW = 1240, PH = 1754, M = 80, CW = PW - 2 * M;
const PT_W = 595.28, PT_H = 841.89;
const INK = '#111111', SOFT = '#555555', LINE = '#dddddd', ACCENT = '#1F6554';
const SERIES = ['#1F6554', '#D08A2E', '#6E7FD1', '#B4547A', '#9C8A1E'];
const SANS = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", "Noto Sans CJK SC", Arial, sans-serif';
const SERIF = '"Iowan Old Style", Georgia, "Songti SC", "Noto Serif CJK SC", serif';
const MAX_ROWS = 120;

/* ---------- PDF container: one JPEG per page ---------- */

export function pdfFromJpegs(pages) {
  const enc = new TextEncoder();
  const chunks = [], offsets = [];
  let length = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); length += u.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const n = pages.length;
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  pages.forEach((p, i) => {
    const page = 3 + i * 3, img = page + 1, content = page + 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im${i} ${img} 0 R >> >> /Contents ${content} 0 R >>`);
    obj(img, [`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
    const draw = `q ${PT_W} 0 0 ${PT_H} 0 0 cm /Im${i} Do Q`;
    obj(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  });
  const xref = length, count = 3 + n * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/* ---------- page layout ---------- */

// Greedy wrap that works for both spaced scripts and Chinese.
export function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    const next = line + ch;
    if (ctx.measureText(next).width <= width || !line) { line = next; continue; }
    const cut = line.lastIndexOf(' ');
    if (cut > 0 && /[\x00-⹿]/.test(ch)) { lines.push(line.slice(0, cut)); line = line.slice(cut + 1) + ch; }
    else { lines.push(line); line = ch.trimStart(); }
  }
  if (line) lines.push(line);
  return lines;
}

class Pages {
  constructor() { this.pages = []; this.newPage(); }
  newPage() {
    const c = document.createElement('canvas');
    c.width = PW; c.height = PH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH);
    ctx.textBaseline = 'alphabetic';
    this.pages.push(c); this.ctx = ctx; this.y = M;
  }
  need(h) { if (this.y + h > PH - M) this.newPage(); }
  font(size, weight = 400, family = SANS) { this.ctx.font = `${weight} ${size}px ${family}`; }

  text(s, x, y, { size = 22, weight = 400, color = INK, align = 'left', family = SANS } = {}) {
    this.font(size, weight, family);
    this.ctx.fillStyle = color; this.ctx.textAlign = align;
    this.ctx.fillText(s, x, y);
  }
  rule(y, color = LINE, w = 1.5) { const c = this.ctx; c.strokeStyle = color; c.lineWidth = w; c.beginPath(); c.moveTo(M, y); c.lineTo(PW - M, y); c.stroke(); }

  heading(s) {
    this.need(70);
    this.y += 34;
    this.text(s, M, this.y, { size: 28, weight: 600, color: ACCENT, family: SERIF });
    this.y += 16;
  }
  para(s, { size = 19, color = SOFT } = {}) {
    this.font(size);
    for (const l of wrap(this.ctx, s, CW)) {
      this.need(size * 1.5);
      this.y += size * 1.45;
      this.text(l, M, this.y, { size, color });
    }
  }
  // Label on the left (wrapping), value on the right.
  kv(label, value, strong) {
    const size = 21, weight = strong ? 700 : 400;
    this.font(size, weight);
    const vw = this.ctx.measureText(value).width;
    const lines = wrap(this.ctx, label, CW - vw - 30);
    const h = lines.length * size * 1.4 + 16;
    this.need(h);
    let y = this.y + size * 1.25 + 4;
    lines.forEach((l, i) => this.text(l, M, y + i * size * 1.4, { size, weight }));
    this.text(value, PW - M, y, { size, weight, align: 'right' });
    this.y += h;
    this.rule(this.y);
  }
}

function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// The on-screen chart SVG, with its theme variables replaced by fixed print colours.
function printableSvg(html, w, h) {
  const svg = html.match(/<svg[\s\S]*<\/svg>/)?.[0];
  if (!svg) return null;
  const css = `text{font:13px ${SANS};fill:#555}.grid{stroke:#ddd;stroke-width:1}.axis{stroke:#888;stroke-width:1}`
    + '.line{fill:none;stroke-width:2.5}.dash{stroke-dasharray:6 5}.area{fill-opacity:.85}'
    + SERIES.map((c, i) => `.s${i + 1}.line{stroke:${c}}.s${i + 1}.area,.s${i + 1}.bar{fill:${c}}`).join('');
  return svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `)
    .replace(/(<svg[^>]*>)/, `$1<style>${css.replace(/</g, '')}</style>`);
}

async function chart(P, c) {
  const html = chartSvg(c, { label: k => t(k), xLabel: xLabel(c.xKind), title: t(c.key) });
  const w = Math.round(CW * 0.9), h = Math.round(w * 300 / 640);
  const svg = printableSvg(html, w, h);
  if (!svg) return;
  let img;
  try { img = await svgToImage(svg); } catch { return; }
  P.need(h + 130); // heading, chart and legend stay on one page
  P.heading(t(c.key));
  P.ctx.drawImage(img, M, P.y + 10, w, h);
  P.y += h + 24;
  // Legend
  let x = M;
  c.series.forEach((s, i) => {
    const name = t(s.key);
    P.ctx.fillStyle = SERIES[i]; P.ctx.fillRect(x, P.y - 14, 16, 16);
    P.text(name, x + 24, P.y, { size: 19, color: SOFT });
    P.font(19); x += 24 + P.ctx.measureText(name).width + 30;
  });
  P.y += 10;
}

/* Columns as wide as their widest cell; when they do not fit the page,
   the type shrinks until they do (the EPF table has eleven columns). */
function table(P, cols, rows) {
  const cells = rows.map(r => r.map((x, i) => (x === null ? '∞' : formatValue(cols[i].kind, x, t))));
  const heads = cols.map(c => t(c.key));
  let size = 17;
  const widths = () => {
    P.font(size, 700);
    const hw = heads.map(h => P.ctx.measureText(h).width);
    P.font(size);
    return cols.map((_, i) => Math.max(hw[i], ...cells.map(r => P.ctx.measureText(r[i]).width)) + size);
  };
  let w = widths();
  while (w.reduce((a, b) => a + b, 0) > CW && size > 9) { size -= 0.5; w = widths(); }
  const extra = (CW - w.reduce((a, b) => a + b, 0)) / cols.length;
  w = w.map(x => x + Math.max(0, extra));
  const right = w.map((_, i) => M + w.slice(0, i + 1).reduce((a, b) => a + b, 0) - size / 2);
  const rowH = Math.round(size * 1.9);
  const line = (vals, weight) => vals.forEach((s, i) =>
    P.text(s, i ? right[i] : M + size / 2, P.y - rowH * 0.3, { size, weight, align: i ? 'right' : 'left' }));
  const head = () => { P.need(rowH * 2); P.y += rowH; line(heads, 700); P.rule(P.y, '#999'); };
  head();
  for (const r of cells) {
    if (P.y + rowH > PH - M) { P.newPage(); head(); }
    P.y += rowH;
    line(r, 400);
    P.rule(P.y);
  }
}

async function logo() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'icons/icon-192.png';
  });
}

export async function toPdf(def, v, result, meta) {
  const P = new Pages();
  // Header
  const icon = await logo();
  if (icon) P.ctx.drawImage(icon, M, P.y, 72, 72);
  const tx = icon ? M + 92 : M;
  P.text(t(`calc_${def.id}`), tx, P.y + 40, { size: 40, weight: 600, family: SERIF });
  P.text(`${meta.name ? meta.name + ' · ' : ''}${t('appName')} · ${meta.date}`, tx, P.y + 72, { size: 20, color: SOFT });
  P.y += 96;
  P.rule(P.y, ACCENT, 3);
  P.y += 22;

  // Headline numbers in boxes
  const n = result.headline.length, gap = 18, bw = (CW - gap * (n - 1)) / n;
  result.headline.forEach((h, i) => {
    const x = M + i * (bw + gap);
    P.ctx.strokeStyle = '#cccccc'; P.ctx.lineWidth = 2;
    P.ctx.strokeRect(x, P.y, bw, 100);
    P.font(18);
    P.text(wrap(P.ctx, rowLabel(h), bw - 28)[0], x + 14, P.y + 32, { size: 18, color: SOFT });
    P.text(formatValue(h.kind, h.value, t), x + 14, P.y + 76, { size: n > 2 ? 30 : 34, weight: 600, family: SERIF });
  });
  P.y += 110;

  P.heading(t('inputs'));
  for (const [l, x, k] of inputRows(def, v)) P.kv(l, k === 'num' || k === 'string' ? String(x) : formatValue(k, x, t));
  for (const g of result.groups) {
    P.heading(t(g.key, g.params));
    for (const r of g.rows) P.kv(rowLabel(r), formatValue(r.kind, r.value, t), r.strong);
  }
  for (const c of result.charts) await chart(P, c);
  for (const tb of result.tables) {
    P.heading(t(tb.key) + (tb.monthly ? ` (${t('yearly')})` : ''));
    table(P, tb.cols, tb.rows.slice(0, MAX_ROWS));
    if (tb.monthly) { P.y += 6; P.para(t('monthlyInExcel'), { size: 17 }); }
  }
  if (result.notes.length) {
    P.heading(t('notes'));
    for (const note of result.notes) P.para(t(note.key, note.params), { size: 18 });
  }
  P.heading(t('rulesUsed'));
  for (const r of meta.rules) P.para(r, { size: 16 });
  P.y += 14;
  P.para(t('disclaimer'), { size: 17 });

  // Page numbers
  P.pages.forEach((c, i) => {
    const ctx = c.getContext('2d');
    ctx.font = `400 16px ${SANS}`; ctx.fillStyle = '#999'; ctx.textAlign = 'right';
    ctx.fillText(`${i + 1} / ${P.pages.length}`, PW - M, PH - M / 2);
  });

  const pages = await Promise.all(P.pages.map(async c => {
    const url = c.toDataURL('image/jpeg', 0.88);
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const jpeg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    return { width: PW, height: PH, jpeg };
  }));
  return pdfFromJpegs(pages);
}
