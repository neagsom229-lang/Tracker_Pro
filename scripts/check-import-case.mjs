// scripts/check-import-case.mjs — fails on any relative import whose path
// does not match the real file names with exact case (Linux is case-sensitive).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = process.cwd();
const ROOTS = ['src', 'server', 'scripts'];
const EXTS = ['', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
const SOURCE = /\.(js|jsx|mjs|cjs)$/;
const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
const failures = [];

// Exact-case existence: compare each path segment with the real directory listing.
function existsExact(abs) {
  let cur = root;
  for (const part of relative(root, abs).split(sep)) {
    let names;
    try {
      names = readdirSync(cur);
    } catch {
      return false;
    }
    if (!names.includes(part)) return false;
    cur = join(cur, part);
  }
  return true;
}

function resolves(abs) {
  for (const ext of EXTS) {
    const p = abs + ext;
    if (existsExact(p) && statSync(p).isFile()) return true;
  }
  return ['index.js', 'index.jsx', 'index.mjs'].some((i) => existsExact(join(abs, i)));
}

function check(file) {
    const text = readFileSync(file, 'utf8')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1].split('?')[0];
    if (!resolves(resolve(dirname(file), spec))) {
      failures.push(`${relative(root, file)}: ${spec}`);
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (SOURCE.test(name)) check(p);
  }
}

for (const r of ROOTS) if (existsSync(r)) walk(r);

if (failures.length) {
  console.error('Import case/path problems:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('check:imports OK');
