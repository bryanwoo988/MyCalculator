/**
 * Minimal QR Code encoder — byte mode, error-correction level M, versions 1–10.
 *
 * The Info screen has to show a scannable code with no network and no CDN, so
 * the encoder ships with the app. Ten versions at level M carry 213 bytes,
 * which is more than any URL this app will ever point at.
 *
 * ISO/IEC 18004 Model 2. Verified byte-for-byte against `segno` — see
 * tools/verify-qr.mjs.
 */

/* --- Capacity tables (EC level M) ---------------------------------------- */

// [total codewords, EC codewords per block, [blocks, data per block] groups]
const VERSIONS = {
  1:  [26,  10, [[1, 16]]],
  2:  [44,  16, [[1, 28]]],
  3:  [70,  26, [[1, 44]]],
  4:  [100, 18, [[2, 32]]],
  5:  [134, 24, [[2, 43]]],
  6:  [172, 16, [[4, 27]]],
  7:  [196, 18, [[4, 31]]],
  8:  [242, 22, [[2, 38], [2, 39]]],
  9:  [292, 22, [[3, 36], [2, 37]]],
  10: [346, 26, [[4, 43], [1, 44]]],
};

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// 15-bit format information, EC level M, masks 0–7 (ISO/IEC 18004 Table C.1).
const FORMAT_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];

// 18-bit version information, versions 7–10 (Table D.1).
const VERSION_INFO = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };

/* --- GF(256) arithmetic, primitive polynomial 0x11D ----------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/**
 * Generator polynomial of degree `deg`, as the `deg` coefficients below the
 * leading term, highest power first — the order rsEncode consumes them in.
 *
 * It is built ascending (index j is the coefficient of x^j) because that makes
 * the multiply-by-(x + α^i) step a plain shift, then reversed.
 */
function rsPoly(deg) {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly.slice(0, deg).reverse();
}

/** Reed–Solomon error-correction codewords for one data block. */
function rsEncode(data, ecLen) {
  const gen = rsPoly(ecLen);
  const res = new Uint8Array(ecLen);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.copyWithin(0, 1);
    res[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i], factor);
    }
  }
  return res;
}

/* --- Bit stream ---------------------------------------------------------- */

class Bits {
  constructor() { this.bits = []; }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() { return this.bits.length; }
}

/** UTF-8 bytes, so the payload can hold non-ASCII if it ever needs to. */
const toBytes = str => new TextEncoder().encode(str);

function chooseVersion(byteLen) {
  for (let v = 1; v <= 10; v++) {
    const [total, ecPer, groups] = VERSIONS[v];
    const dataCodewords = total - ecPer * groups.reduce((a, g) => a + g[0], 0);
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + byteLen * 8 <= dataCodewords * 8) return v;
  }
  throw new RangeError(`QR payload too long for version 10: ${byteLen} bytes`);
}

function buildCodewords(text) {
  const bytes = toBytes(text);
  const version = chooseVersion(bytes.length);
  const [total, ecPer, groups] = VERSIONS[version];
  const blockCount = groups.reduce((a, g) => a + g[0], 0);
  const dataCodewords = total - ecPer * blockCount;

  const bs = new Bits();
  bs.push(0b0100, 4);                              // byte mode
  bs.push(bytes.length, version < 10 ? 8 : 16);    // character count
  for (const b of bytes) bs.push(b, 8);

  // Terminator, then pad to a whole codeword, then alternating pad bytes.
  bs.push(0, Math.min(4, dataCodewords * 8 - bs.length));
  while (bs.length % 8) bs.push(0, 1);
  const pad = [0xEC, 0x11];
  for (let i = 0; bs.length < dataCodewords * 8; i++) bs.push(pad[i % 2], 8);

  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i++) {
    for (let j = 0; j < 8; j++) data[i] |= bs.bits[i * 8 + j] << (7 - j);
  }

  // Split into blocks, compute EC for each.
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i++) {
      const block = data.subarray(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecPer));
    }
  }

  // Interleave: one codeword from each block in turn.
  const out = [];
  const maxData = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  }
  for (let i = 0; i < ecPer; i++) {
    for (const b of ecBlocks) out.push(b[i]);
  }
  return { version, codewords: out };
}

/* --- Matrix -------------------------------------------------------------- */

function newMatrix(size) {
  return {
    size,
    px: Array.from({ length: size }, () => new Int8Array(size).fill(-1)),
    fn: Array.from({ length: size }, () => new Uint8Array(size)), // function module?
  };
}

function setFn(m, x, y, v) {
  if (x < 0 || y < 0 || x >= m.size || y >= m.size) return;
  m.px[y][x] = v;
  m.fn[y][x] = 1;
}

function placeFinder(m, cx, cy) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      setFn(m, cx + dx, cy + dy, d === 2 || d > 3 ? 0 : 1);
    }
  }
}

function placeFunctions(m, version) {
  const n = m.size;

  placeFinder(m, 0, 0);
  placeFinder(m, n - 7, 0);
  placeFinder(m, 0, n - 7);

  for (let i = 8; i < n - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    setFn(m, i, 6, v);
    setFn(m, 6, i, v);
  }

  const centres = ALIGN[version];
  for (const cy of centres) {
    for (const cx of centres) {
      // Alignment patterns never overlap the finders.
      const nearFinder =
        (cx <= 8 && cy <= 8) || (cx >= n - 9 && cy <= 8) || (cx <= 8 && cy >= n - 9);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          setFn(m, cx + dx, cy + dy, d === 1 ? 0 : 1);
        }
      }
    }
  }

  // Reserve the format areas by writing a placeholder through the same
  // mapping the real bits use. Writing a plain rectangle here instead would
  // clobber the two timing modules at (6,8) and (8,6), which the format
  // layout skips.
  writeFormat(m, 0);

  if (version >= 7) {
    const info = VERSION_INFO[version];
    for (let i = 0; i < 18; i++) {
      const bit = (info >>> i) & 1;
      setFn(m, i % 3 + n - 11, Math.floor(i / 3), bit);
      setFn(m, Math.floor(i / 3), i % 3 + n - 11, bit);
    }
  }
}

/** Zigzag placement, two columns at a time, right to left, skipping column 6. */
function placeData(m, codewords) {
  let bit = 0;
  const total = codewords.length * 8;
  let upward = true;

  for (let right = m.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern column
    for (let step = 0; step < m.size; step++) {
      const y = upward ? m.size - 1 - step : step;
      for (let c = 0; c < 2; c++) {
        const x = right - c;
        if (m.fn[y][x]) continue;
        let v = 0;
        if (bit < total) v = (codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1;
        m.px[y][x] = v;
        bit++;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i, _j) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function applyMask(m, maskId) {
  const f = MASKS[maskId];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.fn[y][x] && f(y, x)) m.px[y][x] ^= 1;
    }
  }
}

function writeFormat(m, maskId) {
  const bits = FORMAT_M[maskId];
  const n = m.size;
  for (let i = 0; i < 15; i++) {
    const bit = (bits >>> i) & 1;
    // Copy 1, around the top-left finder.
    if (i < 6) setFn(m, 8, i, bit);
    else if (i === 6) setFn(m, 8, 7, bit);
    else if (i === 7) setFn(m, 8, 8, bit);
    else if (i === 8) setFn(m, 7, 8, bit);
    else setFn(m, 14 - i, 8, bit);
    // Copy 2, split between the other two finders.
    if (i < 8) setFn(m, n - 1 - i, 8, bit);
    else setFn(m, 8, n - 15 + i, bit);
  }
  setFn(m, 8, n - 8, 1);
}

/** ISO/IEC 18004 §8.8.2 penalty scoring — lower is better. */
function penalty(m) {
  const n = m.size;
  let score = 0;

  // Rule 1: runs of five or more same-colour modules in a row or column.
  for (let i = 0; i < n; i++) {
    for (const read of [(k) => m.px[i][k], (k) => m.px[k][i]]) {
      let run = 1;
      for (let k = 1; k < n; k++) {
        if (read(k) === read(k - 1)) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = m.px[y][x];
      if (v === m.px[y][x + 1] && v === m.px[y + 1][x] && v === m.px[y + 1][x + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: the 1:1:3:1:1 finder-like pattern with four light modules beside it.
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (read, k) =>
    A.every((v, d) => read(k + d) === v) || B.every((v, d) => read(k + d) === v);
  for (let i = 0; i < n; i++) {
    const row = k => (k >= 0 && k < n ? m.px[i][k] : -1);
    const col = k => (k >= 0 && k < n ? m.px[k][i] : -1);
    for (let k = 0; k <= n - 11; k++) {
      if (matches(row, k)) score += 40;
      if (matches(col, k)) score += 40;
    }
  }

  // Rule 4: deviation from an even split of dark and light.
  let dark = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) dark += m.px[y][x];
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;

  return score;
}

/**
 * Encode `text` as a QR matrix.
 * @returns {{size:number, modules:Int8Array[], version:number}}
 */
export function encode(text) {
  const { version, codewords } = buildCodewords(text);
  const size = version * 4 + 17;

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = newMatrix(size);
    placeFunctions(m, version);
    placeData(m, codewords);
    applyMask(m, mask);
    writeFormat(m, mask);
    const score = penalty(m);
    if (!best || score < best.score) best = { score, m };
  }
  return { size, modules: best.m.px, version };
}

/**
 * Render `text` as an SVG element.
 * Drawn as one path of square subpaths — a few hundred `<rect>` elements is
 * markedly slower to parse and paint on a modest phone.
 */
export function toSVG(text, { quiet = 4, dark = '#000', light = '#fff' } = {}) {
  const { size, modules } = encode(text);
  const dim = size + quiet * 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${dim} ${dim}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');

  const bg = document.createElementNS(svg.namespaceURI, 'rect');
  bg.setAttribute('width', dim);
  bg.setAttribute('height', dim);
  bg.setAttribute('fill', light);
  svg.append(bg);

  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === 1) d += `M${x + quiet},${y + quiet}h1v1h-1z`;
    }
  }
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', dark);
  svg.append(path);

  return svg;
}
