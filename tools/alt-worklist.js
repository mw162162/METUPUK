// Build the alt-text worklist.
//
//   node tools/alt-worklist.js [--out alt-text-worklist.md]
//
// 227 photographs on this site have no description. That is not a number
// anybody can act on: it does not say which pictures, where they are, or what
// is around them. Writing 227 descriptions means opening 227 pages and
// scrolling to find the picture, which is why it never gets done.
//
// So this collects each one with the context needed to describe it without
// opening anything: the page it sits on, the words immediately around it, and
// the exact file and section number to edit. Grouped by page, because the
// efficient way to do this is one page at a time in the editor.
//
// Where the context makes the answer near-certain — a portrait that is the
// only picture on a page named after a person — it drafts a description. That
// is a starting point to check, not an answer: it can only see the file name
// and the words nearby, and it cannot see the photograph.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');

const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = outArg > -1 ? args[outArg + 1] : 'alt-text-worklist.md';

const strip = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#?\w+;/g, ' ')
  .replace(/[*_#>[\]()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

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

// The words on either side of a picture are usually what it is of. A caption
// beats both, so it is taken first where there is one.
function nearby(sections, index) {
  const text = (b) => {
    if (!b) return '';
    if (b.type === 'prose') return strip(b.body);
    if (b.type === 'card') return strip(b.heading || b.body);
    if (b.type === 'quote') return strip(b.text);
    if (b.type === 'disclosure') return strip(b.summary);
    return '';
  };
  const before = text(sections[index - 1]);
  const after = text(sections[index + 1]);
  const pick = before || after;
  return pick ? pick.slice(0, 180) : '';
}

// A file name is a weak signal but not a useless one: these were uploaded by
// people who named them after what they show.
function fromFilename(src) {
  const base = path.basename(src).replace(/\.[a-z0-9]+$/i, '');
  return strip(base
    .replace(/[-_]/g, ' ')
    .replace(/\b\d{2,4}x\d{2,4}\b/g, ' ')
    .replace(/\bscaled\b|\be\d{6,}\b|\bimg\b|\bimage\b|\bdsc\b/gi, ' ')
    .replace(/\b\d{6,}\b/g, ' '));
}

function draft(title, src, context) {
  const name = fromFilename(src);
  // A page named after a person, carrying a picture named after the same
  // person, is a portrait of that person. Anything less certain gets nothing,
  // because a wrong description is worse than a missing one — it tells
  // somebody the picture is something it is not.
  const looksLikeName = /^[A-Z][a-z]+(?: [A-Z][a-z']+){1,2}$/.test(title.trim());
  const nameWords = name.toLowerCase().split(' ').filter(Boolean);
  const titleWords = title.toLowerCase().split(' ').filter(Boolean);
  const overlap = nameWords.filter((w) => w.length > 2 && titleWords.includes(w)).length;
  if (looksLikeName && overlap >= 1) return `${title.trim()}`;
  if (/infographic|graphic|chart|poster|slide/i.test(name + ' ' + context)) {
    return '(an infographic — describe what it says, not that it is a graphic)';
  }
  return '';
}

function main() {
  const byFile = [];
  let total = 0;
  const distinct = new Set();

  for (const file of files()) {
    const raw = fs.readFileSync(file, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    let front;
    try { front = yaml.load(m[1]); } catch { continue; }
    if (!front) continue;

    const title = String(front.title || path.basename(file, '.md'));
    const items = [];

    // The banner, which is the picture most people see first.
    if (front.image && !front.imageAlt) {
      items.push({ where: 'Banner image', field: 'imageAlt', src: front.image, context: '' });
    }

    const sections = Array.isArray(front.sections) ? front.sections : [];
    sections.forEach((b, i) => {
      if (!b) return;
      if (b.type === 'image' && b.src && !b.alt && b.decorative !== true) {
        items.push({ where: `Section ${i + 1}`, field: 'alt', src: b.src, context: b.caption ? strip(b.caption) : nearby(sections, i) });
      }
      if (b.type === 'card' && b.image && !b.imageAlt) {
        items.push({ where: `Section ${i + 1} (card)`, field: 'imageAlt', src: b.image, context: strip(b.heading) });
      }
      if (b.type === 'gallery' && Array.isArray(b.images)) {
        b.images.forEach((im, k) => {
          if (im && im.src && !im.alt) {
            items.push({ where: `Section ${i + 1}, picture ${k + 1}`, field: 'alt', src: im.src, context: nearby(sections, i) });
          }
        });
      }
      // Most of them are here: <img> tags sitting inside a block of prose,
      // carried over from WordPress. They are the awkward ones, because the
      // description goes inside the text rather than into a field of its own —
      // so the row says which tag, and the words around it come from the same
      // block rather than from the neighbouring section.
      const body = String(b.body || b.html || '');
      if (body) {
        const tags = [...body.matchAll(/<img[^>]*>/g)];
        tags.forEach((match, k) => {
          const tag = match[0];
          if (/alt="[^"]+"/.test(tag)) return;
          const srcMatch = tag.match(/src="([^"]+)"/);
          if (!srcMatch) return;
          const around = strip(body.slice(Math.max(0, match.index - 220), match.index)).slice(-180);
          items.push({
            where: `Section ${i + 1}, picture ${k + 1} of ${tags.length} inside the text`,
            field: 'alt="" in the body',
            src: srcMatch[1],
            context: around || nearby(sections, i),
          });
        });
      }
    });

    if (!items.length) continue;
    items.forEach((it) => { total++; distinct.add(it.src); it.draft = draft(title, it.src, it.context); });
    byFile.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), title, url: front.url || '', items });
  }

  const lines = [];
  lines.push('# Alt text worklist');
  lines.push('');
  lines.push(`${total} pictures with no description, across ${byFile.length} pages.`);
  lines.push('');
  lines.push('One page at a time is the quick way: open it in the editor, fill in the');
  lines.push('sections listed, save. Or edit the content file directly — the field name');
  lines.push('and section number are given for each.');
  lines.push('');
  lines.push('**Draft** is a guess from the file name and the words nearby. It has not seen');
  lines.push('the photograph. Check every one.');
  lines.push('');
  lines.push('If a picture genuinely adds nothing a reader would miss, tick **This picture');
  lines.push('is decorative** instead of describing it.');
  lines.push('');
  lines.push('One decision covers a lot of these. A portrait on a card whose heading is');
  lines.push('already that person\'s name — most of the rows under *I Am The 31* — is the');
  lines.push('same case as the site logo: a screen reader would announce the name twice.');
  lines.push('Decorative is the correct answer there, and it clears them in one pass.');
  lines.push('Decide it once, then work down the rest.');
  lines.push('');

  for (const page of byFile) {
    lines.push(`## ${page.title}`);
    lines.push('');
    lines.push(`\`${page.file}\`${page.url ? ` · ${page.url}` : ''} — ${page.items.length} picture${page.items.length === 1 ? '' : 's'}`);
    lines.push('');
    for (const it of page.items) {
      lines.push(`- **${it.where}** · \`${it.field}\``);
      lines.push(`  - \`${it.src}\``);
      if (it.context) lines.push(`  - Nearby: ${it.context}`);
      if (it.draft) lines.push(`  - Draft: **${it.draft}**`);
      lines.push('  - Description: ');
    }
    lines.push('');
  }

  fs.writeFileSync(path.join(ROOT, OUT), lines.join('\n'));
  console.log(`${total} pictures, ${distinct.size} distinct files, across ${byFile.length} pages`);
  console.log(`written to ${OUT}`);
  const drafted = byFile.reduce((n, p) => n + p.items.filter((i) => i.draft).length, 0);
  console.log(`${drafted} have a draft to check; the rest need writing from scratch`);
}

main();
