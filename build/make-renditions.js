// Full-width banners need renditions wide enough for a desktop viewport.
// WordPress topped out at 1024px for several of these images, so a 1440px
// browser upscales and the banner looks soft. Generate the missing widths from
// the original upload, once, into the asset cache.
//
//   node build/make-renditions.js [--force]
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); }
catch { console.error('sharp is not installed. Run: npm install sharp'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const SCRAPE = path.join(ROOT, '_scrape');
const ASSETS = path.join(SCRAPE, 'assets');

// A ladder covering every slot the design uses: card (~390px), article hero
// (~780px) and full-bleed banner (~1600px), each at 1x and 2x. Anything wider
// than the original is skipped rather than upscaled — we cannot invent detail.
const TARGETS = [780, 1200, 1440, 1560, 1920];

// A body image is painted into the reading column, not across the window, so
// it wants a shorter ladder: the column at 1x and 2x, the phone at 2x, and one
// step between. 1560 is the ceiling because nothing in prose is ever drawn
// wider than 780 CSS pixels.
const BODY_TARGETS = [390, 780, 1170, 1560];
const FORCE = process.argv.includes('--force');

// A rendition path follows WordPress's own convention so srcset picks it up.
const renditionPath = (originalRel, w, h) =>
  originalRel.replace(/(\.[a-z]+)$/i, `-${w}x${h}$1`);

// Strip WordPress's -WxH suffix to find the original upload.
const toOriginal = (rel) => rel.replace(/-\d+x\d+(\.[a-z]+)$/i, '$1');

function bannerImages() {
  const { build } = require('./lib/model');
  const model = build();
  const used = new Set();

  // Page banners and article heroes — every doc.image is shown large somewhere,
  // as a page banner, a post hero, or a card.
  for (const doc of [...model.pages, ...model.posts]) if (doc.image) used.add(doc.image);
  // Backgrounds referenced directly by the templates.
  used.add('/media/2019/10/4-ladies-in-pink.jpg');
  used.add('/media/2021/10/darker-pink-bg.jpg');

  return [...used]
    .filter((u) => u.startsWith('/media/'))
    .map((u) => toOriginal(u.replace('/media/', '')));
}

// Pictures inside the body of a page that are much wider than the column and
// have no smaller copy to offer. Seventeen of them, each downloaded whole —
// up to 878KB for something painted 780px wide.
//
// Everything else was already covered: for 130 of the 137 oversized body
// images WordPress had made the smaller files years ago and simply never
// referenced them, which build/lib/responsive-inline.js now does. This is the
// remainder, where the smaller file genuinely does not exist yet.
function bodyImages() {
  const { build } = require('./lib/model');
  const { srcsetFor } = require('./lib/srcset');
  const model = build();
  const found = new Set();

  for (const doc of [...model.pages, ...model.posts]) {
    for (const b of doc.sections || []) {
      const body = String((b && (b.body || b.html)) || '');
      if (!body.includes('<img')) continue;
      for (const m of body.matchAll(/<img[^>]*>/g)) {
        const tag = m[0];
        if (/\ssrcset=/.test(tag)) continue;
        const src = (tag.match(/src="([^"]+)"/) || [])[1];
        if (!src || !src.startsWith('/media/')) continue;
        const w = parseInt((tag.match(/width="(\d+)"/) || [])[1], 10);
        if (!(w > 800)) continue;
        // A srcset it can already build needs nothing generating.
        if (srcsetFor(src, { maxWidth: 1560 })) continue;
        found.add(toOriginal(src.replace('/media/', '')));
      }
    }
  }
  return [...found];
}

(async () => {
  const banners = [...new Set(bannerImages())];
  const body = [...new Set(bodyImages())].filter((r) => !banners.includes(r));
  const work = [
    ...banners.map((rel) => ({ rel, targets: TARGETS })),
    ...body.map((rel) => ({ rel, targets: BODY_TARGETS })),
  ];
  const originals = work.map((w) => w.rel);
  let made = 0;
  let skipped = 0;
  let tooSmall = 0;
  const limited = [];

  for (const { rel, targets } of work) {
    const src = path.join(ASSETS, rel);
    if (!fs.existsSync(src)) continue;

    let meta;
    try { meta = await sharp(src).metadata(); } catch { continue; }
    if (!meta.width || !meta.height) continue;
    if (meta.width < 780) limited.push({ rel, w: meta.width });

    for (const width of targets) {
      if (meta.width <= width) { tooSmall++; continue; }
      const height = Math.round((width / meta.width) * meta.height);
      const destRel = renditionPath(rel, width, height);
      const dest = path.join(ASSETS, destRel);
      if (fs.existsSync(dest) && !FORCE) { skipped++; continue; }

      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        let pipeline = sharp(src).resize(width, height, { fit: 'cover' });
        pipeline = /\.png$/i.test(dest)
          ? pipeline.png({ compressionLevel: 9 })
          : pipeline.jpeg({ quality: 84, mozjpeg: true, progressive: true });
        await pipeline.toFile(dest);
        made++;
      } catch (e) {
        console.warn(`  skipped ${destRel}: ${e.message}`);
      }
    }
  }

  console.log(`Renditions: ${made} generated, ${skipped} already present, ` +
    `${tooSmall} target widths skipped across ${originals.length} source images`);
  if (limited.length) {
    console.log(`
${limited.length} originals are smaller than 780px, so they cannot be made sharper:`);
    limited.slice(0, 12).forEach((l) => console.log(`  ${l.rel} (${l.w}px)`));
    if (limited.length > 12) console.log(`  …and ${limited.length - 12} more`);
    console.log('These are low-resolution uploads; only a better original would fix them.');
  }
})();
