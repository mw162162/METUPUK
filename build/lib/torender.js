// Typed blocks -> HTML. The inverse of blocks.js.
//
// The important constraint is not "produce valid HTML" but "produce the shapes
// the rest of the pipeline already understands". enrich.js and layout.js key
// off .c-card, .c-disclosure, .c-embed, .tmm_wrap and figure/blockquote, so a
// block renders back into that same vocabulary and every downstream pass keeps
// working untouched. Emitting cleaner-but-different markup here would silently
// disable half the layout work.
//
// This is not a byte-for-byte round trip and is not meant to be. blocks.js
// deliberately discards presentational cruft — a quote keeps its text, not the
// span soup WordPress wrapped it in. What has to survive is the content, and
// that is what the integrity check measures.
//
// The renderers themselves live in components.js, next to the fields a client
// fills in and the recogniser that reads them back. What is left here is the
// part that does not vary per component: find the renderer, and optionally
// stamp each block with where it came from.

const { parse } = require('node-html-parser');
const { COMPONENTS } = require('./components');

const RENDERERS = {};
for (const c of COMPONENTS) {
  RENDERERS[c.name] = c.render;
  for (const alias of c.aliases || []) RENDERERS[alias] = c.render;
}

// Stamp every top-level element of a block with the index of the section it
// came from. Nothing looks different — it is one attribute — but it is what
// lets the editor connect the two directions: click a paragraph in the
// preview and the editor can open the field that produced it.
//
// Marking each root element rather than wrapping them matters. A wrapper
// would become the element `.prose > *` matches, and the measure that keeps
// text readable is set on exactly that selector, so every page on the site
// would quietly lose its line length.
function stamp(html, index) {
  if (!html) return '';
  const root = parse(`<div>${html}</div>`).firstChild;
  let touched = false;
  for (const node of root.childNodes) {
    if (node.nodeType !== 1) continue;
    node.setAttribute('data-block', String(index));
    touched = true;
  }
  return touched ? root.innerHTML : html;
}

function renderBlocks(sections, { mark = false } = {}) {
  if (!Array.isArray(sections)) return '';
  return sections.map((b, i) => {
    const fn = RENDERERS[b && b.type];
    const html = fn ? fn(b) : (b && (b.html || b.body) ? String(b.html || b.body) : '');
    return mark ? stamp(html, i) : html;
  }).filter(Boolean).join('\n');
}

module.exports = { renderBlocks, RENDERERS };
