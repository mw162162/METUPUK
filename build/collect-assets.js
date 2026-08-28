// Collect every metupuk-hosted media URL referenced anywhere in the content.
const fs = require('fs');
const path = require('path');

const S = path.join(__dirname, '..', '_scrape');
const pages = JSON.parse(fs.readFileSync(path.join(S, 'all_pages.json'), 'utf8'));
const posts = JSON.parse(fs.readFileSync(path.join(S, 'all_posts.json'), 'utf8'));
const featured = JSON.parse(fs.readFileSync(path.join(S, 'featured_media.json'), 'utf8'));

const urls = new Set();

const add = (u) => {
  if (!u) return;
  u = u.trim().replace(/&amp;/g, '&');
  if (!/^https?:\/\//i.test(u)) return;
  if (!/metupuk\.org\.uk/i.test(u)) return;
  if (!/\/wp-content\/(uploads|plugins|themes)\//i.test(u)) return;
  if (!/\.(jpe?g|png|gif|svg|webp|mp4|pdf|docx?|xlsx?|pptx?)(\?.*)?$/i.test(u)) return;
  urls.add(u.split('#')[0]);
};

const scanHtml = (html) => {
  if (!html) return;
  for (const m of html.matchAll(/(?:src|href|data-src|poster)\s*=\s*"([^"]+)"/gi)) add(m[1]);
  for (const m of html.matchAll(/srcset\s*=\s*"([^"]+)"/gi)) {
    m[1].split(',').forEach((part) => add(part.trim().split(/\s+/)[0]));
  }
};

for (const p of [...pages, ...posts]) {
  scanHtml(p.content && p.content.rendered);
  scanHtml(p.excerpt && p.excerpt.rendered);
}
featured.forEach((m) => add(m.url));

// The full media library, including every rendition WordPress generated, so
// featured images and card thumbnails all resolve locally.
const allMediaFile = path.join(S, 'all_media.json');
if (fs.existsSync(allMediaFile)) {
  for (const m of JSON.parse(fs.readFileSync(allMediaFile, 'utf8'))) {
    add(m.source_url);
    const sizes = (m.media_details && m.media_details.sizes) || {};
    for (const k of Object.keys(sizes)) add(sizes[k].source_url);
  }
}

// The standalone Darker Side of Pink microsite lives outside WordPress.
const dsop = fs.readFileSync(path.join(S, 'html', 'darker-side-of-pink_.html'), 'utf8');
for (const m of dsop.matchAll(/(?:src|href|poster)\s*=\s*"([^"]+)"/gi)) {
  let u = m[1];
  if (/^(https?:|\/\/|#|mailto:|tel:)/i.test(u)) continue;
  if (!/\.(jpe?g|png|gif|svg|webp|mp4)$/i.test(u)) continue;
  urls.add('https://metupuk.org.uk/darker-side-of-pink/' + u.replace(/^\.?\//, ''));
}

const out = [...urls].sort();
fs.writeFileSync(path.join(S, 'asset-urls.txt'), out.join('\n'));
console.log('asset urls:', out.length);
