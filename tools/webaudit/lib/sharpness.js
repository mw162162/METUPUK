// Is every image sharp at the size it is shown?
//
// An image looks soft when the pixels it contains are fewer than the CSS pixels
// it is painted across. This compares the widest source the browser can pick
// (src, or the largest srcset candidate) against the width the layout gives it.
//
// Display widths come from a profile keyed on the element's own classes, since
// only the site's CSS knows how wide a component actually renders. The default
// profile below matches this project; pass your own for another site.
const fs = require('fs');
const path = require('path');
const { imageSize } = require('./imagesize');

// Where an image lands, and how wide it is painted there.
//
//   fluid: true  — CSS stretches it to fill the slot, so the slot width is the
//                  display width whatever the file's own size.
//   fluid: false — it keeps its intrinsic size, merely capped by the container
//                  (the max-width: 100% case). A 32px icon in a 700px column is
//                  painted at 32px, not stretched across the column.
const DEFAULT_PROFILE = [
  { match: (el) => el.classList.contains('hero__bg'), width: 1600, fluid: true, label: 'full-bleed hero' },
  { match: (el) => el.classList.contains('page-head__bg'), width: 1600, fluid: true, label: 'page banner' },
  // Most specific first: the face tiles sit *inside* the pinned media, so the
  // full-bleed rule would otherwise claim them and report a crisp 323px tile as
  // a 0.20x disaster. Any nested slot has to be listed above its container.
  { match: (el) => el.classList.contains('scrolly__face'), width: 112, fluid: true, label: 'portrait tile' },
  { match: (el) => el.closest('.scrolly__media'), width: 1600, fluid: true, label: 'pinned background' },
  // A deliberately contained hero keeps the image at its own size, so it is
  // measured like body content rather than a full-width slot.
  { match: (el) => el.closest('.post-hero--contained'), width: 480, fluid: false, label: 'contained hero' },
  { match: (el) => el.closest('.post-hero'), width: 780, fluid: true, label: 'article hero' },
  { match: (el) => el.closest('.montage'), width: 150, fluid: true, label: 'montage tile' },
  { match: (el) => el.closest('.portrait'), width: 190, fluid: true, label: 'portrait tile' },
  { match: (el) => el.closest('.card__media'), width: 390, fluid: true, label: 'card' },
  { match: (el) => el.closest('.profile'), width: 280, fluid: true, label: 'profile tile' },
  { match: (el) => el.closest('.c-card__media'), width: 380, fluid: true, label: 'content card' },
  { match: (el) => el.closest('.c-gallery'), width: 220, fluid: true, label: 'gallery tile' },
  { match: (el) => el.closest('.brand'), width: 44, fluid: true, label: 'logo' },
  { match: (el) => el.closest('.social'), width: 24, fluid: true, label: 'icon' },
  { match: (el) => el.closest('.prose'), width: 700, fluid: false, label: 'article body' },
];

// Below 1.0 the browser is enlarging the file — but enlargement only becomes
// visible somewhere around a tenth. Compared side by side, a 0.96x hero is
// indistinguishable from the same region at twice the pixels, while a 0.75x
// banner turns 8pt infographic text to mush. So 0.9 is where the report calls
// something stretched; between 0.9 and 1.5 it is merely short of retina.
//
// Fine text is the worst case and soft-focus photography the mildest, which no
// ratio can tell apart — treat a flagged infographic as more urgent than a
// flagged portrait.
const UPSCALED = 0.9;
const SOFT = 1.5;

function widestSource(el, root, resolveFile) {
  const candidates = [];

  const add = (url) => {
    if (!url || /^(https?:|data:)/i.test(url)) return;
    const file = resolveFile(url);
    if (!file || !fs.existsSync(file)) return;
    const size = imageSize(file);
    if (size && size.w) candidates.push({ url, w: size.w, vector: !!size.vector });
  };

  add(el.getAttribute('src'));
  const srcset = el.getAttribute('srcset');
  if (srcset) {
    for (const part of srcset.split(',')) add(part.trim().split(/\s+/)[0]);
  }
  // <picture><source srcset>
  const picture = el.closest('picture');
  if (picture) {
    for (const s of picture.querySelectorAll('source[srcset]')) {
      for (const part of (s.getAttribute('srcset') || '').split(',')) add(part.trim().split(/\s+/)[0]);
    }
  }

  if (!candidates.length) return null;
  return candidates.reduce((best, c) => (c.w > best.w ? c : best));
}

// Is there a larger file on disk that this image could have used? If not, the
// original upload is the ceiling and no amount of markup fixes it.
function largestOnDisk(url, resolveFile) {
  const file = resolveFile(url);
  if (!file) return 0;
  const dir = path.dirname(file);
  const name = path.basename(file);
  const m = name.match(/^(.*?)(?:-\d+x\d+)?(\.[a-z0-9]+)$/i);
  if (!m) return 0;
  const [, base, ext] = m;

  let widest = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return 0; }
  for (const entry of entries) {
    const e = entry.match(/^(.*?)(?:-(\d+)x(\d+))?(\.[a-z0-9]+)$/i);
    if (!e || e[1] !== base || e[4].toLowerCase() !== ext.toLowerCase()) continue;
    const size = e[2] ? { w: +e[2] } : imageSize(path.join(dir, entry));
    if (size && size.w > widest) widest = size.w;
  }
  return widest;
}

function check(site, add, { profile = DEFAULT_PROFILE, root } = {}) {
  const outRoot = root || site.root;
  if (!outRoot || site.kind !== 'directory') return; // needs files on disk

  const resolveFile = (url) => {
    const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
    if (!clean.startsWith('/')) return null;
    return path.join(outRoot, clean.replace(/^\//, ''));
  };

  const worst = new Map(); // file -> finding, so one image is reported once

  for (const page of site.pages) {
    for (const el of page.dom.querySelectorAll('img')) {
      const rule = profile.find((r) => {
        try { return r.match(el); } catch { return false; }
      });
      if (!rule) continue;

      const best = widestSource(el, page.dom, resolveFile);
      if (!best) continue;
      if (best.vector) continue; // SVG scales losslessly

      // For a non-fluid slot the image is drawn at its own width, shrunk only
      // if it exceeds the container.
      let displayWidth = rule.width;
      if (!rule.fluid) {
        const declared = parseInt(el.getAttribute('width'), 10);
        const natural = declared > 0 ? declared : best.w;
        displayWidth = Math.min(natural, rule.width);
      }
      // An image only a little smaller than its slot is not worth reporting.
      if (displayWidth < 64) continue;

      const ratio = best.w / displayWidth;
      // A design-controlled slot (hero, card, banner) should carry a 2x source,
      // so anything under 1.5x is worth flagging. An inline content image shown
      // at its own natural size is not a defect — only real stretching is.
      const threshold = rule.fluid ? SOFT : UPSCALED;
      if (ratio >= threshold) continue;

      const key = best.url;
      const existing = worst.get(key);
      if (existing && existing.ratio <= ratio) continue;

      // Separate "you referenced too small a rendition" — which is a bug in the
      // markup and fixable today — from "the original upload is this size",
      // which needs a better photograph and cannot be code-fixed.
      const ceiling = largestOnDisk(best.url, resolveFile);
      const couldBeBigger = ceiling > best.w + 1;

      // Ask "can this be fixed?" before "how bad is it?". Ordering these the
      // other way round reported 55 hero images as needing a larger rendition
      // when the largest file that exists is already in use: a fix nobody can
      // carry out, which is worse than saying nothing because it teaches people
      // to skim past the report.
      let id;
      let severity;
      let fix;
      if (!couldBeBigger && ratio < UPSCALED) {
        // The layout is enlarging the file. Visible on any screen, and only a
        // better photograph fixes it.
        id = 'image-source-lowres';
        severity = 'warning';
        fix = 'The original upload is this size, so no rendition can be sharper. ' +
          'Re-upload a higher-resolution original, or present the image smaller.';
      } else if (!couldBeBigger) {
        // Between 1x and 2x: correct on an ordinary screen, short of crisp on a
        // dense one. Reported apart from the case above, because filing the two
        // together turns a handful of real defects into a hundred-item list
        // nobody reads — which is how the real ones stay unfixed.
        id = 'image-source-not-retina';
        severity = 'note';
        fix = 'Sharp on a standard screen but not on a dense one. Worth acting on only ' +
          'where the image carries the page — a hero or a banner — and then only by ' +
          're-uploading a larger original.';
      } else if (ratio >= UPSCALED) {
        id = 'image-soft';
        severity = 'warning';
        fix = `A ${ceiling}px version already exists; reference it via srcset so dense screens get it.`;
      } else {
        id = 'image-upscaled';
        severity = 'error';
        fix = `A ${ceiling}px version of this image already exists — reference that instead.`;
      }

      worst.set(key, {
        id,
        severity,
        page: page.url,
        ratio,
        detail: `${best.url} is ${best.w}px wide but is displayed at about ${displayWidth}px in a ${rule.label} ` +
          `(${ratio.toFixed(2)}x).` +
          (id === 'image-source-lowres' ? ' This is the largest version that exists.' : ''),
        fix,
      });
    }
  }

  [...worst.values()]
    .sort((a, b) => a.ratio - b.ratio)
    .forEach((f) => add(f));
}

module.exports = { check, DEFAULT_PROFILE };
