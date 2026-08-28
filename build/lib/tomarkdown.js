// HTML -> Markdown, for content that has to survive a round trip.
//
// The rule here is different from a normal converter: anything this does not
// understand is emitted as raw HTML rather than approximated. Markdown allows
// inline HTML, so a block that does not map cleanly (an embed, a disclosure, a
// team-member grid) passes through untouched and still renders. Nothing is
// guessed at and nothing is dropped.
const { parse } = require('node-html-parser');

// Blocks with a clean Markdown equivalent. Everything else is passed through.
const SIMPLE_BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'hr', 'pre']);
const INLINE = new Set(['a', 'strong', 'b', 'em', 'i', 'code', 'br', 'img', 'span', 'sup', 'sub', 'u', 's', 'del']);

// Characters that would otherwise be read as Markdown syntax. Only escaped at
// the start of a line or where they genuinely change meaning, so ordinary
// prose does not fill up with backslashes.
function escapeText(text) {
  return text
    .replace(/([\\`*_[\]])/g, '\\$1')
    .replace(/^(\s*)([#>+-]|\d+\.)\s/gm, '$1\\$2 ');
}

function isInlineOnly(el) {
  for (const node of el.childNodes) {
    if (node.nodeType === 3) continue;
    if (node.nodeType !== 1) continue;
    const tag = (node.rawTagName || '').toLowerCase();
    if (!INLINE.has(tag)) return false;
    if (tag === 'span' && node.getAttribute('class')) return false;
    if (!isInlineOnly(node)) return false;
  }
  return true;
}

function inline(node) {
  if (node.nodeType === 3) return escapeText(node.rawText);
  if (node.nodeType !== 1) return '';
  const tag = (node.rawTagName || '').toLowerCase();
  const kids = () => node.childNodes.map(inline).join('');

  switch (tag) {
    case 'br': return '  \n';
    case 'strong': case 'b': {
      const inner = kids().trim();
      return inner ? `**${inner}**` : '';
    }
    case 'em': case 'i': {
      const inner = kids().trim();
      return inner ? `*${inner}*` : '';
    }
    case 'code': return `\`${node.text}\``;
    case 'a': {
      const href = node.getAttribute('href');
      const inner = kids();
      // A link carrying attributes Markdown cannot express keeps its element.
      const extra = ['target', 'rel', 'class', 'id', 'aria-label'].some((a) => node.getAttribute(a));
      if (!href || extra) return node.toString();
      const title = node.getAttribute('title');
      return `[${inner}](${href}${title ? ` "${title}"` : ''})`;
    }
    case 'img': {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      // Dimensions and loading hints matter to the build, so an img that has
      // them stays an element rather than losing them to ![](...).
      const extra = ['width', 'height', 'class', 'srcset', 'sizes'].some((a) => node.getAttribute(a));
      if (extra) return node.toString();
      return `![${alt}](${src})`;
    }
    default:
      // span/sup/sub/u/s/del and anything else inline: keep the element.
      return node.toString();
  }
}

function listItems(el, ordered, depth) {
  const out = [];
  let n = 1;
  for (const li of el.childNodes) {
    if (li.nodeType !== 1 || (li.rawTagName || '').toLowerCase() !== 'li') continue;
    const marker = ordered ? `${n++}. ` : '- ';
    const pad = ' '.repeat(marker.length);

    // A nested list is rendered under its parent item, indented.
    const nested = [];
    const own = [];
    for (const child of li.childNodes) {
      const tag = child.nodeType === 1 ? (child.rawTagName || '').toLowerCase() : '';
      if (tag === 'ul' || tag === 'ol') nested.push(listItems(child, tag === 'ol', depth + 1));
      else own.push(inline(child));
    }
    const text = own.join('').trim().replace(/\n/g, `\n${pad}`);
    out.push('  '.repeat(depth) + marker + text);
    nested.forEach((block) => out.push(block));
  }
  return out.join('\n');
}

function block(el) {
  const tag = (el.rawTagName || '').toLowerCase();

  if (!SIMPLE_BLOCK.has(tag)) return el.toString();
  // A block carrying classes or an id is doing something the stylesheet knows
  // about, so it keeps its element.
  if (el.getAttribute('class') || el.getAttribute('id')) return el.toString();

  switch (tag) {
    case 'hr': return '---';
    case 'p': {
      if (!isInlineOnly(el)) return el.toString();
      const text = el.childNodes.map(inline).join('').trim();
      return text || '';
    }
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      if (!isInlineOnly(el)) return el.toString();
      const text = el.childNodes.map(inline).join('').trim();
      return text ? `${'#'.repeat(+tag[1])} ${text}` : '';
    }
    case 'ul': case 'ol': {
      const ok = el.childNodes.every((n) => {
        if (n.nodeType === 3) return !n.rawText.trim();
        if (n.nodeType !== 1) return true;
        return (n.rawTagName || '').toLowerCase() === 'li' && !n.getAttribute('class');
      });
      if (!ok) return el.toString();
      return listItems(el, tag === 'ol', 0);
    }
    case 'blockquote': {
      const inner = toMarkdown(el.innerHTML);
      return inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
    }
    case 'pre': return '```\n' + el.text + '\n```';
    default: return el.toString();
  }
}

function toMarkdown(html) {
  if (!html) return '';
  const root = parse(`<div>${html}</div>`).firstChild;
  const out = [];
  for (const node of root.childNodes) {
    if (node.nodeType === 3) {
      const t = node.rawText.trim();
      if (t) out.push(escapeText(t));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const md = block(node).trim();
    if (md) out.push(md);
  }
  return out.join('\n\n');
}

module.exports = { toMarkdown };
