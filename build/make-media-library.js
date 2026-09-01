// Build the media library the CMS shows a client.
//
//   node build/make-media-library.js
//
// The editor was pointed straight at _scrape/assets: 5,436 files and 1.1 GB,
// of which 86% are WordPress renditions — eight crops of the same photograph.
// That is why /admin/ sat on "Loading Site Data": it has to enumerate every one
// before it can show anything. And when it finished, a client looking for a
// photo of Jo Taylor would find her eight times at eight sizes.
//
// A media library should hold the images someone can choose, not the build
// artefacts derived from them. This links the originals into one folder:
// 757 files instead of 5,436.
//
// Hard links, not copies, so 362 MB is not duplicated on disk. Same file, two
// names; editing through one is editing the file itself, which is what we want.
// Falls back to copying where linking is refused (different volume, or a
// filesystem that will not).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FROM = path.join(ROOT, '_scrape', 'assets');
const TO = path.join(ROOT, 'media-library');

// A WordPress rendition ends in -WIDTHxHEIGHT before its extension. The file
// without that suffix is the upload someone actually made.
const RENDITION = /-\d+x\d+(\.[a-z0-9]+)$/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(FROM)) {
    console.error('No _scrape/assets to build from.');
    process.exit(1);
  }

  const all = walk(FROM);
  const originals = all.filter((f) => !RENDITION.test(f));

  let linked = 0;
  let copied = 0;
  let current = 0;
  let bytes = 0;

  for (const src of originals) {
    const rel = path.relative(FROM, src);
    const dst = path.join(TO, rel);
    const stat = fs.statSync(src);
    bytes += stat.size;

    let existing = null;
    try { existing = fs.statSync(dst); } catch { /* not there yet */ }
    if (existing && existing.size === stat.size && existing.mtimeMs >= stat.mtimeMs) {
      current += 1;
      continue;
    }

    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try {
      fs.rmSync(dst, { force: true });
      fs.linkSync(src, dst);
      linked += 1;
    } catch {
      fs.copyFileSync(src, dst);
      copied += 1;
    }
  }

  console.log(`Media library:  ${originals.length} originals (${(bytes / 1024 / 1024).toFixed(0)} MB)`);
  console.log(`  linked        ${linked}`);
  if (copied) console.log(`  copied        ${copied}  (linking refused)`);
  console.log(`  already there ${current}`);
  console.log(`  skipped       ${all.length - originals.length} WordPress renditions`);
}

main();
