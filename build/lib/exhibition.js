// The "Darker Side of Pink" exhibition lives outside WordPress as a bespoke
// microsite. Pull its content into the main site so nothing is stranded.
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

const SRC = path.join(__dirname, '..', '..', '_scrape', 'html', 'darker-side-of-pink_.html');

const tidy = (s) => (s || '').replace(/\s+/g, ' ').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').trim();

function extract() {
  const root = parse(fs.readFileSync(SRC, 'utf8'));

  // --- Portraits: thumbnail + name + the Vimeo film behind it -------------
  const videoByAnchor = new Map();
  for (const pop of root.querySelectorAll('.video-popup')) {
    const id = pop.getAttribute('id');
    if (!id) continue;
    const iframe = pop.querySelector('iframe');
    const src = iframe ? (iframe.getAttribute('data-src') || iframe.getAttribute('src')) : null;
    const nameEl = pop.querySelector('.frame > p');
    videoByAnchor.set('#' + id, {
      video: src || null,
      name: tidy(nameEl && nameEl.text),
    });
  }

  const portraits = [];
  const seen = new Set();
  for (const item of root.querySelectorAll('.section__video-grid__item')) {
    const a = item.querySelector('a[data-popup]');
    const img = item.querySelector('img');
    const span = item.querySelector('span');
    if (!a || !img) continue;
    const anchor = a.getAttribute('data-popup');
    if (seen.has(anchor)) continue;
    seen.add(anchor);
    const info = videoByAnchor.get(anchor) || {};
    const slug = (anchor || '').replace('#', '');
    // Prefer the high-resolution crop generated from the campaign cards; the
    // microsite's own thumbnails are only 220x120 and look soft as portraits.
    const cropped = path.join(__dirname, '..', '..', '_scrape', 'assets', 'dsop-portraits', `${slug}.jpg`);
    portraits.push({
      slug,
      name: tidy(span && span.text) || info.name || '',
      image: fs.existsSync(cropped)
        ? `/media/dsop-portraits/${slug}.jpg`
        : '/media/dsop/' + (img.getAttribute('src') || '').replace(/^\.?\//, ''),
      video: info.video || null,
    });
  }

  // --- Tour dates ---------------------------------------------------------
  const tour = [];
  for (const card of root.querySelectorAll('.section__tour-dates__item, .tour-dates__item, .section6 .item')) {
    const text = tidy(card.text);
    if (!text) continue;
    const status = tidy((card.querySelector('h3, .status, .title') || {}).text || '');
    const city = (text.match(/City\s*([A-Za-z' -]+?)\s*Venue/) || [])[1];
    const venue = (text.match(/Venue\s*(.+?)\s*Dates/) || [])[1];
    const dates = (text.match(/Dates\s*(.+)$/) || [])[1];
    if (city || venue) tour.push({ status: tidy(status), city: tidy(city), venue: tidy(venue), dates: tidy(dates) });
  }

  // Fall back to parsing the flat text if the markup does not match.
  if (!tour.length) {
    const sec = root.querySelector('.section6') || root.querySelector('.section5');
    const flat = tidy(sec ? sec.text : '');
    const re = /(Exhibition Finished|Current Location|Coming Soon)\s*City\s*(.+?)\s*Venue\s*(.+?)\s*Dates\s*(.+?)(?=Exhibition Finished|Current Location|Coming Soon|$)/g;
    let m;
    while ((m = re.exec(flat))) {
      tour.push({ status: tidy(m[1]), city: tidy(m[2]), venue: tidy(m[3]), dates: tidy(m[4]) });
    }
  }

  // --- Standing copy from the microsite ------------------------------------
  const sectionText = (sel) => {
    const el = root.querySelector(sel);
    return el ? tidy(el.text) : '';
  };

  return {
    portraits,
    tour,
    intro: sectionText('.section2') || sectionText('.section1'),
    raw: root,
  };
}

module.exports = { extract };
