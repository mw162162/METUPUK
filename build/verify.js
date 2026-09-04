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

// Control characters are debris, not content. One post carries a literal
// U+0002 inside a URL from twenty years of copy-and-paste; the export strips
// it so the file can be parsed at all, and comparing a stripped page against
// an unstripped source would report that cleanup as a loss.
const norm = (s) => (s || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .replace(/[\s ]+/g, ' ')
  .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-').replace(/…/g, '...')
  .toLowerCase().trim();

// Text taken off a page on purpose, and the reason for each.
//
// The integrity check below compares the built page against the original
// WordPress export, so anything removed deliberately looks exactly like the
// build dropping it. That is the check working: a silent omission and a
// considered edit are indistinguishable from the outside, so the difference
// has to be written down.
//
// Nothing goes in here to make a warning go away. It goes in here when a
// person decided the text should not be published and said why — which keeps
// the promise meaningful for the other 5,000 characters on the page and the
// 375 pages beside it.
const REMOVED_ON_PURPOSE = [
  {
    url: '/about-metupuk/',
    text: 'Click here',
    times: 6,
    why: 'Six empty <a href="#"> links left behind by the WordPress theme. They were '
      + 'the first words on the page, and because the description is derived from the '
      + 'opening body text they were also its Google snippet.',
  },
  {
    url: '/about-metupuk/',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut elit tellus, '
      + 'luctus nec ullamcorper mattis, pulvinar dapibus leo.',
    times: 1,
    why: "The theme's placeholder paragraph, published as it came.",
  },
];

// Take the sanctioned removals out of the source before comparing, and say so
// if one no longer matches — an exception that has stopped applying is a line
// nobody has read since it was written.
function expected(doc, note) {
  let text = doc.text || '';
  for (const r of REMOVED_ON_PURPOSE) {
    if (r.url !== doc.url) continue;
    const found = text.split(r.text).length - 1;
    if (found !== r.times) {
      note(`${doc.url} :: exception for ${JSON.stringify(r.text.slice(0, 40))} expected ${r.times}, source has ${found}`);
      continue;
    }
    text = text.split(r.text).join(' ');
  }
  return text;
}

// Is this build visible to search engines?
//
// src/static/_headers currently sends X-Robots-Tag: noindex on every path,
// which is correct while the site is a preview under someone else's domain and
// catastrophic the day it is not: the pages would be live, linked and indexed
// by nobody. robots.txt says the opposite, so the two cannot both be read as
// intent. Reported on every build so that switching the domain and forgetting
// this cannot happen quietly.
function indexingState() {
  const file = path.join(ROOT, 'src', 'static', '_headers');
  if (!fs.existsSync(file)) return { blocked: false, why: 'no _headers file' };
  const text = fs.readFileSync(file, 'utf8');
  const blocked = /^[ 	]*X-Robots-Tag:.*noindex/im.test(text);
  return { blocked, why: blocked ? 'X-Robots-Tag: noindex in src/static/_headers' : '' };
}

function run() {
  const model = buildModel();
  // The editor at /admin is an application shell, not a page of the site: it
  // has no heading and no content, and counting it would put a permanent
  // false warning in this report.
  const files = walkFiles(OUT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !f.replace(/\\/g, '/').includes('/admin/'));
  const problems = { deadLinks: [], missingImages: [], noH1: [], noTitle: [], contentLoss: [], staleExceptions: [], emptyAlt: 0, emptyAltPages: [] };
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
      // An image with no alt at all is a gap. An image with alt="" and either
      // role="presentation" or aria-hidden is a decision someone made, and is
      // not counted — the page-head backgrounds are the second kind.
      if (img.rawTagName === 'img' && !img.getAttribute('alt')
        && img.getAttribute('role') !== 'presentation'
        && img.getAttribute('aria-hidden') !== 'true') {
        problems.emptyAlt++;
        if (problems.emptyAltPages.length < 12) {
          const src = img.getAttribute('src') || '?';
          problems.emptyAltPages.push(`${rel} -> ${src}`);
        }
      }
    }
  }

  // Content integrity: every sentence of source text must survive into the page.
  for (const doc of [...model.pages, ...model.posts]) {
    if (doc.url === '/' || doc.words < 8) continue;
    const file = path.join(OUT, doc.url.replace(/^\//, ''), 'index.html');
    if (!fs.existsSync(file)) { problems.contentLoss.push(`${doc.url} :: page missing`); continue; }
    const rendered = norm(toText(parse(fs.readFileSync(file, 'utf8')).querySelector('main').innerHTML));
    const source = norm(expected(doc, (m) => problems.staleExceptions.push(m)));
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

  const indexing = indexingState();
  const report = [
    `HTML pages built:        ${files.length}`,
    `Dead internal links:     ${problems.deadLinks.length}`,
    `Missing local media:     ${problems.missingImages.length}`,
    `Pages without an <h1>:   ${problems.noH1.length}`,
    `Pages without a <title>: ${problems.noTitle.length}`,
    `Images with empty alt:   ${problems.emptyAlt}`,
    `Content-loss warnings:   ${problems.contentLoss.length}`,
    `Stale exceptions:        ${problems.staleExceptions.length}`,
    `Original URLs now 404:   ${gone.length}`,
    `Homepage features lost:  ${droppedFromHome.length}`,
    `Search engines:          ${indexing.blocked ? 'BLOCKED — ' + indexing.why : 'allowed'}`,
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
  if (indexing.blocked) {
    console.log('--- Search engines are blocked ---');
    console.log('  Every page sends X-Robots-Tag: noindex, so none of this site can rank.');
    console.log('  Correct for a preview on netlify.app. Before pointing metupuk.org.uk');
    console.log('  here, delete the "/*  X-Robots-Tag: noindex" rule at the end of');
    console.log('  src/static/_headers — otherwise the site goes live invisible.');
    console.log();
  }
  show('Content-loss warnings', problems.contentLoss);
  show('Removals that no longer match the source', problems.staleExceptions);
  show('Original URLs now 404', gone);
  show('Homepage no longer links to', droppedFromHome);

  return problems;
}

if (require.main === module) run();
module.exports = { run };
