/* Regenerate the service worker's precache list and cache name.

     node tools/build-sw.mjs

   The name is a hash of every precached file's path and contents, so any
   change ships to installed copies with nothing to remember. CI runs this
   on every push. Fails when the precache would exceed BUDGET: everything is
   downloaded on install, so it stays small. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';

const DIRS = ['css', 'js', 'data', 'icons'];
const FILES = ['index.html', 'manifest.webmanifest', 'favicon.ico', 'whatsnew.js'];
const SKIP = /(^\.|\.DS_Store$|~$)/;
export const BUDGET = 4 * 1048576;

function walk(root, dir, out = []) {
  for (const name of readdirSync(join(root, dir)).sort()) {
    if (SKIP.test(name)) continue;
    const rel = posix.join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

export function build(root) {
  const files = [
    ...FILES.filter(f => existsSync(join(root, f))),
    ...DIRS.filter(d => existsSync(join(root, d))).flatMap(d => walk(root, d)),
  ].sort();

  const hash = createHash('sha256');
  for (const f of files) { hash.update(f); hash.update(readFileSync(join(root, f))); }
  const cache = `mycalc-${hash.digest('hex').slice(0, 10)}`;
  const bytes = files.reduce((a, f) => a + statSync(join(root, f)).size, 0);
  if (bytes > BUDGET) return { files, bytes, cache, ok: false };

  const block = [
    '/* --- generated:begin --- */',
    `const CACHE = '${cache}';`,
    'const ASSETS = [',
    "  './',",
    ...files.map(f => `  '${f}',`),
    '];',
    '/* --- generated:end --- */',
  ].join('\n');

  const path = join(root, 'sw.js');
  const sw = readFileSync(path, 'utf8');
  const re = /\/\* --- generated:begin --- \*\/[\s\S]*?\/\* --- generated:end --- \*\//;
  if (!re.test(sw)) throw new Error('sw.js has no generated block');
  writeFileSync(path, sw.replace(re, block));
  return { files, bytes, cache, ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = build(join(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log(`precache: ${r.files.length} files, ${(r.bytes / 1048576).toFixed(2)} MB (budget ${BUDGET / 1048576} MB)`);
  if (!r.ok) { console.error('precache over 4 MB budget'); process.exit(1); }
  console.log(`cache:    ${r.cache}`);
}
