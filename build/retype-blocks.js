// Re-read the raw-HTML blocks now that the registry knows more.
//
//   node build/retype-blocks.js [--write]
//
// Every escape-hatch block on the site is a component nobody had built yet.
// When one gets built, the pages already carrying that markup do not know
// about it — they keep their lump of HTML and stay uneditable, and the count
// of "blocks a client cannot edit" never goes down.
//
// So this walks the content, offers every html block to the registry again,
// and rewrites the ones something now recognises. Run it after adding a
// component. Nothing else is touched: a block that still matches nothing is
// left exactly as it was.
//
// It reads content/, not the WordPress scrape, because content/ is the source
// of truth and anything written since the migration only exists there.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { parse } = require('node-html-parser');
const { classify } = require('./lib/blocks');
const { BY_NAME } = require('./lib/components');
const { renderBlocks } = require('./lib/torender');
const { contentFile } = require('./lib/yaml-out');
const { toText } = require('./lib/clean');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const letters = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function files() {
  const out = [];
  for (const dir of ['pages', 'posts']) {
    const full = path.join(CONTENT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith('.md')) out.push(path.join(full, name));
    }
  }
  return out;
}

function frontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?$/);
  return m ? yaml.load(m[1]) : null;
}

// The same promise as everywhere else: a block may change shape, but not a
// letter of what it says. Measured on what would be rendered, because that is
// what a reader sees — a field the renderer ignores is as lost as a field that
// was never written.
function survives(before, after) {
  const want = letters(toText(renderBlocks([before])));
  const got = letters(toText(renderBlocks([after])));
  let j = 0;
  for (let i = 0; i < want.length; i++) {
    const at = got.indexOf(want[i], j);
    if (at < 0) return false;
    j = at + 1;
  }
  return true;
}

function retype(block) {
  if (block.type !== 'html') return null;
  const root = parse(String(block.html || '')).firstChild;
  if (!root || root.nodeType !== 1) return null;

  const kind = classify(root);
  if (kind === 'html' || kind === 'prose') return null;

  const component = BY_NAME.get(kind);
  if (!component || !component.read) return null;
  const typed = component.read(root);
  if (!typed) return null;

  return survives(block, typed) ? typed : { refused: kind };
}

function main() {
  const write = process.argv.includes('--write');
  let changed = 0;
  let refused = 0;
  const counts = {};
  const touched = [];

  for (const file of files()) {
    const raw = fs.readFileSync(file, 'utf8');
    const front = frontMatter(raw);
    if (!front || !Array.isArray(front.sections)) continue;

    let dirty = false;
    front.sections = front.sections.map((b) => {
      const typed = retype(b);
      if (!typed) return b;
      if (typed.refused) {
        refused++;
        console.log(`  kept as HTML (would have lost text): ${path.basename(file)} -> ${typed.refused}`);
        return b;
      }
      counts[typed.type] = (counts[typed.type] || 0) + 1;
      dirty = true;
      changed++;
      return typed;
    });

    if (dirty) {
      touched.push(path.relative(ROOT, file));
      if (write) fs.writeFileSync(file, contentFile(front));
    }
  }

  console.log(`\nBlocks retyped:  ${changed}`);
  Object.entries(counts).sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${String(n).padStart(5)}  ${t}`));
  if (refused) console.log(`Left alone:      ${refused} (conversion would have lost text)`);
  console.log(`Files affected:  ${touched.length}`);
  touched.forEach((f) => console.log('  ' + f));
  if (!write) console.log('\nNothing written. Re-run with --write to apply.');
}

main();
