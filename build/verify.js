// Post-build audit: prove no content was lost and nothing links into a void.
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');
const { build: buildModel } = require('./lib/model');
const { toText } = require('./lib/clean');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

function walkFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

// Does this site-absolute URL resolve to something we actually built?
function resolves(url) {
  const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
  if (!clean || clean === '/') return fs.existsSync(path.join(OUT, 'index.html'));
  const base = path.join(OUT, clean.replace(/^\//, ''));
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return true;
  if (fs.existsSync(path.join(base, 'index.html'))) return true;
  return false;
}

const norm = (s) => (s || '').replace(/[\s ]+/g, ' ')
  .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-').replace(/…/g, '...')
  .toLowerCase().trim();

function run() {
  const model = buildModel();
  const files = walkFiles(OUT).filter((f) => f.endsWith('.html'));
  const problems = { deadLinks: [], missingImages: [], noH1: [], noTitle: [], contentLoss: [], emptyAlt: 0 };
  const linkTargets = new Map();

  for (const file of files) {
    const rel = '/' + path.relative(OUT, file).replace(/\\/g, '/').replace(/index\.html$/, '');
    const root = parse(fs.readFileSync(file, 'utf8'));

    if (!root.querySelector('h1')) problems.noH1.push(rel);
    const title = root.querySelector('title');
    if (!title || !title.text.trim()) problems.noTitle.push(rel);

    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!href || /^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) continue;
      if (!resolves(href)) {
        problems.deadLinks.push(`${rel} -> ${href}`);
      }
      linkTargets.set(href.split('#')[0], true);
    }

    for (const img of root.querySelectorAll('img[src], iframe[src], video[src]')) {
      const src = img.getAttribute('src');
      if (!src || /^(https?:|data:)/i.test(src)) continue;
      if (!fs.existsSync(path.join(OUT, decodeURIComponent(src.replace(/^\//, '').split('?')[0])))) {
        problems.missingImages.push(`${rel} -> ${src}`);
      }
      if (img.rawTagName === 'img' && !img.getAttribute('alt')) problems.emptyAlt++;
    }
  }

  // Content integrity: every sentence of source text must survive into the page.
  for (const doc of [...model.pages, ...model.posts]) {
    if (doc.url === '/' || doc.words < 8) continue;
    const file = path.join(OUT, doc.url.replace(/^\//, ''), 'index.html');
    if (!fs.existsSync(file)) { problems.contentLoss.push(`${doc.url} :: page missing`); continue; }
    const rendered = norm(toText(parse(fs.readFileSync(file, 'utf8')).querySelector('main').innerHTML));
    const source = norm(doc.text);
    // Every character of the source must appear, in order, in the rendered page.
    // Insertions (navigation, added links) are fine; omissions are not.
    // Whitespace is ignored because block boundaries legitimately reflow.
    const squash = (s) => s.replace(/\s+/g, '');
    const a = squash(source);
    const b = squash(rendered);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) i++;
      j++;
    }
    if (i < a.length) {
      const at = source.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
      problems.contentLoss.push(`${doc.url} :: diverges after ${i}/${a.length} chars — “…${at}…”`);
    }
  }

  // The old homepage was built entirely in Elementor, so it never came through
  // the REST API and the content check below cannot cover it. These are the
  // destinations its hero slider and card carousel promoted; the new homepage
  // must still link to every one of them.
  const HOMEPAGE_MUST_LINK = [
    '/about-us/',
    '/darker-pink/',
    '/treatment-lines/',
    '/aims-and-objectives/',
    '/about-us/red-flag-sbcinfographic/',
    '/trodelvynow/',
    '/metupuk-mental-health-social-media-survey/',
    '/aims-and-objectives/research-and-access-to-drugs/',
    '/latest-news/',
  ];
  const homeFile = path.join(OUT, 'index.html');
  const droppedFromHome = [];
  if (fs.existsSync(homeFile)) {
    const home = parse(fs.readFileSync(homeFile, 'utf8'));
    const mainEl = home.querySelector('main');
    const hrefs = new Set((mainEl || home).querySelectorAll('a[href]').map((a) => a.getAttribute('href').split('#')[0]));
    for (const u of HOMEPAGE_MUST_LINK) if (!hrefs.has(u)) droppedFromHome.push(u);
  } else {
    droppedFromHome.push('(no homepage built)');
  }

  // Original URLs from the live site must all still resolve.
  const originalPaths = [...model.pages, ...model.posts].map((d) => d.url);
  const gone = originalPaths.filter((u) => !resolves(u));

  const report = [
    `HTML pages built:        ${files.length}`,
    `Dead internal links:     ${problems.deadLinks.length}`,
    `Missing local media:     ${problems.missingImages.length}`,
    `Pages without an <h1>:   ${problems.noH1.length}`,
    `Pages without a <title>: ${problems.noTitle.length}`,
    `Images with empty alt:   ${problems.emptyAlt}`,
    `Content-loss warnings:   ${problems.contentLoss.length}`,
    `Original URLs now 404:   ${gone.length}`,
    `Homepage features lost:  ${droppedFromHome.length}`,
  ].join('\n');

  console.log(report + '\n');
  const show = (label, list, n = 15) => {
    if (!list.length) return;
    console.log(`--- ${label} (${list.length}) ---`);
    list.slice(0, n).forEach((x) => console.log('  ' + x));
    if (list.length > n) console.log(`  …and ${list.length - n} more`);
    console.log();
  };
  show('Dead internal links', problems.deadLinks);
  show('Missing local media', problems.missingImages);
  show('Pages without an h1', problems.noH1);
  show('Content-loss warnings', problems.contentLoss);
  show('Original URLs now 404', gone);
  show('Homepage no longer links to', droppedFromHome);

  return problems;
}

if (require.main === module) run();
module.exports = { run };
