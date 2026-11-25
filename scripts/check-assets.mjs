#!/usr/bin/env node
/**
 * Checks that static asset references in index.html, public/manifest.json,
 * and public/service-worker.js resolve to files that exist on disk.
 * Exits 1 on any missing asset. Intended for CI / verify.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function exists(rel) {
  const clean = rel.replace(/^\//, '').split('?')[0].split('#')[0];
  return fs.existsSync(path.join(root, 'public', clean)) || fs.existsSync(path.join(root, clean));
}

function checkFile(file, refs) {
  for (const ref of refs) {
    if (!ref.startsWith('/')) continue;
    if (ref.startsWith('//')) continue;
    if (ref.endsWith('/')) continue; // prefix/pattern, not a concrete file
    if (!exists(ref)) errors.push(`${file}: missing asset ${ref}`);
  }
}

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'public/service-worker.js'), 'utf8');

const htmlRefs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
checkFile('index.html', htmlRefs);

const manifestRefs = [];
for (const icon of manifest.icons || []) if (icon.src) manifestRefs.push(icon.src);
if (manifest.start_url) manifestRefs.push(manifest.start_url);
checkFile('public/manifest.json', manifestRefs);

const swRefs = [...sw.matchAll(/['"]((?:\/[^'"\s]+))['"]/g)].map((m) => m[1]);
// Only check local static-like refs; ignore API paths/functions.
checkFile(
  'public/service-worker.js',
  swRefs.filter((r) => !r.startsWith('/functions/')),
);

// TOML parse check for Supabase config (catches duplicate keys / syntax errors).
try {
  execSync('python -c "import tomllib; tomllib.load(open(\'supabase/config.toml\',\'rb\')); print(\'toml ok\')"', {
    cwd: root,
    stdio: 'pipe',
  });
} catch (e) {
  errors.push(`supabase/config.toml: invalid TOML (${e.stderr?.toString().trim() || e.message})`);
}

if (errors.length) {
  console.error('check-assets FAILED:');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('check-assets OK');