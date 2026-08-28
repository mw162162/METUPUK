// Post-processing that the audit tool asked for: correct heading outlines,
// intrinsic image sizes, and accessible names for image-only links.
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');
const { imageSize } = require('../../tools/webaudit/lib/imagesize');
const layout = require('./layout');

const SCRAPE = path.join(__dirname, '..', '..', '_scrape');

// filename -> { width, height } for every rendition WordPress produced.
let DIMS = null;
function dimensions() {
  if (DIMS) return DIMS;
  DIMS = new Map();
  const file = path.join(SCRAPE, 'all_media.json');
  if (!fs.existsSync(file)) return DIMS;
  const base = (u) => decodeURIComponent(String(u).split('?')[0].split('/').pop() || '');
  for (const m of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    const d = m.media_details || {};
    if (d.width && d.height) DIMS.set(base(m.source_url), { w: d.width, h: d.height });
    for (const k of Object.keys(d.sizes || {})) {
      const s = d.sizes[k];
      if (s.width && s.height) DIMS.set(base(s.source_url), { w: s.width, h: s.height });
    }
  }
  return DIMS;
}

/* --- Headings that are really paragraphs -----------------------------------
   Nineteen headings across nine pages run to 120+ characters or several
   sentences. They were styled as headings in the old editor for emphasis, not
   because they title a section — so they render at display size in the body
   and fill the contents rail with paragraphs. Demote them to text, keeping the
   emphasis with a lead-paragraph class. */
function demoteFakeHeadings(html) {
  if (!/<h[2-6]/i.test(html)) return html;
  const root = parse(html);
  for (const h of root.querySelectorAll('h2, h3, h4, h5, h6')) {
    const text = h.text.replace(/\s+/g, ' ').trim();
    const sentences = (text.match(/[.!?]\s+[A-Z]/g) || []).length + 1;
    if (text.length <= 120 && sentences <= 1) continue;
    const p = parse('<p class="lead"></p>').firstChild;
    p.set_content(h.innerHTML);
    replaceNode(h, p);
  }
  return root.toString();
}

function replaceNode(node, replacement) {
  const parent = node.parentNode;
  if (!parent) return;
  const idx = parent.childNodes.indexOf(node);
  if (idx < 0) return;
  parent.childNodes.splice(idx, 1, replacement);
  replacement.parentNode = parent;
}

/* --- Headings -------------------------------------------------------------
   The page template already supplies the h1. Migrated bodies frequently start
   at h3 (or contain their own h1), which breaks the document outline that
   screen readers and search engines rely on. Shift the whole body so its
   top level is h2, preserving relative structure. */
function fixHeadings(html) {
  if (!/<h[1-6]/i.test(html)) return html;

  // Renumber rather than shift. A flat shift leaves an h1→h3 jump whenever the
  // body happens to use h2 further down; renumbering rebuilds the outline so
  // each heading is at most one level deeper than the one before it.
  const source = [];
  const re = /<h([1-6])(\s[^>]*)?>/gi;
  let m;
  while ((m = re.exec(html))) source.push({ index: m.index, length: m[0].length, level: +m[1], attrs: m[2] || '' });
  if (!source.length) return html;

  const target = [];
  let prev = 1; // the page template already provides the h1
  for (const h of source) {
    let level;
    if (!target.length) level = 2;
    else if (h.level > source[target.length - 1].level) level = Math.min(6, prev + 1);
    else if (h.level === source[target.length - 1].level) level = prev;
    else {
      // Going back up: find the nearest earlier heading at the same source
      // level and reuse the level we assigned it.
      let found = 2;
      for (let i = target.length - 1; i >= 0; i--) {
        if (source[i].level === h.level) { found = target[i]; break; }
        if (source[i].level < h.level) { found = Math.min(6, target[i] + 1); break; }
      }
      level = found;
    }
    target.push(level);
    prev = level;
  }

  // Rebuild back-to-front so earlier offsets stay valid.
  let out = html;
  for (let i = source.length - 1; i >= 0; i--) {
    const h = source[i];
    const newLevel = target[i];
    if (newLevel === h.level) continue;
    const open = `<h${newLevel}${h.attrs}>`;
    // Replace the matching close tag first.
    const closeRe = new RegExp(`</h${h.level}>`, 'i');
    const after = out.slice(h.index + h.length);
    const closeAt = after.search(closeRe);
    if (closeAt >= 0) {
      const absolute = h.index + h.length + closeAt;
      out = out.slice(0, absolute) + `</h${newLevel}>` + out.slice(absolute + `</h${h.level}>`.length);
    }
    out = out.slice(0, h.index) + open + out.slice(h.index + h.length);
  }
  return out;
}

/* --- Images ---------------------------------------------------------------
   Width and height let the browser reserve space, which removes layout shift
   (a Core Web Vitals factor). */
function fixImages(html) {
  if (!html.includes('<img')) return html;
  const dims = dimensions();
  const root = parse(html);

  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';

    // A src still pointing at metupuk.org.uk/wp-content means localisation
    // failed, which in practice means the file 404s on the old site too. A
    // broken-image icon helps nobody, so drop it.
    if (/metupuk\.org\.uk\/wp-content\//i.test(src)) {
      const parent = img.parentNode;
      if (!parent) continue;
      const idx = parent.childNodes.indexOf(img);
      if (idx >= 0) parent.childNodes.splice(idx, 1);
      continue;
    }

    // WordPress replaces emoji with images hosted on s.w.org. That is a remote
    // request per emoji and leaks the reader's IP to a third party — the actual
    // character does the job.
    if (/s\.w\.org\/images\/core\/emoji/i.test(src)) {
      const alt = img.getAttribute('alt') || '';
      const parent = img.parentNode;
      if (!parent) continue;
      const idx = parent.childNodes.indexOf(img);
      if (idx < 0) continue;
      const replacement = parse(alt ? `<span>${alt}</span>` : '<span></span>').firstChild;
      parent.childNodes.splice(idx, 1, replacement);
      replacement.parentNode = parent;
    }
  }

  for (const img of root.querySelectorAll('img')) {
    if (img.getAttribute('width') && img.getAttribute('height')) continue;
    const src = img.getAttribute('src');
    if (!src) continue;
    const key = decodeURIComponent(src.split('?')[0].split('/').pop() || '');
    const d = dims.get(key) ||
      (key.match(/-(\d+)x(\d+)\.[a-z]+$/i) ? { w: +RegExp.$1, h: +RegExp.$2 } : null) ||
      // Plugin chrome (social icons and the like) is a fixed small square.
      (/\/media\/plugin\//.test(src) ? { w: 16, h: 16 } : null);
    if (!d) continue;
    img.setAttribute('width', String(d.w));
    img.setAttribute('height', String(d.h));
  }
  return root.toString();
}

/* --- Tiny renditions ------------------------------------------------------
   WordPress's 150x150 crop was fine in a cramped page-builder card; shown at
   200px or more it is visibly soft. Swap in a larger rendition of the same
   upload and let CSS do the cropping. */
const ASSET_ROOT = path.join(SCRAPE, 'assets');
const dirListings = new Map();

function siblingRenditions(localSrc) {
  const rel = decodeURIComponent(localSrc.replace('/media/', ''));
  const dir = path.dirname(rel);
  if (!dirListings.has(dir)) {
    try { dirListings.set(dir, fs.readdirSync(path.join(ASSET_ROOT, dir))); }
    catch { dirListings.set(dir, []); }
  }
  const name = path.basename(rel);
  const m = name.match(/^(.*)-\d+x\d+(\.[a-z0-9]+)$/i);
  if (!m) return [];
  const [, base, ext] = m;
  const out = [];
  for (const file of dirListings.get(dir)) {
    const s = file.match(/^(.*)-(\d+)x(\d+)(\.[a-z0-9]+)$/i);
    if (s) {
      if (s[1] !== base || s[4].toLowerCase() !== ext.toLowerCase()) continue;
      out.push({ file: '/media/' + (dir === '.' ? '' : dir + '/') + file, w: +s[2], h: +s[3] });
      continue;
    }
    // The original upload carries no -WxH suffix but is the largest rendition
    // there is, so it belongs in the candidate list too.
    if (file !== base + ext) continue;
    const size = imageSize(path.join(ASSET_ROOT, dir, file));
    if (size && size.w) out.push({ file: '/media/' + (dir === '.' ? '' : dir + '/') + file, w: size.w, h: size.h });
  }
  return out.sort((a, b) => a.w - b.w);
}

function upgradeTinyImages(html) {
  if (!html.includes('<img')) return html;
  const root = parse(html);

  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('/media/')) continue;

    const current = src.match(/-(\d+)x(\d+)\.[a-z0-9]+$/i);
    const currentWidth = current ? +current[1] : 0;
    if (!currentWidth) continue; // already the original upload

    // How wide will this actually be painted? Inside a card or gallery the CSS
    // stretches the image to fill the slot, so the declared width is irrelevant
    // there; in flowing prose the image keeps its own size, capped by the column.
    const inProfile = img.closest('.profile');
    const inCard = img.closest('.c-card__media') || img.closest('.card__media');
    const inGallery = img.closest('.c-gallery');
    let display;
    if (inProfile) display = 280;
    else if (inCard) display = 390;
    else if (inGallery) display = 220;
    else {
      const declared = parseInt(img.getAttribute('width'), 10) || currentWidth;
      display = Math.min(declared, 700);
    }

    // Aim for twice the display width so it stays sharp on dense screens.
    const wanted = display * 2;

    const siblings = siblingRenditions(src);
    if (!siblings.length) continue;

    // Is this rendition a hard crop? Several of the old theme's registered
    // sizes had crop=true, so WordPress sliced a 3024x4032 portrait into a
    // 600x432 landscape and threw the rest away. The reader sees a photo with
    // its head cut off. Compare the rendition's shape against the original
    // upload's: when they disagree, the rendition is a crop, not a scale.
    const rel = decodeURIComponent(src.replace('/media/', ''));
    const m = path.basename(rel).match(/^(.*)-(\d+)x(\d+)(\.[a-z0-9]+)$/i);
    const originalName = m ? m[1] + m[4] : null;
    const original = originalName
      ? siblings.find((v) => path.basename(v.file) === originalName)
      : null;

    let cropped = false;
    if (original && original.h && m) {
      const originalRatio = original.w / original.h;
      const thisRatio = (+m[2]) / (+m[3]);
      cropped = Math.abs(originalRatio - thisRatio) / originalRatio > 0.06;
    }

    if (currentWidth >= wanted && !cropped) continue;

    // Only ever swap to a rendition shaped like the upload itself. Sorting the
    // ladder by width alone is what put a cropped image on the page in the
    // first place: a correct 225x300 portrait was "upgraded" to the wider
    // 600x432, which is a landscape crop of it. Wider is not better when the
    // extra pixels come from throwing away the top and bottom of the picture.
    let candidates = siblings;
    if (original && original.h) {
      const originalRatio = original.w / original.h;
      const sameShape = siblings.filter(
        (v) => v.h && Math.abs(v.w / v.h - originalRatio) / originalRatio <= 0.06
      );
      if (sameShape.length) candidates = sameShape;
      else if (cropped) continue;
    }

    // The smallest rendition that reaches the target, else the largest there is.
    const pick = candidates.find((v) => v.w >= wanted) || candidates[candidates.length - 1];
    if (!pick) continue;
    if (!cropped && pick.w <= currentWidth) continue;

    img.setAttribute('src', pick.file);
    img.setAttribute('width', String(pick.w));
    img.setAttribute('height', String(pick.h));
  }
  return root.toString();
}

/* --- Links ---------------------------------------------------------------- */
/* --- Small images in a wide column ----------------------------------------
   183 of the 198 images that sit alone as a block in prose were narrower than
   the reading column, most of them by a lot: a 640px picture in a 766px
   measure leaves a band of white down one side and stops the page dead.

   Where the upload has a rendition big enough to cover the full column, the
   image takes it and fills the width. Where it does not, it is left exactly as
   it was: filling the column from a small source would only trade white space
   for a soft picture, and that is a worse trade. */
function fillColumn(html, { measure = 880 } = {}) {
  if (!html || !html.includes('<img')) return html;
  const root = parse(html);

  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('/media/')) continue;

    // Only images standing alone as their own block. A linked image counts:
    // the anchor is a wrapper, not company for the picture.
    let host = img;
    let up = img.parentNode;
    if (up && (up.rawTagName || '').toLowerCase() === 'a') { host = up; up = up.parentNode; }
    const tag = up ? (up.rawTagName || '').toLowerCase() : '';
    const alone = tag === 'p' || tag === 'figure';
    // A caption is allowed; a paragraph of prose around the image is not.
    if (alone) {
      const stray = up.text.replace(/\s/g, '');
      const caption = up.querySelector('figcaption');
      const capLen = caption ? caption.text.replace(/\s/g, '').length : 0;
      if (stray - capLen > 0) continue;
      host = up;
    } else if (tag !== 'div') continue;
    if (img.closest('.c-card__media') || img.closest('.card__media')
      || img.closest('.c-gallery') || img.closest('.prose-grid')
      || img.closest('.profile') || img.closest('.tmm_member')) continue;

    const declared = parseInt(img.getAttribute('width'), 10) || 0;
    if (!declared || declared >= measure) continue;

    const siblings = siblingRenditions(src);
    if (!siblings.length) continue;
    const pick = siblings.find((v) => v.w >= measure * 2)
      || siblings[siblings.length - 1];
    if (!pick || pick.w < measure * 1.15) continue;

    img.setAttribute('src', pick.file);
    img.setAttribute('width', String(pick.w));
    img.setAttribute('height', String(pick.h));
    const cls = (host.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    if (!cls.includes('prose-fill')) cls.push('prose-fill');
    host.setAttribute('class', cls.join(' '));
  }
  return root.toString();
}

function fixLinks(html) {
  if (!html.includes('<a')) return html;
  const root = parse(html);
  for (const a of root.querySelectorAll('a')) {
    const href = (a.getAttribute('href') || '').trim();

    // An anchor with no destination is not a link. Neither is href="#", which
    // page builders leave behind for JavaScript that no longer exists.
    if (!href || href === '#' || href === '#top') {
      const parent = a.parentNode;
      if (!parent) continue;
      const idx = parent.childNodes.indexOf(a);
      if (idx < 0) continue;
      parent.childNodes.splice(idx, 1, ...a.childNodes);
      a.childNodes.forEach((n) => { n.parentNode = parent; });
      continue;
    }

    // An image-only link needs an accessible name.
    const hasText = a.text.replace(/\s+/g, '').length > 0;
    if (hasText || a.getAttribute('aria-label')) continue;
    const img = a.querySelector('img');

    // No text and no image — usually a link whose broken image we just removed.
    // An empty anchor is announced as an unlabelled link, so drop it.
    if (!img && !a.querySelector('svg, video, iframe')) {
      const parent = a.parentNode;
      if (!parent) continue;
      const idx = parent.childNodes.indexOf(a);
      if (idx >= 0) parent.childNodes.splice(idx, 1);
      continue;
    }
    if (!img) continue;
    const alt = (img.getAttribute('alt') || '').trim();
    if (alt) continue; // the image's own alt names the link
    const isImageFile = /\.(jpe?g|png|gif|webp|avif)$/i.test(href.split('?')[0]);
    a.setAttribute('aria-label', isImageFile ? 'View this image at full size' : 'Open linked item');
  }
  return root.toString();
}

/* --- Anchors --------------------------------------------------------------
   Some in-page links point at ids the old page builder generated. Where a
   heading obviously matches, restore the id so the link works again. */
function restoreAnchors(html) {
  if (!html.includes('href="#')) return html;
  const root = parse(html);
  const existing = new Set(root.querySelectorAll('[id]').map((el) => el.getAttribute('id')));
  const wanted = [...new Set(
    root.querySelectorAll('a[href^="#"]')
      .map((a) => decodeURIComponent((a.getAttribute('href') || '').slice(1)))
      .filter((h) => h && !existing.has(h))
  )];
  if (!wanted.length) return html;

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const stem = (s) => norm(s).replace(/(ies|es|s)$/, '');
  const headings = root.querySelectorAll('h2,h3,h4,h5,h6');

  for (const want of wanted) {
    const w = stem(want);
    if (w.length < 4) continue;
    const match =
      headings.find((h) => norm(h.text).startsWith(norm(want))) ||
      headings.find((h) => stem(h.text).includes(w));
    if (!match) continue;
    // Reuse the heading's existing id rather than adding a second one.
    const id = match.getAttribute('id');
    if (id) {
      for (const a of root.querySelectorAll(`a[href="#${want}"]`)) a.setAttribute('href', '#' + id);
    } else {
      match.setAttribute('id', want);
    }
    existing.add(want);
  }

  // Anything still unmatched points nowhere; keep the words, drop the link.
  for (const a of root.querySelectorAll('a[href^="#"]')) {
    const id = decodeURIComponent((a.getAttribute('href') || '').slice(1));
    if (!id || existing.has(id) || root.querySelector(`[id="${id}"]`)) continue;
    const parent = a.parentNode;
    if (!parent) continue;
    const idx = parent.childNodes.indexOf(a);
    if (idx < 0) continue;
    parent.childNodes.splice(idx, 1, ...a.childNodes);
    a.childNodes.forEach((n) => { n.parentNode = parent; });
  }
  return root.toString();
}

// A short quotation can carry display styling. A long one — the MP letter
// template runs to 662 words — has to read as body text, or it becomes a wall
// of italics nobody finishes.
function classifyQuotes(html) {
  if (!html.includes('<blockquote')) return html;
  const root = parse(html);
  for (const q of root.querySelectorAll('blockquote')) {
    const words = q.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    if (words > 45) q.setAttribute('class', 'is-long');
  }
  return root.toString();
}

/* --- Team-member blocks ---------------------------------------------------
   The old site used a Team Members plugin for the people pages, including the
   memorial page. Its stylesheet did not survive the migration, so a deliberate
   three-column layout collapsed into one very long column, and its social
   links were 16px raster PNGs shipped inside the plugin folder. The markup is
   sound; it just needs its own icons back and a grid to sit in. Nothing is
   reordered or removed. */
const TMM_ICONS = {
  // Same paths the header, footer and side rail use, so a link to Instagram
  // looks the same wherever it appears.
  facebook: 'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z',
  twitter: 'M18.9 2H22l-6.8 7.8L23 22h-6.3l-4.9-6.4L6.2 22H3l7.3-8.3L2.4 2h6.4l4.4 5.8L18.9 2Zm-1.1 18h1.7L8.3 3.8H6.5L17.8 20Z',
  instagram: 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1Zm0 3.8a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 9.9a3.9 3.9 0 1 1 0-7.8 3.9 3.9 0 0 1 0 7.8Zm7.6-10.1a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0Z',
};

function teamMembers(html) {
  if (!html || !html.includes('tmm_')) return html;
  const root = parse(html);

  for (const name of root.querySelectorAll('.tmm_names')) {
    const t = name.text.replace(/\s+/g, ' ').trim();
    if (t && t !== name.text) name.set_content(t);
  }

  for (const img of root.querySelectorAll('.tmm_scblock img')) {
    const src = img.getAttribute('src') || '';
    const m = src.match(/links\/([a-z]+)\.png$/i);
    const icon = m && TMM_ICONS[m[1].toLowerCase()];
    if (!icon) continue;
    const label = img.getAttribute('alt') || m[1];
    const svg = parse(
      `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${icon}"/></svg>`
    ).firstChild;
    replaceNode(img, svg);
    // The alt text moves onto the link, which is the thing being described.
    const a = svg.closest ? svg.closest('a') : null;
    if (a && !a.getAttribute('aria-label')) a.setAttribute('aria-label', label);
  }

  // "Died 23.2.20" trails the biography as a bare text node. On a memorial page
  // that line is the point, so give it an element it can be styled through.
  for (const desc of root.querySelectorAll('.tmm_desc')) {
    // Most entries end with a <p>; a few trail off as a bare text node. Both
    // say the same thing, so both end up as the same element.
    for (const node of desc.childNodes.slice()) {
      if (node.nodeType !== 3) continue;
      const text = node.rawText.trim();
      if (!/^Died\b/i.test(text)) continue;
      const el = parse(`<p>${text}</p>`).firstChild;
      const idx = desc.childNodes.indexOf(node);
      desc.childNodes.splice(idx, 1, el);
      el.parentNode = desc;
    }
    // Not always the final paragraph: several entries note the treatment
    // funding route after the date.
    for (const para of desc.querySelectorAll('p')) {
      if (!/^Died\b/i.test(para.text.trim())) continue;
      const cls = (para.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      if (!cls.includes('tmm_died')) { cls.push('tmm_died'); para.setAttribute('class', cls.join(' ')); }
    }
  }

  return root.toString();
}

function enrich(html) {
  if (!html) return html;
  let out = demoteFakeHeadings(html);
  out = fixHeadings(out);
  out = upgradeTinyImages(out);
  out = fixImages(out);
  out = fixLinks(out);
  out = restoreAnchors(out);
  out = classifyQuotes(out);
  out = teamMembers(out);
  out = layout.group(out);
  out = layout.floatNarrow(out);
  out = fillColumn(out);
  out = layout.profiles(out);
  return out;
}

module.exports = { enrich, fixHeadings, fixImages, fixLinks, restoreAnchors, teamMembers };
