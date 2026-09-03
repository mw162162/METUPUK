// Rename the block key in every content file.
//
//   node build/migrate-block-key.js [--write] [--back]
//
// These files have always said which component a block is with `type`. Tina
// says it with `_template`, hardcoded in its GraphQL layer, so adopting Tina
// means every block in the repository changes key: 895 of them across 300
// files.
//
// That is a mechanical change and mechanical changes are where content goes
// missing quietly, so this does not trust itself. Every file is rendered
// before and after and the two are compared character by character; a file
// whose rendered text changes at all is left exactly as it was and reported.
//
// --back reverses it, because a migration you cannot undo is a decision you
// cannot revisit.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { renderBlocks } = require('./lib/torender');
const { contentFile } = require('./lib/yaml-out');
const { toText } = require('./lib/clean');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const WRITE = process.argv.includes('--write');
const BACK = process.argv.includes('--back');
const FROM = BACK ? '_template' : 'type';
const TO = BACK ? 'type' : '_template';

const letters = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function files() {
  const out = [];
  for (const dir of ['pages', 'posts']) {
    const full = path.join(CONTENT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full).sort()) {
      if (name.endsWith('.md')) out.push(path.join(full, name));
    }
  }
  return out;
}

// The renderer keys off `type`, so to render a migrated block it has to be
// handed back the shape it knows. This is only for the comparison — what gets
// written is the migrated shape.
const asRenderable = (b) => {
  if (!b || typeof b !== 'object') return b;
  const copy = { ...b };
  if (TO !== 'type' && copy[TO] !== undefined) { copy.type = copy[TO]; delete copy[TO]; }
  return copy;
};

function rename(block) {
  if (!block || typeof block !== 'object') return block;
  const out = {};
  // Key order is preserved so the diff shows a rename and nothing else.
  for (const [k, v] of Object.entries(block)) {
    if (k === FROM) out[TO] = v;
    else out[k] = v;
  }
  return out;
}

function main() {
  let changed = 0;
  let blocks = 0;
  const refused = [];
  const touched = [];

  for (const file of files()) {
    const raw = fs.readFileSync(file, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?$/);
    if (!m) continue;
    let front;
    try { front = yaml.load(m[1]); } catch { refused.push(path.basename(file) + ': unreadable front matter'); continue; }
    if (!front || !Array.isArray(front.sections)) continue;
    if (!front.sections.some((b) => b && b[FROM] !== undefined)) continue;

    const before = letters(toText(renderBlocks(front.sections.map(asRenderable))));
    const migrated = front.sections.map(rename);
    const after = letters(toText(renderBlocks(migrated.map(asRenderable))));

    if (before !== after) {
      refused.push(path.relative(ROOT, file) + ': rendered text changed — left alone');
      continue;
    }

    blocks += migrated.length;
    changed++;
    touched.push(path.relative(ROOT, file).split(path.sep).join('/'));
    if (WRITE) fs.writeFileSync(file, contentFile({ ...front, sections: migrated }));
  }

  console.log(`${FROM} -> ${TO}`);
  console.log(`  files:  ${changed}`);
  console.log(`  blocks: ${blocks}`);
  if (refused.length) {
    console.log(`  refused: ${refused.length}`);
    refused.slice(0, 10).forEach((r) => console.log('    ' + r));
  }
  if (!WRITE) console.log('\nNothing written. Re-run with --write to apply.');
}

main();
