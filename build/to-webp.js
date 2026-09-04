// Re-encode the built site's images as WebP, and point every page at them.
//
//   node build/to-webp.js [--quality 82] [--dry] [--force]
//
// The site ships 1,690 JPEGs and PNGs. Three of the four heaviest things on the
// homepage are photographs saved as PNG, which is the most expensive mistake in
// web imagery: 490 KB for a montage that is 81 KB as WebP, 315 KB for a
// background that is 17 KB. Across the site it is 467 MB of pictures that are
// 107 MB as WebP — the largest single thing that can be done for how fast this
// site feels, and it costs nothing anybody can see.
//
// Three decisions worth knowing about:
//
// It rewrites the reference rather than offering an alternative. The usual
// approach wraps each image in <picture> with the original as a fallback — but
// that puts a new element between the image and its parent, and this site's
// layout keys off `.prose > *` and off figure, so every wrapper is a chance to
// break a measure or a margin silently. WebP has been supported by every
// browser since 2020; the fallback buys nothing and costs that risk.
//
// It keeps the original file. Deleting it saves 360 MB of hosting and breaks
// every inbound link to a picture — Google Images results, the red-flag
// infographic other organisations have embedded, anything anyone hotlinked.
// This rebuild went to considerable trouble to keep every page URL working,
// and an image URL is a URL. Netlify uploads only files whose contents
// changed, so the originals are already up there: keeping them costs one
// upload, not one per deploy.
//
// Social cards keep the original too. Facebook and X read WebP; LinkedIn and a
// scattering of chat clients have been unreliable about it, and a share
// preview with no picture is worse than a larger one that nobody downloads
// unless they share the page.
//
// Because the original stays put, a second run finds the WebP already beside
// it and skips the encoding — so this is cheap to leave in the publish
// pipeline. Only genuinely new or changed pictures cost anything.
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
const FORCE = args.includes('--force');

const CONVERTIBLE = /\.(jpe?g|png)$/i;
// The tags whose URL is read by something other than a browser.
const SOCIAL = /<meta[^>]+(?:og:image|twitter:image)[^>]*>/gi;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const siteUrl = (file) => '/' + path.relative(OUT, file).split(path.sep).join('/');

async function main() {
  const files = walk(MEDIA).filter((f) => CONVERTIBLE.test(f));
  if (!files.length) { console.log('no images to convert'); return; }

  let before = 0;
  let after = 0;
  let converted = 0;
  let cached = 0;
  let kept = 0;

  // Eight at a time: enough to use the machine, few enough that a build on a
  // laptop becomes unresponsive.
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      const target = file.replace(CONVERTIBLE, '.webp');
      const source = fs.statSync(file);

      // Already done on an earlier run, and the picture has not changed since.
      if (!FORCE && fs.existsSync(target) && fs.statSync(target).mtimeMs >= source.mtimeMs) {
        cached++;
        continue;
      }

      try {
        const buf = await sharp(file).webp({ quality: QUALITY }).toBuffer();

        // A conversion that is not smaller is not an improvement. Some
        // already-tight JPEGs and small flat PNGs come out bigger; those keep
        // the file they had, and because no .webp is written the reference is
        // left pointing at the original.
        if (buf.length >= source.size) { kept++; continue; }

        before += source.size;
        after += buf.length;
        converted++;
        if (!DRY) fs.writeFileSync(target, buf);
      } catch {
        // A file sharp cannot read keeps the bytes it already had.
        kept++;
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  // Built from what is on disk rather than from what this run converted, so a
  // rebuild that regenerated the HTML is still pointed at WebP even when every
  // encode was a cache hit. That is what makes the pass idempotent.
  const toWebp = new Map();
  const toOriginal = new Map();
  for (const file of files) {
    const target = file.replace(CONVERTIBLE, '.webp');
    if (!fs.existsSync(target)) continue;
    toWebp.set(siteUrl(file), siteUrl(target));
    toOriginal.set(siteUrl(target), siteUrl(file));
  }

  let touched = 0;
  let missed = 0;
  if (!DRY && toWebp.size) {
    for (const file of walk(OUT)) {
      if (!/\.(html|css|xml|json|js)$/i.test(file)) continue;
      const original = fs.readFileSync(file, 'utf8');
      let text = original;
      for (const [from, to] of toWebp) {
        if (text.includes(from)) text = text.split(from).join(to);
      }

      // Then put the social tags back the way they were. Rewriting forwards
      // and then undoing it on two tags is simpler than holding them aside:
      // a placeholder has to be a string that cannot occur in the document,
      // and every candidate for that is a bug waiting to be found.
      text = text.replace(SOCIAL, (tag) => {
        let fixed = tag;
        for (const [webp, source] of toOriginal) {
          if (fixed.includes(webp)) fixed = fixed.split(webp).join(source);
        }
        return fixed;
      });

      if (text !== original) { fs.writeFileSync(file, text); touched++; }

      // Anything still pointing at a picture that has a WebP beside it is a
      // reference the rewrite failed to reach. Social tags are excluded
      // because theirs is deliberate. Counted rather than assumed away: a
      // silent miss here is a page that quietly stayed slow.
      if (/\.html$/i.test(file)) {
        const body = text.replace(SOCIAL, '');
        for (const from of toWebp.keys()) if (body.includes(from)) missed++;
      }
    }
  }

  const saved = before - after;
  console.log(`  converted    ${converted} images${DRY ? ' (dry run)' : ''}`);
  if (cached) console.log(`  already done ${cached} (unchanged since the last run)`);
  if (kept) console.log(`  left alone   ${kept} (WebP was no smaller, or unreadable)`);
  if (converted) {
    console.log(`  ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB`
      + `  (${Math.round(saved / before * 100)}% smaller, ${(saved / 1024 / 1024).toFixed(1)} MB saved)`);
  }
  if (!DRY) {
    console.log(`  ${toWebp.size} pictures served as WebP; the originals stay, so old links still work`);
    console.log(`  rewrote      ${touched} files to match`);
    if (missed) console.log(`  MISSED       ${missed} reference(s) still point at the original`);
  }
}

main();
