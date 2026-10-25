/* Preferences and saved records survive bad storage and bad backups. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as prefs from '../js/prefs.js';
import * as records from '../js/records.js';
import { workbook, crc32, colName, sheetName } from '../js/export/xlsx.js';

const memory = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), _m: m };
};

test('prefs: defaults to English, unchosen', () => {
  const p = prefs.init(memory());
  assert.equal(p.lang, 'en');
  assert.equal(p.chosen, false);
});

test('prefs: corrupt or hostile values fall back', () => {
  const p = prefs.init(memory({ [prefs.KEY]: JSON.stringify({ lang: 'xx', chosen: true, theme: 'neon', scale: 9, drafts: [] }) }));
  assert.equal(p.lang, 'en');
  assert.equal(p.chosen, false);
  assert.equal(p.theme, 'auto');
  assert.equal(p.scale, 1);
  assert.deepEqual(p.drafts, {});
  assert.equal(prefs.init(memory({ [prefs.KEY]: '{not json' })).lang, 'en');
});

test('prefs: storage that throws is survivable', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  prefs.init(bad);
  prefs.set({ lang: 'zh', chosen: true });
  assert.equal(prefs.get().lang, 'zh');
});

test('prefs: theme resolution', () => {
  const p = { theme: 'auto', lightTheme: 'mint', darkTheme: 'grape' };
  assert.deepEqual(prefs.resolveTheme(p, true), { side: 'dark', palette: 'grape' });
  assert.deepEqual(prefs.resolveTheme(p, false), { side: 'light', palette: 'mint' });
  assert.deepEqual(prefs.resolveTheme({ ...p, theme: 'light' }, true), { side: 'light', palette: 'mint' });
});

test('records: add, update, remove', () => {
  const s = memory();
  records.init(s);
  const r = records.add({ calc: 'home', name: '  House A ', inputs: { price: 1 }, rules: { property: 1 }, headline: [] }, '2026-01-01T00:00:00Z');
  assert.equal(r.name, 'House A');
  records.update(r.id, { name: 'House B' }, '2026-01-02T00:00:00Z');
  assert.equal(records.get(r.id).name, 'House B');
  records.init(s); // reload from storage
  assert.equal(records.all().length, 1);
  records.remove(r.id);
  assert.equal(records.all().length, 0);
});

test('records: backup round trip, newest wins, junk skipped', () => {
  records.init(memory());
  const a = records.add({ calc: 'epf', name: 'A', inputs: {}, rules: {}, headline: [] }, '2026-01-01T00:00:00Z');
  const file = JSON.parse(JSON.stringify(records.backup({ lang: 'ms' }, '1.0.0')));
  file.records[0].name = 'A newer';
  file.records[0].savedAt = '2026-02-01T00:00:00Z';
  file.records.push({ junk: true }, { id: 'x', calc: 'tax', name: 'B', inputs: {}, savedAt: '2026-01-05T00:00:00Z' });
  const res = records.restore(file);
  assert.deepEqual([res.added, res.updated, res.skipped], [1, 1, 1]);
  assert.equal(records.get(a.id).name, 'A newer');
  assert.equal(res.prefs.lang, 'ms');
  assert.throws(() => records.restore({ hello: 1 }), /not-a-backup/);
});

test('xlsx: zip structure and helpers', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  const used = new Set();
  assert.equal(sheetName('a/b:c', used), 'a b c');
  assert.equal(sheetName('a/b:c', used), 'a b c 2');
  const bytes = workbook([{ name: 'S', rows: [['x', { v: 1.5, s: 'money' }]] }]);
  const dv = new DataView(bytes.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(bytes.length - 22 + 10, true), 6); // 5 parts + 1 sheet
});

test('pdf: xref offsets point at their objects', async () => {
  const { pdfFromJpegs } = await import('../js/export/pdf.js');
  const fake = { width: 2, height: 2, jpeg: new Uint8Array([0xff, 0xd8, 0, 1, 2, 0xff, 0xd9]) };
  const bytes = pdfFromJpegs([fake, fake]);
  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 2/);
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  assert.equal(offsets.length, 8); // catalog, pages, 3 per page
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});
