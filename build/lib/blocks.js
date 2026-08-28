// Split a page's HTML into typed content blocks.
//
// A page stored as one lump of HTML can only ever be edited as one lump. Split
// into blocks it becomes a list of components a person can reorder, duplicate
// and add to from a menu -- which is what a client needs in order to run their
// own site, and what makes a build reusable across clients rather than bespoke
// every time.
//
// The types here were taken from a count of what 300 real pages actually
// contain, not from a guess at what a website might need.
const { parse } = require('node-html-parser');
const { toMarkdown } = require('./tomarkdown');

// Everything that is ordinary flowing copy gets gathered into one prose block
// rather than becoming a block per paragraph.
const PROSE = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'hr', 'br', 'strong', 'em', 'a', 'pre', 'table']);

function classify(el) {
  const tag = (el.rawTagName || '').toLowerCase();
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const has = (c) => cls.includes(c);

  if (tag === 'details' || has('c-disclosure')) return 'disclosure';
  if (has('c-embed')) return 'embed';
  if (has('c-card')) return 'card';
  if (has('c-gallery') || has('prose-grid') || has('elementor-image-carousel-wrapper')) return 'gallery';
  if (has('tmm') || has('tmm_wrap')) return 'profiles';
  if (has('image-full')) return 'image';
  if (tag === 'figure') return 'figure';
  if (tag === 'blockquote') return 'quote';
  if (tag === 'img') return 'image';
  if (PROSE.has(tag)) return 'prose';
  return 'html'; // anything unrecognised is preserved verbatim
}

// --- per-type extraction ---------------------------------------------------

function embedBlock(el) {
  const frame = el.querySelector('iframe');
  const cls = (el.getAttribute('class') || '');
  const variant = /--audio/.test(cls) ? 'audio' : /--panel/.test(cls) ? 'panel' : 'video';
  // An iframe's own children are its fallback for anything that cannot render
  // it -- Bandcamp puts the track name and a plain link there. It is real
  // content and it is not in any attribute, so it is kept.
  const fallback = frame ? frame.innerHTML.trim() : '';
  const block = {
    type: 'embed',
    variant,
    src: frame ? frame.getAttribute('src') || '' : '',
    title: frame ? frame.getAttribute('title') || '' : '',
  };
  if (fallback) block.fallback = fallback;
  return block;
}

function imageBlock(el) {
  const img = (el.rawTagName || '').toLowerCase() === 'img' ? el : el.querySelector('img');
  if (!img) return null;
  const cap = el.querySelector('figcaption');
  return {
    type: 'image',
    src: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
    width: parseInt(img.getAttribute('width'), 10) || null,
    height: parseInt(img.getAttribute('height'), 10) || null,
    caption: cap ? cap.text.trim() : '',
  };
}

function galleryBlock(el) {
  const images = el.querySelectorAll('img').map((img) => ({
    src: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
  }));
  return { type: 'gallery', images };
}

function disclosureBlock(el) {
  const summary = el.querySelector('summary');
  const body = el.clone();
  const s = body.querySelector('summary');
  if (s) s.remove();
  return {
    type: 'disclosure',
    summary: summary ? summary.text.trim() : '',
    body: toMarkdown(body.innerHTML),
  };
}

function cardBlock(el) {
  const img = el.querySelector('img');
  const heading = el.querySelector('h2, h3, h4');
  const link = el.querySelector('a');
  const body = el.clone();
  body.querySelectorAll('img, h2, h3, h4').forEach((n) => n.remove());
  return {
    type: 'card',
    heading: heading ? heading.text.trim() : '',
    image: img ? img.getAttribute('src') || '' : '',
    imageAlt: img ? img.getAttribute('alt') || '' : '',
    href: link ? link.getAttribute('href') || '' : '',
    body: toMarkdown(body.innerHTML),
  };
}

function quoteBlock(el) {
  const cite = el.querySelector('cite, footer');
  const body = el.clone();
  const c = body.querySelector('cite, footer');
  if (c) c.remove();
  return {
    type: 'quote',
    text: body.text.replace(/\s+/g, ' ').trim(),
    attribution: cite ? cite.text.trim() : '',
  };
}

function profilesBlock(el) {
  const people = el.querySelectorAll('.tmm_member').map((m) => {
    const q = (s) => { const n = m.querySelector(s); return n ? n.text.trim() : ''; };
    const desc = m.querySelector('.tmm_desc');
    return {
      name: q('.tmm_names'),
      role: q('.tmm_job'),
      body: desc ? toMarkdown(desc.innerHTML) : '',
      links: m.querySelectorAll('.tmm_scblock a').map((a) => a.getAttribute('href') || ''),
    };
  });
  return { type: 'profiles', people };
}

// --- the splitter ----------------------------------------------------------

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
    let block = null;
    switch (kind) {
      case 'embed': block = embedBlock(node); break;
      case 'image': case 'figure': block = imageBlock(node); break;
      case 'gallery': block = galleryBlock(node); break;
      case 'disclosure': block = disclosureBlock(node); break;
      case 'card': block = cardBlock(node); break;
      case 'quote': block = quoteBlock(node); break;
      case 'profiles': block = profilesBlock(node); break;
      default: block = { type: 'html', html: node.toString() };
    }
    // An extractor that found nothing keeps the original rather than dropping it.
    blocks.push(block || { type: 'html', html: node.toString() });
  }
  flushProse();
  return blocks;
}

module.exports = { split, classify };
