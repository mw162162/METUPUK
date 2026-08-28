// A number of links in the original content were already broken, or pointed at
// WordPress plumbing. Resolve what we can against the real URL set; unlink the
// rest rather than shipping a link that leads nowhere.
const { parse } = require('node-html-parser');

function createResolver(model, extraUrls = []) {
  const known = new Set(extraUrls);
  const bySlug = new Map();

  for (const doc of [...model.pages, ...model.posts]) {
    known.add(doc.url);
    if (!bySlug.has(doc.slug)) bySlug.set(doc.slug, doc.url);
  }
  for (const cat of model.categories) {
    if (cat.slug === 'uncategorized') continue;
    known.add(`/news/topic/${cat.slug}/`);
  }

  const stats = { resolved: 0, unlinked: 0, kept: 0 };

  function resolve(href) {
    if (!href) return { action: 'keep', href };
    const [pathPart, hash = ''] = href.split('#');
    const hashSuffix = hash ? '#' + hash : '';

    // WordPress admin and feed plumbing has no place on the public site.
    if (/^\/wp-admin\//.test(pathPart) || /^\/wp-login/.test(pathPart) || /\/feed\/?$/.test(pathPart)) {
      return { action: 'unlink' };
    }

    // The exhibition microsite is now a page in the main site; its per-woman
    // anchors map onto the film sections we generate.
    if (/^\/(darker-side-of-pink|media\/dsop)\/?$/.test(pathPart)) {
      return { action: 'rewrite', href: '/darker-side-of-pink/' + (hash ? '#film-' + hash : '') };
    }

    // Old category archives now live under /news/topic/.
    const catMatch = pathPart.match(/^\/category\/([^/]+)\/?$/);
    if (catMatch) {
      const target = `/news/topic/${catMatch[1]}/`;
      if (known.has(target)) return { action: 'rewrite', href: target + hashSuffix };
      return { action: 'rewrite', href: '/latest-news/' };
    }

    if (!pathPart || known.has(pathPart)) return { action: 'keep', href };

    // Try the final slug — catches links written against a page's old parent.
    const slug = pathPart.replace(/\/$/, '').split('/').pop();
    if (slug && bySlug.has(slug)) {
      return { action: 'rewrite', href: bySlug.get(slug) + hashSuffix };
    }

    // Author archives and tag archives were never rebuilt; send them somewhere useful.
    if (/^\/(author|tag)\//.test(pathPart)) return { action: 'rewrite', href: '/latest-news/' };

    return { action: 'unlink' };
  }

  // Apply to a block of HTML: rewrite what resolves, unlink what does not.
  function fix(html) {
    if (!html || !html.includes('<a')) return html;
    const root = parse(html);
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!href || /^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) { stats.kept++; continue; }
      if (/^\/media\//.test(href) && !/^\/media\/dsop\/?(#|$)/.test(href)) { stats.kept++; continue; }

      const r = resolve(href);
      if (r.action === 'keep') { stats.kept++; continue; }
      if (r.action === 'rewrite') { a.setAttribute('href', r.href); stats.resolved++; continue; }

      // Unlink: keep the words and any image, drop the dead anchor.
      const parent = a.parentNode;
      if (!parent) continue;
      const idx = parent.childNodes.indexOf(a);
      if (idx < 0) continue;
      parent.childNodes.splice(idx, 1, ...a.childNodes);
      a.childNodes.forEach((c) => { c.parentNode = parent; });
      stats.unlinked++;
    }
    return root.toString();
  }

  return { fix, resolve, stats, known };
}

module.exports = { createResolver };
