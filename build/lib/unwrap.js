// Peel off the wrappers that came from somebody else's application.
//
// Paste a few paragraphs out of Gmail, Word or a screenshot tool into
// WordPress and the wrapper divs travel with the text. Years later they are
// still there — <div class="a3s aiL">, <div class="x_WordSection1">,
// <div class="sc-annotation-conductor-layer"> — wrapping content that is
// otherwise ordinary prose. Nothing renders them differently, because nothing
// on this site has ever styled them. They are invisible, and they are the
// reason those pages cannot be edited: the splitter sees a <div> it does not
// recognise and keeps the whole thing as one lump of raw HTML.
//
// The test for "somebody else's div" is not a list of class names, which would
// be endless and would need extending for every tool anyone ever pastes from.
// It is this: does any rule in the site's own stylesheet target this class? If
// not, the wrapper does nothing, and removing it cannot change how the page
// looks. A div with no class at all is inert by the same reasoning.
//
// That test is also exactly right for importing a client's site, which is
// where this earns its keep: their classes are inert against our stylesheet by
// definition, because we are rebuilding their site in our design.
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

// Only these carry no meaning of their own. A <figure>, <blockquote> or
// <details> is doing a job even when nothing styles it, and stripping it would
// change what the markup says.
const CONTAINERS = new Set(['div', 'span', 'section', 'article', 'center', 'font']);

const STYLESHEET = path.join(__dirname, '..', '..', 'src', 'assets', 'css', 'site.css');

let styled = null;

function styledClasses() {
  if (styled) return styled;
  styled = new Set();
  let css = '';
  try {
    css = fs.readFileSync(STYLESHEET, 'utf8');
  } catch {
    // With no stylesheet to check against, nothing can be shown to be inert,
    // so nothing is unwrapped. Failing closed keeps a missing file from
    // quietly stripping every wrapper on the site.
    return styled;
  }
  for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) styled.add(m[1]);
  return styled;
}

function isInert(el) {
  const tag = (el.rawTagName || '').toLowerCase();
  if (!CONTAINERS.has(tag)) return false;
  // An id or an inline style is somebody being specific on purpose, and may be
  // the target of a script or an anchor link.
  if (el.getAttribute('id') || el.getAttribute('style')) return false;
  // A role or an aria attribute is meaning that is not visual, so it survives
  // whether or not any CSS targets it.
  for (const name of Object.keys(el.attributes || {})) {
    if (name === 'role' || name.startsWith('aria-')) return false;
  }
  const known = styledClasses();
  return (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)
    .every((c) => !known.has(c));
}

// Returns the contents of the wrappers, or null when there were none to
// remove. Only a wrapper that is the single thing present is peeled: once
// there are two siblings, the element around them is grouping something, and
// that grouping may be the point.
function unwrap(html) {
  let current = String(html || '');
  let peeled = 0;

  for (let depth = 0; depth < 12; depth++) {
    const root = parse(`<div>${current}</div>`).firstChild;
    const kids = root.childNodes.filter(
      (n) => n.nodeType === 1 || (n.nodeType === 3 && n.rawText.trim()),
    );
    if (kids.length !== 1) break;
    const only = kids[0];
    if (only.nodeType !== 1 || !isInert(only)) break;
    current = only.innerHTML;
    peeled += 1;
  }

  return peeled ? current : null;
}

module.exports = { unwrap, isInert };
