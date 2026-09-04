// Emit the undescribed pictures as JSON, so they can be looked at.
//
//   node tools/alt-manifest.js > alt.json
//
// The worklist is for a person to read. This is the same sweep in a shape a
// script can act on: every picture still missing a description, with the file
// on disk to open, the content file and section to write back to, and the
// words around it. Written because the honest way to describe a photograph is
// to look at it, and looking at 132 of them needs the list machine-readable.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { fromDisk } = require('../build/lib/yaml-out');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const SOURCES = [path.join(ROOT, 'media'), path.join(ROOT, '_scrape', 'assets')];

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&#?\w+;/g, ' ')
  .replace(/[*_#>[\]()]/g, ' ').replace(/\s+/g, ' ').trim();

// A src is a site path; find the byte on disk it was built from.
function onDisk(src) {
  const rel = String(src).replace(/^\/*/, '').replace(/^media\//, '');
  for (const base of SOURCES) {
    const full = path.join(base, ...rel.split('/'));
    if (fs.existsSync(full)) return full;
  }
  return '';
}

function files() {
  const out = [];
  for (const dir of ['pages', 'posts']) {
    const full = path.join(CONTENT, dir);
    if (!fs.existsSync(full)) continue;
    for (const n of fs.readdirSync(full).sort()) if (n.endsWith('.md')) out.push(path.join(full, n));
  }
  return out;
}

const items = [];
for (const file of files()) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  let front;
  try { front = fromDisk(yaml.load(m[1])); } catch { continue; }
  if (!front) continue;
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const title = String(front.title || '');
  const push = (o) => { const disk = onDisk(o.src); if (disk) items.push({ file: rel, title, disk, ...o }); };

  if (front.image && !front.imageAlt) push({ kind: 'banner', src: front.image, at: -1, context: title });

  const sections = Array.isArray(front.sections) ? front.sections : [];
  sections.forEach((b, i) => {
    if (!b) return;
    const near = strip(sections[i - 1] && (sections[i - 1].body || sections[i - 1].heading))
      || strip(sections[i + 1] && (sections[i + 1].body || sections[i + 1].heading));
    if (b.type === 'image' && b.src && !b.alt && b.decorative !== true) {
      push({ kind: 'image', src: b.src, at: i, context: strip(b.caption) || near.slice(0, 200) });
    }
    if (b.type === 'card' && b.image && !b.imageAlt && b.imageDecorative !== true) {
      push({ kind: 'card', src: b.image, at: i, context: strip(b.heading) });
    }
    if (b.type === 'gallery' && Array.isArray(b.images)) {
      b.images.forEach((im, k) => {
        if (im && im.src && !im.alt) push({ kind: 'gallery', src: im.src, at: i, k, context: near.slice(0, 200) });
      });
    }
    const body = String(b.body || b.html || '');
    if (body) {
      [...body.matchAll(/<img[^>]*>/g)].forEach((mm) => {
        const tag = mm[0];
        if (/alt="[^"]+"/.test(tag)) return;
        const sm = tag.match(/src="([^"]+)"/);
        if (!sm) return;
        push({
          kind: 'inline', src: sm[1], at: i, tag,
          context: strip(body.slice(Math.max(0, mm.index - 260), mm.index)).slice(-200),
        });
      });
    }
  });
}

process.stdout.write(JSON.stringify(items, null, 1));
