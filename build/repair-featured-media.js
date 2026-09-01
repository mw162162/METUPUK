// Five posts' featured images are refused by the live REST API (rest_forbidden),
// which is why the scrape never captured their media records. The files came
// down with the asset crawl regardless, and the migration audit identified them
// by reading the live HTML. Add the records here, in the existing fallback file
// the media index already reads, rather than special-casing anything in code.
const fs = require('fs'), path = require('path'), sharp = require('sharp');

const ADD = [
  { id: 140, file: '2020/11/beth-roberts-metup-uk.png',        alt: 'Photo of Beth Roberts', title: 'Beth Roberts' },
  { id: 287, file: '2019/10/kit-dzeryn.jpg',                   alt: 'Photo of Kit Dzeryn',   title: 'Kit Dzeryn' },
  { id: 548, file: '2019/10/Emma-Fisher-Photo-1536x1536.jpeg', alt: 'Photo of Emma Fisher',  title: 'Emma Fisher' },
  { id: 765, file: '2019/10/Miranda-1-scaled.jpg',             alt: 'Photo of Miranda Ashitey', title: 'Miranda Ashitey' },
];

(async () => {
  const p = '_scrape/featured_media.json';
  const list = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const a of ADD) {
    if (list.find(x => x.id === a.id)) { console.log(a.id, 'already present'); continue; }
    const disk = path.join('_scrape/assets', a.file);
    if (!fs.existsSync(disk)) { console.log(a.id, 'MISSING ON DISK', a.file); continue; }
    const m = await sharp(disk).metadata();
    list.push({ id: a.id, url: 'https://metupuk.org.uk/wp-content/uploads/' + a.file, alt: a.alt, title: a.title, w: m.width, h: m.height });
    console.log('added', a.id, a.file, m.width + 'x' + m.height);
  }
  list.sort((x, y) => x.id - y.id);
  fs.writeFileSync(p, JSON.stringify(list, null, 2));
  console.log('featured_media.json now holds', list.length, 'records');
})();
