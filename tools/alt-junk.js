// Collect the descriptions that are really the file name.
//
//   node tools/_junk-manifest.js > junk.json
//
// WordPress fills the alt field with the upload's file name unless somebody
// types over it. That reads aloud as "I M G underscore one eight eight three"
// or a thirty-two character hex string — worse than silence, because a screen
// reader announces it as though it meant something.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { fromDisk } = require('../build/lib/yaml-out');

const ROOT = path.join(__dirname, '..');
const SOURCES = [path.join(ROOT, 'media'), path.join(ROOT, '_scrape', 'assets')];

const NOISE = [
  /[0-9a-f]{8}/i, /\b\d{2,4}\s*[x×]\s*\d{2,4}\b/i, /\bscaled\b/i, /\bunnamed\b/i,
  /\bimg[\s_-]?\d/i, /\bdsc\b/i, /istock/i, /\bwhatsapp\b/i, /^\W*\d+\W*$/,
  /\bphoto[\s_-]?\d/i, /\bpxl\b/i, /^\w{1,3}[-\s]?\d{3,}/, /\b\d{4}-\d{2}-\d{2}\b/,
];

function onDisk(src) {
  const rel = String(src).replace(/^\/*/, '').replace(/^media\//, '');
  for (const base of SOURCES) {
    const full = path.join(base, ...rel.split('/'));
    if (fs.existsSync(full)) return full;
  }
  return '';
}

const items = [];
for (const d of ['pages', 'posts']) {
  const dir = path.join(ROOT, 'content', d);
  for (const n of fs.readdirSync(dir).sort()) {
    if (!n.endsWith('.md')) continue;
    const file = path.join(dir, n);
    const m = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    let front;
    try { front = fromDisk(yaml.load(m[1])); } catch { continue; }
    const rel = `content/${d}/${n}`;
    const add = (kind, alt, src, at, heading) => {
      if (!alt || !src || !NOISE.some((r) => r.test(alt))) return;
      const disk = onDisk(src);
      if (!disk) return;
      items.push({ file: rel, title: String(front.title || ''), kind, at, src, disk, was: alt, heading: heading || '' });
    };
    add('banner', front.imageAlt, front.image, -1);
    (front.sections || []).forEach((b, i) => {
      if (!b) return;
      if (b.type === 'image') add('image', b.alt, b.src, i);
      if (b.type === 'card') add('card', b.imageAlt, b.image, i, b.heading);
    });
  }
}
process.stdout.write(JSON.stringify(items, null, 1));
