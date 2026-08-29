// Build the static site from the migrated WordPress content.
const fs = require('fs');
const path = require('path');
const { build: buildModel, SITE } = require('./lib/model');
const ex = require('./lib/exhibition');
const { createResolver } = require('./lib/links');
const { enrich } = require('./lib/enrich');
const articleLayout = require('./lib/layout');
const T = require('./lib/templates');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const SCRAPE = path.join(ROOT, '_scrape');
const { esc, fmtDate, layout, breadcrumb, articleCard, pagination, tableOfContents, responsiveImg } = T;

const POSTS_PER_PAGE = 12;

/* --- Filesystem helpers --------------------------------------------------- */

function write(urlPath, html) {
  const rel = urlPath === '/' ? 'index.html'
    : urlPath.endsWith('/') ? path.join(urlPath.slice(1), 'index.html')
    : urlPath.slice(1);
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  return dest;
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { n += copyDir(src, dst); }
    else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n++; }
  }
  return n;
}

/* --- Media ----------------------------------------------------------------
   The scrape holds every rendition WordPress ever generated (~900 MB). Ship
   only what the built pages actually reference: it keeps the deploy small and
   stops unused 3 MB originals sitting on the server. */
function copyReferencedMedia() {
  const wanted = new Set();
  const addRef = (u) => {
    if (!u) return;
    const clean = decodeURIComponent(u.split('#')[0].split('?')[0].trim());
    if (clean.startsWith('/media/')) wanted.add(clean.replace('/media/', ''));
  };

  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(p); continue; }
      if (!/\.(html|xml|json|css)$/i.test(entry.name)) continue;
      const html = fs.readFileSync(p, 'utf8');
      for (const m of html.matchAll(/(?:src|href|content)="([^"]+)"/g)) addRef(m[1]);
      for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
        m[1].split(',').forEach((part) => addRef(part.trim().split(/\s+/)[0]));
      }
      for (const m of html.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) addRef(m[2]);
    }
  };
  scan(OUT);

  let copied = 0;
  let bytes = 0;
  const from = path.join(SCRAPE, 'assets');
  for (const rel of wanted) {
    const src = path.join(from, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(OUT, 'media', rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
    bytes += fs.statSync(src).size;
  }
  return { copied, referenced: wanted.size, bytes };
}

/* --- Content helpers ------------------------------------------------------ */

const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Give every heading a stable id so the table of contents and deep links work.
function addHeadingIds(html) {
  const used = new Set();
  return html.replace(/<(h[23])([^>]*)>([\s\S]*?)<\/\1>/gi, (whole, tag, attrs, inner) => {
    if (/\bid=/.test(attrs)) return whole;
    let id = slugify(inner) || 'section';
    let n = 2;
    while (used.has(id)) id = slugify(inner) + '-' + n++;
    used.add(id);
    return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
  });
}

const readingTime = (words) => Math.max(1, Math.round(words / 220));

// Each #DarkerPink story page framed the whole exhibition microsite in an
// iframe just to reach one film. Embed that woman's film directly instead.
function inlineExhibitionFilms(model, exhibition) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const byName = new Map(exhibition.portraits.map((p) => [norm(p.name), p]));
  const bySlug = new Map(exhibition.portraits.map((p) => [p.slug, p]));

  for (const doc of model.pages) {
    if (!doc.url.startsWith('/darker-pink/') || !doc.html.includes('<iframe')) continue;
    doc.html = doc.html.replace(
      /<div class="c-embed"><iframe[^>]*src="[^"]*(?:dsop|darker-side-of-pink)[^"]*?(?:#([a-z-]+))?"[^>]*><\/iframe><\/div>/gi,
      (whole, anchor) => {
        const p = (anchor && bySlug.get(anchor)) || byName.get(norm(doc.title));
        if (!p || !p.video) return '';
        return `<div class="c-embed"><iframe src="${p.video}" title="${p.name} — The Darker Side of Pink" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>
<p><a href="/darker-side-of-pink/">See the full Darker Side of Pink exhibition →</a></p>`;
      }
    );
  }
}

/* --- Page templates ------------------------------------------------------- */

function renderHome(model, exhibition) {
  const latest = model.posts.slice(0, 3);
  const pageImage = (url) => {
    const p = model.pages.find((x) => x.url === url);
    return p && p.image ? p.image : null;
  };

  const aims = [
    { title: 'Awareness & education', url: '/aims-and-objectives/awareness-and-education/', text: 'Confront the reality of MBC that the celebratory pink of most breast cancer marketing leaves out — and make policy makers, charities and government bodies treat it as a priority.' },
    { title: 'Research & access to drugs', url: '/aims-and-objectives/research-and-access-to-drugs/', text: 'Push for a fair share of research funding, faster approvals, and access to the treatments that extend and improve life for people living with secondary breast cancer.' },
    { title: 'Patient treatment & care', url: '/aims-and-objectives/patient-treatment-and-care/', text: 'Fight for every MBC patient to have a clinical nurse specialist, proper support, and care that meets national standards wherever they live.' },
  ];

  // The old homepage promoted these through a four-slide hero and a five-card
  // carousel. Those were the charity's own editorial choices about what matters,
  // so every one of them keeps a place here. Titles, images and summaries come
  // from the pages themselves, so this cannot drift out of date.
  const featuredUrls = [
    '/about-us/red-flag-sbcinfographic/',
    '/trodelvynow/',
    '/treatment-lines/',
    '/metupuk-mental-health-social-media-survey/',
    '/darker-pink/',
    '/about-us/',
  ];
  const featured = featuredUrls
    .map((u) => model.pages.find((p) => p.url === u))
    .filter(Boolean);

  // A strip of exhibition portraits, used as a visual index into the campaign.
  const montage = exhibition.portraits.slice(0, 8)
    .map((p) => `<li>${responsiveImg(p.image, {
      alt: `Portrait of ${p.name} from The Darker Side of Pink`,
      sizes: '(min-width: 950px) 12vw, 25vw',
      width: 360, height: 480, maxWidth: 720,
    })}</li>`)
    .join('\n          ');

  const body = `<section class="hero hero--image">
  ${responsiveImg('/media/2019/10/4-ladies-in-pink.jpg', {
    className: 'hero__bg', alt: '', eager: true, maxWidth: 2048,
    sizes: '100vw', extra: 'aria-hidden="true"',
  })}
  <div class="wrap hero__grid">
    <div class="hero__copy">
      <p class="hero__eyebrow">Metastatic breast cancer · United Kingdom</p>
      <h1>Another 31 women will die today.<br><em class="hero__beat">And tomorrow.</em><br><em class="hero__beat hero__beat--last">And the next.</em></h1>
      <p class="hero__lede">METUPUK is the only patient advocacy group in the UK campaigning solely on metastatic (secondary) breast cancer. We are the patients — volunteer-led, unpaid, and #BusyLivingWithMets.</p>
      <div class="hero__actions">
        <a class="btn btn--donate" href="/help-us/#donate">Donate</a>
        <a class="btn btn--ghost" href="/about-us/">Who we are</a>
      </div>
    </div>
    <div class="hero__stat">
      <p class="hero__stat-number" data-count-to="31">31</p>
      <p class="hero__stat-label">women in the UK die every single day from metastatic breast cancer — the biggest cancer killer of women under 50.</p>
      <p class="hero__stat-note">Median life expectancy after diagnosis is just 2–3 years. We believe that is an unacceptable outcome, and that MBC can become a chronic disease.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div>
        <h2>Three fronts, one goal</h2>
      </div>
      <p class="lede">We are a patient advocacy group aiming to turn metastatic breast cancer into a chronic illness, and to help MBC patients access the best medicines to prolong and improve their quality of life. We work towards a day when MBC can be cured.</p>
    </div>
    <div class="grid grid--3" style="margin-top:var(--sp-7)">
      ${aims.map((a) => {
        const img = pageImage(a.url);
        return `<article class="card card--feature">
        ${img ? `<div class="card__media card__media--tinted">${responsiveImg(img, {
          alt: '', width: 640, height: 400, maxWidth: 1024,
          sizes: '(min-width: 1200px) 380px, (min-width: 700px) 33vw, 100vw',
        })}</div>` : ''}
        <div class="card__body">
          <h3 class="card__title"><a href="${a.url}">${esc(a.title)}</a></h3>
          <p class="card__excerpt">${esc(a.text)}</p>
          <p class="card__more">Read our aims</p>
        </div>
      </article>`;
      }).join('\n      ')}
    </div>
    <p style="margin-top:var(--sp-6)"><a class="btn btn--ghost" href="/aims-and-objectives/">Read our full aims &amp; objectives</a></p>
  </div>
</section>

<section class="section section--sunken">
  <div class="wrap">
    <div class="section-head">
      <div>
        <h2>What we are pushing on right now</h2>
      </div>
      <p class="lede">Campaigns, resources and research that METUPUK members are driving — from the red-flag symptoms infographic to the fight for faster drug approvals.</p>
    </div>
    <div class="grid grid--3" style="margin-top:var(--sp-7)">
      ${featured.map((p) => `<article class="card">
        ${p.image ? `<div class="card__media">${responsiveImg(p.image, {
          alt: p.imageAlt || '',
          sizes: '(min-width: 1200px) 360px, (min-width: 700px) 33vw, 100vw',
          width: 640, height: 360, maxWidth: 1024,
        })}</div>` : ''}
        <div class="card__body">
          <h3 class="card__title"><a href="${p.url}">${esc(p.title)}</a></h3>
          <p class="card__excerpt">${esc(p.excerpt)}</p>
          <p class="card__more">Find out more</p>
        </div>
      </article>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="scrolly" aria-labelledby="dsop-heading">
  <div class="scrolly__media">
    ${responsiveImg('/media/2021/10/darker-pink-bg.jpg', {
      alt: '', sizes: '100vw', maxWidth: 1920, eager: false, extra: 'aria-hidden="true"',
    })}
  </div>
  <div class="scrolly__panels">
    <div class="scrolly__panel">
      <div class="wrap">
        <div class="scrolly__copy">
          <p class="eyebrow">The campaign</p>
          <h2 id="dsop-heading">The Darker Side of Pink</h2>
          <p>Look beyond the pink and fluffy side of cancer. This is the side most campaigns leave out.</p>
        </div>
      </div>
    </div>
    <div class="scrolly__panel">
      <div class="wrap">
        <div class="scrolly__copy">
          <p class="scrolly__figure">31</p>
          <p>Transparent figures tour the UK — one for every woman who dies each day from metastatic breast cancer. Each carries a QR code that plays a film recorded by the woman herself.</p>
        </div>
      </div>
    </div>
    <div class="scrolly__panel">
      <div class="wrap">
        <div class="scrolly__copy">
          <h2>Give us a chance to live — don’t write us off</h2>
          <p>We can be #BusyLivingWithMets, even those of us on the darker side of pink.</p>
          <div class="hero__actions">
            <a class="btn btn--donate" href="/darker-side-of-pink/">See the exhibition</a>
            <a class="btn btn--ghost" href="/bcam24/">Who really cares?</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section section--inverse">
  <div class="wrap">
    <div class="feature-band__grid">
      <div>
        <h2>${exhibition.portraits.length} women, ${exhibition.portraits.length} films</h2>
        <p class="lede" style="margin-top:var(--sp-4)">Every figure in the exhibition is a real person who recorded her own story. Watch them, or read the written accounts.</p>
        <div class="hero__actions">
          <a class="btn btn--ghost" href="/darker-side-of-pink/">Meet all ${exhibition.portraits.length}</a>
        </div>
      </div>
      <div>
        <ul class="montage" aria-label="Portraits from The Darker Side of Pink">
          ${montage}
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="section section--sunken">
  <div class="wrap">
    <div class="section-head">
      <div>
        <h2>Latest news</h2>
      </div>
      <p class="lede">Campaign updates, policy wins and the lived experience of people with secondary breast cancer, written by our community.</p>
    </div>
    <div class="grid grid--3" style="margin-top:var(--sp-7)">
      ${latest.map((p) => articleCard(p)).join('\n      ')}
    </div>
    <p style="margin-top:var(--sp-7)"><a class="btn btn--ghost" href="/latest-news/">All ${model.posts.length} news &amp; blog posts</a></p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="cta-band">
      <div>
        <h2>Help us keep pushing</h2>
        <p>We are entirely volunteer-run and self-funded — no salaries, no remuneration. Every donation, every letter to an MP, every share goes directly into changing outcomes for people living with MBC.</p>
      </div>
      <div class="btn-row">
        <a class="btn btn--donate" href="/help-us/#donate">Donate</a>
        <a class="btn btn--ghost" href="/help-us/join-us/">Join us</a>
        <a class="btn btn--ghost" href="/write-to-your-mp-for-metupuk/">Write to your MP</a>
      </div>
    </div>
  </div>
</section>`;

  return layout({
    title: 'Home',
    url: '/',
    description: 'METUPUK is the only patient advocacy group in the UK campaigning solely on metastatic (secondary) breast cancer. Volunteer-led, patient-led, #BusyLivingWithMets.',
    body,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'NGO',
      name: 'MET UP UK',
      alternateName: 'METUPUK',
      url: T.SITE_URL,
      logo: T.SITE_URL + T.LOGO,
      description: 'The only patient advocacy group in the UK campaigning solely on metastatic (secondary) breast cancer.',
      sameAs: T.SOCIAL.map((s) => s.url),
      address: { '@type': 'PostalAddress', addressCountry: 'GB' },
      identifier: 'Registered charity ' + T.CHARITY_NO,
    }],
  });
}

/* A standfirst is worth having when it tells the reader something the page has
   not said yet. On 269 of these 296 pages it was generated from the opening
   paragraph, so the page introduced itself and then immediately repeated
   itself word for word, with a band of empty space between the two. The
   summary still goes in <meta name="description"> where search results need
   it; it is only kept off the page when it is an echo. */
function standfirst(doc) {
  if (!doc.description) return '';
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const opening = norm(doc.description).split(' ').slice(0, 12).join(' ');
  if (opening && norm(doc.text).startsWith(opening)) return '';
  return `<p class="lede">${esc(doc.description)}</p>`;
}

function renderPage(doc, model) {
  let html = addHeadingIds(doc.html);
  const toc = tableOfContents(html);
  const kids = (doc.children || []).length ? `<section class="section section--tight section--sunken">
    <div class="wrap">
      <h2>In this section</h2>
      <ul class="linklist" style="margin-top:var(--sp-5)">
        ${doc.children.map((c) => `<li><a href="${c.url}">${esc(c.title)}</a></li>`).join('\n        ')}
      </ul>
    </div>
  </section>` : '';

  // Where the charity gave the page a featured image, use it as the banner —
  // it is the image they chose to represent that page.
  // A full-bleed banner spans roughly 1600px. Using a narrower upload there
  // just stretches it, so the plain page header is the better answer.
  const bannerFits = doc.image && (doc.imageWidth === 0 || doc.imageWidth >= 1100);
  const banner = bannerFits
    ? responsiveImg(doc.image, {
        className: 'page-head__bg', alt: '', eager: true,
        sizes: '100vw', maxWidth: 2048, extra: 'aria-hidden="true"',
      })
    : '';

  // Acts only where there is no contents rail beside the text: the tinted
  // ground runs the full width of the window, which would pass behind it.
  if (!toc) html = articleLayout.acts(html);

  const body = `<div class="page-head${bannerFits ? ' page-head--image' : ''}">
  ${banner}
  <div class="wrap">
    ${breadcrumb(doc.breadcrumb, doc.title)}
    <h1>${esc(doc.title)}</h1>
    ${standfirst(doc)}
  </div>
</div>

<div class="section">
  <div class="wrap layout-aside${toc ? '' : ' layout-aside--solo'}">
    <div class="prose">
      ${html}
    </div>
    ${toc}
  </div>
</div>
${kids}`;

  const fallbackDescription =
    `${doc.title} — MET UP UK, the only patient advocacy group in the UK campaigning solely on metastatic (secondary) breast cancer.`;

  return layout({
    title: doc.title,
    // The #DarkerPink story pages share a name with the blog post that
    // announced them, so qualify the title to keep search results distinct.
    titleSuffix: doc.url.startsWith('/darker-pink/') && doc.url !== '/darker-pink/'
      ? 'The Darker Side of Pink' : null,
    url: doc.url,
    description: doc.description && doc.description.length > 40 ? doc.description : fallbackDescription,
    image: doc.image,
    body,
    ogType: 'article',
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: doc.title,
      url: T.SITE_URL + doc.url,
      description: doc.description,
      isPartOf: { '@type': 'WebSite', name: T.SITE_NAME, url: T.SITE_URL },
    }],
  });
}

function renderPost(doc, prev, next) {
  let html = addHeadingIds(doc.html);
  const toc = doc.words > 900 ? tableOfContents(html) : '';
  if (!toc) html = articleLayout.acts(html);
  const cats = (doc.categories || [])
    .map((c) => `<a class="tag" href="/news/topic/${c.slug}/">${esc(c.name)}</a>`).join(' ');

  const body = `<div class="page-head">
  <div class="wrap wrap--narrow" style="width:min(100% - 2.5rem, var(--wrap))">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        <li><a href="/latest-news/">News</a></li>
        <li aria-current="page">${esc(doc.title)}</li>
      </ol>
    </nav>
    <h1>${esc(doc.title)}</h1>
    <p class="card__meta" style="margin-top:var(--sp-4)">
      <time datetime="${doc.date}">${fmtDate(doc.date)}</time>
      <span>·</span><span>${readingTime(doc.words)} min read</span>
      ${cats ? `<span>·</span> ${cats}` : ''}
    </p>
  </div>
</div>

<div class="section">
  <div class="wrap layout-aside${toc ? '' : ' layout-aside--solo'}">
    <article class="prose">
      ${doc.image ? (() => {
        // Stretching a 200px upload across a 780px hero is what makes a page
        // look cheap. Below that width, show it at its own size instead.
        const small = doc.imageWidth > 0 && doc.imageWidth < 700;
        return `<figure class="post-hero${small ? ' post-hero--contained' : ''}">${responsiveImg(doc.image, {
          alt: doc.imageAlt || '', eager: true, maxWidth: 1560,
          width: doc.imageWidth || undefined, height: doc.imageHeight || undefined,
          sizes: small ? `${doc.imageWidth}px` : '(min-width: 1024px) 780px, 100vw',
        })}</figure>`;
      })() : ''}
      ${html}
      <nav class="prevnext" aria-label="More articles">
        ${prev ? `<a href="${prev.url}"><span>← Previous</span>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="is-next" href="${next.url}"><span>Next →</span>${esc(next.title)}</a>` : '<span></span>'}
      </nav>
    </article>
    ${toc}
  </div>
</div>`;

  return layout({
    title: doc.title,
    url: doc.url,
    description: doc.description && doc.description.length > 40
      ? doc.description
      : `${doc.title} — from the MET UP UK blog, the UK's metastatic breast cancer patient advocacy charity.`,
    image: doc.image,
    body,
    ogType: 'article',
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: doc.title,
      datePublished: doc.date,
      dateModified: doc.modified || doc.date,
      url: T.SITE_URL + doc.url,
      description: doc.description,
      image: doc.image ? (doc.image.startsWith('http') ? doc.image : T.SITE_URL + doc.image) : undefined,
      publisher: { '@type': 'NGO', name: 'MET UP UK', logo: { '@type': 'ImageObject', url: T.SITE_URL + T.LOGO } },
      mainEntityOfPage: T.SITE_URL + doc.url,
    }],
  });
}

function renderNewsIndex(posts, model, { page = 1, total = 1, base = '/latest-news/', category = null } = {}) {
  const start = (page - 1) * POSTS_PER_PAGE;
  const slice = posts.slice(start, start + POSTS_PER_PAGE);
  const cats = model.categories
    .filter((c) => c.slug !== 'uncategorized' && c.count > 0)
    .sort((a, b) => b.count - a.count);

  const title = category ? `${category.name} — news` : 'News & blog';
  const intro = category
    ? `Articles filed under ${category.name}.`
    : 'All our latest news, campaign updates and blog posts from the METUPUK team and the wider MBC community.';

  const body = `<div class="page-head">
  <div class="wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        ${category ? '<li><a href="/latest-news/">News</a></li>' : ''}
        <li aria-current="page">${esc(title)}</li>
      </ol>
    </nav>
    <h1>${esc(title)}</h1>
    <p class="lede">${esc(intro)}</p>
  </div>
</div>

<div class="section">
  <div class="wrap">
    ${(() => {
      // Twenty-two topics wrap to four rows and read as a wall. Show the ones
      // people actually use and tuck the long tail behind a disclosure — still
      // one click away, and still crawlable, since it is real markup.
      const pill = (c) => `<a href="/news/topic/${c.slug}/"${category && category.slug === c.slug ? ' aria-current="page"' : ''}>${esc(c.name)} (${c.count})</a>`;
      const PRIMARY = 6;
      const isRest = (c) => cats.indexOf(c) >= PRIMARY;
      const main = cats.slice(0, PRIMARY);
      const rest = cats.slice(PRIMARY);
      // Keep the current topic visible even if it lives in the tail.
      const openTail = category && rest.some((c) => c.slug === category.slug);
      // One row: "All", the six most-used topics, and the disclosure sitting on
      // the same line rather than stranded underneath.
      return `<nav class="filterbar" aria-label="Filter by topic">
      <div class="filters">
        <a href="/latest-news/"${!category ? ' aria-current="page"' : ''}>All (${model.posts.length})</a>
        ${main.map(pill).join('\n        ')}
        ${rest.length ? `<button type="button" class="filters__toggle" aria-expanded="${openTail ? 'true' : 'false'}" aria-controls="more-topics">
          ${rest.length} more<span aria-hidden="true"></span>
        </button>` : ''}
      </div>
      ${rest.length ? `<div class="filters filters--rest" id="more-topics"${openTail ? '' : ' hidden'}>
        ${rest.map(pill).join('\n        ')}
      </div>` : ''}
    </nav>`;
    })()}
    <h2 class="visually-hidden">Articles</h2>
    <div class="grid grid--3">
      ${slice.map((p) => articleCard(p)).join('\n      ')}
    </div>
    ${pagination(page, total, base)}
  </div>
</div>`;

  return layout({
    title: page > 1 ? `${title} — page ${page}` : title,
    url: page === 1 ? base : `${base}page/${page}/`,
    description: intro,
    body,
    noindex: page > 1,
  });
}

function renderExhibition(exhibition, model) {
  // Written stories that live as their own pages, matched to the films by name.
  const storyPages = model.pages.filter((p) => p.url.startsWith('/darker-pink/') && p.url !== '/darker-pink/');
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const storyByName = new Map(storyPages.map((p) => [norm(p.title), p]));

  const cards = exhibition.portraits.map((p) => {
    const story = storyByName.get(norm(p.name));
    const target = story ? story.url : `#film-${p.slug}`;
    return `<li class="portrait">
        ${responsiveImg(p.image, {
          alt: `Portrait of ${p.name}`,
          sizes: '(min-width: 900px) 180px, 45vw',
          width: 360, height: 480, maxWidth: 720,
        })}
        <p class="portrait__name">${esc(p.name)}</p>
        <a href="${target}"><span>${esc(p.name)}${story ? ' — read her story' : ' — watch her film'}</span></a>
      </li>`;
  }).join('\n      ');

  const films = exhibition.portraits.map((p) => `<section id="film-${p.slug}" style="margin-top:var(--sp-7)">
      <h3>${esc(p.name)}</h3>
      <div class="c-embed" style="margin-top:var(--sp-4)">
        <iframe src="${esc(p.video)}" title="${esc(p.name)} — The Darker Side of Pink" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>
      </div>
      ${storyByName.get(norm(p.name)) ? `<p style="margin-top:var(--sp-3)"><a href="${storyByName.get(norm(p.name)).url}">Read ${esc(p.name.split(' ')[0])}’s full story →</a></p>` : ''}
    </section>`).join('\n    ');

  const tourRows = exhibition.tour.map((t) => {
    const dates = (t.dates || '').split(/Click here/i)[0].replace(/\b(20\d\d\s*)+$/, '').trim();
    const current = /current/i.test(t.status);
    const state = current ? 'Now showing' : /coming/i.test(t.status) ? 'Coming soon' : 'Finished';
    return `<tr>
        <td><span class="tag${current ? ' tag--current' : ''}">${esc(state)}</span></td>
        <td><strong>${esc(t.city)}</strong></td>
        <td>${esc(t.venue)}</td>
        <td>${esc(dates)}</td>
      </tr>`;
  }).join('\n      ');

  const body = `<section class="hero">
  <div class="wrap">
    <p class="hero__eyebrow">A touring exhibition by METUPUK</p>
    <h1>The Darker <em>Side of Pink</em></h1>
    <p class="hero__lede">31 transparent figures — one for every woman who dies each day in the UK from metastatic breast cancer. Each figure carries a QR code that plays a film recorded by someone living with the disease.</p>
    <div class="hero__actions">
      <a class="btn btn--donate" href="#women">Hear their stories</a>
      <a class="btn btn--ghost" href="#tour">Where to see it</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap wrap--narrow prose">
    <h2 id="about">About the exhibition</h2>
    <p><strong>Every day, 31 women lose their lives to metastatic breast cancer.</strong></p>
    <p>‘The Darker Side of Pink’ is a physical, interactive, mobile experience that creates awareness of metastatic breast cancer — the biggest cancer killer of women under the age of 50 in the UK.</p>
    <p>It features 31 transparent figures – one for each woman who dies every day from metastatic or secondary breast cancer – each with an individual QR code that plays a video from breast cancer patients who have lived and are living with this diagnosis.</p>
    <p>The figures are displayed in locations around the UK, from galleries to public libraries and shopping centres, to help promote the issues affecting those with secondary and/or metastatic breast cancer.</p>
  </div>
</section>

<section class="section section--sunken">
  <div class="wrap">
    <p class="eyebrow">Hear 31 real women’s stories</p>
    <h2 id="women">The women of the exhibition</h2>
    <p class="lede" style="margin-top:var(--sp-4)">Listen to our 31 women discuss MBC, and what it means to be on the darker side of pink.</p>
    <ul class="portraits" style="margin-top:var(--sp-6)">
      ${cards}
    </ul>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2 id="tour">Where can I see the figures?</h2>
    <p class="lede" style="margin-top:var(--sp-4)">Spreading awareness throughout the UK, to help push policy to change for the better.</p>
    <div class="table-scroll" style="margin-top:var(--sp-6)">
      <table class="prose" style="width:100%;border-collapse:collapse">
        <thead><tr><th scope="col">Status</th><th scope="col">City</th><th scope="col">Venue</th><th scope="col">Dates</th></tr></thead>
        <tbody>
      ${tourRows}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="section section--sunken">
  <div class="wrap wrap--narrow">
    <h2 id="films">All 31 films</h2>
    ${films}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="cta-band">
      <div>
        <h2>Give us a chance to live — don’t write us off</h2>
        <p>We can be #BusyLivingWithMets, even those of us on the darker side of pink. Tag METUPUK into your post, share the figures, and help us push policy to change for the better.</p>
      </div>
      <div class="btn-row">
        <a class="btn btn--donate" href="/help-us/#donate">Donate</a>
        <a class="btn btn--ghost" href="/help-us/">How you can help</a>
      </div>
    </div>
  </div>
</section>`;

  return layout({
    title: 'The Darker Side of Pink',
    url: '/darker-side-of-pink/',
    description: '31 transparent figures — one for every woman who dies each day in the UK from metastatic breast cancer. A touring exhibition by METUPUK, with films from 31 real women.',
    body,
    image: exhibition.portraits[0] ? exhibition.portraits[0].image : null,
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'ExhibitionEvent',
      name: 'The Darker Side of Pink',
      description: 'A touring exhibition of 31 transparent figures, one for each woman who dies every day in the UK from metastatic breast cancer.',
      url: T.SITE_URL + '/darker-side-of-pink/',
      organizer: { '@type': 'NGO', name: 'MET UP UK', url: T.SITE_URL },
    }],
  });
}

function renderSitemapPage(model) {
  const roots = model.pages.filter((p) => p.parent === 0 && p.url !== '/')
    .sort((a, b) => a.title.localeCompare(b.title));
  const branch = (p) => `<li><a href="${p.url}">${esc(p.title)}</a>
      ${p.children && p.children.length ? `<ul>${p.children.map(branch).join('')}</ul>` : ''}
    </li>`;

  const body = `<div class="page-head">
  <div class="wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li aria-current="page">Sitemap</li></ol></nav>
    <h1>Sitemap</h1>
    <p class="lede">Every page and article on this site, in one list.</p>
  </div>
</div>
<div class="section">
  <div class="wrap">
    <div class="prose prose--wide">
      <h2>Pages</h2>
      <ul>${roots.map(branch).join('\n      ')}</ul>
      <h2>Special pages</h2>
      <ul>
        <li><a href="/darker-side-of-pink/">The Darker Side of Pink exhibition</a></li>
        <li><a href="/latest-news/">News &amp; blog</a></li>
      </ul>
      <h2>News &amp; blog (${model.posts.length} articles)</h2>
      <ul>${model.posts.map((p) => `<li><a href="${p.url}">${esc(p.title)}</a> <span style="color:var(--text-faint)">— ${fmtDate(p.date)}</span></li>`).join('\n      ')}</ul>
    </div>
  </div>
</div>`;

  return layout({ title: 'Sitemap', url: '/sitemap/', description: 'Every page and article on the METUPUK site.', body });
}

function render404() {
  const body = `<div class="section" style="padding-block:var(--sp-9)">
  <div class="wrap wrap--narrow" style="text-align:center">
    <p class="eyebrow">Error 404</p>
    <h1>We can’t find that page</h1>
    <p class="lede" style="margin:var(--sp-5) auto 0">The page may have moved. Try the search, or start from one of these.</p>
    <div class="hero__actions" style="justify-content:center">
      <a class="btn btn--primary" href="/">Home</a>
      <a class="btn btn--ghost" href="/latest-news/">News</a>
      <a class="btn btn--ghost" href="/sitemap/">Sitemap</a>
    </div>
  </div>
</div>`;
  return layout({ title: 'Page not found', url: '/404.html', description: 'Page not found.', body, noindex: true });
}

/* --- Feeds and machine-readable output ------------------------------------ */

function renderSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${T.SITE_URL}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
}

function renderFeed(posts) {
  const items = posts.slice(0, 30).map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${T.SITE_URL}${p.url}</link>
    <guid isPermaLink="true">${T.SITE_URL}${p.url}</guid>
    <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    <description>${esc(p.excerpt)}</description>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${T.SITE_NAME} — news</title>
  <link>${T.SITE_URL}/latest-news/</link>
  <description>News, campaign updates and blog posts from MET UP UK.</description>
  <language>en-GB</language>
${items}
</channel></rss>`;
}

// The ribbon, not a number. Two digits at the 16px a browser tab actually
// renders are a smudge, and "31" means nothing to someone who has not already
// read the campaign; the ribbon is recognised instantly and is the charity's
// own mark.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<defs><linearGradient id="r" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="20.4">
<stop offset="0" stop-color="#fbcfe1"/><stop offset=".55" stop-color="#f473a6"/><stop offset="1" stop-color="#ec3f8e"/>
</linearGradient></defs>
<rect width="24" height="24" rx="4" fill="#440729"/>
<path d="M6.9 20.4 C8.6 17.2 10.6 14.7 12.0 12.8 C13.9 10.7 15.7 8.4 15.6 5.6 C15.5 3.5 14.1 2.0 12.3 2.0 C10.5 2.0 9.1 3.5 9.0 5.6 C8.9 8.4 10.7 10.7 12.0 12.8 C13.4 14.7 15.4 17.2 17.1 20.4" fill="none" stroke="url(#r)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* --- Orchestration -------------------------------------------------------- */

function run() {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const model = buildModel();
  const exhibition = ex.extract();

  // Repair links that were already broken on the old site, now that we know
  // the complete set of URLs the new site actually publishes.
  const resolver = createResolver(model, ['/', '/darker-side-of-pink/', '/sitemap/', '/latest-news/']);
  for (const doc of [...model.pages, ...model.posts]) doc.html = resolver.fix(doc.html);
  inlineExhibitionFilms(model, exhibition);
  // Correct heading outlines, image dimensions and link labels.
  for (const doc of [...model.pages, ...model.posts]) doc.html = enrich(doc.html);

  const written = [];
  const record = (url, html) => { write(url, html); written.push(url); };

  // Home
  record('/', renderHome(model, exhibition));

  // Every migrated page, at its original URL.
  for (const p of model.pages) {
    if (p.url === '/') continue;
    record(p.url, renderPage(p, model));
  }

  // The exhibition microsite, rebuilt inside the main site.
  record('/darker-side-of-pink/', renderExhibition(exhibition, model));

  // Posts, newest first, with prev/next.
  model.posts.forEach((p, i) => {
    const newer = model.posts[i - 1] || null;
    const older = model.posts[i + 1] || null;
    record(p.url, renderPost(p, older, newer));
  });

  // News index + pagination. /latest-news/ is a real page, so it is overwritten
  // here with the full archive listing rather than its one-line description.
  const totalPages = Math.max(1, Math.ceil(model.posts.length / POSTS_PER_PAGE));
  for (let n = 1; n <= totalPages; n++) {
    const url = n === 1 ? '/latest-news/' : `/latest-news/page/${n}/`;
    record(url, renderNewsIndex(model.posts, model, { page: n, total: totalPages, base: '/latest-news/' }));
  }

  // Category archives.
  for (const cat of model.categories) {
    if (cat.slug === 'uncategorized') continue;
    const posts = model.posts.filter((p) => p.categories.some((c) => c.id === cat.id));
    if (!posts.length) continue;
    const total = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
    for (let n = 1; n <= total; n++) {
      const base = `/news/topic/${cat.slug}/`;
      const url = n === 1 ? base : `${base}page/${n}/`;
      record(url, renderNewsIndex(posts, model, { page: n, total, base, category: cat }));
    }
  }

  // Utility pages
  record('/sitemap/', renderSitemapPage(model));
  write('/404.html', render404());

  // Search index — title, url, kind and a trimmed body for snippets.
  const index = [...model.pages.filter((p) => p.url !== '/'), ...model.posts]
    .filter((d) => d.words > 5)
    .map((d) => ({ t: d.title, u: d.url, k: d.kind === 'post' ? 'Article' : 'Page', b: d.text.slice(0, 1800) }));
  index.push({ t: 'The Darker Side of Pink', u: '/darker-side-of-pink/', k: 'Exhibition', b: '31 transparent figures, one for every woman who dies each day in the UK from metastatic breast cancer. ' + exhibition.portraits.map((p) => p.name).join(', ') });
  fs.writeFileSync(path.join(OUT, 'search-index.json'), JSON.stringify(index));

  // XML sitemap
  const sitemapUrls = [
    { loc: '/', priority: '1.0' },
    ...model.pages.filter((p) => p.url !== '/').map((p) => ({ loc: p.url, lastmod: p.modified, priority: '0.8' })),
    { loc: '/darker-side-of-pink/', priority: '0.9' },
    { loc: '/latest-news/', priority: '0.7' },
    ...model.posts.map((p) => ({ loc: p.url, lastmod: p.modified, priority: '0.6' })),
  ];
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), renderSitemapXml(sitemapUrls));
  fs.writeFileSync(path.join(OUT, 'feed.xml'), renderFeed(model.posts));
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), FAVICON);
  fs.writeFileSync(path.join(OUT, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${T.SITE_URL}/sitemap.xml\n`);

  // Static assets
  const assetCount = copyDir(path.join(ROOT, 'src', 'assets'), path.join(OUT, 'assets'));
  // Host config (_redirects, _headers) copied to the root of the deploy.
  copyDir(path.join(ROOT, 'src', 'static'), OUT);
  const media = copyReferencedMedia();

  console.log(`Built ${written.length} pages`);
  console.log(`  links     ${resolver.stats.resolved} repaired, ${resolver.stats.unlinked} unlinked, ${resolver.stats.kept} unchanged`);
  console.log(`  pages     ${model.pages.length}`);
  console.log(`  posts     ${model.posts.length}`);
  console.log(`  archives  ${totalPages} news + category pages`);
  console.log(`  media     ${media.copied} files (${(media.bytes / 1024 / 1024).toFixed(0)} MB) of ${media.referenced} referenced`);
  console.log(`  assets    ${assetCount} theme files`);
  console.log(`  in        ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { model, written };
}

if (require.main === module) run();
module.exports = { run };
