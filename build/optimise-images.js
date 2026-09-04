// Re-encode oversized images in the built site. Runs after the build, in place,
// so the HTML needs no changes: same filenames, smaller files.
//
//   node build/optimise-images.js [--max-width 2000] [--kb 400] [--dry]
//
// No longer part of publishing, and deliberately so. build/to-webp.js takes
// 467 MB of pictures to 107 MB where this takes a few per cent, and it covers
// everything a page actually shows. The two also fight: this rewrites files in
// place, which resets the timestamps the WebP pass reads to decide what it
// already did, so running both means re-encoding seventeen hundred photographs
// on every publish.
//
// Kept for the case it is still good at — one oversized upload that wants
// capping at a sane pixel width before anything else touches it. Run it before
// to-webp, never after.
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); }
catch { console.error('sharp is not installed. Run: npm install sharp'); process.exit(1); }

const OUT = path.join(__dirname, '..', 'dist', 'media');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? +args[i + 1] : fallback;
};
const MAX_WIDTH = arg('max-width', 2000);
const THRESHOLD = arg('kb', 400) * 1024;
const DRY = args.includes('--dry');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

(async () => {
  const files = walk(OUT).filter((f) => /\.(jpe?g|png)$/i.test(f) && fs.statSync(f).size > THRESHOLD);
  if (!files.length) { console.log('Nothing over the threshold.'); return; }

  let before = 0;
  let after = 0;
  let changed = 0;

  for (const file of files) {
    const size = fs.statSync(file).size;
    before += size;
    try {
      const img = sharp(file, { failOn: 'none' });
      const meta = await img.metadata();
      const isPng = /\.png$/i.test(file);

      let pipeline = sharp(file, { failOn: 'none' }).rotate();
      if (meta.width > MAX_WIDTH) pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
      // Keep the original format so no HTML has to change; just encode it well.
      pipeline = isPng
        ? pipeline.png({ compressionLevel: 9, palette: true })
        : pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true });

      const buf = await pipeline.toBuffer();
      if (buf.length < size * 0.95) {
        if (!DRY) fs.writeFileSync(file, buf);
        after += buf.length;
        changed++;
        console.log(`  ${(size / 1024 / 1024).toFixed(2)}MB → ${(buf.length / 1024 / 1024).toFixed(2)}MB  ${path.relative(OUT, file)}`);
      } else {
        after += size;
      }
    } catch (e) {
      after += size;
      console.warn(`  skipped ${path.relative(OUT, file)}: ${e.message}`);
    }
  }

  console.log(`\n${changed}/${files.length} images re-encoded${DRY ? ' (dry run)' : ''}`);
  console.log(`${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(1)} MB ` +
    `(${(100 - (after / before) * 100).toFixed(0)}% smaller)`);
})();
