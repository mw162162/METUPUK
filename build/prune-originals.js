// Drop the JPEG and PNG renditions that nothing asks for any more.
//
//   node build/prune-originals.js [--dry]
//
// build/to-webp.js keeps every original beside its WebP so an inbound link to a
// picture still resolves. That is worth something — Google Images, the red-flag
// infographic other organisations have embedded — but it was 515 MB of files no
// visitor downloads against 126 MB they do, four fifths of the hosting for a
// fallback. It is what ran the Netlify allowance out.
//
// The split that makes this safe is between the two kinds of file WordPress
// leaves behind:
//
//   photo.jpg            the upload. This is the URL somebody would have
//                        linked, embedded or found in Google Images. Kept.
//   photo-1024x683.jpg   a size WordPress generated for its own templates.
//                        Nobody has ever linked one of these on purpose, and
//                        the pages now reference the WebP instead. Dropped.
//
// 1,656 of the 1,993 files are the second kind and 398 MB of the 515. So the
// large majority goes with no inbound link broken at all, rather than trading
// one against the other.
//
// Anything a built page still points at is kept whatever its name — including
// the og:image on every article, which to-webp.js deliberately leaves as a JPEG
// because LinkedIn and several chat clients are unreliable about WebP.
//
// Runs at publish time, not on every build: the originals are what to-webp.js
// converts from, so they have to exist locally. They just do not have to be
// uploaded.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const MEDIA = path.join(OUT, 'media');
const DRY = process.argv.includes('--dry');

const CONVERTIBLE = /\.(jpe?g|png)$/i;
// "photo-1024x683.jpg" — a size WordPress made, not something a person saved.
const RENDITION = /-\d{2,4}x\d{2,4}\.(?:jpe?g|png)$/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Every media path a built page, stylesheet or feed still points at. Read
// rather than assumed: a picture WebP could not beat is still referenced as a
// JPEG, and deleting that would break the page rather than save it.
function referenced() {
  const used = new Set();
  for (const file of walk(OUT)) {
    if (!/\.(html|css|xml|json|js|txt)$/i.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\/media\/[A-Za-z0-9._\-/%]+\.(?:jpe?g|png|gif|webp|svg|avif)/gi)) {
      used.add(decodeURIComponent(m[0]));
    }
  }
  return used;
}

const siteUrl = (file) => '/' + path.relative(OUT, file).split(path.sep).join('/');

function main() {
  const used = referenced();
  let freed = 0;
  let dropped = 0;
  let keptReferenced = 0;
  let keptOriginal = 0;
  let keptNoWebp = 0;

  for (const file of walk(MEDIA)) {
    if (!CONVERTIBLE.test(file)) continue;

    if (used.has(siteUrl(file))) { keptReferenced++; continue; }
    if (!RENDITION.test(file)) { keptOriginal++; continue; }

    const webp = file.replace(CONVERTIBLE, '.webp');
    if (!fs.existsSync(webp) || fs.statSync(webp).size === 0) { keptNoWebp++; continue; }

    freed += fs.statSync(file).size;
    dropped++;
    if (!DRY) fs.rmSync(file, { force: true });
  }

  console.log(`  dropped   ${dropped} WordPress renditions${DRY ? ' (dry run)' : ''}, ${(freed / 1024 / 1024).toFixed(0)} MB`);
  console.log(`  kept      ${keptOriginal} original uploads — the URLs anyone would have linked`);
  console.log(`  kept      ${keptReferenced} still referenced by a page, including every social card`);
  if (keptNoWebp) console.log(`  kept      ${keptNoWebp} with no WebP to fall back to`);
}

main();
