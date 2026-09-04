// Re-encode the built site's images as WebP, and point every page at them.
//
//   node build/to-webp.js [--quality 82] [--dry]
//
// The site ships 1,694 JPEGs and PNGs and two modern-format images. Three of
// the four heaviest things on the homepage are photographs saved as PNG, which
// is the most expensive mistake in web imagery: 490 KB for a montage that is
// 81 KB as WebP, 315 KB for a background that is 17 KB.
//
// This converts rather than offering an alternative. The usual approach wraps
// each image in <picture> with the original as a fallback — but that puts a new
// element between the image and its parent, and this site's layout keys off
// `.prose > *` and off figure, so every wrapper is a chance to break a measure
// or a margin silently. WebP has been supported by every browser since 2020;
// the fallback buys nothing and costs that risk.
//
// It runs at publish time, not on every build, because re-encoding seventeen
// hundred photographs is not something to do between saving a page and looking
// at it.
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); }
catch { console.error('sharp is not installed. Run: npm install sharp'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const MEDIA = path.join(OUT, 'media');

const args = process.argv.slice(2);
const qIndex = args.indexOf('--quality');
const QUALITY = qIndex > -1 ? +args[qIndex + 1] : 82;
const DRY = args.includes('--dry');

const CONVERTIBLE = /\.(jpe?g|png)$/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

async function main() {
  const files = walk(MEDIA).filter((f) => CONVERTIBLE.test(f));
  if (!files.length) { console.log('no images to convert'); return; }

  let before = 0;
  let after = 0;
  let converted = 0;
  let kept = 0;
  const renames = new Map();

  // Eight at a time: enough to use the machine, few enough that a build on a
  // laptop does not become unresponsive.
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      const target = file.replace(CONVERTIBLE, '.webp');
      const originalSize = fs.statSync(file).size;
      try {
        const buf = await sharp(file).webp({ quality: QUALITY }).toBuffer();

        // A conversion that is not smaller is not an improvement. Some
        // already-tight JPEGs and tiny flat PNGs come out bigger; those keep
        // the file they had.
        if (buf.length >= originalSize) { kept++; continue; }

        before += originalSize;
        after += buf.length;
        converted++;
        if (DRY) continue;

        fs.writeFileSync(target, buf);
        fs.rmSync(file, { force: true });
        const rel = '/' + path.relative(OUT, file).split(path.sep).join('/');
        renames.set(rel, '/' + path.relative(OUT, target).split(path.sep).join('/'));
      } catch {
        // A file sharp cannot read keeps the bytes it already had.
        kept++;
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  // Point the pages at what now exists. Every reference, wherever it appears —
  // src, srcset, a CSS url(), an og:image, the sitemap.
  let touched = 0;
  if (!DRY && renames.size) {
    for (const file of walk(OUT)) {
      if (!/\.(html|css|xml|json|js)$/i.test(file)) continue;
      let text = fs.readFileSync(file, 'utf8');
      let changed = false;
      for (const [from, to] of renames) {
        if (text.includes(from)) { text = text.split(from).join(to); changed = true; }
      }
      if (changed) { fs.writeFileSync(file, text); touched++; }
    }
  }

  const saved = before - after;
  console.log(`  converted   ${converted} images${DRY ? ' (dry run)' : ''}`);
  if (kept) console.log(`  left alone  ${kept} (WebP was no smaller, or unreadable)`);
  console.log(`  ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB`
    + `  (${Math.round(saved / before * 100)}% smaller, ${(saved / 1024 / 1024).toFixed(1)} MB saved)`);
  if (!DRY) console.log(`  rewrote     ${touched} files to match`);
}

main();
