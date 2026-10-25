/* The service worker precaches every file the app serves, under a cache
   name only this app uses (all of Bryan's apps share one origin). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../tools/build-sw.mjs';

const root = new URL('..', import.meta.url).pathname;

test('precache covers the shell, every module and every rule file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sw-'));
  for (const f of ['index.html', 'manifest.webmanifest', 'favicon.ico', 'whatsnew.js', 'sw.js', 'css', 'js', 'data', 'icons']) cpSync(join(root, f), join(dir, f), { recursive: true });
  const r = build(dir);
  assert.ok(r.ok);
  assert.match(r.cache, /^mycalc-[0-9a-f]{10}$/);
  for (const f of ['index.html', 'whatsnew.js', 'js/app.js', 'js/qrcode.js', 'css/app.css', 'data/releases.json', 'data/rules/epf.json', 'icons/icon-192.png']) {
    assert.ok(r.files.includes(f), f);
  }
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
  assert.match(sw, /const PREFIX = 'mycalc-';/);
});

test('rules.js lists every rule file', async () => {
  const { RULE_FILES } = await import('../js/rules.js');
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(join(root, 'data/rules')).map(f => f.replace(/\.json$/, '')).sort();
  assert.deepEqual([...RULE_FILES].sort(), files);
});

test('releases: newest first, dated, in all three languages', () => {
  const rel = JSON.parse(readFileSync(join(root, 'data/releases.json'), 'utf8'));
  assert.ok(rel.length > 0);
  for (const r of rel) {
    assert.match(r.v, /^\d+\.\d+\.\d+$/);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const l of ['en', 'zh', 'ms']) assert.ok(r.notes[l]?.length, `${r.v} ${l}`);
  }
});
