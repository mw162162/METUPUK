// Split a page's HTML into typed content blocks.
//
// A page stored as one lump of HTML can only ever be edited as one lump. Split
// into blocks it becomes a list of components a person can reorder, duplicate
// and add to from a menu -- which is what a client needs in order to run their
// own site, and what makes a build reusable across clients rather than bespoke
// every time.
//
// The types here were taken from a count of what 300 real pages actually
// contain, not from a guess at what a website might need. They live in
// components.js, each one carrying its own match() and read() alongside the
// renderer that puts it back. This file is only the walk: try each component
// in turn, gather anything unclaimed into prose, and keep verbatim whatever
// nothing recognised.
const { parse } = require('node-html-parser');
const { COMPONENTS, BY_NAME } = require('./components');
const { toMarkdown } = require('./tomarkdown');

// Everything that is ordinary flowing copy gets gathered into one prose block
// rather than becoming a block per paragraph.
const PROSE = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'hr', 'br', 'strong', 'em', 'a', 'pre', 'table']);

function classify(el) {
  const tag = (el.rawTagName || '').toLowerCase();
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const has = (c) => cls.includes(c);
  const context = { tag, has };

  // Registry order is match order, so the specific wins over the general.
  for (const component of COMPONENTS) {
    if (component.match && component.match(el, context)) return component.name;
  }
  if (PROSE.has(tag)) return 'prose';
  return 'html'; // anything unrecognised is preserved verbatim
}

function split(html) {
  if (!html) return [];
  const root = parse(`<div>${html}</div>`).firstChild;
  const blocks = [];
  let prose = [];

  const flushProse = () => {
    if (!prose.length) return;
    const md = toMarkdown(prose.join('\n'));
    if (md.trim()) blocks.push({ type: 'prose', body: md });
    prose = [];
  };

  for (const node of root.childNodes) {
    if (node.nodeType === 3) {
      if (node.rawText.trim()) prose.push(node.toString());
      continue;
    }
    if (node.nodeType !== 1) continue;

    const kind = classify(node);
    if (kind === 'prose') { prose.push(node.toString()); continue; }

    flushProse();
    const component = BY_NAME.get(kind);
    const block = component && component.read ? component.read(node) : null;
    // An extractor that found nothing keeps the original rather than dropping it.
    blocks.push(block || { type: 'html', html: node.toString() });
  }
  flushProse();
  return blocks;
}

module.exports = { split, classify };
