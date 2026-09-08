// Give migrated images the srcset WordPress used to give them.
//
// The export kept <img srcset> on about a thousand images and lost it on three
// hundred more. Those three hundred send one file at whatever size it happens
// to be: a photo taken on a phone in 2020 arrives as 1536x2048 and 877KB to
// fill a 780px column. Nobody notices on a desk. On a train, on data, it is
// most of the page.
//
// So: for every <img> under /media/ with no srcset, look for the renditions
// WordPress already made (stem-WxH.webp, sitting unused on disk), and where
// none are small enough, make them. Then write the srcset the markup should
// have had. Pixels of the original are never touched, and nothing is deleted.
//
// Runs after to-webp.js, over dist.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = 'dist';
const COLUMN = 780;                       // .prose measure at desktop
const SIZES = '(min-width: 1024px) 780px, 100vw';
const WIDTHS = [390, 780, 1200];          // 1x and 2x of the column, plus a phone
const MIN_SOURCE = 900;                   // below this a single file is already fine

const htmlFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'media') walk(p); }
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(OUT);

const meta = new Map();
const sizeOf = async (rel) => {
  if (meta.has(rel)) return meta.get(rel);
  let v = null;
  try { const m = await sharp(path.join(OUT, rel)); const d = await m.metadata(); v = { w: d.width, h: d.height }; }
  catch { v = null; }
  meta.set(rel, v);
  return v;
};

// Renditions WordPress already made: same stem, explicit -WxH, same shape.
const siblings = async (rel, base) => {
  const dir = path.dirname(rel);
  const stem = path.basename(rel).replace(/\.[^.]+$/, '');
  let entries;
  try { entries = fs.readdirSync(path.join(OUT, dir)); } catch { return []; }
  const ratio = base.w / base.h;
  const found = [];
  for (const name of entries) {
    const m = name.match(/^(.+)-(\d+)x(\d+)\.webp$/);
    if (!m || m[1] !== stem.replace(/-\d+x\d+$/, '')) continue;
    const w = +m[2], h = +m[3];
    if (w >= base.w) continue;
    if (Math.abs(w / h - ratio) > 0.02) continue;   // a different crop, not a rendition
    found.push({ rel: dir + '/' + name, w });
  }
  return found;
};

let made = 0;
const derive = async (rel, base, want) => {
  const dir = path.dirname(rel);
  const stem = path.basename(rel).replace(/\.[^.]+$/, '');
  const h = Math.round(want * base.h / base.w);
  const out = `${dir}/${stem}-${want}x${h}.webp`;
  if (!fs.existsSync(path.join(OUT, out))) {
    await sharp(path.join(OUT, rel)).resize(want).webp({ quality: 80, effort: 4 })
      .toFile(path.join(OUT, out));
    made++;
  }
  return { rel: out, w: want };
};

(async () => {
  let touched = 0, imgs = 0;
  for (const file of htmlFiles) {
    const before = fs.readFileSync(file, 'utf8');
    const tags = before.match(/<img[^>]*>/g) || [];
    let after = before;

    for (const tag of tags) {
      if (/srcset=/.test(tag)) continue;
      const src = (tag.match(/src="(\/media\/[^"]+\.(?:webp|jpe?g|png))"/i) || [])[1];
      if (!src) continue;
      const rel = src.slice(1);
      if (!fs.existsSync(path.join(OUT, rel))) continue;

      const base = await sizeOf(rel);
      if (!base || base.w < MIN_SOURCE) continue;

      const have = await siblings(rel, base);
      const set = [];
      for (const want of WIDTHS) {
        if (want >= base.w) continue;
        const near = have.filter((c) => Math.abs(c.w - want) <= want * 0.12)
          .sort((a, b) => Math.abs(a.w - want) - Math.abs(b.w - want))[0];
        set.push(near || await derive(rel, base, want));
      }
      if (!set.length) continue;
      set.push({ rel, w: base.w });

      const seen = new Set();
      const srcset = set
        .filter((c) => !seen.has(c.w) && seen.add(c.w))
        .sort((a, b) => a.w - b.w)
        .map((c) => `/${c.rel} ${c.w}w`)
        .join(', ');

      // Serve the column size by default so a browser without srcset is fine too.
      const fallback = set.slice().sort((a, b) =>
        Math.abs(a.w - COLUMN) - Math.abs(b.w - COLUMN))[0];

      const next = tag
        .replace(/src="[^"]*"/, `src="/${fallback.rel}"`)
        .replace(/<img/, `<img srcset="${srcset}" sizes="${SIZES}"`);
      after = after.split(tag).join(next);
      imgs++;
    }

    if (after !== before) { fs.writeFileSync(file, after); touched++; }
  }

  // Some references name a file the export never produced. The share image on
  // /2023/11/... points at kat-southwell-...jpg; what exists is ten renditions
  // of it and no original. A broken og:image is invisible on the site and
  // costs the charity a picture every time the page is shared, so where a
  // rendition of the same photo exists, point at the largest one.
  let repaired = 0;
  const renditionFor = (rel) => {
    const dir = path.dirname(rel);
    const stem = path.basename(rel).replace(/\.[^.]+$/, '').replace(/-\d+x\d+$/, '');
    let names;
    try { names = fs.readdirSync(path.join(OUT, dir)); } catch { return null; }
    const best = names
      .map((n) => {
        const m = n.match(/^(.+)-(\d+)x(\d+)\.webp$/);
        return m && m[1] === stem ? { n, w: +m[2] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.w - a.w)[0];
    return best ? `${dir}/${best.n}` : null;
  };

  const listed = new Map();
  const present = (rel) => {
    const full = path.join(OUT, rel);
    const dir = path.dirname(full);
    if (!listed.has(dir)) {
      let names = [];
      try { names = fs.readdirSync(dir); } catch { /* nothing there */ }
      listed.set(dir, new Set(names));
    }
    return listed.get(dir).has(path.basename(full));
  };

  for (const file of htmlFiles) {
    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    for (const m of before.matchAll(/"(https:\/\/metupuk\.org\.uk)?(\/media\/[^"]+)"/g)) {
      const rel = decodeURIComponent(m[2]).slice(1);
      if (present(rel)) continue;
      const fixed = renditionFor(rel);
      if (!fixed) continue;
      after = after.split(m[2]).join('/' + fixed);
      repaired++;
    }
    if (after !== before) fs.writeFileSync(file, after);
  }
  if (repaired) console.log(`  ${repaired} references repointed at a rendition that exists`);
  console.log(`  ${imgs} images given a srcset across ${touched} pages, ${made} renditions made`);
})();
