// Pull the latest content from the live WordPress install.
//
//   node build/pull.js                 refresh content + any new media
//   node build/pull.js --content-only  skip media downloads (much faster)
//
// This is what makes "keep editing in WordPress, publish a static site" work:
// the editors carry on exactly as they do now, and publishing is
//   node build/pull.js && npm run build
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SITE = process.env.SITE_URL || 'https://metupuk.org.uk';
const OUT = path.join(__dirname, '..', '_scrape');
const CONTENT_ONLY = process.argv.includes('--content-only');

function get(url, redirects = 4) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http:') ? http : https;
    const req = mod.get(url, { headers: { 'User-Agent': 'metupuk-build/1.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${res.statusCode} ${url}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ body, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout ' + url)); });
  });
}

// Paginate a REST collection. Ordering by id keeps pages stable — without it
// WordPress can return the same record twice and silently drop another.
//
// The page count comes from the X-WP-TotalPages header, never from "this page
// came back short". WordPress regularly returns fewer rows than per_page
// (records are filtered after the query is paged), so treating a short page as
// the end silently truncates the pull — it stopped at 23 of 698 media items.
async function collection(name, extra = '') {
  const perPage = 30;
  const all = new Map();
  let totalPages = null;

  for (let page = 1; page <= (totalPages || 500); page++) {
    const url = `${SITE}/wp-json/wp/v2/${name}?per_page=${perPage}&page=${page}&orderby=id&order=asc${extra}`;
    let res;
    try { res = await get(url); }
    catch (e) {
      if (/^400 /.test(e.message)) break; // past the last page
      throw e;
    }
    if (totalPages === null) totalPages = parseInt(res.headers['x-wp-totalpages'], 10) || 1;
    let items;
    try { items = JSON.parse(res.body); } catch { break; }
    if (!Array.isArray(items)) break;
    items.forEach((it) => all.set(it.id, it));
    process.stdout.write(`\r  ${name}: ${all.size} (page ${page}/${totalPages})    `);
  }
  process.stdout.write('\n');
  return [...all.values()];
}

// Never let a bad pull quietly destroy a good local copy. A network hiccup or
// an API change should stop the build, not silently shrink the site.
function writeGuarded(file, items, label) {
  const dest = path.join(OUT, file);
  if (fs.existsSync(dest) && !process.argv.includes('--force')) {
    let previous = [];
    try { previous = JSON.parse(fs.readFileSync(dest, 'utf8')); } catch { /* treat as empty */ }
    if (Array.isArray(previous) && previous.length && items.length < previous.length * 0.8) {
      throw new Error(
        `Refusing to overwrite ${file}: the pull returned ${items.length} ${label}, ` +
        `but the existing copy has ${previous.length}. Check the site is up and the ` +
        `API is responding, then re-run with --force if the drop is genuinely correct.`
      );
    }
  }
  fs.writeFileSync(dest, JSON.stringify(items));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Pulling from ${SITE}`);

  const pages = await collection('pages');
  const posts = await collection('posts');
  const media = await collection('media', '&_fields=id,source_url,alt_text,title,caption,media_details');
  const cats = JSON.parse((await get(`${SITE}/wp-json/wp/v2/categories?per_page=100`)).body);

  writeGuarded('all_pages.json', pages, 'pages');
  writeGuarded('all_posts.json', posts, 'posts');
  writeGuarded('all_media.json', media, 'media items');
  writeGuarded('cats.json', cats, 'categories');

  // Pages built entirely in a page builder come back with an empty body, so
  // grab their rendered HTML too. Losing these silently is the classic
  // page-builder migration failure.
  const { toText } = require('./lib/clean');
  const emptyDocs = [...pages, ...posts].filter(
    (d) => toText((d.content && d.content.rendered) || '').length < 40
  );
  if (emptyDocs.length) {
    fs.mkdirSync(path.join(OUT, 'html'), { recursive: true });
    console.log(`  ${emptyDocs.length} page-builder pages need their rendered HTML`);
    for (const d of emptyDocs) {
      const slug = new URL(d.link).pathname.replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'home';
      try {
        const res = await get(d.link);
        fs.writeFileSync(path.join(OUT, 'html', `${slug}.html`), res.body);
      } catch (e) {
        console.warn(`  could not fetch ${d.link}: ${e.message}`);
      }
    }
  }

  console.log(`\nContent: ${pages.length} pages · ${posts.length} posts · ${media.length} media · ${cats.length} categories`);

  if (CONTENT_ONLY) {
    console.log('Skipping media download (--content-only).');
    console.log('Next: node build/build.js');
    return;
  }

  console.log('\nCollecting and downloading media…');
  require('child_process').execSync('node build/collect-assets.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  require('child_process').execSync('node build/download-assets.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

  console.log('\nNext: node build/make-renditions.js && node build/build.js && node build/verify.js');
})().catch((e) => { console.error(e); process.exit(1); });
