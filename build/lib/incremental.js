// Re-render one page without rebuilding the site.
//
// A full build is thirteen seconds, and three of those are parsing all three
// hundred content files before a single page is written. None of that work
// changes when someone edits one paragraph. This keeps the model, the
// exhibition data and the link resolver in memory, so a save re-reads one file
// and re-renders one page.
//
// It is deliberately not a general incremental build. It handles the case that
// matters while editing — one page changed, show me that page — and hands
// anything else back to the full build. Indexes, pagination, the homepage and
// the feed all list content that just changed, so the watcher follows a fast
// single-page render with a full rebuild in the background. The editor gets its
// answer immediately; the rest of the site catches up a few seconds later.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const B = require('../build');
const { buildFromContent } = require('./model');
const ex = require('./exhibition');
const { createResolver } = require('./links');
const { enrich } = require('./enrich');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT = path.join(ROOT, 'content');

class PageBuilder {
  constructor() {
    this.ready = false;
  }

  // The expensive half, run once.
  prime() {
    const t0 = Date.now();
    this.model = buildFromContent();
    this.exhibition = ex.extract();
    this.resolver = createResolver(this.model, ['/', '/darker-side-of-pink/', '/sitemap/', '/latest-news/']);
    for (const doc of [...this.model.pages, ...this.model.posts]) {
      doc.html = this.resolver.fix(doc.html);
    }
    B.inlineExhibitionFilms(this.model, this.exhibition);
    for (const doc of [...this.model.pages, ...this.model.posts]) {
      doc.html = enrich(doc.html);
    }
    this.byFile = new Map();
    for (const doc of [...this.model.pages, ...this.model.posts]) {
      this.byFile.set(this.fileFor(doc), doc);
    }
    this.ready = true;
    return Date.now() - t0;
  }

  fileFor(doc) {
    const dir = doc.kind === 'page' ? 'pages' : 'posts';
    const name = doc.kind === 'page'
      ? `${doc.slug}.md`
      : `${(doc.date || '').slice(0, 10)}-${doc.slug}.md`;
    return path.join(CONTENT, dir, name).split(path.sep).join('/');
  }

  // Re-read one content file, put it back through the same pipeline the full
  // build uses, and write its page. Returns the URL, or null if this file is
  // not one the fast path can handle.
  rebuild(file) {
    if (!this.ready) return null;
    const key = path.resolve(file).split(path.sep).join('/');
    const doc = this.byFile.get(key);
    if (!doc) return null;

    let front;
    try {
      const raw = fs.readFileSync(key, 'utf8');
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
      if (!m) return null;
      front = yaml.load(m[1]);
    } catch {
      // A half-written file mid-save. The caller falls back to a full build,
      // which will either succeed later or report the error properly.
      return null;
    }

    // A URL change moves the page, which invalidates links, the sitemap and the
    // nav. That is a full build, not a re-render.
    if (front.url !== doc.url) return null;

    const { renderBlocks } = require('./torender');
    const { toText } = require('./clean');

    const html = enrich(this.resolver.fix(renderBlocks(front.sections)));
    const text = toText(html);

    Object.assign(doc, {
      title: front.title || doc.title,
      modified: front.modified || doc.modified,
      image: front.image || doc.image,
      imageAlt: front.imageAlt || '',
      html,
      text,
      words: text ? text.split(/\s+/).length : 0,
    });

    if (doc.kind === 'page') {
      B.write(doc.url, B.renderPage(doc, this.model));
    } else {
      const i = this.model.posts.indexOf(doc);
      B.write(doc.url, B.renderPost(doc, this.model.posts[i + 1] || null, this.model.posts[i - 1] || null));
    }
    // Same token the full build writes, so the preview refreshes on a fast
    // render exactly as it does on a full one.
    try {
      fs.writeFileSync(path.join(B.OUT, 'build-id.txt'), String(Date.now()));
    } catch { /* the preview simply will not auto-refresh */ }
    return doc.url;
  }
}

module.exports = { PageBuilder };
