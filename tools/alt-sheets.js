// Lay the undescribed pictures out as numbered contact sheets.
//
//   node tools/alt-manifest.js > alt.json
//   node tools/alt-sheets.js <dir containing alt.json>
//
// Descriptions written from file names are guesses, and a wrong description is
// worse than a missing one. The only honest way to write them is to look at the
// photographs — but opening 127 files one at a time is why nobody does. Six to
// a sheet with the index burned in makes it one sitting.
//
// It stamps each manifest entry with `n`, the sheet number of its picture, so a
// description written against #42 can be written back to the right image.
const fs = require('fs'); const path = require('path'); const sharp = require('sharp');
const SP = process.argv[2];
const items = JSON.parse(fs.readFileSync(path.join(SP, 'alt.json'), 'utf8'));
// One thumbnail per distinct file, so the same picture is not looked at twice.
const seen = new Map();
items.forEach((it) => { if (!seen.has(it.disk)) seen.set(it.disk, seen.size); it.n = seen.get(it.disk); });
fs.writeFileSync(path.join(SP, 'alt.json'), JSON.stringify(items, null, 1));
const uniq = [...seen.keys()];
const CELL = 400, COLS = 3, ROWS = 2, PER = COLS * ROWS, PAD = 26;
const out = path.join(SP, 'sheets'); fs.mkdirSync(out, { recursive: true });
(async () => {
  for (let s = 0; s * PER < uniq.length; s++) {
    const batch = uniq.slice(s * PER, s * PER + PER);
    const layers = [];
    for (let i = 0; i < batch.length; i++) {
      const x = (i % COLS) * (CELL + PAD) + PAD, y = Math.floor(i / COLS) * (CELL + PAD) + PAD;
      try {
        const buf = await sharp(batch[i]).resize(CELL, CELL, { fit: 'contain', background: '#fff' })
          .flatten({ background: '#fff' }).jpeg({ quality: 78 }).toBuffer();
        layers.push({ input: buf, left: x, top: y });
      } catch { /* unreadable file gets a blank cell */ }
      const label = Buffer.from(`<svg width="220" height="22"><text x="0" y="17" font-family="sans-serif" font-size="17" font-weight="bold" fill="#b0006a">#${s * PER + i}</text></svg>`);
      layers.push({ input: label, left: x, top: y - 22 });
    }
    const W = COLS * (CELL + PAD) + PAD, H = ROWS * (CELL + PAD) + PAD;
    await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
      .composite(layers).jpeg({ quality: 76 }).toFile(path.join(out, `sheet-${String(s).padStart(2, '0')}.jpg`));
  }
  console.log(`${uniq.length} distinct pictures -> ${Math.ceil(uniq.length / PER)} sheets`);
})();
const fs = require('fs'); const path = require('path'); const sharp = require('sharp');
const SP = process.argv[2];
const items = JSON.parse(fs.readFileSync(path.join(SP, 'alt.json'), 'utf8'));
// One thumbnail per distinct file, so the same picture is not looked at twice.
const seen = new Map();
items.forEach((it) => { if (!seen.has(it.disk)) seen.set(it.disk, seen.size); it.n = seen.get(it.disk); });
fs.writeFileSync(path.join(SP, 'alt.json'), JSON.stringify(items, null, 1));
const uniq = [...seen.keys()];
const CELL = 400, COLS = 3, ROWS = 2, PER = COLS * ROWS, PAD = 26;
const out = path.join(SP, 'sheets'); fs.mkdirSync(out, { recursive: true });
(async () => {
  for (let s = 0; s * PER < uniq.length; s++) {
    const batch = uniq.slice(s * PER, s * PER + PER);
    const layers = [];
    for (let i = 0; i < batch.length; i++) {
      const x = (i % COLS) * (CELL + PAD) + PAD, y = Math.floor(i / COLS) * (CELL + PAD) + PAD;
      try {
        const buf = await sharp(batch[i]).resize(CELL, CELL, { fit: 'contain', background: '#fff' })
          .flatten({ background: '#fff' }).jpeg({ quality: 78 }).toBuffer();
        layers.push({ input: buf, left: x, top: y });
      } catch { /* unreadable file gets a blank cell */ }
      const label = Buffer.from(`<svg width="220" height="22"><text x="0" y="17" font-family="sans-serif" font-size="17" font-weight="bold" fill="#b0006a">#${s * PER + i}</text></svg>`);
      layers.push({ input: label, left: x, top: y - 22 });
    }
    const W = COLS * (CELL + PAD) + PAD, H = ROWS * (CELL + PAD) + PAD;
    await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
      .composite(layers).jpeg({ quality: 76 }).toFile(path.join(out, `sheet-${String(s).padStart(2, '0')}.jpg`));
  }
  console.log(`${uniq.length} distinct pictures -> ${Math.ceil(uniq.length / PER)} sheets`);
})();
