// Build the site's document model from content/ instead of _scrape/.
//
// This is the change that makes the CMS real. Until now the editor wrote files
// the build ignored, so a client could log in, edit, commit — and publish
// nothing. Same output shape as model.js, different source, so every renderer,
// enrich pass and layout pass downstream is untouched.
//
// The scrape stops being the source of truth and becomes what it should always
// have been: an importer, run once per client.
//
// Two things still come from the scrape and are honest about it: the media
// index and the asset files themselves. A client's media library has to live
// somewhere, and moving it is a separate job from closing this loop.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { renderBlocks } = require('./torender');
const { toText } = require('./clean');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT = path.join(ROOT, 'content');

function readDoc(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return null;
  try {
    return yaml.load(m[1]);
  } catch (err) {
    // A file the parser cannot read is a file the CMS cannot open either, so
    // it is a build failure rather than something to skip quietly.
    throw new Error(`${path.relative(ROOT, file)}: ${err.message}`);
  }
}

function readCategories() {
  const file = path.join(CONTENT, 'categories.yml');
  if (!fs.existsSync(file)) return new Map();
  const data = yaml.load(fs.readFileSync(file, 'utf8')) || {};
  return new Map(Object.entries(data));
}

// Everything the scrape derived that content/ does not store, derived the same
// way so the two sources agree: summaries, word counts, image dimensions.
function build(base) {
  const { summarise, measured, firstImage, media } = base;

  const catNames = readCategories();
  const catBySlug = new Map();
  const takeCategory = (slug) => {
    if (!catBySlug.has(slug)) {
      catBySlug.set(slug, { id: slug, slug, name: catNames.get(slug) || slug, count: 0 });
    }
    const c = catBySlug.get(slug);
    c.count += 1;
    return c;
  };

  const load = (kind) => {
    const dir = path.join(CONTENT, kind === 'page' ? 'pages' : 'posts');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((n) => n.endsWith('.md'))
      .map((name) => {
        const front = readDoc(path.join(dir, name));
        if (!front) return null;

        const html = renderBlocks(front.sections);
        const text = toText(html);
        // Same carve-out as the scrape-backed model: a page whose body is a
        // team grid has no prose of its own, and summarising it presents the
        // first person's medical history as an introduction to the page.
        const summaryText = html.includes('tmm_wrap')
          ? toText(html.replace(/<div[^>]*class="[^"]*tmm_wrap[\s\S]*$/i, ''))
          : text;

        const image = front.image || firstImage(html);
        const slug = name.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');

        // A page with no address used to be dropped here, silently. Somebody
        // could write a page in the editor, save it, and simply never find it
        // on the site — no error, no empty page, nothing to search for.
        //
        // An address is derivable: it is where the page sits, which is what
        // the parent, the date and the file name already say. Deriving it
        // means a new page always appears somewhere, and the client can move
        // it afterwards rather than having to know the convention before they
        // start. Posts follow the /year/month/ shape every other post uses, so
        // a new one does not land somewhere the rest of the site does not.
        const derived = () => {
          if (kind === 'post') {
            const d = new Date(front.date || Date.now());
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            return `/${d.getUTCFullYear()}/${month}/${slug}/`;
          }
          return front.parent ? `/${front.parent}/${slug}/` : `/${slug}/`;
        };
        const url = front.url || derived();

        return {
          kind,
          id: url,                     // the URL is the stable identity here
          slug,
          title: front.title || slug,
          url,
          parentSlug: front.parent || null,
          parent: 0,                   // resolved below, once every page is loaded
          order: front.order || 0,
          date: front.date || null,
          modified: front.modified || null,
          html,
          text,
          words: text ? text.split(/\s+/).length : 0,
          // An authored summary wins over a derived one, which is the same
          // precedence the scrape-backed model applies to WordPress excerpts.
          excerpt: front.excerpt || summarise(summaryText, 200),
          description: front.excerpt
            ? summarise(front.excerpt, 165)
            : summarise(summaryText, 165),
          image,
          imageAlt: front.imageAlt || '',
          // Always measured from the file: content/ stores which image, not how big
          // it is, and a stale number in frontmatter would outlive the crop.
          ...measured(null, image),
          categories: (front.categories || []).map(takeCategory),
        };
      })
      .filter(Boolean);
  };

  const pages = load('page');
  const posts = load('post').sort((a, b) => new Date(b.date) - new Date(a.date));

  // Parents are stored by slug, because a WordPress numeric id means nothing
  // once the content has left WordPress. Resolve them to documents now.
  const pageBySlug = new Map(pages.map((p) => [p.slug, p]));
  for (const p of pages) {
    if (p.parentSlug && pageBySlug.has(p.parentSlug)) p.parent = pageBySlug.get(p.parentSlug).id;
  }

  const pageById = new Map(pages.map((p) => [p.id, p]));
  for (const p of pages) {
    p.children = pages.filter((c) => c.parent === p.id)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    const trail = [];
    let cur = p;
    while (cur && cur.parent && pageById.has(cur.parent)) {
      cur = pageById.get(cur.parent);
      trail.unshift({ title: cur.title, url: cur.url });
    }
    p.breadcrumb = trail;
  }

  return {
    pages,
    posts,
    pageById,
    categories: [...catBySlug.values()].sort((a, b) => a.name.localeCompare(b.name)),
    media,
  };
}

module.exports = { build };
