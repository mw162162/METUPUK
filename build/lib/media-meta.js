// Alt text for migrated images, taken from the charity's own media library.
// We never invent a description: if WordPress has no alt, caption or meaningful
// title for an image, it stays alt="" rather than getting a guessed one.
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

const SCRAPE = path.join(__dirname, '..', '..', '_scrape');

const strip = (html) => parse(html || '').text.replace(/\s+/g, ' ').trim();

// "Set up for conference with METUPUK" is useful. "IMG_20220427_145626732" is not.
const FILENAMEY = /^(img|dsc|dscn|pxl|p\d|image|photo|screenshot|untitled|cropped|final|copy|new|whatsapp)[\s_-]*[\d_-]*$/i;
const NOISE = /^[\d\s_-]+$/;

function titleToAlt(title) {
  if (!title) return '';
  let t = strip(title)
    .replace(/\.(jpe?g|png|gif|webp|svg)$/i, '')
    .replace(/^cropped-/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length < 4) return '';
  if (FILENAMEY.test(t) || NOISE.test(t)) return '';
  // Reject strings that are mostly digits — almost always camera filenames.
  const digits = (t.match(/\d/g) || []).length;
  if (digits / t.length > 0.35) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function loadAltIndex() {
  const file = path.join(SCRAPE, 'all_media.json');
  const byFile = new Map();
  if (!fs.existsSync(file)) return byFile;

  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const m of items) {
    const alt =
      strip(m.alt_text) ||
      strip(m.caption && m.caption.rendered) ||
      titleToAlt(m.title && m.title.rendered);
    if (!alt) continue;

    // Register the original plus every resized variant WordPress generated,
    // so a 300x169 thumbnail picks up the same description as the full image.
    const urls = [m.source_url];
    const sizes = (m.media_details && m.media_details.sizes) || {};
    for (const k of Object.keys(sizes)) if (sizes[k].source_url) urls.push(sizes[k].source_url);
    for (const u of urls) {
      if (!u) continue;
      const base = decodeURIComponent(u.split('/').pop().split('?')[0]);
      if (!byFile.has(base)) byFile.set(base, alt);
    }
  }
  return byFile;
}

module.exports = { loadAltIndex, titleToAlt };
