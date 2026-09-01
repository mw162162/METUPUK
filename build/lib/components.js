// One definition per component.
//
// A component used to live in four files: its fields in the editor config, its
// renderer here, its recogniser in the splitter, and its styles in the CSS.
// Miss one and the component still appears to work — until the day somebody
// re-imports the site and it silently degrades to a lump of raw HTML, which is
// exactly how a form renderer existed for weeks with no form recogniser behind
// it.
//
// So a component is described once, here, and the three code paths are built
// from that description:
//
//   torender.js   render(block) -> HTML
//   blocks.js     match/read    HTML -> block
//   config.yml    fields        what the client fills in
//
// Styles stay hand-written, because that is the part that should be bespoke
// per client. Everything else is the same on every site built from this kit,
// and this is the list a client sees when they press "Add section".
//
// Order matters: match() is tried top to bottom, so the specific comes before
// the general. A <figure class="c-card"> is a card, not an image.

const { fromMarkdown } = require('./frommarkdown');
const { toMarkdown } = require('./tomarkdown');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// An attribute is only written when it has a value, so the output does not
// fill up with alt="" width="" on every image.
const attr = (name, value) => (value || value === 0 ? ` ${name}="${esc(value)}"` : '');

const textOf = (el, sel) => { const n = el.querySelector(sel); return n ? n.text.trim() : ''; };

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

// An image is either described or declared decorative. There is no third
// option, because the third option is what produced 1,062 images with an
// empty alt attribute: a field left blank looks exactly like a field somebody
// meant to leave blank, so nothing downstream can tell the difference and
// nothing can warn about it.
function renderImage(b) {
  const altAttr = b.decorative === true
    ? ' alt="" role="presentation"'
    : attr('alt', b.alt);
  const img = `<img src="${esc(b.src)}"${altAttr}${attr('width', b.width)}${attr('height', b.height)}>`;
  return b.caption
    ? `<figure>${img}<figcaption>${esc(b.caption)}</figcaption></figure>`
    : img;
}

function renderGallery(b) {
  const imgs = (b.images || [])
    .map((im) => `<img src="${esc(im.src)}"${attr('alt', im.alt)}>`)
    .join('');
  return `<div class="prose-grid" data-count="${(b.images || []).length}">${imgs}</div>`;
}

function renderEmbed(b) {
  const cls = b.variant && b.variant !== 'video' ? ` c-embed--${esc(b.variant)}` : '';
  const fallback = b.fallback || '';
  return `<div class="c-embed${cls}"><iframe src="${esc(b.src)}"${attr('title', b.title)} loading="lazy" allowfullscreen>${fallback}</iframe></div>`;
}

// A quotation can run to more than one paragraph, and a blank line in the
// field is how someone says so. Collapsing them into a single paragraph loses
// no words, which is why it went unnoticed — it just silently reflows somebody
// else's writing into a wall of text.
function renderQuote(b) {
  const cite = b.attribution ? `<cite>${esc(b.attribution)}</cite>` : '';
  const paragraphs = String(b.text == null ? '' : b.text)
    .split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`).join('');
  return `<blockquote>${paragraphs || '<p></p>'}${cite}</blockquote>`;
}

function renderDisclosure(b) {
  return `<details class="c-disclosure"><summary>${esc(b.summary)}</summary><div class="c-disclosure__body">${fromMarkdown(b.body || '')}</div></details>`;
}

function renderCard(b) {
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

function renderProfiles(b) {
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

// Self-hosted video, as opposed to an embed. The two are not the same
// component: an embed hands the visitor to YouTube along with whatever YouTube
// decides to track, while this plays a file the site owns.
//
// It offers a captions track because a video without captions is unusable for
// anyone deaf, and on a site about a disease that is not a hypothetical
// audience. preload="metadata" so the page does not pull megabytes for a video
// nobody presses play on, and a real download link inside the element for the
// browsers that cannot play it at all.
function renderVideo(b) {
  const track = b.captions
    ? `<track kind="captions" src="${esc(b.captions)}" srclang="en" label="English" default>`
    : '';
  const fallback = `<p class="c-video__fallback">Your browser cannot play this video. <a href="${esc(b.src)}">Download it instead</a>.</p>`;
  const player = `<video class="c-video__player" src="${esc(b.src)}"${attr('poster', b.poster)} controls playsinline preload="metadata">${track}${fallback}</video>`;
  return b.caption
    ? `<figure class="c-video">${player}<figcaption>${esc(b.caption)}</figcaption></figure>`
    : `<div class="c-video">${player}</div>`;
}

// A row of links that look like buttons. Trivial to write by hand, which is
// why every site ends up with six slightly different versions of it; offered
// as a component, a client gets the one the design intends and the tap target
// stays 44px whatever they type into it.
const BUTTON_STYLES = { primary: 'btn--primary', pink: 'btn--pink', ghost: 'btn--ghost' };

function renderButtons(b) {
  const items = (b.buttons || []).map((x) => {
    const cls = BUTTON_STYLES[x.style] || BUTTON_STYLES.primary;
    // A new tab is a decision, and it is the client's to make per link.
    const ext = x.newTab ? ' target="_blank" rel="noopener"' : '';
    return `<a class="btn ${cls}" href="${esc(x.href)}"${ext}>${esc(x.label)}</a>`;
  }).join('');
  return items ? `<div class="c-buttons">${items}</div>` : '';
}

// The one layout primitive whose absence forces people into raw HTML. Two or
// three columns of ordinary prose, collapsing to one on a narrow screen — no
// nesting and no arbitrary grid builder, because a client given a grid builder
// will build a page that does not survive a phone.
function renderColumns(b) {
  const cols = (b.columns || [])
    .map((c) => `<div class="c-columns__col">${fromMarkdown(c.body || '')}</div>`)
    .join('');
  if (!cols) return '';
  const layout = b.layout && b.layout !== 'equal' ? ` data-layout="${esc(b.layout)}"` : '';
  return `<div class="c-columns" data-count="${(b.columns || []).length}"${layout}>${cols}</div>`;
}

// A real form, which the site went its whole life without. The migration audit
// found 303 pages and not one <form>: the only way to join the charity was a
// mailto: link, which is a dead end for anyone on a phone with no mail client.
//
// Plain HTML that posts. No JavaScript is required for it to work, so it keeps
// working when a script fails, and it needs no validation library to be usable
// — the browser already knows how to do required fields and email formats.
//
// The action is configurable because where a submission goes is a hosting
// decision, not a content one.
function renderForm(b) {
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

// ---------------------------------------------------------------------------
// Readers: HTML back into a block
// ---------------------------------------------------------------------------

function readImage(el) {
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

function readGallery(el) {
  const images = el.querySelectorAll('img').map((img) => ({
    src: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
  }));
  return { type: 'gallery', images };
}

function readEmbed(el) {
  const frame = el.querySelector('iframe');
  const cls = el.getAttribute('class') || '';
  const variant = /--audio/.test(cls) ? 'audio' : /--panel/.test(cls) ? 'panel' : 'video';
  // An iframe's own children are its fallback for anything that cannot render
  // it — Bandcamp puts the track name and a plain link there. It is real
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

function readQuote(el) {
  const cite = el.querySelector('cite, footer');
  const body = el.clone();
  const c = body.querySelector('cite, footer');
  if (c) c.remove();

  // Paragraphs inside the quotation are kept as blank lines, which is what the
  // renderer reads back. Whitespace is still collapsed within a paragraph,
  // because the line breaks in the source markup are indentation, not meaning.
  const paragraphs = body.querySelectorAll('p')
    .map((p) => p.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = paragraphs.length
    ? paragraphs.join('\n\n')
    : body.text.replace(/\s+/g, ' ').trim();

  return {
    type: 'quote',
    text,
    attribution: cite ? cite.text.trim() : '',
  };
}

function readDisclosure(el) {
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

function readCard(el) {
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

function readProfiles(el) {
  const people = el.querySelectorAll('.tmm_member').map((m) => {
    const desc = m.querySelector('.tmm_desc');
    return {
      name: textOf(m, '.tmm_names'),
      role: textOf(m, '.tmm_job'),
      body: desc ? toMarkdown(desc.innerHTML) : '',
      links: m.querySelectorAll('.tmm_scblock a').map((a) => a.getAttribute('href') || ''),
    };
  });
  return { type: 'profiles', people };
}

function readVideo(el) {
  const v = (el.rawTagName || '').toLowerCase() === 'video' ? el : el.querySelector('video');
  if (!v) return null;

  // Three places the same file can be named: the element's own src, a <source>
  // child (the older way of writing it), and the download link WordPress puts
  // inside as a fallback. A site-relative path is preferred over any of them,
  // because an export usually rewrites the fallback link to the local copy and
  // leaves the <source> pointing at the old domain over plain http — taking
  // the first one found would publish a page that fetches its video from a
  // server the client no longer controls.
  const source = v.querySelector('source');
  const link = v.querySelector('a');
  const candidates = [
    v.getAttribute('src'),
    source ? source.getAttribute('src') : '',
    link ? link.getAttribute('href') : '',
  ].filter(Boolean);
  const src = candidates.find((u) => u.startsWith('/')) || candidates[0] || '';
  if (!src) return null;

  const track = v.querySelector('track');
  const cap = el.querySelector('figcaption');
  const block = { type: 'video', src };
  // Optional fields are left out rather than written empty, so a file shows
  // what was actually there.
  if (v.getAttribute('poster')) block.poster = v.getAttribute('poster');
  if (track && track.getAttribute('src')) block.captions = track.getAttribute('src');
  if (cap && cap.text.trim()) block.caption = cap.text.trim();
  return block;
}

const STYLE_NAMES = { 'btn--primary': 'primary', 'btn--pink': 'pink', 'btn--ghost': 'ghost' };

function readButtons(el) {
  const buttons = el.querySelectorAll('a').map((a) => {
    const cls = (a.getAttribute('class') || '').split(/\s+/);
    const style = cls.map((c) => STYLE_NAMES[c]).find(Boolean) || 'primary';
    const button = { label: a.text.trim(), href: a.getAttribute('href') || '', style };
    if (a.getAttribute('target') === '_blank') button.newTab = true;
    return button;
  });
  return buttons.length ? { type: 'buttons', buttons } : null;
}

function readColumns(el) {
  const columns = el.querySelectorAll('.c-columns__col')
    .map((c) => ({ body: toMarkdown(c.innerHTML) }));
  if (!columns.length) return null;
  const block = { type: 'columns', columns };
  const layout = el.getAttribute('data-layout');
  if (layout) block.layout = layout;
  return block;
}

// Reading a form back is what lets a client's existing contact form arrive in
// the editor as questions rather than as markup. What can be read is read; a
// form using a control this kit does not model is left alone, because a
// half-converted form is worse than an honest lump of HTML.
const FIELD_TYPES = new Set(['text', 'email', 'tel', 'textarea']);

function labelFor(form, input) {
  // Anything hidden from a screen reader is decoration, not the label. The
  // asterisk on a required field is the usual case, and the renderer draws its
  // own, so reading it back would print it twice.
  const read = (el) => {
    const copy = el.clone();
    copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return copy.text.replace(/\s+/g, ' ').trim();
  };

  const id = input.getAttribute('id');
  if (id) {
    const el = form.querySelector(`label[for="${id}"]`);
    if (el) return read(el);
  }
  // Otherwise the label is usually the one wrapping it.
  let node = input.parentNode;
  while (node && node !== form) {
    if ((node.rawTagName || '').toLowerCase() === 'label') return read(node);
    const el = node.querySelector('label');
    if (el) return read(el);
    node = node.parentNode;
  }
  return '';
}

function readForm(el) {
  const fields = [];
  let submit = 'Send';
  let consent = '';

  for (const c of el.querySelectorAll('input, textarea, select, button')) {
    const tag = (c.rawTagName || '').toLowerCase();
    if (tag === 'select') return null;
    const type = (c.getAttribute('type') || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();

    if (tag === 'button' || type === 'submit') {
      submit = (c.text || c.getAttribute('value') || '').trim() || submit;
      continue;
    }
    if (type === 'hidden') continue;
    // A control taken out of the tab order is a honeypot, not a question.
    if (c.getAttribute('tabindex') === '-1') continue;

    const name = c.getAttribute('name');
    if (!name) continue;

    if (type === 'checkbox') {
      // One tick box before the button is a consent line, which the renderer
      // draws itself. More than one is a question set this kit does not model.
      if (consent) return null;
      consent = labelFor(el, c) || 'I agree';
      continue;
    }
    if (!FIELD_TYPES.has(type)) return null;

    const label = labelFor(el, c);
    if (!label) return null;
    const field = { label, name, type };
    if (c.hasAttribute('required')) field.required = true;
    // Whatever the control says describes it. aria-describedby is how help
    // text is attached to an input on any form built properly.
    const describedBy = c.getAttribute('aria-describedby');
    if (describedBy) {
      const help = el.querySelector(`#${describedBy.split(/\s+/)[0]}`);
      if (help) field.help = help.text.trim();
    }
    fields.push(field);
  }
  if (!fields.length) return null;

  // Any paragraph standing above the first field is the form's own preamble.
  let intro = '';
  for (const child of el.childNodes) {
    if (child.nodeType !== 1) continue;
    const tag = (child.rawTagName || '').toLowerCase();
    // A hidden field carries no words, so it does not end the search.
    if (tag === 'input' && (child.getAttribute('type') || '') === 'hidden') continue;
    if (tag !== 'p') break;
    if (child.querySelector('input, textarea, select, label')) continue;
    intro = child.text.trim();
    break;
  }

  const action = el.getAttribute('action');
  const block = {
    type: 'form',
    name: el.getAttribute('name') || el.getAttribute('id') || 'contact',
    fields,
    submit,
  };
  if (intro) block.intro = intro;
  if (consent) block.consent = consent;
  if (action) block.action = action;
  return block;
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const COMPONENTS = [
  {
    name: 'prose',
    label: 'Text',
    summary: 'Text',
    // Ordinary flowing copy is gathered by the splitter across many elements
    // rather than matched one at a time, so it has no match() of its own.
    fields: [{ label: 'Body', name: 'body', widget: 'markdown' }],
    render: (b) => fromMarkdown(b.body || ''),
  },
  {
    name: 'disclosure',
    label: 'Expandable section',
    summary: 'Expandable: {{fields.summary}}',
    fields: [
      { label: 'Heading', name: 'summary', widget: 'string' },
      { label: 'Body', name: 'body', widget: 'markdown' },
    ],
    match: (el, { tag, has }) => tag === 'details' || has('c-disclosure'),
    read: readDisclosure,
    render: renderDisclosure,
  },
  {
    name: 'embed',
    label: 'Embedded video or player',
    summary: 'Embed: {{fields.title}}',
    fields: [
      { label: 'Address', name: 'src', widget: 'string',
        hint: 'The embed address, e.g. https://www.youtube.com/embed/XXXX' },
      { label: 'Title', name: 'title', widget: 'string', required: false,
        hint: 'What the video is, for anyone who cannot see it.' },
      { label: 'Kind', name: 'variant', widget: 'select', default: 'video',
        options: ['video', 'audio', 'panel'] },
    ],
    match: (el, { has }) => has('c-embed'),
    read: readEmbed,
    render: renderEmbed,
  },
  {
    name: 'card',
    label: 'Card',
    summary: 'Card: {{fields.heading}}',
    fields: [
      { label: 'Heading', name: 'heading', widget: 'string' },
      { label: 'Image', name: 'image', widget: 'image', required: false },
      { label: 'Alt text', name: 'imageAlt', widget: 'string', required: false },
      { label: 'Link', name: 'href', widget: 'string', required: false },
      { label: 'Body', name: 'body', widget: 'markdown', required: false },
    ],
    match: (el, { has }) => has('c-card'),
    read: readCard,
    render: renderCard,
  },
  {
    name: 'gallery',
    label: 'Picture grid',
    summary: 'Picture grid',
    fields: [
      { label: 'Pictures', name: 'images', widget: 'list', label_singular: 'Picture',
        fields: [
          { label: 'Picture', name: 'src', widget: 'image' },
          { label: 'Describe this picture', name: 'alt', widget: 'string', required: false },
        ] },
    ],
    match: (el, { has }) => has('c-gallery') || has('prose-grid') || has('elementor-image-carousel-wrapper'),
    read: readGallery,
    render: renderGallery,
  },
  {
    name: 'profiles',
    label: 'People',
    summary: 'People',
    fields: [
      { label: 'People', name: 'people', widget: 'list', label_singular: 'Person',
        summary: '{{fields.name}}',
        fields: [
          { label: 'Name', name: 'name', widget: 'string' },
          { label: 'Role', name: 'role', widget: 'string', required: false },
          { label: 'About', name: 'body', widget: 'markdown', required: false },
          { label: 'Links', name: 'links', widget: 'list', required: false,
            field: { label: 'Address', name: 'href', widget: 'string' } },
        ] },
    ],
    match: (el, { has }) => has('tmm') || has('tmm_wrap'),
    read: readProfiles,
    render: renderProfiles,
  },
  {
    name: 'video',
    label: 'Video file',
    summary: 'Video: {{fields.caption}}',
    fields: [
      { label: 'Video file', name: 'src', widget: 'file',
        hint: 'An MP4 you upload. For YouTube or Vimeo, use "Embedded video" instead.' },
      { label: 'Captions file', name: 'captions', widget: 'file', required: false,
        hint: 'A .vtt subtitle file. Without one this video is unusable for anyone deaf — please add it.' },
      { label: 'Still image', name: 'poster', widget: 'image', required: false,
        hint: 'Shown before anyone presses play.' },
      { label: 'Caption', name: 'caption', widget: 'string', required: false },
    ],
    match: (el, { tag, has }) => tag === 'video' || has('c-video') || has('e-hosted-video'),
    read: readVideo,
    render: renderVideo,
  },
  {
    name: 'buttons',
    label: 'Buttons',
    summary: 'Buttons',
    fields: [
      { label: 'Buttons', name: 'buttons', widget: 'list', label_singular: 'Button',
        summary: '{{fields.label}}',
        fields: [
          { label: 'Text on the button', name: 'label', widget: 'string' },
          { label: 'Link', name: 'href', widget: 'string',
            hint: 'A page on this site like /help-us/, or a full address like https://example.org' },
          { label: 'Style', name: 'style', widget: 'select', default: 'primary',
            options: ['primary', 'pink', 'ghost'] },
          { label: 'Open in a new tab', name: 'newTab', widget: 'boolean', default: false,
            hint: 'Leave off for pages on this site. Turn on for somewhere else entirely.' },
        ] },
    ],
    match: (el, { has }) => has('c-buttons'),
    read: readButtons,
    render: renderButtons,
  },
  {
    name: 'columns',
    label: 'Columns',
    summary: 'Columns',
    fields: [
      { label: 'Width', name: 'layout', widget: 'select', default: 'equal',
        options: ['equal', 'wide-left', 'wide-right'],
        hint: 'Columns stack into one on a phone whichever you choose.' },
      { label: 'Columns', name: 'columns', widget: 'list', label_singular: 'Column',
        fields: [{ label: 'Body', name: 'body', widget: 'markdown' }] },
    ],
    match: (el, { has }) => has('c-columns'),
    read: readColumns,
    render: renderColumns,
  },
  {
    name: 'image',
    label: 'Image',
    summary: 'Image: {{fields.alt}}',
    aliases: ['figure'],
    fields: [
      { label: 'Picture', name: 'src', widget: 'image' },
      { label: 'Describe this picture', name: 'alt', widget: 'string', required: false,
        hint: 'What would you say to someone on the phone who cannot see it? A person’s name, what is happening, what the graphic says.' },
      { label: 'This picture is decorative', name: 'decorative', widget: 'boolean', default: false,
        hint: 'Tick only if the picture adds nothing a reader would miss. It will be hidden from screen readers. Leave unticked and write a description for every photograph of a person.' },
      { label: 'Caption', name: 'caption', widget: 'string', required: false },
      { label: 'Width', name: 'width', widget: 'number', required: false },
      { label: 'Height', name: 'height', widget: 'number', required: false },
    ],
    match: (el, { tag, has }) => has('image-full') || tag === 'figure' || tag === 'img',
    read: readImage,
    render: renderImage,
  },
  {
    name: 'quote',
    label: 'Pull quote',
    summary: 'Quote: {{fields.text}}',
    fields: [
      { label: 'Quote', name: 'text', widget: 'text' },
      { label: 'Attribution', name: 'attribution', widget: 'string', required: false },
    ],
    match: (el, { tag }) => tag === 'blockquote',
    read: readQuote,
    render: renderQuote,
  },
  {
    name: 'form',
    label: 'Form',
    summary: 'Form: {{fields.name}}',
    fields: [
      { label: 'Form name', name: 'name', widget: 'string',
        hint: 'Shown with each message so you know which form it came from.' },
      { label: 'Intro', name: 'intro', widget: 'text', required: false },
      { label: 'Questions', name: 'fields', widget: 'list', label_singular: 'Question',
        summary: '{{fields.label}}',
        fields: [
          { label: 'Label', name: 'label', widget: 'string' },
          { label: 'Field name', name: 'name', widget: 'string',
            hint: 'Lowercase, no spaces. This is the heading it arrives under.' },
          { label: 'Type', name: 'type', widget: 'select', default: 'text',
            options: ['text', 'email', 'tel', 'textarea'] },
          { label: 'Required', name: 'required', widget: 'boolean', default: false },
          { label: 'Help text', name: 'help', widget: 'string', required: false },
        ] },
      { label: 'Consent line', name: 'consent', widget: 'string', required: false,
        hint: 'A tick box people must agree to before sending. Leave empty for none.' },
      { label: 'Thank-you message', name: 'success', widget: 'string', required: false,
        hint: 'Shown in place of the form once it has sent.' },
      { label: 'Button text', name: 'submit', widget: 'string', default: 'Send' },
      { label: 'Send submissions to', name: 'action', widget: 'string', required: false,
        default: 'netlify', hint: 'Leave as netlify unless you have your own endpoint.' },
    ],
    match: (el, { tag }) => tag === 'form',
    read: readForm,
    render: renderForm,
  },
  {
    name: 'html',
    label: 'Custom HTML',
    summary: 'Custom HTML',
    fields: [
      { label: 'HTML', name: 'html', widget: 'code', default_language: 'html', output_code_only: true,
        hint: 'An escape hatch. Anything here is published exactly as written.' },
    ],
    // No match(): this is what the splitter falls back to, not something it
    // recognises. Counting these is how we know which component to build next.
    render: (b) => b.html || b.body || '',
  },
];

const BY_NAME = new Map();
for (const c of COMPONENTS) {
  BY_NAME.set(c.name, c);
  for (const alias of c.aliases || []) BY_NAME.set(alias, c);
}

module.exports = { COMPONENTS, BY_NAME, esc, attr };
