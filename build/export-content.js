// Export the site's content as editable files.
//
//   node build/export-content.js
//
// This is the step that frees a site from the CMS it was built in. Content
// stops being rows in someone's database and becomes files in the repo, which
// is what a git-based editor (Sveltia, Decap) reads and writes: the client
// edits, the edit is a commit, the commit rebuilds the site.
//
// Each page is written as a list of typed blocks rather than one lump of HTML,
// because a lump can only ever be edited as a lump. As blocks it becomes a list
// of components the client can reorder, duplicate and add to from a menu.
//
// Every file is checked against the source, letter by letter, before it is
// written. A conversion that loses anything fails the run rather than shipping.
const fs = require('fs');
const path = require('path');
const model = require('./lib/model');
const { split } = require('./lib/blocks');
const { toText } = require('./lib/clean');

const OUT = path.join(__dirname, '..', 'content');

/* --- YAML ---------------------------------------------------------------- */
// Small enough to write by hand: the shapes here are strings, numbers, lists
// and plain objects. JSON's string escaping is a valid YAML double-quoted
// scalar, and anything multi-line uses a literal block so Markdown stays
// readable in the file instead of becoming one long escaped line.
function scalar(v, indent) {
  if (v == null || v === '') return '""';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (!s.includes('\n')) return JSON.stringify(s);
  const pad = ' '.repeat(indent + 2);
  return `|-\n${s.split('\n').map((l) => (l ? pad + l : '')).join('\n')}`;
}

function yamlValue(v, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return ' []';
    return '\n' + v.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return `${pad}  - ` + yamlObject(item, indent + 4).replace(/^\s+/, '');
      }
      return `${pad}  - ${scalar(item, indent + 4)}`;
    }).join('\n');
  }
  if (v && typeof v === 'object') return '\n' + yamlObject(v, indent + 2);
  return ' ' + scalar(v, indent);
}

function yamlObject(obj, indent) {
  const pad = ' '.repeat(indent);
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${pad}${k}:${yamlValue(v, indent)}`)
    .join('\n');
}

/* --- integrity ------------------------------------------------------------ */
// Compare at the level of letters, not words. Markdown puts syntax inside
// words -- METUPU<strong>K</strong> becomes METUPU**K**, which is correct and
// renders identically -- so a word comparison reports a loss that is not there.
// Reduced to a stream of letters and digits, the source must appear in the
// conversion as a subsequence: insertions (a link's URL) are allowed, a
// deletion is not.
const letters = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function blockText(b) {
  const walk = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(walk).join(' ');
    if (typeof v === 'object') return Object.values(v).map(walk).join(' ');
    return String(v);
  };
  return Object.entries(b).filter(([k]) => k !== 'type').map(([, v]) => walk(v)).join(' ');
}

// Twenty years of copy-and-paste leaves debris. One post carried a literal
// U+0002 through from WordPress, and YAML refuses to parse a stream containing
// control characters — so that file could not be opened by any standard parser,
// which means the CMS could not have opened it either. Invisible, unprintable,
// and load-bearing enough to break a client's editor on the one page they
// wanted to change. Stripped on the way out, so every future import is covered.
// Tab, newline and carriage return are kept; they are real formatting.
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitise(value) {
  if (typeof value === 'string') return value.replace(CONTROL, '');
  if (Array.isArray(value)) return value.map(sanitise);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitise(v);
    return out;
  }
  return value;
}

function checkIntegrity(originalHtml, blocks) {
  const want = letters(toText(originalHtml));
  const got = letters(toText(blocks.map(blockText).join(' ')));
  let j = 0;
  for (let i = 0; i < want.length; i++) {
    const at = got.indexOf(want[i], j);
    if (at < 0) {
      const src = toText(originalHtml);
      const approx = Math.round((i / want.length) * src.length);
      return src.slice(Math.max(0, approx - 45), approx + 45).trim();
    }
    j = at + 1;
  }
  return null;
}

/* --- export --------------------------------------------------------------- */
function main() {
  const m = model.build();
  const slugOf = new Map(m.pages.map((p) => [p.id, p.slug]));
  const catOf = new Map((m.categories || []).map((c) => [c.id, c.slug || c.name]));

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'posts'), { recursive: true });

  let written = 0, failed = 0;
  const counts = {};
  const problems = [];

  for (const doc of [...m.pages, ...m.posts]) {
    if (doc.url === '/') continue; // the homepage is composed, not authored
    const blocks = split(doc.html);

    const lost = checkIntegrity(doc.html, blocks);
    if (lost) {
      failed++;
      problems.push(`${doc.url}\n        near: ...${lost}...`);
      continue;
    }
    blocks.forEach((b) => { counts[b.type] = (counts[b.type] || 0) + 1; });

    const front = { title: doc.title, url: doc.url, date: doc.date || '' };
    if (doc.modified) front.modified = doc.modified;
    if (doc.image) { front.image = doc.image; front.imageAlt = doc.imageAlt || ''; }
    // WordPress lets an author write a summary by hand rather than take the
    // opening of the body. Where they did, it is content and has to travel:
    // 41 pages carry one, and without it their standfirst silently changes to
    // the first two lines of the page. Where the excerpt is only a restatement
    // of the body, it is left out — the model derives that anyway, and a
    // redundant field is one more thing for a client to wonder about.
    const derived = model.summarise(doc.text, 200);
    if (doc.excerpt && doc.excerpt !== derived) front.excerpt = doc.excerpt;
    if (doc.kind === 'page') {
      const parent = doc.parent ? slugOf.get(doc.parent) : null;
      if (parent) front.parent = parent;
      if (doc.order) front.order = doc.order;
    } else {
      // The model hands back whole category objects, not ids. Mapping them
      // through the id lookup returned undefined for every post, so all 228
      // exported without a single category and the twenty-one topic filters
      // would have emptied the moment the build started reading these files.
      // Nothing failed and nothing warned: the frontmatter key was simply
      // absent. Accept either shape so it cannot silently regress again.
      const cats = (doc.categories || [])
        .map((c) => (c && typeof c === 'object' ? c.slug || c.name : catOf.get(c)))
        .filter(Boolean);
      if (cats.length) front.categories = cats;
    }
    front.sections = sanitise(blocks);

    const dir = doc.kind === 'page' ? 'pages' : 'posts';
    const name = doc.kind === 'page'
      ? `${doc.slug}.md`
      : `${(doc.date || '').slice(0, 10)}-${doc.slug}.md`;
    fs.writeFileSync(path.join(OUT, dir, name), `---\n${yamlObject(front, 0)}\n---\n`);
    written++;
  }

  // A category's display name cannot be recovered from its slug —
  // "living-with-mbc" is not "Living with MBC" — so the names are written out
  // beside the content. Without this the content directory would still depend
  // on the scrape to label its own topic pages, and a directory that cannot
  // rebuild the site on its own is not really the source of truth.
  const cats = (m.categories || [])
    .filter((c) => c.slug !== 'uncategorized')
    .sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(
    path.join(OUT, 'categories.yml'),
    '# Topic names, written by the export. Slug is the identity; name is what\n'
    + '# readers see. Edit a name here and every topic page follows.\n'
    + cats.map((c) => `${c.slug}: ${JSON.stringify(c.name)}`).join('\n') + '\n'
  );

  console.log(`Files written:        ${written}`);
  console.log(`Categories written:   ${cats.length}`);
  console.log(`Conversions rejected: ${failed}`);
  console.log('\nBlocks by component type:');
  Object.entries(counts).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
  if (problems.length) {
    console.log('\nRejected:');
    problems.slice(0, 8).forEach((p) => console.log('  ' + p));
  }
  process.exitCode = failed ? 1 : 0;
}

main();
