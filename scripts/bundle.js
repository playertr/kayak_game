#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────
// Hacky bundler — combine shell.html + JS source files into a single
// distributable HTML file.
//
// Usage:  node bundle.js            → writes multiplayer-kayak.html
//         node bundle.js --check    → also validates with new Function()
// ────────────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..');

// Source files in topological (dependency) order
const SRC_ORDER = [
  'src/config.js',
  'data/coastline-data.js',
  'data/map-labels.js',
  'src/tides.js',
  'src/projection.js',
  'src/land.js',
  'src/entities.js',
  'src/update.js',
  'src/render.js',
  'src/game.js',
];

// ── Build the concatenated JS bundle ────────────────────────────────

let js = '';
for (const rel of SRC_ORDER) {
  const abs  = path.join(DIR, rel);
  const code = fs.readFileSync(abs, 'utf8');
  const bar  = '─'.repeat(Math.max(1, 60 - rel.length));
  js += `\n// ── ${rel} ${bar}\n`;
  js += code;
  js += '\n';
}

// ── Inject into shell.html ──────────────────────────────────────────

const shell  = fs.readFileSync(path.join(DIR, 'shell.html'), 'utf8');
const marker = '// {{BUNDLE}}';
if (!shell.includes(marker)) {
  console.error('ERROR: shell.html is missing the ' + marker + ' placeholder');
  process.exit(1);
}
const output = shell.replace(marker, js);

const outPath = path.join(DIR, 'multiplayer-kayak.html');
fs.writeFileSync(outPath, output);

const lines = output.split('\n').length;
console.log(`✓ Bundled ${SRC_ORDER.length} files → ${outPath}`);
console.log(`  ${output.length.toLocaleString()} bytes, ${lines.toLocaleString()} lines`);

// ── Optional syntax check ───────────────────────────────────────────

if (process.argv.includes('--check')) {
  const m = output.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) { console.error('No <script> tag found'); process.exit(1); }
  try {
    new Function(m[1]);
    console.log('✓ Syntax OK');
  } catch (e) {
    console.error('✗ SYNTAX ERROR:', e.message);
    process.exit(1);
  }
}
