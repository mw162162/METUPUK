// Responsive image sources. Built from what is actually on disk rather than
// from WordPress's metadata, so renditions we generate ourselves are picked up
// alongside the ones WordPress made.
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', '..', '_scrape', 'assets');

// "photo-1024x683.jpg" -> { base: "photo", w: 1024, h: 683, ext: ".jpg" }
const SIZED = /^(.*)-(\d+)x(\d+)(\.[a-z0-9]+)$/i;

// dirname -> Map(baseName -> [{ local, w, h }])
const dirCache = new Map();

function variantsInDir(dirRel) {
  if (dirCache.has(dirRel)) return dirCache.get(dirRel);
  const index = new Map();
  const abs = path.join(ASSETS, dirRel);

  let entries = [];
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { /* missing dir */ }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(name)) continue;

    const m = name.match(SIZED);
    const base = m ? m[1] + m[4] : name;
    if (!index.has(base)) index.set(base, []);
    index.get(base).push({
      local: '/media/' + (dirRel ? dirRel + '/' : '') + name,
      w: m ? +m[2] : null,
      h: m ? +m[3] : null,
      isOriginal: !m,
      file: path.join(abs, name),
    });
  }

  dirCache.set(dirRel, index);
  return index;
}

// The original carries no -WxH suffix, so measure it from the file header.
function readSize(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(32768);
    const read = fs.readSync(fd, buf, 0, 32768, 0);
    fs.closeSync(fd);
    const b = buf.subarray(0, read);

    // PNG: IHDR width/height at a fixed offset.
    if (b.length > 24 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') {
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    // JPEG: walk the segment markers to the first SOF.
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch { /* unreadable */ }
  return null;
}

/**
 * Returns { srcset, src, width, height } for a local /media path, or null when
 * only one usable size exists (in which case the plain src is already correct).
 */
function srcsetFor(localPath, { maxWidth = 2048 } = {}) {
  if (!localPath || !localPath.startsWith('/media/')) return null;

  const rel = decodeURIComponent(localPath.split('?')[0].replace('/media/', ''));
  const dirRel = path.dirname(rel) === '.' ? '' : path.dirname(rel);
  const name = path.basename(rel);
  const m = name.match(SIZED);
  const base = m ? m[1] + m[4] : name;

  const found = variantsInDir(dirRel).get(base);
  if (!found || found.length < 2) return null;

  // Resolve the original's dimensions so every variant can be aspect-checked.
  const list = [];
  for (const v of found) {
    let { w, h } = v;
    if (!w || !h) {
      const size = readSize(v.file);
      if (!size) continue;
      w = size.w; h = size.h;
    }
    if (w && h) list.push({ local: v.local, w, h });
  }
  if (list.length < 2) return null;

  // Use the widest as the reference shape and drop anything cropped to a
  // different aspect ratio — WordPress also makes hard square and banner crops,
  // and mixing those into a srcset distorts the image.
  list.sort((a, b) => a.w - b.w);
  const reference = list[list.length - 1];
  const ratio = reference.w / reference.h;
  const sameShape = list.filter((v) => Math.abs(v.w / v.h - ratio) <= 0.02);

  const usable = sameShape.filter((v) => v.w <= maxWidth);
  // If everything is above the cap, keep the smallest of them rather than
  // returning nothing — an oversized source still beats an upscaled one.
  const chosen = usable.length >= 2 ? usable : sameShape.slice(0, 2);
  if (chosen.length < 2) return null;

  // Dedupe by width.
  const byWidth = new Map();
  for (const v of chosen) if (!byWidth.has(v.w)) byWidth.set(v.w, v);
  const final = [...byWidth.values()].sort((a, b) => a.w - b.w);
  if (final.length < 2) return null;

  const largest = final[final.length - 1];
  return {
    srcset: final.map((v) => `${encodeURI(v.local)} ${v.w}w`).join(', '),
    src: largest.local,
    widest: largest.w,
    width: largest.w,
    height: largest.h,
  };
}

module.exports = { srcsetFor };
