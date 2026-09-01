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

const { parse } = require('node-html-parser');
const { fromMarkdown } = require('./frommarkdown');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// An attribute is only written when it has a value, so the output does not
// fill up with alt="" width="" on every image.
const attr = (name, value) => (value || value === 0 ? ` ${name}="${esc(value)}"` : '');

// An image is either described or declared decorative. There is no third
// option, because the third option is what produced 1,062 images with an
// empty alt attribute: a field left blank looks exactly like a field somebody
// meant to leave blank, so nothing downstream can tell the difference and
// nothing can warn about it.
//
// Declared decorative, an image gets alt="" and role="presentation", which is
// what tells a screen reader to skip it. Described, it gets the description.
// Neither is a build warning, and the warning names the page.
function image(b) {
  const decorative = b.decorative === true;
  const altAttr = decorative
    ? ' alt="" role="presentation"'
    : attr('alt', b.alt);
  const img = `<img src="${esc(b.src)}"${altAttr}${attr('width', b.width)}${attr('height', b.height)}>`;
  return b.caption
    ? `<figure>${img}<figcaption>${esc(b.caption)}</figcaption></figure>`
    : img;
}

function gallery(b) {
  const imgs = (b.images || [])
    .map((im) => `<img src="${esc(im.src)}"${attr('alt', im.alt)}>`)
    .join('');
  return `<div class="prose-grid" data-count="${(b.images || []).length}">${imgs}</div>`;
}

function embed(b) {
  const cls = b.variant && b.variant !== 'video' ? ` c-embed--${esc(b.variant)}` : '';
  const fallback = b.fallback || '';
  return `<div class="c-embed${cls}"><iframe src="${esc(b.src)}"${attr('title', b.title)} loading="lazy" allowfullscreen>${fallback}</iframe></div>`;
}

function quote(b) {
  const cite = b.attribution ? `<cite>${esc(b.attribution)}</cite>` : '';
  return `<blockquote><p>${esc(b.text)}</p>${cite}</blockquote>`;
}

function disclosure(b) {
  return `<details class="c-disclosure"><summary>${esc(b.summary)}</summary><div class="c-disclosure__body">${fromMarkdown(b.body || '')}</div></details>`;
}

function card(b) {
  const media = b.image
    ? `<div class="c-card__media"><img src="${esc(b.image)}"${attr('alt', b.imageAlt)}></div>`
    : '';
  const headingText = b.heading ? esc(b.heading) : '';
  // A card that carries a link wraps its heading in it, which is where
  // blocks.js found the href in the first place.
  const heading = headingText
    ? `<h3>${b.href ? `<a href="${esc(b.href)}">${headingText}</a>` : headingText}</h3>`
    : '';
  const body = b.body ? fromMarkdown(b.body) : '';
  return `<div class="c-card">${media}<div class="c-card__body">${heading}${body}</div></div>`;
}

function profiles(b) {
  const people = (b.people || []).map((p) => {
    const links = (p.links || []).length
      ? `<div class="tmm_scblock">${p.links.map((h) => `<a href="${esc(h)}"></a>`).join('')}</div>`
      : '';
    return `<div class="tmm_member">
      <div class="tmm_names">${esc(p.name)}</div>
      ${p.role ? `<div class="tmm_job">${esc(p.role)}</div>` : ''}
      <div class="tmm_desc">${fromMarkdown(p.body || '')}</div>
      ${links}
    </div>`;
  }).join('\n');
  return `<div class="tmm_wrap">${people}</div>`;
}


// A real form, which the site has never had. The migration audit found 303
// pages and not one <form>: the only way to join the charity was a mailto: link,
// which is a dead end for anyone on a phone without a mail client configured.
//
// Written as plain HTML that posts. No JavaScript is required for it to work,
// so it keeps working when a script fails, and it needs no client-side
// validation library to be usable. The browser already knows how to do required
// fields, email formats and focus management.
//
// The action is configurable because where a submission goes is a hosting
// decision, not a content one: Netlify Forms needs only an attribute, a Worker
// needs a URL, and a client who changes host should not have to rebuild a page.
function form(b) {
  const id = (b.name || 'form').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form';
  const netlify = !b.action || b.action === 'netlify';
  const action = netlify ? '' : ` action="${esc(b.action)}"`;
  // Netlify needs the form named in the markup and a honeypot it can check.
  const netlifyAttrs = netlify ? ` data-netlify="true" netlify-honeypot="company"` : '';

  const fields = (b.fields || []).map((f, i) => {
    const fid = `${id}-${(f.name || 'field-' + i).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const req = f.required ? ' required' : '';
    const reqMark = f.required ? '<span class="form__required" aria-hidden="true">*</span>' : '';
    const label = `<label class="form__label" for="${fid}">${esc(f.label || f.name)}${reqMark}</label>`;
    const help = f.help ? `<p class="form__help" id="${fid}-help">${esc(f.help)}</p>` : '';
    const described = f.help ? ` aria-describedby="${fid}-help"` : '';
    // Label above the input, help text below it, never a placeholder standing
    // in for a label: a placeholder disappears the moment someone types.
    const control = f.type === 'textarea'
      ? `<textarea class="form__control" id="${fid}" name="${esc(f.name || fid)}" rows="5"${req}${described}></textarea>`
      : `<input class="form__control" id="${fid}" name="${esc(f.name || fid)}" type="${esc(f.type || 'text')}"${req}${described}${f.type === 'email' ? ' autocomplete="email"' : ''}>`;
    return `<div class="form__field">${label}${control}${help}</div>`;
  }).join('\n');

  const consent = b.consent
    ? `<div class="form__field form__field--check">
        <input class="form__check" id="${id}-consent" name="consent" type="checkbox" required>
        <label class="form__label form__label--inline" for="${id}-consent">${esc(b.consent)}</label>
      </div>`
    : '';

  // Two states the browser never shows on its own. A form that posts and then
  // lands on a generic host page tells a client nothing; worse, a post that
  // fails silently means someone typed their details, pressed send, and nobody
  // will ever know. The error names a way through that does not depend on us.
  const done = `<div class="form__done" role="status" hidden>
    <p class="form__done-title">${esc(b.success || 'Thank you. We will be in touch.')}</p>
  </div>`;
  const failed = `<div class="form__error" role="alert" hidden>
    <p>Sorry, that did not send. Please email <a href="mailto:contact@metupuk.org.uk">contact@metupuk.org.uk</a> and we will pick it up.</p>
  </div>`;

  return done + failed + `<form class="form" id="${id}" name="${esc(b.name || id)}" method="post"${action}${netlifyAttrs}>
  ${b.intro ? `<p class="form__intro">${esc(b.intro)}</p>` : ''}
  ${netlify ? `<input type="hidden" name="form-name" value="${esc(b.name || id)}">
  <p class="form__pot"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></p>` : ''}
  ${fields}
  ${consent}
  <button class="btn btn--primary" type="submit">${esc(b.submit || 'Send')}</button>
</form>`;
}

const RENDERERS = {
  prose: (b) => fromMarkdown(b.body || ''),
  image,
  figure: image,
  gallery,
  embed,
  quote,
  disclosure,
  form,
  card,
  profiles,
  // Anything the splitter could not type was kept verbatim, so it goes back
  // verbatim. These are the blocks a client cannot edit in the CMS — worth
  // counting rather than hiding.
  html: (b) => b.html || b.body || '',
};

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
