// Offer the smaller copies of an inline picture that already exist.
//
// WordPress wrote its body images as a bare <img src> with no srcset, so the
// full upload is what every visitor downloads: a 2,560px photograph into a
// 700px column, 750KB where 60KB would do. 368 of the 575 body images on this
// site were like that, and for 130 of the 137 oversized ones the smaller files
// were already sitting in the media library — generated years ago by WordPress
// and never referenced by anything.
//
// So this adds nothing to disk. It reads what is there and writes the srcset
// that lets a browser choose.
//
// Only pictures wide enough to fill the column are touched, and that limit is
// the whole design rather than a tuning knob. `sizes` describes how wide the
// image will be painted; the honest description for a picture that fills the
// measure is "the column, or the viewport on a phone". Say that about a 150px
// thumbnail sitting inline and it becomes a lie in the expensive direction —
// the browser would size against the viewport and fetch a *larger* file than
// the one it downloads today. Below the threshold the existing single source
// is already the right answer, so it is left alone.
const { parse } = require('node-html-parser');
const { srcsetFor, sourceWidth } = require('./srcset');

// The reading column at its widest, and the point above which an image is
// certainly being scaled down to fit it.
const COLUMN = 780;
const FILLS_COLUMN = 800;

// What the browser is actually given to paint into: the measure on a desktop,
// the full width on a phone. True only for the images this touches.
const SIZES = `(min-width: 1024px) ${COLUMN}px, 100vw`;

function responsiveInline(html) {
  if (!html || !html.includes('<img')) return html;

  const root = parse(`<div>${html}</div>`).firstChild;
  let changed = false;

  for (const img of root.querySelectorAll('img')) {
    // Anything already responsive was either written that way by WordPress or
    // built by responsiveImg, and both know better than this pass does.
    if (img.getAttribute('srcset')) continue;

    const src = img.getAttribute('src');
    if (!src || !src.startsWith('/media/')) continue;

    // The declared width is WordPress's own and is usually right; fall back to
    // measuring the file when the attribute is missing.
    const declared = parseInt(img.getAttribute('width'), 10);
    const width = declared > 0 ? declared : sourceWidth(src);
    if (!(width >= FILLS_COLUMN)) continue;

    const set = srcsetFor(src, { maxWidth: 1560 });
    if (!set) continue;

    // src is left exactly as it was. It is the fallback, the page has already
    // declared its width and height, and changing it risks a different shape
    // for no gain — the srcset is what the browser will read.
    img.setAttribute('srcset', set.srcset);
    if (!img.getAttribute('sizes')) img.setAttribute('sizes', SIZES);
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    changed = true;
  }

  return changed ? root.innerHTML : html;
}

module.exports = { responsiveInline };
