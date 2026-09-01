// Assemble one content model from the scraped WordPress export.
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');
const { clean, toText } = require('./clean');
const { imageSize: measure } = require('../../tools/webaudit/lib/imagesize');

const SCRAPE = path.join(__dirname, '..', '..', '_scrape');
const SITE = 'https://metupuk.org.uk';

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(SCRAPE, f), 'utf8'));

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&#0?38;|&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8230;/g, '…')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}

// Remote media URL -> local path under /media, mirroring the uploads tree.
function mediaPath(url) {
  let p;
  try { p = new URL(url, SITE).pathname; } catch { return null; }
  if (/^\/wp-content\/uploads\//.test(p)) return '/media/' + decodeURIComponent(p.replace('/wp-content/uploads/', ''));
  if (/^\/wp-content\/plugins\//.test(p)) return '/media/plugin/' + decodeURIComponent(p.replace('/wp-content/plugins/', ''));
  if (/^\/wp-content\/themes\//.test(p)) return '/media/theme/' + decodeURIComponent(p.replace('/wp-content/themes/', ''));
  // Only treat an exhibition URL as media when it names an actual file —
  // /darker-side-of-pink/ itself is a page, not an asset.
  if (/^\/darker-side-of-pink\/.+\.[a-z0-9]{2,5}$/i.test(p)) {
    return '/media/dsop/' + decodeURIComponent(p.replace('/darker-side-of-pink/', ''));
  }
  return null;
}

const ASSET_ROOT = path.join(SCRAPE, 'assets');
const haveAsset = (localUrl) => {
  if (!localUrl) return false;
  const rel = localUrl.replace(/^\/media\//, '');
  return fs.existsSync(path.join(ASSET_ROOT, rel));
};

// Rewrite a media reference to the local copy, falling back to the live URL
// if we never managed to download that particular file.
function rewriteMedia(src) {
  if (!src) return src;
  const s = src.replace(/&amp;/g, '&').trim();
  if (!/metupuk\.org\.uk/i.test(s) && /^https?:/i.test(s)) return s;
  const local = mediaPath(s);
  if (local && haveAsset(local)) return local;
  return s.replace(/^http:/, 'https:');
}

// Keep every original URL path intact so no inbound link or bookmark breaks.
function rewriteLink(href) {
  if (!href) return href;
  let h = href.replace(/&amp;/g, '&').trim();
  if (/^(mailto:|tel:|#|javascript:)/i.test(h)) return h;
  if (!/^https?:\/\//i.test(h)) return h;
  let u;
  try { u = new URL(h); } catch { return h; }
  if (!/(^|\.)metupuk\.org\.uk$/i.test(u.hostname)) return h;
  const asMedia = mediaPath(u.pathname);
  if (asMedia && haveAsset(asMedia)) return asMedia + (u.hash || '');
  let p = u.pathname;
  if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/';
  return p + (u.search || '') + (u.hash || '');
}

const { loadAltIndex } = require('./media-meta');
const ALT_INDEX = loadAltIndex();

// Look an image up by filename, so every resized variant inherits the same
// description as the original upload.
function altFor(src) {
  if (!src) return '';
  const base = decodeURIComponent(src.split('?')[0].split('/').pop() || '');
  return ALT_INDEX.get(base) || '';
}

const cleanOpts = { rewriteMedia, rewriteLink, altFor };

// ---------------------------------------------------------------------------

// Index the whole media library, not just the featured-image subset — an
// earlier partial fetch left a third of the posts looking image-less.
function buildMediaIndex() {
  const map = new Map();
  const add = (id, url, alt, w, h) => {
    if (!id || !url || map.has(id)) return;
    map.set(id, { id, src: rewriteMedia(url), alt: decodeEntities(alt || ''), width: w || null, height: h || null });
  };

  if (fs.existsSync(path.join(SCRAPE, 'all_media.json'))) {
    for (const m of readJson('all_media.json')) {
      const d = m.media_details || {};
      // Prefer a large-but-not-enormous rendition for cards and social cards.
      const sizes = d.sizes || {};
      const pick = sizes.large || sizes['1536x1536'] || sizes.medium_large || null;
      add(m.id, (pick && pick.source_url) || m.source_url,
        (m.alt_text || '').trim() || (m.caption && m.caption.rendered) || (m.title && m.title.rendered),
        (pick && pick.width) || d.width, (pick && pick.height) || d.height);
    }
  }
  // Anything the earlier featured-media pass caught that the full list missed.
  if (fs.existsSync(path.join(SCRAPE, 'featured_media.json'))) {
    for (const m of readJson('featured_media.json')) add(m.id, m.url, m.alt || m.title, m.w, m.h);
  }
  return map;
}

// Some pages are built entirely in Elementor, so the REST API returns nothing.
// For those we fall back to the rendered HTML we scraped.
function scrapedBody(fileBase) {
  const f = path.join(SCRAPE, 'html', fileBase + '.html');
  if (!fs.existsSync(f)) return '';
  const html = fs.readFileSync(f, 'utf8');
  const root = parse(html);
  const main =
    root.querySelector('.entry-content') ||
    root.querySelector('.elementor-location-single') ||
    root.querySelector('main') ||
    root.querySelector('#content') ||
    root.querySelector('article');
  return main ? main.innerHTML : '';
}

const ELEMENTOR_FALLBACK = {
  2673: 'darker-pink_jan-greenwood_',
  2678: 'darker-pink_lesley-eaton_',
  3618: 'metupuk-around-the-uk_mbc-scotland-coming-soon_',
  3620: 'metupuk-around-the-uk_mbc-n-i-coming-soon_',
  3905: '2024_05_what-not-to-say-mean-well-stupid-things-people-say-rebecca-brown_',
};

function pathOf(link) {
  try {
    let p = new URL(link, SITE).pathname;
    if (!p.endsWith('/')) p += '/';
    return p;
  } catch { return '/'; }
}

// Fallback image when a document has no featured image: the first content
// image that is actually a picture. Judge the ORIGINAL upload, not whichever
// small rendition the editor happened to insert — a portrait photo placed at
// 225px wide usually has a 2000px original sitting next to it.
// Dimensions for the image a page leads with. WordPress supplies them for a
// featured image and for nothing else, so anything picked out of the body has
// to be measured off disk. Zero here is not "small", it is "unknown", and
// every caller that treats those as the same thing gets it wrong.
function measured(feat, src) {
  if (feat && feat.width) return { imageWidth: feat.width, imageHeight: feat.height || 0 };
  if (!src || !src.startsWith('/media/')) return { imageWidth: 0, imageHeight: 0 };
  const original = src.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
  const file = path.join(ASSET_ROOT, decodeURIComponent(original.replace('/media/', '')));
  const size = fs.existsSync(file) ? measure(file) : null;
  return { imageWidth: (size && size.w) || 0, imageHeight: (size && size.h) || 0 };
}

function firstImage(html) {
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    const src = (tag.match(/src="([^"]+)"/i) || [])[1];
    if (!src || !src.startsWith('/media/')) continue;
    if (/\/media\/(plugin|theme)\//.test(src)) continue;

    const original = src.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
    const file = path.join(ASSET_ROOT, decodeURIComponent(original.replace('/media/', '')));
    const size = fs.existsSync(file) ? measure(file) : null;

    // Good enough to represent the article if the original can fill a card.
    if (size && size.w >= 500) return original;

    // No original on disk: fall back to judging the rendition itself.
    const width = +(tag.match(/width="(\d+)"/i) || [])[1] || 0;
    const sized = src.match(/-(\d+)x(\d+)\.[a-z0-9]+$/i);
    const known = width || (sized ? +sized[1] : 0);
    if (known && known < 300) continue;
    return src;
  }
  return null;
}

function summarise(text, max = 165) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
  return cut.slice(0, stop > 60 ? stop : max).trim() + '…';
}

function build() {
  const media = buildMediaIndex();
  const rawPages = readJson('all_pages.json');
  const rawPosts = readJson('all_posts.json');
  const categories = readJson('cats.json');

  const catById = new Map(categories.map((c) => [c.id, {
    id: c.id,
    name: decodeEntities(c.name),
    slug: c.slug,
    count: c.count,
  }]));

  const makeDoc = (raw, kind) => {
    let rawHtml = (raw.content && raw.content.rendered) || '';
    if (toText(rawHtml).length < 40 && ELEMENTOR_FALLBACK[raw.id]) {
      rawHtml = scrapedBody(ELEMENTOR_FALLBACK[raw.id]) || rawHtml;
    }
    const html = clean(rawHtml, cleanOpts);
    const text = toText(html);
    // A page whose body is a team-member grid has no prose of its own, so
    // summarising it produces the first person's medical history presented as
    // an introduction to the page. Summarise only what sits outside the grid;
    // where that leaves nothing, the page simply gets no standfirst.
    const summaryText = html.includes('tmm_wrap')
      ? toText(html.replace(/<div[^>]*class="[^"]*tmm_wrap[\s\S]*$/i, ''))
      : text;
    const excerptHtml = clean((raw.excerpt && raw.excerpt.rendered) || '', cleanOpts);
    const feat = media.get(raw.featured_media) || null;
    return {
      kind,
      id: raw.id,
      slug: raw.slug,
      title: decodeEntities((raw.title && raw.title.rendered) || raw.slug),
      url: pathOf(raw.link),
      parent: raw.parent || 0,
      order: raw.menu_order || 0,
      date: raw.date || null,
      modified: raw.modified || null,
      html,
      text,
      words: text ? text.split(/\s+/).length : 0,
      excerpt: summarise(toText(excerptHtml) || summaryText, 200),
      description: summarise(toText(excerptHtml) || summaryText, 165),
      image: feat ? feat.src : firstImage(html),
      imageAlt: feat ? feat.alt : '',
      // Intrinsic width of the chosen image, so templates can decline to
      // stretch a small upload across a full-width slot.
      // Measured from the file when WordPress has no record of it. Only a
      // featured image carries dimensions in the API; one found in the body
      // does not, and reporting that as zero let the banner treat "unknown" as
      // "big enough" and stretch a 492px newspaper clipping across 1600px.
      ...measured(feat, feat ? feat.src : firstImage(html)),
      categories: (raw.categories || []).map((id) => catById.get(id)).filter(Boolean).filter((c) => c.slug !== 'uncategorized'),
    };
  };

  const pages = rawPages.map((p) => makeDoc(p, 'page'));
  const posts = rawPosts.map((p) => makeDoc(p, 'post'))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const pageById = new Map(pages.map((p) => [p.id, p]));
  for (const p of pages) {
    p.children = pages.filter((c) => c.parent === p.id).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    const trail = [];
    let cur = p;
    while (cur && cur.parent && pageById.has(cur.parent)) {
      cur = pageById.get(cur.parent);
      trail.unshift({ title: cur.title, url: cur.url });
    }
    p.breadcrumb = trail;
  }

  return { pages, posts, pageById, categories: [...catById.values()], media };
}

// The same model, sourced from the editable files rather than the scrape.
// Kept here rather than in content-model.js so the helpers that derive what
// content/ does not store — summaries, word counts, image dimensions — are the
// single implementation both sources share. Two implementations would drift,
// and the whole point of the switch is that the output does not change.
function buildFromContent() {
  return require('./content-model').build({
    summarise,
    measured,
    firstImage,
    media: buildMediaIndex(),
  });
}

module.exports = { build, buildFromContent, decodeEntities, rewriteMedia, rewriteLink, summarise, SITE };
