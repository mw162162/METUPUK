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

/* --- Acts -----------------------------------------------------------------
   A long article was one column, one width, one background from top to
   bottom, and no amount of subheads or pull quotes changes what that feels
   like to scroll: the landmarks change, the space does not.

   So the space changes. The blocks are grouped into acts and every other act
   sits on a tinted ground that runs the full width of the window. The measure
   never moves, because that is what keeps the text readable. What moves is
   what the text is sitting on, and that is enough to feel like passing from
   one part of a piece to another.

   Where the author already marked their sections with a rule, those are the
   breaks. Where they did not, the blocks are divided evenly. Nothing is
   reordered and nothing is dropped, so the content check still passes.

   Deliberately not here: no dark act, which on a page about dying reads as
   melodrama, and no "01 / 06" counter, which is the section-numbering tell. */
const ACT_BLOCK = new Set(['p', 'ul', 'ol', 'h2', 'h3', 'h4', 'blockquote', 'figure', 'div', 'details', 'table', 'hr']);

function acts(html, { minBlocks = 8, perAct = 7, max = 6 } = {}) {
  if (!html) return html;
  const root = parse(`<div>${html}</div>`).firstChild;
  const nodes = root.childNodes.slice();
  const isEl = (n) => n.nodeType === 1;
  const tagOf = (n) => (isEl(n) ? (n.rawTagName || '').toLowerCase() : '');
  const blocks = nodes.filter((n) => ACT_BLOCK.has(tagOf(n)));
  if (blocks.length < minBlocks) return html;
  if (root.querySelector('.tmm_wrap') || root.querySelector('.profile-grid')
    || root.querySelector('.story-grid')) return html;

  // Walk every child, not only the elements. Slicing the element list alone
  // stranded the text nodes between them, which left them sitting before the
  // acts instead of inside them and reordered the page. The content check
  // caught it: nine posts diverged near their end.
  const rules = nodes.filter((n) => tagOf(n) === 'hr').length;
  const perGroup = Math.ceil(blocks.length / Math.max(3, Math.min(max, Math.round(blocks.length / perAct))));

  const groups = [];
  let current = [];
  let seen = 0;
  for (const node of nodes) {
    if (rules >= 2) {
      // The author's own section breaks. The rule itself is the boundary and
      // is not carried into either side of it.
      if (tagOf(node) === 'hr') {
        if (current.some(isEl)) groups.push(current);
        current = [];
        continue;
      }
      current.push(node);
    } else {
      current.push(node);
      if (ACT_BLOCK.has(tagOf(node))) seen++;
      if (seen >= perGroup) { groups.push(current); current = []; seen = 0; }
    }
  }
  if (current.length) {
    if (groups.length && !current.some(isEl)) groups[groups.length - 1].push(...current);
    else groups.push(current);
  }

  if (groups.filter((g) => g.some(isEl)).length < 3) return html;

  for (const node of nodes) {
    const idx = root.childNodes.indexOf(node);
    if (idx >= 0) root.childNodes.splice(idx, 1);
  }
  groups.forEach((group, i) => {
    const tint = i % 2 === 1 ? ' act--tint' : '';
    const act = parse(`<section class="act${tint}"><div class="act__inner"></div></section>`).firstChild;
    const inner = act.querySelector('.act__inner');
    group.forEach((el) => inner.appendChild(el));
    root.appendChild(act);
    act.parentNode = root;
  });

  return root.innerHTML;
}

/* --- Story cards ----------------------------------------------------------
   Some campaign pages are not articles at all. /bcam24/ is nine people's
   stories, each a portrait with a headline followed by the account, stacked
   one after another down a single column: 27,000 pixels, thirty screens of
   scrolling for 1,300 words.

   Read as what it is, a collection rather than a piece of prose, it becomes a
   grid: the portrait, the headline it came with, and the story under it. The
   same content in about a fifth of the scroll.

   The pattern is specific enough to be safe: a paragraph holding exactly one
   image and a line of text, followed by a paragraph of prose and no image,
   repeated at least three times. Nothing else matches it by accident. */
function storyCards(html, { min = 3 } = {}) {
  if (!html || !html.includes('<img')) return html;
  const root = parse(`<div>${html}</div>`).firstChild;
  const kids = root.childNodes.filter((n) => n.nodeType === 1);
  const tag = (el) => (el.rawTagName || '').toLowerCase();

  const isHead = (el) => tag(el) === 'p'
    && el.querySelectorAll('img').length === 1
    && el.text.trim().length >= 25;
  const isBody = (el) => tag(el) === 'p'
    && el.querySelectorAll('img').length === 0
    && el.text.trim().length >= 120;

  // Only runs that are already next to each other. Collecting every pair on the
  // page and lifting them all to the first one's position moved whatever sat
  // between them to the end: the content check caught it on /bcam24/, diverging
  // a third of the way in.
  const runs = [];
  let i = 0;
  while (i < kids.length - 1) {
    if (!(isHead(kids[i]) && isBody(kids[i + 1]))) { i++; continue; }
    const run = [];
    while (i < kids.length - 1 && isHead(kids[i]) && isBody(kids[i + 1])) {
      run.push([kids[i], kids[i + 1]]);
      i += 2;
    }
    if (run.length >= min) runs.push(run);
  }
  if (!runs.length) return html;

  // Applied back to front, since building one shifts the indices after it.
  for (const run of runs.reverse()) {
    const first = run[0][0];
    const parent = first.parentNode;
    if (!parent) continue;
    const at = parent.childNodes.indexOf(first);
    if (at < 0) continue;

    for (const el of run.flat()) {
      const idx = parent.childNodes.indexOf(el);
      if (idx >= 0) parent.childNodes.splice(idx, 1);
    }
    const grid = parse('<div class="story-grid"></div>').firstChild;
    parent.childNodes.splice(at, 0, grid);
    grid.parentNode = parent;

    for (const [head, body] of run) {
      const card = parse('<article class="story"></article>').firstChild;
      grid.appendChild(card);
      // Move the anchor when there is one, not the image inside it. Taking the
      // image alone left eight links on this page with nothing in them, which
      // is a link a screen reader announces and cannot describe.
      const img = head.querySelector('img');
      const wrap = img && img.parentNode && (img.parentNode.rawTagName || '').toLowerCase() === 'a'
        ? img.parentNode
        : img;
      const media = parse('<div class="story__media"></div>').firstChild;
      card.appendChild(media);
      if (wrap) media.appendChild(wrap);
      head.setAttribute('class', 'story__title');
      card.appendChild(head);
      body.setAttribute('class', 'story__body');
      card.appendChild(body);
    }
  }
  return root.innerHTML;
}

module.exports = { group, profiles, floatNarrow, acts, storyCards };
