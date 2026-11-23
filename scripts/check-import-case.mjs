// check-import-case.mjs - minimal import case check
// Verifies that known import paths have correct filename case.
// Run with: node scripts/check-import-case.mjs

import { readFileSync } from 'fs';

const failures = [];

// Check the two known case-sensitive imports
const checks = [
  { file: 'src/components/AIQuickAdd.jsx', import: '../lib/Ai', desc: 'Ai.js file' },
  { file: 'src/components/ReceiptScanner.jsx', import: '../lib/Ai', desc: 'Ai.js file' },
];

for (const c of checks) {
  const content = readFileSync(c.file, 'utf-8');
  if (!content.includes(c.import)) {
    failures.push({ file: c.file, import: c.import, reason: 'Import path not found (may already be fixed)' });
  } else if (c.import === '../lib/ai') {
    // Only flag if it's the old lowercase version
    failures.push({ file: c.file, import: c.import, reason: 'Uses ../lib/ai but file is Ai.js (capital A)' });
  }
}

if (failures.length > 0) {
  console.log('FAILURES (' + failures.length + '):');
  for (const f of failures) {
    console.log('  ' + f.file + ' import ' + f.import + ' -> ' + f.reason);
  }
  process.exit(1);
} else {
  console.log('All import paths have correct case.');
  process.exit(0);
}