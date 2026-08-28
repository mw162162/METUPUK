// The audit rules. Each check receives the collected site and pushes findings.
// A finding is { id, severity, page, detail, fix }.
//   error   — actively broken or costing traffic today
//   warning — will hurt reach or usability, fix soon
//   notice  — worth improving, not urgent
const path = require('path');
const sharpness = require('./sharpness');

const SEV = { error: 'error', warning: 'warning', notice: 'notice' };

const text = (el) => (el ? el.text.replace(/\s+/g, ' ').trim() : '');
const attr = (el, a) => (el ? el.getAttribute(a) : null);
const isExternal = (href) => /^https?:\/\//i.test(href);
const isSpecial = (href) => /^(mailto:|tel:|javascript:|data:|#)/i.test(href);

/* --- SEO ------------------------------------------------------------------ */

function seo(site, add) {
  const titles = new Map();
  const descs = new Map();

  for (const page of site.pages) {
    const { dom, url } = page;
    const head = dom.querySelector('head');
    const title = text(dom.querySelector('title'));
    const desc = attr(dom.querySelector('meta[name="description"]'), 'content');
    const canonical = attr(dom.querySelector('link[rel="canonical"]'), 'href');
    const robots = attr(dom.querySelector('meta[name="robots"]'), 'content') || '';
    const noindex = /noindex/i.test(robots);

    if (!head) add({ id: 'html-no-head', severity: SEV.error, page: url, detail: 'Page has no <head>.', fix: 'Every page needs a head with title and meta description.' });

    if (!title) {
      add({ id: 'title-missing', severity: SEV.error, page: url, detail: 'No <title>.', fix: 'Add a unique, descriptive title of roughly 50–60 characters.' });
    } else {
      if (title.length < 15 && !noindex) add({ id: 'title-short', severity: SEV.warning, page: url, detail: `Title is only ${title.length} characters: "${title}"`, fix: 'Aim for 50–60 characters so the result is informative in search.' });
      if (title.length > 65 && !noindex) add({ id: 'title-long', severity: SEV.notice, page: url, detail: `Title is ${title.length} characters; Google truncates around 60.`, fix: 'Front-load the distinctive words.' });
      if (!noindex) {
        if (!titles.has(title)) titles.set(title, []);
        titles.get(title).push(url);
      }
    }

    if (!desc) {
      if (!noindex) add({ id: 'description-missing', severity: SEV.warning, page: url, detail: 'No meta description.', fix: 'Write a 120–160 character summary; it is the sales pitch in the search result.' });
    } else {
      if (desc.length < 70) add({ id: 'description-short', severity: SEV.notice, page: url, detail: `Meta description is only ${desc.length} characters.`, fix: 'Use 120–160 characters to fill the search snippet.' });
      if (desc.length > 170) add({ id: 'description-long', severity: SEV.notice, page: url, detail: `Meta description is ${desc.length} characters and will be cut off.`, fix: 'Trim to about 155 characters.' });
      if (!noindex) {
        if (!descs.has(desc)) descs.set(desc, []);
        descs.get(desc).push(url);
      }
    }

    if (!canonical) add({ id: 'canonical-missing', severity: SEV.notice, page: url, detail: 'No canonical link.', fix: 'Add <link rel="canonical"> to consolidate duplicate URLs.' });

    const h1s = dom.querySelectorAll('h1');
    // Same exemption the title and description checks make: a noindex page is
    // not part of the public site. Application shells such as a CMS at /admin
    // legitimately have no heading, and flagging them puts a permanent error
    // in the report that can never be cleared.
    if (h1s.length === 0 && !noindex) add({ id: 'h1-missing', severity: SEV.error, page: url, detail: 'No <h1>.', fix: 'Every page needs exactly one h1 stating what the page is about.' });
    if (h1s.length > 1) add({ id: 'h1-multiple', severity: SEV.warning, page: url, detail: `${h1s.length} <h1> elements.`, fix: 'Use one h1; demote the rest to h2.' });

    // Search and social presentation checks do not apply to a page that is
    // deliberately kept out of the index, such as a CMS at /admin.
    if (!dom.querySelector('meta[property="og:title"]') && !noindex) {
      add({ id: 'og-missing', severity: SEV.warning, page: url, detail: 'No Open Graph tags.', fix: 'Add og:title, og:description and og:image so shared links show a rich card. This is one of the cheapest wins for social reach.' });
    } else if (!dom.querySelector('meta[property="og:image"]')) {
      add({ id: 'og-image-missing', severity: SEV.warning, page: url, detail: 'Open Graph tags present but no og:image.', fix: 'A shared link without an image gets far fewer clicks.' });
    }

    if (!dom.querySelector('script[type="application/ld+json"]')) {
      add({ id: 'schema-missing', severity: SEV.notice, page: url, detail: 'No structured data (JSON-LD).', fix: 'Add schema.org markup so search engines and AI assistants can understand the page.' });
    } else {
      for (const s of dom.querySelectorAll('script[type="application/ld+json"]')) {
        try { JSON.parse(s.text); }
        catch { add({ id: 'schema-invalid', severity: SEV.error, page: url, detail: 'JSON-LD block is not valid JSON.', fix: 'Invalid structured data is ignored entirely.' }); }
      }
    }

    // Thin content ranks badly and rarely earns links.
    const main = dom.querySelector('main') || dom.querySelector('body');
    const words = main ? main.text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length : 0;
    page.words = words;
    if (words < 120 && !noindex) {
      add({ id: 'content-thin', severity: SEV.notice, page: url, detail: `Only ${words} words of content.`, fix: 'Thin pages rarely rank. Expand, merge into a richer page, or noindex it.' });
    }

    // URL hygiene
    if (/[A-Z]/.test(url)) add({ id: 'url-uppercase', severity: SEV.notice, page: url, detail: 'URL contains uppercase letters.', fix: 'Lowercase URLs avoid duplicate-content confusion.' });
    if (url.length > 100) add({ id: 'url-long', severity: SEV.notice, page: url, detail: `URL is ${url.length} characters.`, fix: 'Shorter URLs are easier to share and read in results.' });
    if (/\/\d{4}\/\d{2}\//.test(url)) add({ id: 'url-dated', severity: SEV.notice, page: url, detail: 'URL contains a date path.', fix: 'Dated URLs make evergreen content look stale. Consider a flat /news/slug/ structure with redirects if you ever restructure.' });
  }

  for (const [title, urls] of titles) {
    if (urls.length > 1) {
      add({ id: 'title-duplicate', severity: SEV.warning, page: urls[0], detail: `${urls.length} pages share the title "${title}": ${urls.slice(0, 4).join(', ')}${urls.length > 4 ? '…' : ''}`, fix: 'Duplicate titles make pages compete with each other in search.' });
    }
  }
  for (const [desc, urls] of descs) {
    if (urls.length > 2) {
      add({ id: 'description-duplicate', severity: SEV.notice, page: urls[0], detail: `${urls.length} pages share the same meta description.`, fix: 'Write a distinct description per page.' });
    }
  }
}

/* --- Links and documents -------------------------------------------------- */

function links(site, add) {
  const inbound = new Map(site.pages.map((p) => [p.url, 0]));
  const externalTargets = new Map();
  const origin = site.baseUrl || site.root || '';
  let absoluteInternal = 0;

  // A link written as https://thissite/page is internal, not external. Reduce
  // every same-origin href to a path so both forms are treated alike.
  const toInternalPath = (href) => {
    if (!isExternal(href)) return href;
    if (!origin || !/^https?:\/\//i.test(origin)) return null;
    try {
      const u = new URL(href);
      const o = new URL(origin);
      // Treat www and bare host as the same site.
      const strip = (h) => h.replace(/^www\./i, '');
      if (strip(u.host) !== strip(o.host)) return null;
      return u.pathname + (u.hash || '');
    } catch { return null; }
  };

  for (const page of site.pages) {
    const ids = new Set(page.dom.querySelectorAll('[id]').map((el) => el.getAttribute('id')));

    for (const a of page.dom.querySelectorAll('a[href]')) {
      const href = (a.getAttribute('href') || '').trim();
      const label = text(a) || attr(a, 'aria-label') || (a.querySelector('img') ? attr(a.querySelector('img'), 'alt') : '');

      if (!href) {
        add({ id: 'link-empty', severity: SEV.warning, page: page.url, detail: 'Link with an empty href.', fix: 'Remove it or point it somewhere.' });
        continue;
      }
      if (href === '#' || href === '#top') {
        add({ id: 'link-placeholder', severity: SEV.warning, page: page.url, detail: `Placeholder link (href="${href}") that goes nowhere useful.`, fix: 'Use a <button> for JavaScript controls, or point the link at a real destination.' });
      }
      if (!label) {
        add({ id: 'link-no-text', severity: SEV.error, page: page.url, detail: `Link to ${href} has no text or label.`, fix: 'Screen readers announce this as an unlabelled link. Add text or aria-label.' });
      }
      if (/^(click here|here|read more|more|link)$/i.test(label.trim())) {
        add({ id: 'link-generic-text', severity: SEV.notice, page: page.url, detail: `Link text "${label.trim()}" is not descriptive.`, fix: 'Descriptive link text helps both users and search engines understand the target.' });
      }

      if (isSpecial(href)) {
        // In-page anchors must actually exist.
        if (href.startsWith('#') && href.length > 1) {
          const id = decodeURIComponent(href.slice(1));
          if (!ids.has(id)) add({ id: 'anchor-missing', severity: SEV.warning, page: page.url, detail: `Anchor ${href} does not exist on the page.`, fix: 'Fix the id or the link.' });
        }
        continue;
      }

      const asInternal = toInternalPath(href);
      if (isExternal(href) && !asInternal) {
        const host = (() => { try { return new URL(href).host; } catch { return null; } })();
        if (host) {
          if (!externalTargets.has(href)) externalTargets.set(href, []);
          externalTargets.get(href).push(page.url);
        }
        if (attr(a, 'target') === '_blank' && !/noopener/.test(attr(a, 'rel') || '')) {
          add({ id: 'link-target-unsafe', severity: SEV.notice, page: page.url, detail: `External link opens in a new tab without rel="noopener": ${href}`, fix: 'Add rel="noopener" to prevent the target page accessing window.opener.' });
        }
        continue;
      }
      // An internal link written as an absolute URL still counts as internal;
      // it is a portability smell, reported once for the whole site below.
      if (asInternal && isExternal(href)) absoluteInternal++;

      // Internal link (relative, or absolute but same-origin)
      const [pathPart, hash] = (asInternal || href).split('#');
      if (site.resolve && pathPart && !site.resolve(pathPart)) {
        const isDoc = /\.(pdf|docx?|xlsx?|pptx?|csv|zip)$/i.test(pathPart);
        add({
          id: isDoc ? 'document-missing' : 'link-broken',
          severity: SEV.error,
          page: page.url,
          detail: `${isDoc ? 'Document' : 'Link'} target does not exist: ${pathPart}`,
          fix: isDoc ? 'The file is linked but not present. Upload it or remove the link.' : 'Fix the URL or restore the page.',
        });
      }
      if (pathPart && inbound.has(pathPart)) inbound.set(pathPart, inbound.get(pathPart) + 1);
      if (!pathPart && hash) { /* same-page anchor, handled above */ }
    }

    // Media and documents referenced by src
    for (const el of page.dom.querySelectorAll('img[src], source[src], video[src], audio[src], iframe[src], script[src], link[href]')) {
      const raw = el.rawTagName === 'link' ? el.getAttribute('href') : el.getAttribute('src');
      if (!raw || isSpecial(raw)) continue;
      if (isExternal(raw)) {
        // Remote assets are worth network-checking alongside outbound links.
        const asLocal = toInternalPath(raw);
        if (asLocal && site.resolve && !site.resolve(asLocal)) {
          add({ id: 'asset-missing', severity: SEV.error, page: page.url, detail: `Missing file: ${raw}`, fix: 'The page references a file that is not deployed.' });
        } else if (!asLocal) {
          if (!externalTargets.has(raw)) externalTargets.set(raw, []);
          externalTargets.get(raw).push(page.url);
        }
        continue;
      }
      if (site.resolve && !site.resolve(raw)) {
        add({ id: 'asset-missing', severity: SEV.error, page: page.url, detail: `Missing file: ${raw}`, fix: 'The page references a file that is not deployed.' });
      }
    }
  }

  if (absoluteInternal > 20) {
    add({ id: 'link-absolute-internal', severity: SEV.notice, page: '(site)', detail: `${absoluteInternal.toLocaleString()} internal links are written as absolute URLs.`, fix: 'Root-relative paths keep working on staging, on a new domain, and after an HTTPS switch.' });
  }

  // Orphan pages get no internal links, so search engines discover them late
  // and users never find them.
  const noindexed = new Set(
    site.pages
      .filter((p) => /noindex/i.test(attr(p.dom.querySelector('meta[name="robots"]'), 'content') || ''))
      .map((p) => p.url)
  );
  for (const [url, count] of inbound) {
    if (url === '/' || count > 0) continue;
    if (/(^|\/)(404|offline|thanks?|thank-you)(\.html)?\/?$/i.test(url)) continue;
    // A page kept out of the index is meant to be reached directly, not linked
    // to. A CMS at /admin is the usual case.
    if (noindexed.has(url)) continue;
    add({ id: 'page-orphan', severity: SEV.warning, page: url, detail: 'No internal links point to this page.', fix: 'Link to it from a relevant page or a section index, or it will not be found.' });
  }

  return { externalTargets };
}

/* --- Accessibility -------------------------------------------------------- */

function accessibility(site, add) {
  for (const page of site.pages) {
    const { dom, url } = page;

    const html = dom.querySelector('html');
    if (!html || !attr(html, 'lang')) {
      add({ id: 'lang-missing', severity: SEV.error, page: url, detail: 'No lang attribute on <html>.', fix: 'Screen readers need it to choose the right pronunciation.' });
    }

    let missingAlt = 0;
    let emptyAlt = 0;
    let noDims = 0;
    let noLazy = 0;
    const imgs = dom.querySelectorAll('img');
    for (const img of imgs) {
      const alt = img.getAttribute('alt');
      if (alt === null || alt === undefined) missingAlt++;
      else if (!alt.trim()) emptyAlt++;
      if (!img.getAttribute('width') || !img.getAttribute('height')) noDims++;
      if (!img.getAttribute('loading') && !img.getAttribute('fetchpriority')) noLazy++;
    }
    if (missingAlt) add({ id: 'img-alt-absent', severity: SEV.error, page: url, detail: `${missingAlt} image(s) with no alt attribute at all.`, fix: 'Every img needs alt. Use alt="" only for decorative images.' });
    if (emptyAlt) add({ id: 'img-alt-empty', severity: SEV.notice, page: url, detail: `${emptyAlt} image(s) marked decorative with alt="".`, fix: 'Correct for decoration; if any of these carry meaning, describe them.', count: emptyAlt });
    if (noDims) add({ id: 'img-no-dimensions', severity: SEV.warning, page: url, detail: `${noDims} image(s) without width/height.`, fix: 'Missing dimensions cause layout shift, which hurts Core Web Vitals and rankings.' });
    if (noLazy && imgs.length > 5) add({ id: 'img-no-loading', severity: SEV.notice, page: url, detail: `${noLazy} image(s) without a loading attribute.`, fix: 'Add loading="lazy" below the fold to speed up first paint.' });

    // Heading order
    const heads = dom.querySelectorAll('h1,h2,h3,h4,h5,h6').map((h) => +h.rawTagName[1]);
    for (let i = 1; i < heads.length; i++) {
      if (heads[i] - heads[i - 1] > 1) {
        add({ id: 'heading-skip', severity: SEV.warning, page: url, detail: `Heading level jumps from h${heads[i - 1]} to h${heads[i]}.`, fix: 'Screen reader users navigate by heading level; skipping levels breaks the outline.' });
        break;
      }
    }

    // Form controls need labels
    for (const input of dom.querySelectorAll('input, select, textarea')) {
      const type = (input.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) continue;
      const id = input.getAttribute('id');
      const labelled = (id && dom.querySelector(`label[for="${id}"]`)) ||
        input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.getAttribute('title');
      if (!labelled) {
        add({ id: 'input-unlabelled', severity: SEV.error, page: url, detail: `Form control (${type || input.rawTagName}) has no label.`, fix: 'Add a <label for> or aria-label.' });
      }
    }

    // Landmarks
    if (!dom.querySelector('main')) add({ id: 'landmark-main-missing', severity: SEV.warning, page: url, detail: 'No <main> landmark.', fix: 'Lets keyboard and screen-reader users skip straight to the content.' });
    const navs = dom.querySelectorAll('nav');
    const unlabelled = navs.filter((n) => !attr(n, 'aria-label') && !attr(n, 'aria-labelledby'));
    if (navs.length > 1 && unlabelled.length) {
      add({ id: 'landmark-nav-unlabelled', severity: SEV.notice, page: url, detail: `${unlabelled.length} of ${navs.length} <nav> elements have no accessible name.`, fix: 'With several navs, each needs aria-label to be distinguishable.' });
    }

    // A skip link is the single highest-value keyboard affordance.
    const firstLink = dom.querySelector('body a[href^="#"]');
    if (!firstLink || !/skip/i.test(text(firstLink))) {
      add({ id: 'skip-link-missing', severity: SEV.notice, page: url, detail: 'No "skip to content" link.', fix: 'Keyboard users otherwise tab through the whole menu on every page.' });
    }

    // Viewport must allow zoom.
    const vp = attr(dom.querySelector('meta[name="viewport"]'), 'content') || '';
    if (!vp) add({ id: 'viewport-missing', severity: SEV.error, page: url, detail: 'No viewport meta tag.', fix: 'The page will not be mobile-friendly, which Google ranks on.' });
    else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(vp)) {
      add({ id: 'viewport-no-zoom', severity: SEV.error, page: url, detail: 'Viewport blocks zooming.', fix: 'Users with low vision must be able to pinch-zoom. Remove user-scalable=no and maximum-scale.' });
    }
  }
}

/* --- Performance ---------------------------------------------------------- */

function performance(site, add, opts = {}) {
  const heavyImageKb = opts.heavyImageKb || 400;

  for (const page of site.pages) {
    if (page.bytes > 250 * 1024) {
      add({ id: 'page-heavy', severity: SEV.warning, page: page.url, detail: `HTML is ${(page.bytes / 1024).toFixed(0)} KB before assets.`, fix: 'Large HTML delays first paint. Trim inline styles/scripts or split the page.' });
    }
    const blocking = page.dom.querySelectorAll('head script[src]')
      .filter((s) => !s.getAttribute('defer') && !s.getAttribute('async') && s.getAttribute('type') !== 'module');
    if (blocking.length) {
      add({ id: 'script-blocking', severity: SEV.warning, page: page.url, detail: `${blocking.length} render-blocking script(s) in <head>.`, fix: 'Add defer or move to the end of body.' });
    }
    const inlineStyle = page.dom.querySelectorAll('[style]').length;
    if (inlineStyle > 40) {
      add({ id: 'inline-styles', severity: SEV.notice, page: page.url, detail: `${inlineStyle} inline style attributes.`, fix: 'Inline styles bloat HTML and cannot be cached. Move to a stylesheet.' });
    }
  }

  if (site.assets && site.assets.size) {
    const heavy = [...site.assets.entries()]
      .filter(([f, size]) => /\.(jpe?g|png|gif|webp|avif)$/i.test(f) && size > heavyImageKb * 1024)
      .sort((a, b) => b[1] - a[1]);
    for (const [file, size] of heavy.slice(0, 25)) {
      add({ id: 'image-heavy', severity: SEV.warning, page: file, detail: `Image is ${(size / 1024 / 1024).toFixed(2)} MB.`, fix: `Resize and re-compress; anything over ${heavyImageKb} KB on a web page is usually avoidable. Convert to WebP/AVIF for roughly 30–50% smaller files.` });
    }
    if (heavy.length > 25) {
      add({ id: 'image-heavy-more', severity: SEV.notice, page: '(site)', detail: `${heavy.length - 25} further images over ${heavyImageKb} KB not listed.`, fix: 'Run an image optimisation pass across the whole media library.' });
    }

    const legacy = [...site.assets.keys()].filter((f) => /\.(jpe?g|png)$/i.test(f)).length;
    const modern = [...site.assets.keys()].filter((f) => /\.(webp|avif)$/i.test(f)).length;
    if (legacy > 20 && modern / Math.max(1, legacy) < 0.1) {
      add({ id: 'image-format-legacy', severity: SEV.notice, page: '(site)', detail: `${legacy} JPEG/PNG images and only ${modern} in a modern format.`, fix: 'Serving WebP or AVIF typically cuts image bytes by a third or more.' });
    }
  }
}

/* --- Site-wide infrastructure --------------------------------------------- */

function infrastructure(site, add) {
  if (site.resolve) {
    if (!site.resolve('/robots.txt')) {
      add({ id: 'robots-missing', severity: SEV.warning, page: '(site)', detail: 'No robots.txt.', fix: 'Add one, and point it at your sitemap so crawlers find every page.' });
    }
    if (!site.resolve('/sitemap.xml')) {
      add({ id: 'sitemap-missing', severity: SEV.error, page: '(site)', detail: 'No sitemap.xml.', fix: 'A sitemap is how search engines discover pages that are not heavily linked. Submit it in Google Search Console.' });
    }
    if (!site.resolve('/404.html') && !site.resolve('/404/')) {
      add({ id: '404-missing', severity: SEV.notice, page: '(site)', detail: 'No custom 404 page.', fix: 'A helpful 404 with search and key links recovers visitors who would otherwise bounce.' });
    }
    const hasFeed = site.resolve('/feed.xml') || site.resolve('/rss.xml') || site.resolve('/atom.xml');
    if (!hasFeed) {
      add({ id: 'feed-missing', severity: SEV.notice, page: '(site)', detail: 'No RSS/Atom feed.', fix: 'A feed lets supporters and aggregators follow new posts automatically.' });
    }
  }

  // Analytics: you cannot grow what you do not measure.
  const anyAnalytics = site.pages.some((p) =>
    /gtag\(|googletagmanager|plausible|umami|fathom|matomo|_paq|counter\.dev|simpleanalytics/i.test(p.html));
  if (!anyAnalytics) {
    add({ id: 'analytics-missing', severity: SEV.warning, page: '(site)', detail: 'No analytics detected on any page.', fix: 'Without measurement you cannot tell which content earns reach. A privacy-friendly option (Plausible, Fathom, Umami) avoids a cookie banner entirely.' });
  }
}

function run(site, opts = {}) {
  const findings = [];
  const add = (f) => findings.push(f);
  seo(site, add);
  const linkData = links(site, add);
  accessibility(site, add);
  performance(site, add, opts);
  sharpness.check(site, add, { root: site.root });
  infrastructure(site, add);
  return { findings, linkData };
}

module.exports = { run, SEV };
