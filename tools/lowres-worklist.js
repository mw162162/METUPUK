// Which photographs need replacing, and at what size.
//
//   node tools/lowres-worklist.js [--out lowres-worklist.md]
//
// The audit reports every picture that is not retina-crisp, which on this site
// was 132 of them. That is not a list anybody acts on, and most of it is not a
// defect: an image between 1x and 1.5x is correct on an ordinary screen.
//
// This is the shorter list — the ones the layout is actually enlarging, where
// the file on disk is already the largest that exists. Each row says the page,
// the picture, how wide it is and how wide it needs to be, so somebody can go
// and find a better original. Nothing here is fixable in code; that is the
// point of separating it out.
//
// Run it after a build. It reads the audit rather than reimplementing it, so
// the two can never disagree.
const fs = require('fs');
const path = require('path');
const { fromDirectory } = require('./webaudit/lib/collect');
const { run } = require('./webaudit/lib/checks');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = outArg > -1 ? args[outArg + 1] : 'lowres-worklist.md';

// "/media/x.jpg is 219px wide but is displayed at about 280px in a profile
// tile (0.78x)." — pull the numbers back out rather than recomputing them.
const DETAIL = /^(\S+) is (\d+)px wide but is displayed at about (\d+)px in an? (.+?) \(([\d.]+)x\)/;

// Fine text suffers most from being enlarged; a face suffers least. The ratio
// cannot tell them apart, so say so rather than implying every row is equal.
const URGENCY = (r) => (r < 0.8 ? 'Noticeable' : 'Slight');

async function main() {
  const site = await fromDirectory(path.join(ROOT, 'dist'));
  const findings = run(site).findings.filter((f) => f.id === 'image-source-lowres');

  const rows = [];
  for (const f of findings) {
    const m = DETAIL.exec(f.detail);
    if (!m) continue;
    rows.push({
      page: f.page, src: m[1], have: +m[2], want: +m[3], slot: m[4], ratio: +m[5],
    });
  }
  rows.sort((a, b) => a.ratio - b.ratio);

  const lines = [];
  lines.push('# Pictures that need a better original');
  lines.push('');
  lines.push(`${rows.length} picture${rows.length === 1 ? '' : 's'} on this site are being enlarged by the layout. The file`);
  lines.push('on disk is already the biggest one there is, so no amount of code makes them');
  lines.push('sharper — each one needs a larger photograph in its place.');
  lines.push('');
  lines.push('**Enough** is the width the picture is drawn at, which stops the enlarging.');
  lines.push('**Ideal** is twice that, which is what a modern phone or laptop screen actually');
  lines.push('draws. For a full-width backdrop, enough is genuinely enough — doubling a');
  lines.push('1600px background buys a sharpness nobody looks at and costs every visitor the');
  lines.push('download.');
  lines.push('');
  lines.push('Replace a picture by uploading the new one in the editor on the page listed.');
  lines.push('The site picks up the larger file on the next publish with no other change.');
  lines.push('');
  lines.push('| | Page | Picture | Now | Enough | Ideal |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(`| ${URGENCY(r.ratio)} | \`${r.page}\` | \`${r.src}\` | ${r.have}px | ${r.want}px | ${r.want * 2}px |`);
  }
  lines.push('');
  lines.push('A graphic carrying small text — an infographic, a scan of a document — suffers');
  lines.push('most from being enlarged, because the letters go soft before anything else');
  lines.push('does. A portrait at the same ratio is barely affected. Work down the list with');
  lines.push('that in mind rather than strictly by number.');
  lines.push('');

  fs.writeFileSync(path.join(ROOT, OUT), lines.join('\n'));
  console.log(`${rows.length} pictures need a better original`);
  console.log(`written to ${OUT}`);
}

main();
