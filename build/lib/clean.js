// Turn WordPress + Elementor + Word-paste markup into clean semantic HTML.
const { parse } = require('node-html-parser');

// Wrapper classes that carry layout, never meaning: unwrap and keep the children.
const ELEMENTOR_WRAPPER = /^(elementor|swiper-|e-con|e-child|e-flex|e-grid|wp-block-columns|wp-block-column|wp-block-group)/;
const WORD_JUNK = /^(SCXW|BCX|TextRun|NormalTextRun|EOP|Paragraph|Ligature|SpellingError|ContextualSpellingAndGrammarError|WACImageContainer)/;

// Dropped outright: scripts, Word's XML islands, form chrome.
const DROP_TAGS = new Set([
  'script', 'style', 'noscript', 'link', 'meta', 'xml',
  'form', 'input', 'button', 'label', 'select', 'textarea', 'o:p',
]);
const DROP_NAMESPACED = /^[wom]:/i; // <w:sdt>, <o:p>, <m:oMath> pasted from Word

const KEEP_ATTRS = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'width', 'height'],
  iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen'],
  video: ['src', 'poster', 'width', 'height'],
  source: ['src', 'type'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  ol: ['start'],
  details: ['class'],
  summary: [],
  div: ['class'],
  ul: ['class'],
  li: [],
  h2: ['id'],
  h3: ['id'],
  svg: ['viewBox', 'xmlns', 'fill', 'width', 'height', 'aria-hidden', 'focusable'],
  path: ['d', 'fill', 'fill-rule', 'clip-rule'],
  g: ['fill'],
};

const BLOCK = new Set(['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'details', 'summary']);
const VOIDISH = new Set(['img', 'iframe', 'br', 'hr', 'video', 'source', 'svg', 'input']);

// Classes we generate ourselves and must not strip in the unwrap pass.
const OURS = new Set(['c-card', 'c-card__media', 'c-card__body', 'c-card__title', 'c-card__text',
  'c-disclosure', 'c-disclosure__body', 'c-gallery', 'c-embed']);

const classList = (node) => (node.getAttribute('class') || '').split(/\s+/).filter(Boolean);

function unwrap(node) {
  const parent = node.parentNode;
  if (!parent) return;
  const idx = parent.childNodes.indexOf(node);
  if (idx < 0) return;
  parent.childNodes.splice(idx, 1, ...node.childNodes);
  node.childNodes.forEach((c) => { c.parentNode = parent; });
}

function remove(node) {
  const parent = node.parentNode;
  if (!parent) return;
  const idx = parent.childNodes.indexOf(node);
  if (idx >= 0) parent.childNodes.splice(idx, 1);
}

function replaceWith(node, replacement) {
  const parent = node.parentNode;
  if (!parent) return false;
  const idx = parent.childNodes.indexOf(node);
  if (idx < 0) return false;
  parent.childNodes.splice(idx, 1, replacement);
  replacement.parentNode = parent;
  return true;
}

function walk(node, fn) {
  const kids = node.childNodes ? [...node.childNodes] : [];
  for (const child of kids) {
    if (child.nodeType === 1) { fn(child); walk(child, fn); }
  }
}

const frag = (html) => parse(html).firstChild;

// Elementor renders accordions as a pile of divs; <details> is the honest equivalent
// and works with no JavaScript at all.
function convertAccordions(root) {
  for (const item of root.querySelectorAll('.elementor-accordion-item')) {
    const titleEl = item.querySelector('.elementor-accordion-title');
    const contentEl = item.querySelector('.elementor-tab-content');
    if (!titleEl || !contentEl) continue;
    const details = frag('<details class="c-disclosure"><summary></summary><div class="c-disclosure__body"></div></details>');
    details.querySelector('summary').set_content(titleEl.innerHTML.trim());
    details.querySelector('.c-disclosure__body').set_content(contentEl.innerHTML.trim());
    replaceWith(item, details);
  }
}

// Elementor "image box" = image + heading + description. Rebuild as a real card.
function convertImageBoxes(root) {
  for (const box of root.querySelectorAll('.elementor-image-box-wrapper')) {
    const img = box.querySelector('img');
    const title = box.querySelector('.elementor-image-box-title');
    const desc = box.querySelector('.elementor-image-box-description');
    let html = '';
    if (img) html += '<div class="c-card__media">' + img.toString() + '</div>';
    html += '<div class="c-card__body">';
    if (title) html += '<h3 class="c-card__title">' + title.innerHTML.trim() + '</h3>';
    if (desc) html += '<div class="c-card__text">' + desc.innerHTML.trim() + '</div>';
    html += '</div>';
    const card = frag('<div class="c-card"></div>');
    card.set_content(html);
    replaceWith(box, card);
  }
}

// Swiper carousels degrade badly without JS; render them as a plain image grid.
function convertCarousels(root) {
  for (const wrap of root.querySelectorAll('.swiper-wrapper, .elementor-image-carousel')) {
    const imgs = wrap.querySelectorAll('img');
    if (!imgs.length) continue;
    const seen = new Set();
    const items = [];
    for (const im of imgs) {
      const src = im.getAttribute('src');
      if (!src || seen.has(src)) continue;
      seen.add(src);
      items.push('<li>' + im.toString() + '</li>');
    }
    if (!items.length) continue;
    replaceWith(wrap, frag('<ul class="c-gallery">' + items.join('') + '</ul>'));
  }
}

// Elementor's video widget renders an empty <div class="elementor-video"> and
// injects the player with JavaScript at runtime; the actual URL only exists in
// a data-settings JSON blob. Without this the video is simply gone.
function convertVideoWidgets(root) {
  for (const widget of root.querySelectorAll('.elementor-widget-video')) {
    const raw = widget.getAttribute('data-settings');
    if (!raw) continue;

    let settings;
    try {
      settings = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } catch { continue; }

    const url = settings.youtube_url || settings.vimeo_url || settings.external_url || '';
    let embed = null;
    let title = 'Video';

    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/i);
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (yt) {
      // youtube-nocookie avoids setting tracking cookies until the user plays.
      embed = `https://www.youtube-nocookie.com/embed/${yt[1]}`;
      const start = (url.match(/[?&]t=(\d+)/) || [])[1];
      if (start) embed += `?start=${start}`;
      title = 'YouTube video';
    } else if (vm) {
      embed = `https://player.vimeo.com/video/${vm[1]}`;
      title = 'Vimeo video';
    }
    if (!embed) continue;

    const frag = parse(
      `<div class="c-embed"><iframe src="${embed}" title="${title}" loading="lazy" ` +
      `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" ` +
      `allowfullscreen></iframe></div>`
    ).firstChild;
    replaceWith(widget, frag);
  }
}

// WordPress figures often nest the caption oddly; keep figure/figcaption, drop the rest.
function tidyFigures(root) {
  for (const fig of root.querySelectorAll('figure')) {
    const cap = fig.querySelector('figcaption');
    if (cap && !cap.text.trim()) remove(cap);
  }
}

function clean(html, opts = {}) {
  if (!html || !html.trim()) return '';
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });

  convertVideoWidgets(root);
  convertAccordions(root);
  convertImageBoxes(root);
  convertCarousels(root);
  tidyFigures(root);

  // Pass 1 — drop junk nodes entirely.
  walk(root, (el) => {
    const tag = (el.rawTagName || '').toLowerCase();
    if (DROP_TAGS.has(tag) || DROP_NAMESPACED.test(tag)) remove(el);
  });

  // Pass 2 — unwrap layout containers until nothing changes.
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 15) {
    changed = false;
    walk(root, (el) => {
      const tag = (el.rawTagName || '').toLowerCase();
      if (!tag || !el.parentNode) return;
      const cls = classList(el);
      if (cls.some((c) => OURS.has(c))) return;

      if (tag === 'div' || tag === 'section') {
        const junky = cls.length === 0 || cls.every((c) => ELEMENTOR_WRAPPER.test(c) || WORD_JUNK.test(c) || /^(wp-|has-|is-|align)/.test(c));
        if (junky) { unwrap(el); changed = true; return; }
      }
      // A span that only carries Word styling is noise.
      if (tag === 'span' || tag === 'font') { unwrap(el); changed = true; return; }
    });
  }

  // Pass 3 — attribute whitelist, then link and media rewriting.
  const embedsToWrap = [];
  walk(root, (el) => {
    const tag = (el.rawTagName || '').toLowerCase();
    // The parser lower-cases attribute names, so compare that way — otherwise
    // camelCase SVG attributes like viewBox are silently dropped, and an <svg>
    // without a viewBox falls back to a 300x150 box of dead space.
    const keep = (KEEP_ATTRS[tag] || []).map((k) => k.toLowerCase());
    for (const name of Object.keys({ ...el.attributes })) {
      if (!keep.includes(name.toLowerCase())) el.removeAttribute(name);
    }

    if (tag === 'img') {
      if (opts.rewriteMedia) {
        const s = el.getAttribute('src');
        if (s) el.setAttribute('src', opts.rewriteMedia(s));
      }
      el.setAttribute('loading', 'lazy');
      el.setAttribute('decoding', 'async');
      // Prefer the charity's own alt text from the media library over nothing.
      if (!(el.getAttribute('alt') || '').trim() && opts.altFor) {
        el.setAttribute('alt', opts.altFor(el.getAttribute('src')) || '');
      }
      if (el.getAttribute('alt') === null) el.setAttribute('alt', '');
    }

    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href && opts.rewriteLink) el.setAttribute('href', opts.rewriteLink(href));
      const h = el.getAttribute('href') || '';
      if (/^https?:\/\//i.test(h)) {
        el.setAttribute('rel', 'noopener');
        el.setAttribute('target', '_blank');
      }
    }

    if (tag === 'iframe') {
      el.setAttribute('loading', 'lazy');
      if (!el.getAttribute('title')) el.setAttribute('title', 'Embedded media');
      const src = el.getAttribute('src') || '';
      // An iframe pointing back at our own site is really just a link.
      if (/metupuk\.org\.uk/i.test(src) && opts.rewriteLink) {
        el.setAttribute('src', opts.rewriteLink(src));
      }
      if (el.getAttribute('src')) embedsToWrap.push(el);
    }

    if (tag === 'video') {
      if (opts.rewriteMedia) {
        const s = el.getAttribute('src');
        if (s) el.setAttribute('src', opts.rewriteMedia(s));
      }
      el.setAttribute('controls', '');
      el.setAttribute('playsinline', '');
    }
  });

  // Wrap embeds so they stay responsive at every width. Audio players and
  // dashboards are not 16:9 — giving them a video aspect box is where the
  // "why is there dead space" comes from.
  const AUDIO_HOSTS = /(anchor\.fm|spotify\.com|soundcloud\.com|bandcamp\.com|podbean|buzzsprout|captivate\.fm|acast\.com)/i;
  const PANEL_HOSTS = /(powerbi\.com|wakelet\.com|docs\.google\.com|airtable\.com|datawrapper)/i;

  for (const el of embedsToWrap) {
    if (!el.parentNode) continue;
    const cls = classList(el.parentNode);
    if (cls.includes('c-embed')) continue;
    const src = el.getAttribute('src') || '';
    let variant = '';
    if (AUDIO_HOSTS.test(src)) variant = ' c-embed--audio';
    else if (PANEL_HOSTS.test(src)) variant = ' c-embed--panel';
    const wrapper = frag(`<div class="c-embed${variant}"></div>`);
    if (replaceWith(el, wrapper)) wrapper.appendChild(el);
  }

  // An <svg> with no drawable path is invisible but still takes up its default
  // 300x150 box — which is exactly what dead space on a page looks like.
  walk(root, (el) => {
    if ((el.rawTagName || '').toLowerCase() !== 'svg') return;
    const hasPath = el.querySelectorAll('path, circle, rect, polygon, line, use')
      .some((c) => c.getAttribute('d') || c.getAttribute('points') || c.getAttribute('r') || c.getAttribute('width'));
    if (!hasPath) remove(el);
    else { el.setAttribute('aria-hidden', 'true'); el.setAttribute('focusable', 'false'); }
  });

  // Pass 4 — drop blocks left empty by the unwrapping.
  for (let i = 0; i < 5; i++) {
    walk(root, (el) => {
      const tag = (el.rawTagName || '').toLowerCase();
      if (VOIDISH.has(tag) || !BLOCK.has(tag)) return;
      if (el.querySelector('img, iframe, video, hr, br')) return;
      if (!el.text.replace(/[ \s]/g, '')) remove(el);
    });
  }

  return root.toString()
    .replace(/&nbsp;/g, ' ')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Plain text, for excerpts, meta descriptions and the search index.
const BLOCK_END = /<\/(p|h[1-6]|li|div|blockquote|figcaption|td|th|tr|section|article|header|footer)\s*>/gi;

function toText(html) {
  if (!html) return '';
  // The parser joins text nodes with nothing between them, so a heading
  // followed by a paragraph reads as "Mary RichardsA passionate advocate".
  // Put the block boundary back before the tags are thrown away.
  return parse(html.replace(BLOCK_END, '$& ').replace(/<br\s*\/?>/gi, ' ')).text
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { clean, toText };
