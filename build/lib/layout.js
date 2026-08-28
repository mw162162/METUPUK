// Article layout: remove the dead space migrated content leaves behind.
//
// Two patterns cause almost all of it:
//
//   1. Runs of images stacked one per row. The old editor inserted them as
//      separate paragraphs, so four photos became four full-width rows with a
//      gap between each. They belong in a grid.
//
// Only runs whose images are a similar shape are grouped; a banner next to a
// portrait stays stacked, because tiling those leaves a worse gap than the one
// it closes.
//
// Nothing is reordered or removed - blocks are only regrouped - so the
// content-integrity check still passes character for character.
const { parse } = require('node-html-parser');

// A block that is really just an image: a bare <img>, a <figure>, or the
// <p><img></p> the WordPress editor produces.
function imageBlock(el) {
  const tag = (el.rawTagName || '').toLowerCase();
  if (tag === 'img') return el;
  if (tag === 'figure') return el.querySelector('img');
  if (tag === 'p' || tag === 'div') {
    const imgs = el.querySelectorAll('img');
    if (imgs.length === 1 && !el.text.replace(/\s/g, '')) return imgs[0];
  }
  return null;
}

function ratio(img) {
  const w = parseInt(img.getAttribute('width'), 10);
  const h = parseInt(img.getAttribute('height'), 10);
  return w && h ? w / h : 0;
}

// Images tile well beside each other only when they are roughly the same
// shape. A 2.45:1 banner next to a 1.70:1 photograph leaves a step down one
// edge that looks like a mistake, so runs like that stay stacked.
function compatible(imgs, tolerance = 0.25) {
  const ratios = imgs.map(ratio);
  if (ratios.some((r) => !r)) return false;
  const lo = Math.min(...ratios);
  const hi = Math.max(...ratios);
  return (hi - lo) / hi <= tolerance;
}

function group(html) {
  if (!html || !html.includes('<img')) return html;
  const root = parse(`<div>${html}</div>`).firstChild;
  const kids = root.childNodes.filter((n) => n.nodeType === 1);
  if (!kids.length) return html;

  // Find every run against the untouched list, then apply them in reverse:
  // mutating the tree shifts the indices of everything after it.
  const runs = [];
  let i = 0;
  while (i < kids.length) {
    if (!imageBlock(kids[i])) { i++; continue; }
    let j = i;
    while (j + 1 < kids.length && imageBlock(kids[j + 1])) j++;
    if (j > i) {
      const run = kids.slice(i, j + 1);
      if (compatible(run.map(imageBlock))) runs.push(run);
    }
    i = j + 1;
  }

  for (const run of runs.reverse()) {
    const parent = run[0].parentNode;
    if (!parent) continue;
    const at = parent.childNodes.indexOf(run[0]);
    if (at < 0) continue;
    for (const el of run) {
      const idx = parent.childNodes.indexOf(el);
      if (idx >= 0) parent.childNodes.splice(idx, 1);
    }
    const grid = parse(`<div class="prose-grid" data-count="${run.length}"></div>`).firstChild;
    parent.childNodes.splice(at, 0, grid);
    grid.parentNode = parent;
    run.forEach((el) => { grid.appendChild(el); });
  }

  return root.innerHTML;
}

// --- Profile grids ---------------------------------------------------------
// The old editor emitted each person as an image-box followed by a separate
// disclosure, both full width. Fifty-nine of those is 118 stacked blocks and a
// very long scroll dominated by portraits. Pair each card with the disclosure
// that belongs to it, then lay the pairs out as a grid: the same content, a
// third of the height, and the portraits sized like portraits.
function profiles(html, { min = 3 } = {}) {
  if (!html || !html.includes('c-card')) return html;
  const root = parse(`<div>${html}</div>`).firstChild;
  const kids = root.childNodes.filter((n) => n.nodeType === 1);

  const isCard = (el) => el && (el.getAttribute('class') || '').split(/\s+/).includes('c-card');
  const isDisclosure = (el) => el && (el.getAttribute('class') || '').split(/\s+/).includes('c-disclosure');

  // Find every run first, against the untouched list, then apply them in
  // reverse — mutating the tree shifts the indices of everything after it.
  const runs = [];
  let i = 0;
  while (i < kids.length) {
    if (!isCard(kids[i])) { i++; continue; }
    const run = [];
    let j = i;
    while (j < kids.length && isCard(kids[j])) {
      const pair = [kids[j]];
      if (isDisclosure(kids[j + 1])) { pair.push(kids[j + 1]); j += 2; } else { j += 1; }
      run.push(pair);
    }
    if (run.length >= min) runs.push(run);
    i = j;
  }

  for (const run of runs.reverse()) {
    const parent = run[0][0].parentNode;
    if (!parent) continue;
    const at = parent.childNodes.indexOf(run[0][0]);
    if (at < 0) continue;

    for (const el of run.flat()) {
      const idx = parent.childNodes.indexOf(el);
      if (idx >= 0) parent.childNodes.splice(idx, 1);
    }
    const grid = parse('<div class="profile-grid"></div>').firstChild;
    parent.childNodes.splice(at, 0, grid);
    grid.parentNode = parent;

    for (const pair of run) {
      const cell = parse('<div class="profile"></div>').firstChild;
      grid.appendChild(cell);
      pair.forEach((el) => cell.appendChild(el));
    }
  }

  return root.innerHTML;
}

// A lone narrow image in a wide column leaves most of the line empty and stops
// the reading. Where the following block is real prose, mark the image so the
// text can run beside it. Only genuinely small images qualify: anything wider
// would leave too little room for a readable line next to it.
function floatNarrow(html, { narrow = 420, minProse = 180 } = {}) {
  if (!html || !html.includes('<img')) return html;
  const root = parse(`<div>${html}</div>`).firstChild;
  const kids = root.childNodes.filter((n) => n.nodeType === 1);
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    if ((el.rawTagName || '').toLowerCase() !== 'p') continue;
    const img = imageBlock(el);
    if (!img) continue;
    const w = parseInt(img.getAttribute('width'), 10) || 0;
    if (!w || w > narrow) continue;
    const next = kids[i + 1];
    if (!next || (next.rawTagName || '').toLowerCase() !== 'p') continue;
    if (imageBlock(next)) continue;
    if (next.text.replace(/\s+/g, ' ').trim().length < minProse) continue;
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    if (!cls.includes('prose-float')) cls.push('prose-float');
    el.setAttribute('class', cls.join(' '));
  }
  return root.innerHTML;
}

module.exports = { group, profiles, floatNarrow };
