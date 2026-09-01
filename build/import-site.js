// Import any HTML site into editable content.
//
//   node build/import-site.js <folder-of-html> [--out content-imported] [--dry]
//
// This is the piece that makes the kit resell. Everything else here was built
// for one charity's WordPress export; this reads plain HTML, which is what you
// actually get from a client — a scrape, a static export, a folder someone
// emailed you. It produces the same typed blocks the editor already knows how
// to edit and the build already knows how to render.
//
// The hard part is not parsing HTML. It is telling a page's content from its
// chrome, because nothing in the markup reliably says which is which: plenty of
// sites have no <main>, and half the world's navigation lives in a <div>.
//
// So it does not guess from tag names alone. Chrome is the stuff that repeats:
// the header, the nav, the footer, the cookie line are identical on every page,
// and the content is what differs. Comparing pages against each other finds the
// boundary far more reliably than any single-page heuristic, and it costs one
// extra pass.
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');
const { split } = require('./lib/blocks');
const { renderBlocks } = require('./lib/torender');
const { toText } = require('./lib/clean');

const REPEAT_THRESHOLD = 0.6;   // on 60%+ of pages, it is furniture
const MIN_PAGES_TO_COMPARE = 4; // below this, cross-page comparison is noise
const STRIP = 'script, style, noscript, template, svg, iframe[src*="analytics"]';

const letters = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.x?html?$/i.test(entry.name)) out.push(full);
  }
  return out;
}

// A stable signature for a block of markup, so the same nav on two pages looks
// the same even when a class or an active state differs.
function signature(el) {
  const text = letters(el.text).slice(0, 220);
  return text.length < 12 ? null : `${(el.rawTagName || '').toLowerCase()}:${text}`;
}

function candidates(root) {
  const body = root.querySelector('body') || root;
  const out = [];
  const visit = (el, depth) => {
    if (depth > 6) return;
    for (const child of el.childNodes) {
      if (child.nodeType !== 1) continue;
      out.push(child);
      visit(child, depth + 1);
    }
  };
  visit(body, 0);
  return out;
}

function learnBoilerplate(docs) {
  const counts = new Map();
  for (const doc of docs) {
    const seen = new Set();
    for (const el of candidates(doc.root)) {
      const sig = signature(el);
      if (sig) seen.add(sig);
    }
    for (const sig of seen) counts.set(sig, (counts.get(sig) || 0) + 1);
  }
  const boiler = new Set();
  const limit = Math.max(2, Math.ceil(docs.length * REPEAT_THRESHOLD));
  for (const [sig, n] of counts) if (n >= limit) boiler.add(sig);
  return boiler;
}

// Prefer what the page declares. Fall back to the densest block of prose that
// is not furniture — which is what a reader would call the article.
function extractContent(root, boiler) {
  for (const sel of ['main', 'article', '[role="main"]', '#content', '.content', '#main']) {
    const el = root.querySelector(sel);
    if (el && letters(el.text).length > 120) return el;
  }

  let best = null;
  let bestScore = 0;
  for (const el of candidates(root)) {
    const tag = (el.rawTagName || '').toLowerCase();
    if (['nav', 'header', 'footer', 'aside', 'form'].includes(tag)) continue;
    const sig = signature(el);
    if (sig && boiler.has(sig)) continue;
    const own = letters(el.text).length;
    if (own < 200) continue;
    // Favour text over link soup: a nav has many links and little prose.
    const links = el.querySelectorAll('a').length;
    const score = own / (1 + links * 40);
    if (score > bestScore) { bestScore = score; best = el; }
  }
  return best || root.querySelector('body') || root;
}

// Descend to where the blocks actually live.
//
// Finding <main> is only half the job: inside it sits a stack of layout
// wrappers — a section, a wrap, a column — and the paragraphs are several
// levels below. Splitting at the wrapper types the whole page as one lump of
// raw HTML, which is exactly the block a client cannot edit.
//
// So walk down to the element whose own children are mostly content:
// paragraphs, headings, lists, figures. That is what a person would point at
// and call the article.
const CONTENT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol',
  'blockquote', 'figure', 'img', 'table', 'pre', 'details', 'hr']);

function contentScore(el) {
  let content = 0;
  let other = 0;
  for (const child of el.childNodes) {
    if (child.nodeType !== 1) continue;
    const tag = (child.rawTagName || '').toLowerCase();
    if (CONTENT_TAGS.has(tag)) content += 1;
    else other += 1;
  }
  return { content, other };
}

function descendToBlocks(el) {
  let best = el;
  let bestCount = contentScore(el).content;
  const visit = (node, depth) => {
    if (depth > 8) return;
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      const tag = (child.rawTagName || '').toLowerCase();
      if (CONTENT_TAGS.has(tag)) continue;
      const { content } = contentScore(child);
      // Strictly more content children wins, so the deepest genuine
      // container is chosen over the wrapper that merely contains it.
      if (content > bestCount) { bestCount = content; best = child; }
      visit(child, depth + 1);
    }
  };
  visit(el, 0);
  return best;
}
// The status regions a form needs — the thank-you and the did-not-send — are
// drawn by the renderer, so a page this kit built once already has them sitting
// inline. Import them again and every message appears twice.
//
// Reading the form itself is the splitter's job, not this file's: the form
// component carries its own recogniser, so a <form> arrives here already typed.
// All that is left is the furniture around it, which only a page built by this
// kit will have.
const REDRAWN = /form__(done|error)/;

function tidyFormFurniture(blocks) {
  if (!blocks.some((b) => b.type === 'form')) return blocks;

  // The thank-you is the one part of those regions the page wrote for itself,
  // so it moves into the form rather than being dropped with the markup that
  // held it. The did-not-send line is the renderer's own and comes back on its
  // own; the integrity check is what proves both claims, because it compares
  // the source against the rendered blocks rather than the stored ones.
  const done = blocks.find((b) => b.type === 'html' && /form__done/.test(String(b.html || '')));
  if (done) {
    const message = toText(String(done.html)).replace(/\s+/g, ' ').trim();
    for (const b of blocks) if (b.type === 'form' && !b.success && message) b.success = message;
  }

  return blocks.filter((b) => !(b.type === 'html' && REDRAWN.test(String(b.html || ''))));
}


// Remove the furniture that survived inside the content element.
function stripBoilerplate(el, boiler) {
  const clone = el.clone();
  clone.querySelectorAll(STRIP).forEach((n) => n.remove());
  for (const child of clone.querySelectorAll('*')) {
    const tag = (child.rawTagName || '').toLowerCase();
    if (['nav', 'header', 'footer'].includes(tag)) { child.remove(); continue; }
    const sig = signature(child);
    if (sig && boiler.has(sig)) child.remove();
  }
  return clone;
}

function urlFor(file, root) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const url = '/' + rel.replace(/index\.x?html?$/i, '').replace(/\.x?html?$/i, '/');
  return url.replace(/\/+/g, '/');
}

// Quote strings, but leave the types YAML already understands alone. The
// editor's tick box reads its value back out of this file, and it does not
// accept the string "true".
function yamlString(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return JSON.stringify(String(v == null ? '' : v));
}

function toYaml(front) {
  const lines = [];
  for (const [k, v] of Object.entries(front)) {
    if (v == null || v === '') continue;
    if (k === 'sections') continue;
    lines.push(`${k}: ${yamlString(v)}`);
  }
  lines.push('sections:');
  for (const b of front.sections) {
    const entries = Object.entries(b).filter(([, v]) => v != null && v !== '');
    lines.push(`  - type: ${yamlString(b.type)}`);
    for (const [k, v] of entries) {
      if (k === 'type') continue;
      if (Array.isArray(v)) {
        lines.push(`    ${k}:`);
        for (const item of v) {
          if (item && typeof item === 'object') {
            const inner = Object.entries(item).filter(([, x]) => x != null && x !== '');
            lines.push(`      - ${inner.map(([ik, iv], n) => (n === 0 ? '' : '        ') + `${ik}: ${yamlString(iv)}`).join('\n')}`);
          } else lines.push(`      - ${yamlString(item)}`);
        }
      } else if (typeof v === 'string' && v.includes('\n')) {
        lines.push(`    ${k}: |-`);
        v.split('\n').forEach((l) => lines.push(l ? `      ${l}` : ''));
      } else {
        lines.push(`    ${k}: ${yamlString(v)}`);
      }
    }
  }
  return lines.join('\n');
}

// The same promise the WordPress migration made: every letter of the source has
// to survive, in order, or the page is reported rather than written. A
// conversion that loses a sentence is worse than one that fails.
//
// It measures the rendered blocks rather than the stored ones, because the
// question a client cares about is whether the page still says everything the
// old page said — not whether the words are sitting in a field somewhere. That
// also catches a block whose text the renderer quietly ignores.
function integrity(sourceHtml, blocks) {
  const want = letters(toText(sourceHtml));
  const got = letters(toText(renderBlocks(blocks)));
  let j = 0;
  for (let i = 0; i < want.length; i++) {
    const at = got.indexOf(want[i], j);
    if (at < 0) {
      const src = toText(sourceHtml);
      const approx = Math.round((i / want.length) * src.length);
      return src.slice(Math.max(0, approx - 50), approx + 50).replace(/\s+/g, ' ').trim();
    }
    j = at + 1;
  }
  return null;
}

// One file per page, named after the page — except that a site of any size has
// /about/team/ and /trustees/team/, and both want to be team.md. Overwriting
// the first with the second would lose a whole page without a word about it,
// so a clash walks back up the URL until the name is its own.
function fileNameFor(url, taken) {
  const parts = url.split('/').filter(Boolean).map((part) => part.toLowerCase());
  if (!parts.length) return 'home';
  let slug = parts[parts.length - 1];
  for (let k = parts.length - 2; k >= 0 && taken.has(slug); k--) {
    slug = parts[k] + '-' + slug;
  }
  let unique = slug;
  for (let n = 2; taken.has(unique); n++) unique = slug + '-' + n;
  taken.add(unique);
  return unique;
}

function main() {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--'));
  const outArg = args.indexOf('--out');
  const out = outArg > -1 ? args[outArg + 1] : 'content-imported';
  const dry = args.includes('--dry');

  if (!src || !fs.existsSync(src)) {
    console.error('usage: node build/import-site.js <folder-of-html> [--out DIR] [--dry]');
    process.exit(2);
  }

  const files = walk(src);
  if (!files.length) { console.error('No HTML found in ' + src); process.exit(1); }
  console.log(`Reading ${files.length} HTML file(s) from ${src}`);

  const docs = files.map((file) => ({
    file,
    root: parse(fs.readFileSync(file, 'utf8')),
  }));

  const boiler = files.length >= MIN_PAGES_TO_COMPARE ? learnBoilerplate(docs) : new Set();
  console.log(`Recognised ${boiler.size} repeated block(s) as page furniture`);

  let written = 0;
  let failed = 0;
  const counts = {};
  const taken = new Set();
  const problems = [];

  for (const doc of docs) {
    const titleEl = doc.root.querySelector('h1') || doc.root.querySelector('title');
    const title = titleEl ? titleEl.text.trim() : path.basename(doc.file, path.extname(doc.file));

    const content = stripBoilerplate(descendToBlocks(extractContent(doc.root, boiler)), boiler);
    // The page's own <h1> becomes the title, so it is not repeated in the body.
    const h1 = content.querySelector('h1');
    if (h1 && h1.text.trim() === title) h1.remove();

    const html = content.innerHTML;
    if (letters(toText(html)).length < 40) { problems.push(`${doc.file}: almost no content found`); failed++; continue; }

    const blocks = tidyFormFurniture(split(html));
    const lost = integrity(html, blocks);
    if (lost) { problems.push(`${doc.file}: lost text near "...${lost}..."`); failed++; continue; }
    blocks.forEach((b) => { counts[b.type] = (counts[b.type] || 0) + 1; });

    const url = urlFor(doc.file, src);
    const slug = fileNameFor(url, taken);
    const front = { title, url, date: '', sections: blocks };

    if (!dry) {
      const dest = path.join(out, 'pages', `${slug}.md`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, `---\n${toYaml(front)}\n---\n`);
    }
    written++;
  }

  console.log(`\nPages converted:      ${written}`);
  console.log(`Could not convert:    ${failed}`);
  if (!dry) console.log(`Written to:           ${out}/pages/`);
  console.log('\nBlocks by component type:');
  Object.entries(counts).sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${String(n).padStart(5)}  ${t}`));

  if (problems.length) {
    console.log(`\nNeeds a look (${problems.length}):`);
    problems.slice(0, 15).forEach((p) => console.log('  ' + p));
    if (problems.length > 15) console.log(`  ...and ${problems.length - 15} more`);
  }
}

main();
