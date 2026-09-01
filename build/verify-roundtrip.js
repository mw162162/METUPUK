// Prove the content files can be rendered back without losing anything.
//
//   node build/verify-roundtrip.js
//
// This runs before the build is repointed at content/, not after. The whole
// migration rests on one promise — no content loss — and switching the build's
// source is the single riskiest thing that can be done to that promise. So the
// renderer is measured against all 300 files first, while the live build is
// still reading the scrape and nothing is at stake.
//
// The test is the same one the exporter uses: every letter of the source, in
// order, must appear in the rendered output. A subsequence check rather than an
// equality check, because canonical markup legitimately differs from WordPress
// soup — what may not differ is the words.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const model = require('./lib/model');
const { toText } = require('./lib/clean');
const { renderBlocks } = require('./lib/torender');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const letters = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function readContent(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return null;
  return yaml.load(m[1]);
}

function firstDivergence(want, got) {
  let j = 0;
  for (let i = 0; i < want.length; i++) {
    const at = got.indexOf(want[i], j);
    if (at < 0) return i;
    j = at + 1;
  }
  return -1;
}

function main() {
  const m = model.build();
  const byUrl = new Map([...m.pages, ...m.posts].map((d) => [d.url, d]));

  let checked = 0;
  let clean = 0;
  const failures = [];
  const missingDoc = [];
  const typeCounts = {};

  for (const kind of ['pages', 'posts']) {
    const dir = path.join(CONTENT, kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const front = readContent(path.join(dir, name));
      if (!front || !front.url) continue;

      const doc = byUrl.get(front.url);
      if (!doc) { missingDoc.push(front.url); continue; }

      (front.sections || []).forEach((b) => {
        typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
      });

      const html = renderBlocks(front.sections);
      const want = letters(toText(doc.html));
      const got = letters(toText(html));
      checked++;

      const at = firstDivergence(want, got);
      if (at < 0) { clean++; continue; }

      const src = toText(doc.html);
      const approx = Math.round((at / Math.max(1, want.length)) * src.length);
      failures.push({
        url: front.url,
        at: `${Math.round((at / Math.max(1, want.length)) * 100)}%`,
        near: src.slice(Math.max(0, approx - 60), approx + 60).replace(/\s+/g, ' ').trim(),
      });
    }
  }

  console.log(`Content files checked:  ${checked}`);
  console.log(`Rendered without loss:  ${clean}`);
  console.log(`Lost something:         ${failures.length}`);
  if (missingDoc.length) console.log(`No matching document:   ${missingDoc.length}`);

  console.log('\nBlocks rendered by type:');
  Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${String(n).padStart(5)}  ${t}`));

  if (failures.length) {
    console.log('\nFirst divergences:');
    for (const f of failures.slice(0, 12)) {
      console.log(`\n  ${f.url}  (about ${f.at} in)`);
      console.log(`    ...${f.near}...`);
    }
    if (failures.length > 12) console.log(`\n  ...and ${failures.length - 12} more`);
  }

  process.exit(failures.length ? 1 : 0);
}

main();
