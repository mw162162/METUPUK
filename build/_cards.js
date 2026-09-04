// A portrait on a card whose heading is already that person's name is the same
// case as the site logo beside the wordmark: a screen reader would announce the
// name, then the picture, then the name again. Decorative is the correct answer,
// and saying so out loud is what separates it from a description nobody wrote.
const fs = require('fs'), path = require('path'), yaml = require('js-yaml');
const { fromDisk } = require('./lib/yaml-out');
const { contentFile } = require('./lib/yaml-out');
const write = process.argv.includes('--write');
let marked = 0; const touched = [];
for (const dir of ['pages', 'posts']) {
  for (const n of fs.readdirSync(path.join('content', dir))) {
    if (!n.endsWith('.md')) continue;
    const file = path.join('content', dir, n);
    const raw = fs.readFileSync(file, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    let fm; try { fm = fromDisk(yaml.load(m[1])); } catch { continue; }
    if (!fm || !Array.isArray(fm.sections)) continue;
    let dirty = false;
    for (const b of fm.sections) {
      if (!b || b.type !== 'card' || !b.image || b.imageAlt) continue;
      const heading = String(b.heading || '').trim();
      if (!/^[A-Z][a-z]+( [A-Z][a-z']+)+$/.test(heading)) continue;
      b.imageAlt = '';
      b.imageDecorative = true;
      marked++; dirty = true;
    }
    if (dirty) { touched.push(file); if (write) fs.writeFileSync(file, contentFile(fm)); }
  }
}
console.log('  portraits declared decorative: ' + marked + ' across ' + touched.length + ' file(s)');
touched.forEach((f) => console.log('    ' + f));
if (!write) console.log('  (dry run — pass --write to apply)');
