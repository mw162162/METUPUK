// Read a brand off a website.
//
//   node build/brand-from-url.js https://example.org --id example
//   node build/brand-from-url.js https://example.org --dry
//
// Onboarding is the part that decides whether this is a product or a thing
// somebody configures for you. Writing Fen & Furrow by hand took an hour and a
// person who knows what a brand file is; nobody is buying that.
//
// So this fetches a page, reads its stylesheets, and proposes a brand: the
// palette by the job each colour does, the typefaces, the mark, the name. It
// guesses, and it says which parts are guesses — a draft somebody corrects is
// worth far more than a blank form, and far less dangerous than a confident
// wrong answer nobody was told to check.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const url = argv.find((a) => /^https?:\/\//.test(a));
const argOf = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DRY = argv.includes('--dry');

if (!url) {
  console.error('  usage: node build/brand-from-url.js <url> [--id name] [--dry]');
  process.exit(1);
}

/* --- Colour ---------------------------------------------------------------- */

function hex(c) {
  const m = String(c).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return '#' + h.toLowerCase();
}

function hsl(h6) {
  const r = parseInt(h6.slice(1, 3), 16) / 255;
  const g = parseInt(h6.slice(3, 5), 16) / 255;
  const b = parseInt(h6.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0, hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  // Chroma, not saturation. HSL saturation asks "how pure is this hue",
  // which says a pale pink tint is fully saturated — 1.00, the same score as
  // the brand pink itself, while a near-black plum scores 0.81. Chroma asks
  // "how much colour is actually here", and separates them: 0.14, 0.56, 0.10.
  // Read against the rebuilt site, saturation picked the palest tint in the
  // palette as the headline colour and near-black as its partner.
  return { h: hue, s: s, l: l, chroma: max - min };
}

// Perceived brightness, for deciding what can carry white text.
const lum = (c) => {
  const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};

/* --- Fetching -------------------------------------------------------------- */

async function get(u) {
  const res = await fetch(u, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (brand-from-url; +one page, once)' },
  });
  if (!res.ok) throw new Error(u + ' returned ' + res.status);
  return res.text();
}

/* --- Reading the page ------------------------------------------------------ */

function meta(html, prop) {
  const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*>', 'i');
  const tag = (html.match(re) || [])[0];
  if (!tag) return null;
  return (tag.match(/content=["']([^"']+)["']/i) || [])[1] || null;
}

function absolute(href, base) {
  try { return new URL(href, base).href; } catch (err) { return null; }
}

async function read(pageUrl) {
  const html = await get(pageUrl);
  const origin = new URL(pageUrl).origin;

  // Stylesheets, in order. First one that carries custom properties usually
  // is the site's own; the rest are frameworks and fonts.
  const sheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => (m[0].match(/href=["']([^"']+)["']/i) || [])[1])
    .filter(Boolean)
    .map((h) => absolute(h, pageUrl))
    .filter(Boolean);

  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);

  let css = inline.join('\n');
  const fetched = [];
  for (const href of sheets.slice(0, 6)) {
    if (/fonts\.googleapis|fonts\.gstatic/.test(href)) continue;
    try { css += '\n' + await get(href); fetched.push(href); } catch (err) { /* skip */ }
  }

  const googleFonts = sheets.find((h) => /fonts\.googleapis\.com/.test(h)) || null;

  return { html, css, origin, sheets: fetched, googleFonts };
}

/* --- Proposing a brand ------------------------------------------------------ */

function palette(css) {
  // Custom properties first: a site that declares them has already named its
  // own colours, and that is a far better signal than counting hex codes.
  const declared = [];
  const root = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (root) {
    for (const m of root[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const c = hex(m[2]);
      // A framework's own defaults are not the brand. Every WordPress site
      // declares --wp--preset--color--vivid-red and a dozen others in :root,
      // so reading custom properties off one hands you the block editor's
      // palette with total confidence — amber and orange for a charity whose
      // site is plum. Read against the live site, that is exactly what came
      // back, and nothing about it looked like a guess.
      if (/^--(wp|bs|tw|ion|mdc|mat|chakra|ant)-/.test(m[1])) continue;
      if (c) declared.push({ name: m[1], hex: c, uses: 0 });
    }
  }

  // Otherwise, whatever the stylesheet actually paints with, by frequency.
  const counted = {};
  for (const m of css.matchAll(/#[0-9a-f]{3,6}\b/gi)) {
    const c = hex(m[0]);
    if (c) counted[c] = (counted[c] || 0) + 1;
  }
  const common = Object.keys(counted)
    .sort((a, b) => counted[b] - counted[a])
    .map((c) => ({ name: null, hex: c }));

  // How hard the site leans on each colour. Declaring a token says a colour
  // exists; using it four hundred times says it is the brand. Without this,
  // whichever colour is most colourful wins — and gold outscores pink on pure
  // chroma, so a plum-and-raspberry site came back gold, from an accent it
  // uses twice.
  for (const d of declared) {
    // Counted by splitting rather than by a built pattern: the token name is a
    // literal containing dashes, and every attempt to escape it into a regex
    // produced `var(--plum-950` — an unterminated group, and a crash at the
    // first colour rather than a wrong answer at the last.
    d.uses = css.split('var(' + d.name).length - 1;
  }
  for (const c of common) {
    c.uses = counted[c.hex] || 0;
  }

  const pool = (declared.length >= 4 ? declared : common).slice(0, 40);
  return { pool, source: declared.length >= 4 ? 'custom properties' : 'hex frequency' };
}

function roles(pool) {
  const withHsl = pool.map((c) => Object.assign({}, c, hsl(c.hex), { lum: lum(c.hex) }));
  const coloured = withHsl.filter((c) => c.chroma > 0.18);

  // The ground is the darkest thing the site actually uses. White text has to
  // sit on it, so anything above a fifth of full brightness is disqualified.
  const darks = withHsl.filter((c) => c.lum < 0.2).sort((a, b) => a.lum - b.lum);
  const ground = darks[0] || withHsl.sort((a, b) => a.lum - b.lum)[0];
  const groundTo = darks[1] || ground;

  // The figure is the most colourful thing that will still read on that
  // ground: bright enough to see, not so pale it is a wash.
  // Colourful and used. The square root keeps a colour used four hundred
  // times from burying one used forty — the question is which the site leans
  // on, not which it mentions most.
  const weight = (c) => c.chroma * (1 + Math.sqrt(c.uses || 0));
  const bright = coloured
    .filter((c) => c.lum > 0.12 && c.lum < 0.72)
    .sort((a, b) => weight(b) - weight(a));
  const figure = bright[0] || coloured[0] || withHsl[0];

  // The rule is a deeper relative of the figure, so the two read as one family
  // — but it has to be a colour, not the ground wearing the same hue.
  const family = coloured
    .filter((c) => Math.abs(c.h - figure.h) < 40 && c.hex !== figure.hex
      && c.lum > 0.06 && c.lum < figure.lum)
    .sort((a, b) => weight(b) - weight(a));
  const rule = family[0] || figure;

  // A light tint for second lines. Prefer one the site already has.
  const soft = withHsl.filter((c) => c.lum > 0.6 && c.s > 0.1)
    .sort((a, b) => b.lum - a.lum)[0];

  return {
    ground: ground && ground.hex,
    groundTo: groundTo && groundTo.hex,
    figure: figure && figure.hex,
    rule: rule && rule.hex,
    soft: (soft && soft.hex) || '#ffffff',
    why: figure
      ? `${figure.name || figure.hex} used ${figure.uses || 0} times, chroma ${figure.chroma.toFixed(2)}`
      : null,
  };
}

function fonts(css, googleFonts) {
  const families = [];
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const stack = m[1].trim().replace(/\s*!important/, '');
    if (/^(inherit|initial|unset|var\()/i.test(stack)) continue;
    if (!families.includes(stack)) families.push(stack);
  }

  // A Google Fonts link names the faces exactly, which beats guessing from a
  // stack that ends in "sans-serif".
  let named = [];
  if (googleFonts) {
    for (const m of googleFonts.matchAll(/family=([^&]+)/g)) {
      // family=Roboto:400,500,300 and family=Archivo:wght@500;600 both name
      // one face and then describe it. Only the name is wanted.
      const fam = decodeURIComponent(m[1]).split(':')[0].replace(/\+/g, ' ').trim();
      if (fam && !named.includes(fam)) named.push(fam);
    }
  }

  const display = named[0] || null;
  const body = named[1] || named[0] || null;
  return {
    display: display ? `"${display}",Georgia,serif` : (families[0] || 'system-ui,sans-serif'),
    body: body ? `"${body}",-apple-system,"Segoe UI",sans-serif` : (families[1] || families[0] || 'system-ui,sans-serif'),
    preload: display
      ? [`900 100px ${display}`, `700 60px ${display}`, `600 30px ${body}`, `400 40px ${body}`]
      : [],
    webfonts: googleFonts,
    named,
  };
}

function mark(html, pageUrl) {
  const og = meta(html, 'og:image');
  if (og) return absolute(og, pageUrl);
  const touch = (html.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*>/i) || [])[0];
  if (touch) {
    const href = (touch.match(/href=["']([^"']+)["']/i) || [])[1];
    if (href) return absolute(href, pageUrl);
  }
  return null;
}

function name(html, pageUrl) {
  return meta(html, 'og:site_name')
    || (html.match(/<title[^>]*>([^<]+)</i) || [])[1]?.split(/[|—–-]/)[0].trim()
    || new URL(pageUrl).hostname;
}

function tags(html) {
  const found = {};
  for (const m of html.matchAll(/#[A-Za-z][A-Za-z0-9]{3,30}/g)) {
    // #FFD52F is a colour, not a campaign. Anything that is entirely hex
    // digits and the length of a colour is one.
    if (/^#[0-9a-f]{3,8}$/i.test(m[0])) continue;
    found[m[0]] = (found[m[0]] || 0) + 1;
  }
  return Object.keys(found).sort((a, b) => found[b] - found[a]).slice(0, 4);
}

/* --- Run -------------------------------------------------------------------- */

(async function run() {
  console.log(`  reading ${url}`);
  const page = await read(url);
  const pal = palette(page.css);
  const r = roles(pal.pool);
  const type = fonts(page.css, page.googleFonts);
  const id = argOf('id', new URL(url).hostname.replace(/^www\./, '').split('.')[0]);

  const brand = {
    schema: 1,
    id,
    name: name(page.html, url),
    site: new URL(url).hostname.replace(/^www\./, ''),
    drafted: new Date().toISOString().slice(0, 10),
    draftedFrom: url,

    type: {
      display: type.display,
      body: type.body,
      preload: type.preload,
      webfonts: type.webfonts,
    },

    colour: {
      figure: r.figure,
      rule: r.rule,
      heading: '#ffffff',
      soft: r.soft,
      tag: r.figure,
      chip: r.rule,
      signature: '#ffffff',
    },

    grounds: [
      { key: 'dark', label: 'Dark', from: r.ground, to: r.groundTo },
      { key: 'accent', label: 'Accent', from: r.rule, to: r.ground },
    ],

    mark: { image: mark(page.html, url), wordmark: name(page.html, url).toUpperCase() },
    duotone: 'grayscale(1) contrast(1.05) sepia(1) hue-rotate(320deg) saturate(1.4) brightness(0.95)',
    tags: tags(page.html),
    libraries: {},

    templates: [
      { key: 'figure', label: 'The figure', defaults: {
        number: '100', headline: 'change this to the sentence that matters', note: '' } },
      { key: 'quote', label: 'Quote', defaults: {
        quote: 'Change this to something somebody said.', who: name(page.html, url) } },
    ],
  };

  console.log(`  stylesheets   ${page.sheets.length} read`);
  console.log(`  palette from  ${pal.source} (${pal.pool.length} colours)`);
  console.log(`  ground        ${r.ground} -> ${r.groundTo}`);
  if (r.why) console.log(`  chosen why    ${r.why}`);
  console.log(`  figure        ${r.figure}   rule ${r.rule}   soft ${r.soft}`);
  console.log(`  type          ${type.named.length ? type.named.join(', ') : 'none named; using the stacks found'}`);
  console.log(`  mark          ${brand.mark.image || 'none found'}`);
  console.log(`  tags          ${brand.tags.length ? brand.tags.join(' ') : 'none found'}`);
  console.log('');
  console.log('  Every line above is a guess from one page. Check the palette especially:');
  console.log('  a site with no custom properties is read by counting hex codes, and the');
  console.log('  colour a stylesheet mentions most is not always the colour it means.');

  if (DRY) { console.log('\n  --dry, nothing written'); return; }

  const out = path.join(ROOT, 'src', 'static', 'social', 'brands', id + '.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(brand, null, 2) + '\n');
  console.log(`\n  written  ${path.relative(ROOT, out)}`);
  console.log(`  try it   /social/?brand=${id}`);
}()).catch((err) => {
  console.error('  ' + err.message);
  process.exit(1);
});
