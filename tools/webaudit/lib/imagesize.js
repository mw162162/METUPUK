// Read intrinsic image dimensions straight from the file header. The width and
// height attributes in the HTML are what the page *claims*; this is what the
// file actually contains, which is what decides whether it looks sharp.
const fs = require('fs');

function readHeader(file, bytes = 65536) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function png(b) {
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function gif(b) {
  if (b.length < 10 || b.toString('ascii', 0, 3) !== 'GIF') return null;
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
}

function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (i + 4 > b.length) break;
    const len = b.readUInt16BE(i + 2);
    // SOF0..SOF15, excluding DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) break;
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webp(b) {
  if (b.length < 30) return null;
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const type = b.toString('ascii', 12, 16);
  if (type === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (type === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (type === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  return null;
}

function svg(b) {
  const head = b.toString('utf8', 0, Math.min(b.length, 4096));
  if (!/<svg/i.test(head)) return null;
  const vb = head.match(/viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
  if (vb) return { w: Math.round(+vb[1]), h: Math.round(+vb[2]), vector: true };
  const w = head.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const h = head.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (w && h) return { w: Math.round(+w[1]), h: Math.round(+h[1]), vector: true };
  return { w: 0, h: 0, vector: true };
}

const cache = new Map();

function imageSize(file) {
  if (cache.has(file)) return cache.get(file);
  let result = null;
  try {
    const b = readHeader(file);
    result = png(b) || jpeg(b) || gif(b) || webp(b) || svg(b);
  } catch { result = null; }
  cache.set(file, result);
  return result;
}

module.exports = { imageSize };
