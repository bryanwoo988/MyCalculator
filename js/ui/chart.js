/* Charts as inline SVG strings: line, stacked area and stacked bar.
   Colours are CSS variables (--c1 … --c4), so a chart follows the theme on
   screen and prints in the light palette. No library. */

const W = 640, H = 300, PAD = { l: 70, r: 16, t: 16, b: 42 };

// 0, 1, 2, 2.5, 5 × 10ⁿ steps for about `count` ticks.
export function niceTicks(max, count = 5) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count, pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 1e-9; v += step) ticks.push(v);
  if (ticks.at(-1) < max) ticks.push(ticks.at(-1) + step);
  return ticks;
}

export function compact(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(v));
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function chartSvg(chart, { label = k => k, xLabel = x => x, title = '' } = {}) {
  const { x, series, type } = chart;
  const n = x.length;
  if (!n || !series.length) return '';
  const stacked = type !== 'line';
  const tops = x.map((_, i) => stacked
    ? series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0)
    : Math.max(...series.map(s => s.values[i] || 0)));
  const ticks = niceTicks(Math.max(...tops));
  const yMax = ticks.at(-1) || 1;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const band = iw / n;
  const X = i => type === 'bar' ? PAD.l + band * (i + 0.5) : PAD.l + (n === 1 ? iw / 2 : iw * i / (n - 1));
  const Y = v => PAD.t + ih - (v / yMax) * ih;
  const out = [];

  for (const t of ticks) {
    out.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(t)}" y2="${Y(t)}"/>`);
    out.push(`<text class="ytick" x="${PAD.l - 8}" y="${Y(t) + 7}" text-anchor="end">${compact(t)}</text>`);
  }
  const every = Math.max(1, Math.ceil(n / 7));
  x.forEach((v, i) => {
    if (i % every && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every / 2) return; // keep clear of the last label
    out.push(`<text class="xtick" x="${X(i)}" y="${H - PAD.b + 30}" text-anchor="middle">${esc(xLabel(v))}</text>`);
  });

  const base = new Array(n).fill(0);
  series.forEach((s, k) => {
    const cls = `s${k + 1}`;
    const v = s.values.map(z => Math.max(0, z || 0));
    if (type === 'line') {
      const d = v.map((y, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join('');
      out.push(`<path class="line ${cls}${k ? ' dash' : ''}" d="${d}"/>`);
    } else if (type === 'stack') {
      const top = v.map((y, i) => base[i] + y);
      const up = top.map((y, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join('');
      const down = base.map((y, i) => `L${X(i).toFixed(1)},${Y(y).toFixed(1)}`).reverse().join('');
      out.push(`<path class="area ${cls}" d="${up}${down}Z"/>`);
      top.forEach((y, i) => { base[i] = y; });
    } else {
      const bw = Math.max(1, band * 0.7);
      v.forEach((y, i) => {
        if (y <= 0) return;
        out.push(`<rect class="bar ${cls}" x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(base[i] + y).toFixed(1)}" width="${bw.toFixed(1)}" height="${(Y(base[i]) - Y(base[i] + y)).toFixed(1)}"/>`);
        base[i] += y;
      });
    }
  });
  out.push(`<line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(0)}" y2="${Y(0)}"/>`);

  const legend = series.length > 1 || title
    ? `<div class="legend">${series.map((s, k) => `<span><i class="sw s${k + 1}${type === 'line' && k ? ' dash' : ''}"></i>${esc(label(s.key))}</span>`).join('')}</div>`
    : '';
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${out.join('')}</svg>${legend}</figure>`;
}
