// Page templates. Plain template literals — no framework, no runtime cost.
const SITE_NAME = 'METUPUK';
const SITE_TAGLINE = '#BusyLivingWithMets';
const SITE_URL = 'https://metupuk.org.uk';
const CHARITY_NO = '1196494';
const LOGO = '/media/2019/10/metupuk-logo.jpg';

const SOCIAL = [
  { name: 'Facebook', url: 'https://www.facebook.com/METUPUK/', icon: 'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z' },
  { name: 'X (Twitter)', url: 'https://twitter.com/metupukorg', icon: 'M18.9 2H22l-6.8 7.8L23 22h-6.3l-4.9-6.4L6.2 22H3l7.3-8.3L2.4 2h6.4l4.4 5.8L18.9 2Zm-1.1 18h1.7L8.3 3.8H6.5L17.8 20Z' },
  { name: 'Instagram', url: 'https://www.instagram.com/metupuk', icon: 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1Zm0 3.8a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 9.9a3.9 3.9 0 1 1 0-7.8 3.9 3.9 0 0 1 0 7.8Zm7.6-10.1a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0Z' },
  { name: 'YouTube', url: 'https://www.youtube.com/channel/UC-2H_BbJroN2cYpeXArUZ7Q', icon: 'M21.6 7.2s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C16 4.1 12 4.1 12 4.1s-4 0-6.8.2c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S2.2 8.8 2.2 10.4v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.2.9 1.6.1 6.6.2 6.6.2s4 0 6.8-.2c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5c0-1.6-.2-3.2-.2-3.2ZM9.9 14.3V8.8l5.2 2.8-5.2 2.7Z' },
];

// The site's main navigation. Mirrors the original menu, regrouped so every
// section has an obvious home and nothing is more than two clicks away.
const NAV = [
  {
    title: '#DarkerPink',
    url: '/darker-pink/',
    children: [
      { title: 'The #DarkerPink Exhibition', url: '/darker-side-of-pink/' },
      { title: 'Who Really Cares? (BCAM 2024)', url: '/bcam24/' },
      { title: '#DarkerPink TV ad 2022', url: '/darker-side-of-pink-2022-tv-ad/' },
      { title: 'I Am The 31', url: '/i-am-the-31/' },
      { title: '#TrodelvyNow campaign', url: '/trodelvynow/' },
    ],
  },
  {
    title: 'About us',
    url: '/about-us/',
    children: [
      { title: 'Welcome to METUPUK', url: '/about-us/welcome-to-metupuk/' },
      { title: 'Who are we? Our mission statement', url: '/about-us/who-are-we/' },
      { title: 'Why are we doing this?', url: '/about-us/why-are-we-doing-this/' },
      { title: 'Charity information', url: '/about-us/charity-information/' },
      { title: 'Our finances', url: '/about-us/our-finances/' },
      { title: 'METUPUK strategy', url: '/metupuk-strategy/' },
      { title: 'Red flag #SBCinfographic', url: '/about-us/red-flag-sbcinfographic/' },
      { title: 'International allies — ABC Global Alliance', url: '/about-us/international-allies-the-abc-global-alliance/' },
      { title: 'Our friends not forgotten', url: '/about-us/our-friends-not-forgotten/' },
      { title: 'METUPUK around the UK', url: '/metupuk-around-the-uk/' },
      { title: 'MBC Wales', url: '/metupuk-around-the-uk/mbc-wales/', child: true },
      { title: 'MBC Scotland', url: '/metupuk-around-the-uk/mbc-scotland-coming-soon/', child: true },
      { title: 'MBC Northern Ireland', url: '/metupuk-around-the-uk/mbc-n-i-coming-soon/', child: true },
      { title: 'METUPUK in the news', url: '/metupuk-in-the-news/' },
    ],
  },
  {
    title: 'Aims & objectives',
    url: '/aims-and-objectives/',
    children: [
      { title: 'Awareness & education', url: '/aims-and-objectives/awareness-and-education/' },
      { title: 'Research & access to drugs', url: '/aims-and-objectives/research-and-access-to-drugs/' },
      { title: 'Patient treatment and care', url: '/aims-and-objectives/patient-treatment-and-care/' },
    ],
  },
  {
    title: 'Research & trials',
    url: '/research-and-trials/',
    children: [
      { title: 'Clinical trials', url: '/research-and-trials/clinical-trials/' },
      { title: 'Treatment lines', url: '/treatment-lines/' },
      { title: 'MBC Manchester conference', url: '/mbc-manchester-conference/' },
      { title: 'Mental health & social media survey', url: '/metupuk-mental-health-social-media-survey/' },
    ],
  },
  {
    title: 'Help us',
    url: '/help-us/',
    children: [
      { title: 'Join us', url: '/help-us/join-us/' },
      { title: 'Fundraising', url: '/help-us/fundraising/' },
      { title: 'Resources', url: '/help-us/resources/' },
      { title: 'METUPUK newsletter', url: '/help-us/metupuk-newsletter/' },
      { title: 'Write to your MP', url: '/write-to-your-mp-for-metupuk/' },
      { title: 'Birdboxes', url: '/birdhouses/' },
    ],
  },
  { title: 'News', url: '/latest-news/' },
];

const { srcsetFor } = require('./srcset');

// Build a responsive <img> from a local media path, using the renditions
// WordPress already generated.
function responsiveImg(src, { alt = '', sizes, className, width, height, eager = false, maxWidth = 2048, extra = '' } = {}) {
  if (!src) return '';
  const set = srcsetFor(src, { maxWidth });
  // Intrinsic size prevents layout shift; fall back to the rendition's own.
  if (!width && set && set.width) width = set.width;
  if (!height && set && set.height) height = set.height;
  const attrs = [
    className ? `class="${className}"` : '',
    `src="${esc(set ? set.src : src)}"`,
    set ? `srcset="${esc(set.srcset)}"` : '',
    set && sizes ? `sizes="${esc(sizes)}"` : '',
    `alt="${esc(alt)}"`,
    width ? `width="${width}"` : '',
    height ? `height="${height}"` : '',
    eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"',
    extra,
  ].filter(Boolean).join(' ');
  return `<img ${attrs}>`;
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const isActive = (current, url) => current === url || (url !== '/' && current.startsWith(url));

/* --- Chrome --------------------------------------------------------------- */

function navMarkup(current) {
  return NAV.map((item) => {
    const active = isActive(current, item.url) ||
      (item.children || []).some((c) => c.url === current);
    if (!item.children) {
      return `<li class="nav__item${active ? ' nav__item--active' : ''}">
          <a class="nav__link" href="${item.url}"${current === item.url ? ' aria-current="page"' : ''}>${esc(item.title)}</a>
        </li>`;
    }
    const id = 'nav-' + item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `<li class="nav__item nav__item--has-panel${active ? ' nav__item--active' : ''}" data-open="false">
        <a class="nav__link" href="${item.url}"${current === item.url ? ' aria-current="page"' : ''}>${esc(item.title)}</a>
        <button type="button" class="nav__disc" aria-expanded="false" aria-controls="${id}" aria-label="Show pages under ${esc(item.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <ul class="nav__panel" id="${id}">
          ${item.children.map((c) => `<li${c.child ? ' class="is-child"' : ''}><a href="${c.url}"${current === c.url ? ' aria-current="page"' : ''}>${esc(c.title)}</a></li>`).join('\n          ')}
        </ul>
      </li>`;
  }).join('\n      ');
}

function drawerMarkup(current) {
  return NAV.map((item) => `<li>
        <a href="${item.url}"${current === item.url ? ' aria-current="page"' : ''}>${esc(item.title)}</a>
        ${item.children ? `<ul class="drawer__sub">
          ${item.children.map((c) => `<li${c.child ? ' class="is-child"' : ''}><a href="${c.url}"${current === c.url ? ' aria-current="page"' : ''}>${esc(c.title)}</a></li>`).join('\n          ')}
        </ul>` : ''}
      </li>`).join('\n      ');
}

function header(current) {
  return `<header class="site-header">
  <div class="wrap site-header__bar">
    <a class="brand" href="/">
      <img src="${LOGO}" alt="" width="44" height="44">
      <span>
        <span class="brand__name">MET UP UK</span>
        <span class="brand__tag">${esc(SITE_TAGLINE)}</span>
      </span>
    </a>
    <nav class="nav" aria-label="Main">
      <ul class="nav__list">
      ${navMarkup(current)}
      </ul>
    </nav>
    <div class="site-header__actions">
      <button class="icon-btn" type="button" data-search-open aria-label="Search the site">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
      </button>
      <button class="icon-btn" type="button" data-theme-toggle aria-label="Switch to dark theme" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
      </button>
      <a class="btn btn--donate" href="/help-us/#donate">Donate</a>
      <button class="icon-btn nav-toggle" type="button" data-drawer-open aria-expanded="false" aria-controls="site-drawer" aria-label="Open menu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  </div>
</header>

<div class="drawer" id="site-drawer" hidden>
  <div class="wrap">
    <div class="drawer__top">
      <a class="brand" href="/">
        <img src="${LOGO}" alt="" width="44" height="44">
        <span><span class="brand__name">MET UP UK</span></span>
      </a>
      <button class="icon-btn" type="button" data-drawer-close aria-label="Close menu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
      </button>
    </div>
    <nav aria-label="Main menu">
      <ul class="drawer__list">
      ${drawerMarkup(current)}
      </ul>
    </nav>
    <div class="drawer__cta">
      <a class="btn btn--donate" href="/help-us/#donate">Donate</a>
      <a class="btn btn--ghost" href="/help-us/join-us/">Join us</a>
    </div>
  </div>
</div>`;
}

function footer() {
  // The link columns carry their own class so their styles never reach the
  // social row, which is a different component that happens to also be a list.
  const col = (title, links) => `<div>
        <h2>${esc(title)}</h2>
        <ul class="footer__links">${links.map((l) => `<li><a href="${l.url}">${esc(l.title)}</a></li>`).join('')}</ul>
      </div>`;

  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer__grid">
      <div class="footer__brand">
        <h2>MET UP UK</h2>
        <p>The only patient advocacy group in the UK campaigning solely on metastatic (secondary) breast cancer. Volunteer-led, patient-led, and #BusyLivingWithMets.</p>
        <ul class="social">
          ${SOCIAL.map((s) => `<li><a href="${s.url}" rel="noopener" target="_blank" aria-label="${esc(s.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.icon}"/></svg></a></li>`).join('')}
        </ul>
      </div>
      ${col('About', NAV[1].children.slice(0, 6))}
      ${col('Our work', [...NAV[2].children, ...NAV[3].children.slice(0, 2)])}
      ${col('Get involved', [...NAV[4].children.slice(0, 5), { title: 'Latest news', url: '/latest-news/' }])}
      ${col('Campaigns', NAV[0].children)}
    </div>
    <div class="footer__legal">
      <p>&copy; ${new Date().getFullYear()} MET UP UK. Registered charity number ${CHARITY_NO}.</p>
      <p><a href="/about-us/charity-information/">Charity information</a> · <a href="/conflict-of-interest-3/">Conflict of interest policy</a> · <a href="/sitemap/">Sitemap</a></p>
    </div>
  </div>
</footer>`;
}

// A fixed rail down the right edge, as the original theme had. Hidden on
// narrower screens, where it would sit on top of the content it is meant to
// sit beside — the footer icons cover that case.
const socialRail = `<nav class="social-rail" aria-label="METUPUK on social media">
  <ul>
    ${SOCIAL.map((s) => `<li>
      <a href="${s.url}" rel="noopener" target="_blank">
        <span class="social-rail__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.icon}"/></svg></span>
        <span class="social-rail__label">${esc(s.name)}</span>
      </a>
    </li>`).join('\n    ')}
  </ul>
</nav>`;

const searchDialog = `<div class="search-dialog" id="search-dialog" hidden role="dialog" aria-modal="true" aria-label="Search">
  <div class="search-panel">
    <div class="search-panel__top">
      <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
      <label class="visually-hidden" for="search-input">Search METUPUK</label>
      <input type="search" id="search-input" placeholder="Search pages and articles…" autocomplete="off" spellcheck="false">
      <button class="icon-btn" type="button" data-search-close aria-label="Close search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
      </button>
    </div>
    <ul class="search-results" id="search-results"></ul>
  </div>
</div>`;

/* --- Document shell ------------------------------------------------------- */

function layout(opts) {
  const {
    title, description, url = '/', body, image, jsonLd = [],
    bodyClass = '', noindex = false, titleSuffix = null,
  } = opts;
  const fullTitle = url === '/'
    ? `${SITE_NAME} — ${SITE_TAGLINE}`
    : `${title}${titleSuffix ? ' — ' + titleSuffix : ''} — ${SITE_NAME}`;
  const ogImage = image ? (image.startsWith('http') ? image : SITE_URL + image) : SITE_URL + LOGO;

  return `<!doctype html>
<html lang="en-GB" data-base="/">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || '')}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<link rel="canonical" href="${SITE_URL}${url}">
<meta property="og:type" content="${opts.ogType || 'website'}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || '')}">
<meta property="og:url" content="${SITE_URL}${url}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@metupukorg">
<meta name="theme-color" content="#440729">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${LOGO}">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} news" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/css/site.css">
<script>(function(){try{var t=localStorage.getItem('metupuk-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
${jsonLd.length ? `<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd)}</script>` : ''}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<a class="skip-link" href="#main">Skip to content</a>
${header(url)}
<main id="main">
${body}
</main>
${socialRail}
${footer()}
${searchDialog}
<script src="/assets/js/site.js" defer></script>
</body>
</html>`;
}

/* --- Shared partials ------------------------------------------------------ */

function breadcrumb(trail, current) {
  if (!trail || !trail.length) return '';
  return `<nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        ${trail.map((t) => `<li><a href="${t.url}">${esc(t.title)}</a></li>`).join('')}
        <li aria-current="page">${esc(current)}</li>
      </ol>
    </nav>`;
}

function articleCard(doc, opts = {}) {
  // 27 posts genuinely have no image — no featured image, none in the body.
  // These get a text-led card rather than a stand-in graphic.
  const img = doc.image
    ? `<div class="card__media">${responsiveImg(doc.image, {
        alt: doc.imageAlt || '',
        sizes: '(min-width: 1200px) 380px, (min-width: 700px) 33vw, 100vw',
        width: 640, height: 360, maxWidth: 1024,
      })}</div>`
    : '';
  const cats = (doc.categories || []).slice(0, 2)
    .map((c) => `<span class="tag">${esc(c.name)}</span>`).join(' ');
  return `<article class="card${img ? '' : ' card--text'}">
      ${img}
      <div class="card__body">
        <p class="card__meta">${doc.date ? `<time datetime="${doc.date}">${fmtDate(doc.date)}</time>` : ''} ${cats}</p>
        <h3 class="card__title"><a href="${doc.url}">${esc(doc.title)}</a></h3>
        ${opts.hideExcerpt ? '' : `<p class="card__excerpt">${esc(doc.excerpt)}</p>`}
        <p class="card__more">Read more</p>
      </div>
    </article>`;
}

function pagination(current, total, base) {
  if (total <= 1) return '';
  const href = (n) => (n === 1 ? base : `${base}page/${n}/`);
  const out = [];
  out.push(current > 1
    ? `<a href="${href(current - 1)}" rel="prev">← Prev</a>`
    : '<span aria-hidden="true">← Prev</span>');
  const nums = new Set([1, total, current, current - 1, current + 1]);
  const list = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  let last = 0;
  for (const n of list) {
    if (n - last > 1) out.push('<span class="is-gap">…</span>');
    out.push(n === current
      ? `<span aria-current="page">${n}</span>`
      : `<a href="${href(n)}">${n}</a>`);
    last = n;
  }
  out.push(current < total
    ? `<a href="${href(current + 1)}" rel="next">Next →</a>`
    : '<span aria-hidden="true">Next →</span>');
  return `<nav class="pagination" aria-label="Pagination">${out.join('')}</nav>`;
}

// Build a table of contents from the h2/h3 already present in the body.
function tableOfContents(html) {
  const items = [];
  for (const m of html.matchAll(/<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    // Migrated pages sometimes mark a whole pull-quote up as a heading. That is
    // display text, not a section title, and it puts a paragraph in the rail.
    if (text.length > 90) continue;
    items.push({ level: +m[1], id: m[2], text });
  }
  if (items.length < 3) return '';
  return `<aside class="toc" aria-labelledby="toc-heading">
      <h2 id="toc-heading">On this page</h2>
      <ol>
        ${items.map((i) => `<li${i.level === 3 ? ' class="is-sub"' : ''}><a href="#${i.id}">${esc(i.text)}</a></li>`).join('\n        ')}
      </ol>
    </aside>`;
}

module.exports = {
  SITE_NAME, SITE_TAGLINE, SITE_URL, CHARITY_NO, LOGO, NAV, SOCIAL,
  esc, fmtDate, layout, breadcrumb, articleCard, pagination, tableOfContents, responsiveImg,
};
