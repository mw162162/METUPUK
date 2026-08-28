// The exhibition microsite only ships 220x120 landscape thumbnails, which look
// soft when shown as portraits. The charity's own 1920x1080 campaign cards hold
// the same photographs at full resolution, so crop the portrait out of those.
//
//   node build/make-portraits.js [--force]
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); }
catch { console.error('sharp is not installed. Run: npm install sharp'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const SCRAPE = path.join(ROOT, '_scrape');
const SOURCE_DIR = path.join(SCRAPE, 'assets', '2021', '10');
const OUT_DIR = path.join(SCRAPE, 'assets', 'dsop-portraits');

const { extract } = require('./lib/exhibition');

const FORCE = process.argv.includes('--force');

// Output geometry. The cards are 1920x1080 and carry furniture we must crop
// away: the MET UP UK logo box top-left, the "#DarkerPink" line bottom-left,
// and the pull-quote from just past the middle. The window below sits inside
// all of it while still framing the subject, who is consistently placed around
// 40% of the width.
const SRC_W = 1920;
const SRC_H = 1080;
const CROP_X = 420;   // clear of the logo box and the #DarkerPink line
const CROP_Y = 40;    // a little headroom above the subject
const CROP_W = 645;   // stops short of the quote text
const CROP_H = Math.round(CROP_W * 4 / 3); // 933, keeps the 3:4 shape
const OUT_W = CROP_W;            // native crop width — never upscale
const OUT_H = Math.round(CROP_W * 4 / 3);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');

// Three women are credited differently on the card than in the exhibition list:
// a shortened first name, a stray initial in the filename, and a name change.
const ALIASES = {
  jangreenwood: 'janegreenwood',
  leilaasoko: 'jleilaasoko',
  sarahwalton: 'sarahbarber',
};

function buildSourceIndex() {
  if (!fs.existsSync(SOURCE_DIR)) return new Map();
  const index = new Map();
  for (const file of fs.readdirSync(SOURCE_DIR)) {
    // Originals only — skip WordPress's resized copies.
    const m = file.match(/^FB-1920x1080-\d+\.(.+)\.png$/i);
    if (!m || /-\d+x\d+\.png$/i.test(file)) continue;
    index.set(norm(m[1]), path.join(SOURCE_DIR, file));
  }
  return index;
}

(async () => {
  const { portraits } = extract();
  const sources = buildSourceIndex();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let made = 0;
  let skipped = 0;
  const unmatched = [];

  for (const p of portraits) {
    const key = norm(p.name);
    const src = sources.get(key) || sources.get(ALIASES[key] || '');
    if (!src) { unmatched.push(p.name); continue; }

    const dest = path.join(OUT_DIR, `${p.slug}.jpg`);
    if (fs.existsSync(dest) && !FORCE) { skipped++; continue; }

    try {
      const meta = await sharp(src).metadata();
      // Scale the crop window if a card is not exactly 1920x1080.
      const scale = meta.height / SRC_H;
      const width = Math.min(Math.round(CROP_W * scale), meta.width);
      const height = Math.min(Math.round(CROP_H * scale), meta.height);
      const left = Math.max(0, Math.min(Math.round(CROP_X * scale), meta.width - width));
      const top = Math.max(0, Math.min(Math.round(CROP_Y * scale), meta.height - height));

      const cropped = sharp(src).extract({ left, top, width, height });

      await cropped
        .clone()
        .resize(OUT_W, OUT_H, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 92, mozjpeg: true, progressive: true, chromaSubsampling: '4:4:4' })
        .toFile(dest);

      // A half-size rendition, named the way WordPress names its own, so the
      // srcset builder finds it and small tiles do not download the large one.
      const halfW = Math.round(OUT_W / 2);
      const halfH = Math.round(OUT_H / 2);
      await cropped
        .clone()
        .resize(halfW, halfH, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 90, mozjpeg: true, progressive: true })
        .toFile(path.join(OUT_DIR, `${p.slug}-${halfW}x${halfH}.jpg`));

      made++;
    } catch (e) {
      unmatched.push(`${p.name} (${e.message})`);
    }
  }

  console.log(`Portraits: ${made} generated, ${skipped} already present, ${portraits.length} total`);
  if (unmatched.length) {
    console.log(`No high-resolution source for ${unmatched.length}: ${unmatched.join(', ')}`);
    console.log('These fall back to the exhibition thumbnail.');
  }
})();
