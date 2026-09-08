// A brand, exported as things Canva can use.
//
//   node build/canva-kit.js                    the METUPUK brand
//   node build/canva-kit.js --brand fen-and-furrow
//
// The studio exists so nobody has to know the hex codes. This is the opposite
// errand: somebody already lives in Canva, is not going to move, and needs the
// numbers written down so what they make there matches what the site does.
//
// So it is generated from the same brand file the studio draws from, not typed
// out beside it. A brand colour changed in the stylesheet reaches the next post
// made in the studio and the next kit exported for Canva, and the two cannot
// drift apart — which is the only way a written specification is ever true a
// year later.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const BRAND = argOf('brand', 'metupuk');
const OUT = path.join(ROOT, argOf('out', path.join('dist', 'social', 'canva')), BRAND);

// The same three the studio makes, and the same geometry.
const SIZES = [
  { key: 'square', w: 1080, h: 1080, note: 'Instagram and Facebook feed' },
  { key: 'story', w: 1080, h: 1920, note: 'Instagram and Facebook stories' },
  { key: 'wide', w: 1200, h: 675, note: 'X, and the image shown when a link is shared' },
];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The margins the studio uses, stated in pixels rather than as the formula.
   A person laying a text box out in Canva needs "88 pixels from the left", not
   "eight and a half per cent of the shorter side". */
function geometry(size) {
  const pad = Math.round(Math.min(size.w, size.h) * 0.085);
  const u = Math.min(size.w, size.h) / 1080;
  const footer = Math.round(104 * u);
  return {
    pad,
    column: size.w - pad * 2,
    textBottom: size.h - pad - footer,
    signature: footer,
    unit: +u.toFixed(3),
  };
}

async function ground(brand, g, size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${esc(g.from)}"/><stop offset="1" stop-color="${esc(g.to)}"/>
  </linearGradient></defs>
  <rect width="${size.w}" height="${size.h}" fill="url(#g)"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/* A transparent overlay showing where the words may go and where the signature
   sits. Dropped over a design in Canva it answers the only question the spec
   cannot: "is this too low?" */
async function guide(brand, size) {
  const m = geometry(size);
  const line = brand.colour.figure || '#ff00aa';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">
  <rect x="${m.pad}" y="${m.pad}" width="${m.column}" height="${m.textBottom - m.pad}"
        fill="none" stroke="${esc(line)}" stroke-width="3" stroke-dasharray="14 10"/>
  <rect x="${m.pad}" y="${m.textBottom}" width="${m.column}" height="${size.h - m.pad - m.textBottom}"
        fill="${esc(line)}" fill-opacity="0.14" stroke="${esc(line)}" stroke-width="2"/>
  <text x="${m.pad + 12}" y="${m.pad + 34}" font-family="sans-serif" font-size="24"
        fill="${esc(line)}">words go inside this box</text>
  <text x="${m.pad + 12}" y="${m.textBottom + 34}" font-family="sans-serif" font-size="24"
        fill="${esc(line)}">signature — keep clear</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/* One image of the whole palette, because a list of hex codes in a text file is
   read once and a picture of them stays open on the second monitor. */
async function swatches(brand) {
  const roles = [
    ['figure', 'The figure — the number, anything set largest'],
    ['rule', 'Rule — the short bar, the quote mark'],
    ['heading', 'Heading — words in the display face'],
    ['soft', 'Second line — supporting text'],
    ['chip', 'Label — the filled pill'],
    ['tag', 'Hashtag — the signature line'],
  ].filter((r) => brand.colour[r[0]]);

  // Each background's two ends together. Listed as all the froms and then all
  // the tos, the one pair anybody actually needs to compare sat six rows apart.
  const grounds = [];
  (brand.grounds || []).forEach((g) => {
    grounds.push([g.from, 'Background: ' + g.label + ' — from']);
    grounds.push([g.to, 'Background: ' + g.label + ' — to']);
  });

  const rows = roles.map((r) => [brand.colour[r[0]], r[1]]).concat(grounds);
  const rowH = 96, w = 1000, h = rows.length * rowH + 140;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  <text x="40" y="60" font-family="sans-serif" font-size="34" font-weight="700" fill="#111">
    ${esc(brand.name)} — colours by the job they do</text>
  ${rows.map((r, i) => {
    const y = 110 + i * rowH;
    return `<rect x="40" y="${y}" width="120" height="72" rx="8" fill="${esc(r[0])}" stroke="#ddd"/>
    <text x="184" y="${y + 32}" font-family="monospace" font-size="28" fill="#111">${esc(r[0])}</text>
    <text x="184" y="${y + 62}" font-family="sans-serif" font-size="22" fill="#555">${esc(r[1])}</text>`;
  }).join('\n  ')}
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function spec(brand) {
  const lines = [];
  const L = (s) => lines.push(s == null ? '' : s);

  L('# ' + brand.name + ' — making posts in Canva');
  L('');
  L('Generated from the brand file the studio draws from, so these numbers are');
  L('the numbers, not a description of them. If a colour changes on the site,');
  L('re-export this and it changes here too.');
  L('');
  L('Generated ' + new Date().toISOString().slice(0, 10) + ' from `' + brand.id + '`.');
  L('');

  L('## Colours');
  L('');
  L('Named by the job each one does. That matters more than it sounds: use');
  L('“the figure colour” for the big number and nothing else, and posts stay');
  L('recognisable even when somebody makes one this file never anticipated.');
  L('');
  L('| Role | Hex | Use it for |');
  L('| --- | --- | --- |');
  const roles = [
    ['figure', 'The number, and anything set largest'],
    ['rule', 'The short bar under the figure, and the quote mark'],
    ['heading', 'Words set in the display face'],
    ['soft', 'The supporting line under a heading'],
    ['chip', 'The filled pill (Showing now, Coming soon)'],
    ['tag', 'The hashtag on the signature line'],
  ];
  roles.forEach((r) => {
    if (brand.colour[r[0]]) L('| ' + r[0] + ' | `' + brand.colour[r[0]] + '` | ' + r[1] + ' |');
  });
  L('');
  L('Backgrounds are a gradient, top-left to bottom-right:');
  L('');
  (brand.grounds || []).forEach((g) => {
    L('- **' + g.label + '** — `' + g.from + '` to `' + g.to + '`');
  });
  L('');

  L('## Type');
  L('');
  L('- Display (headings, the figure): **' + (brand.type.display || '').split(',')[0].replace(/"/g, '') + '**');
  L('- Body (supporting lines): **' + (brand.type.body || '').split(',')[0].replace(/"/g, '') + '**');
  if (brand.type.webfonts) L('- Both are on Google Fonts, so Canva has them.');
  L('');

  L('## Sizes and margins');
  L('');
  L('Every measurement in pixels, at the size Canva will ask you for.');
  L('');
  L('| Size | Canvas | Margin | Text column | Words stop at | Signature strip |');
  L('| --- | --- | --- | --- | --- | --- |');
  SIZES.forEach((s) => {
    const m = geometry(s);
    L('| ' + s.key + ' | ' + s.w + ' × ' + s.h + ' | ' + m.pad + 'px'
      + ' | ' + m.column + 'px | ' + m.textBottom + 'px from the top | ' + m.signature + 'px tall |');
  });
  L('');
  L('The signature strip is the bottom band carrying the wordmark and the');
  L('hashtag. Nothing else goes in it. `guides/` has a transparent overlay per');
  L('size showing both boxes — drop one over a design to check it.');
  L('');

  L('## The signature');
  L('');
  L('Every post signs itself, bottom left to bottom right:');
  L('');
  L('- Left: **' + ((brand.mark && brand.mark.wordmark) || brand.name) + '**'
    + (brand.mark && brand.mark.image ? ', with the mark from `marks/` beside it' : ''));
  L('- Right: the hashtag, in the tag colour');
  L('');
  if (brand.tags && brand.tags.length) {
    L('Hashtags: ' + brand.tags.map((t) => '`' + t + '`').join(', '));
    L('');
  }

  L('## The templates');
  L('');
  L('What the studio makes, so a Canva version of each is recognisably the');
  L('same post. Blocks are listed top to bottom.');
  L('');
  (brand.templates || []).forEach((t) => {
    L('### ' + t.label);
    L('');
    (t.blocks || []).forEach((b) => {
      const what = b.from ? '{' + b.from + '}' : b.type;
      const how = {
        figure: 'as large as it will go, in the figure colour',
        rule: 'a short bar, about 150 × 10px at square',
        heading: 'display face, heavy, set to fit',
        body: 'body face, regular',
        chip: 'filled pill, uppercase, display face',
        quoteMark: 'a large opening quote mark in the rule colour',
        attribution: 'body face, preceded by an em dash, in the accent colour',
      }[b.type] || b.type;
      L('- **' + b.type + '** ' + what + ' — ' + how + (b.colour ? ' (' + b.colour + ')' : ''));
    });
    L('');
    if (t.caption) { L('Caption pattern: `' + t.caption + '`'); L(''); }
    if (t.alt) { L('Alt text pattern: `' + t.alt + '`'); L(''); }
  });

  L('## Two things worth not getting wrong');
  L('');
  L('**Write the alt text.** Every template above has an alt pattern. Canva will');
  L('not ask you for it and the platform will not either; it is the half of a');
  L('post that gets left blank because it is written separately from the');
  L('picture. Fill in the pattern and paste it when you post.');
  L('');
  L('**Photographs of people are tinted.** The studio applies one filter, the');
  L('same one the site uses:');
  L('');
  L('    ' + (brand.duotone || 'none'));
  L('');
  L('Canva cannot reproduce that exactly. Get close with a black-and-white');
  L('filter and a colour overlay in the figure colour at around 40%, or export');
  L('the picture from the studio and bring it across.');
  L('');
  L('---');
  L('');
  L('If a template here is fighting you, the studio does all of this without');
  L('any of the numbers: ' + (brand.site ? 'see the team who set the site up.' : ''));
  L('');
  return lines.join('\n');
}

async function run() {
  const brandFile = path.join(ROOT, 'dist', 'social', 'brands', BRAND + '.json');
  if (!fs.existsSync(brandFile)) {
    console.error('  no brand called "' + BRAND + '" — build the site first, or check social/brands/');
    process.exit(1);
  }
  const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));

  fs.mkdirSync(path.join(OUT, 'backgrounds'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'guides'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'marks'), { recursive: true });

  let made = 0;
  for (const g of brand.grounds || []) {
    for (const size of SIZES) {
      const buf = await ground(brand, g, size);
      fs.writeFileSync(path.join(OUT, 'backgrounds', g.key + '-' + size.key + '.png'), buf);
      made++;
    }
  }
  for (const size of SIZES) {
    fs.writeFileSync(path.join(OUT, 'guides', size.key + '.png'), await guide(brand, size));
  }
  fs.writeFileSync(path.join(OUT, 'palette.png'), await swatches(brand));

  // The marks, if this brand has any that live with us.
  let marks = 0;
  if (brand.mark && brand.mark.image && brand.mark.image.startsWith('/')) {
    const from = path.join(ROOT, 'dist', brand.mark.image.slice(1));
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(OUT, 'marks', path.basename(from)));
      marks++;
    }
  }

  fs.writeFileSync(path.join(OUT, 'SPEC.md'), spec(brand));

  // A plain list too: some tools want pasting into, not reading.
  const plain = Object.keys(brand.colour).map((k) => brand.colour[k] + '  ' + k)
    .concat((brand.grounds || []).map((g) => g.from + '  background ' + g.label + ' from'))
    .concat((brand.grounds || []).map((g) => g.to + '  background ' + g.label + ' to'));
  fs.writeFileSync(path.join(OUT, 'palette.txt'), plain.join('\n') + '\n');

  console.log('  brand         ' + brand.name);
  console.log('  backgrounds   ' + made + ' (' + (brand.grounds || []).length + ' grounds × ' + SIZES.length + ' sizes)');
  console.log('  guides        ' + SIZES.length);
  console.log('  marks         ' + marks);
  console.log('  palette       palette.png, palette.txt');
  console.log('  spec          SPEC.md');
  console.log('  out           ' + path.relative(ROOT, OUT));
}

run().catch((err) => { console.error('  ' + err.message); process.exit(1); });
