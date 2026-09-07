// The invariants that keep coming back.
//
//   node build/check-layout.js [dist]
//
// Every rule here exists because it broke, was fixed, and broke again — or
// because a fix for one screen quietly undid the other. They are cascade and
// pipeline faults: the kind a build cannot notice, that look correct in the
// file, and that only appear on somebody's phone.
//
// It reads the stylesheet as shipped rather than the source, because that is
// what a browser gets, and the built pages for what they actually link. It
// cannot measure layout — that needs a real engine — so it asserts the
// conditions those layouts depend on instead.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', process.argv[2] || 'dist');

// Comments first. Several of these patterns appear in prose explaining why a
// rule must not exist, and a checker that fails on its own documentation is
// worse than no checker at all.
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Flatten to { media, body } so a rule can be asked which query it sits under.
function blocks(css) {
  const out = [];
  const re = /@media([^{]+)\{/g;
  let m, last = 0, plain = '';
  while ((m = re.exec(css))) {
    plain += css.slice(last, m.index);
    let depth = 1, i = re.lastIndex;
    for (; i < css.length && depth; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push({ media: m[1].trim(), body: css.slice(re.lastIndex, i - 1) });
    last = i;
    re.lastIndex = i;
  }
  plain += css.slice(last);
  out.push({ media: null, body: plain });
  return out;
}

const walk = (dir, fn) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, fn);
    else fn(full);
  }
};

const checks = [];
const check = (name, why, fn) => checks.push({ name, why, fn });

check(
  'nothing above the sticky header sets overflow',
  'overflow on html, body or the header stops position: sticky in WebKit. It has done twice, and both times the site opened on a phone with the hero mid-screen and no menu.',
  ({ parts }) => {
    const bad = [];
    for (const p of parts) {
      const re = /(^|[},])\s*(html|body|\.site-header)\s*(,[^{]*)?\{([^}]*)\}/g;
      let m;
      while ((m = re.exec(p.body))) {
        if (/overflow(-x|-y)?\s*:\s*(hidden|clip|auto|scroll)/.test(m[4])) {
          bad.push(`${m[2]} { ${m[4].trim().slice(0, 50)} }${p.media ? ' @media ' + p.media : ''}`);
        }
      }
    }
    return bad.length ? bad : true;
  }
);

check(
  'every page references a file that exists',
  'running build.js without the WebP pass leaves 28 portraits pointing at JPEGs that were pruned. Nothing errors; the pictures are simply gone, and only on the pages nobody reloaded.',
  () => {
    const missing = new Set();
    walk(OUT, (file) => {
      if (!/\.html$/i.test(file)) return;
      const html = fs.readFileSync(file, 'utf8');
      for (const m of html.matchAll(/(?:src|href)="(\/(?:media|assets|brand)\/[^"]+)"/g)) {
        const rel = decodeURIComponent(m[1]).split('?')[0];
        if (!fs.existsSync(path.join(OUT, rel))) missing.add(rel);
      }
      for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
        for (const part of m[1].split(',')) {
          const url = part.trim().split(/\s+/)[0];
          if (!url.startsWith('/')) continue;
          const rel = decodeURIComponent(url).split('?')[0];
          if (!fs.existsSync(path.join(OUT, rel))) missing.add(rel);
        }
      }
    });
    return missing.size ? [...missing].slice(0, 8) : true;
  }
);

check(
  'every linked stylesheet and script is content-hashed',
  'an asset under a name that never changes sits in a seven-day cache, so a correct fix reaches the server and never reaches the reader. A week of variant work went out that way.',
  ({ linked }) => {
    const bad = linked.filter((u) => !/\.[0-9a-f]{8}\.(css|js)$/.test(u));
    return bad.length ? bad : true;
  }
);

check(
  'no asset is shipped that nothing links',
  'hashed names accumulate and the whole directory is uploaded — 25 files and 2.6 MB of stylesheets no page had referenced for weeks.',
  ({ linked }) => {
    const bad = [];
    for (const sub of ['assets/css', 'assets/js']) {
      const dir = path.join(OUT, sub);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!linked.includes('/' + sub + '/' + name)) bad.push(sub + '/' + name);
      }
    }
    return bad.length ? bad : true;
  }
);

check(
  'the contents rail survives a closed <details>',
  'browsers now hide closed disclosure content on ::details-content, which overriding the child display cannot reach. The rail emptied itself with no change on our side.',
  ({ parts }) =>
    parts.some((p) => p.media && /min-width/.test(p.media)
      && /\.toc::details-content[^}]*content-visibility\s*:\s*visible/.test(p.body))
    || 'no .toc::details-content { content-visibility: visible } inside a min-width query'
);

check(
  'the pinned choreography stays in the pinned layout',
  'on a phone the artwork is an ordinary block far below the panels, so "the current panel" means nothing — and the faces were drawn in the last panel’s state, dimmed with one woman ringed, in a block nobody had scrolled through.',
  ({ parts }) => {
    const bad = [];
    for (const p of parts) {
      if (p.media && /min-width/.test(p.media)) continue;
      for (const m of p.body.matchAll(/\.scrolly\[data-panel[^{]*\{[^}]*\}/g)) {
        bad.push(m[0].replace(/\s+/g, ' ').slice(0, 62) + (p.media ? ` @media ${p.media}` : ' (unscoped)'));
      }
    }
    return bad.length ? bad : true;
  }
);

check(
  'the phone keeps its own version of those beats',
  'removing the choreography instead of rescoping it was the wrong fix once already: the block went static and stopped matching the desktop.',
  ({ parts }) => {
    const narrow = parts.filter((p) => p.media && /max-width/.test(p.media));
    const missing = ['.scrolly__art.is-arrived', '.scrolly__art.is-focused']
      .filter((sel) => !narrow.some((p) => p.body.includes(sel)));
    return missing.length ? missing.map((s) => `no ${s} rule in any max-width block`) : true;
  }
);

check(
  'the kept card matches the short row it sits under',
  'thirty-one faces eight to a row leaves a last row of seven, and that is the edge the eye compares the card to.',
  ({ parts }) =>
    parts.some((p) => p.media && /max-width/.test(p.media)
      && /\.scrolly__kept\s*\{[^}]*max-width:\s*calc\(7\s*\*\s*var\(--cell\)/.test(p.body))
    || 'the kept card is not seven cells wide in the phone block'
);

check(
  'the exhibition chrome is off where there is no room',
  'the ribbon, the section label and the wordmark live in the empty page a wide window leaves. A phone leaves none, so they were drawn over the paragraphs.',
  ({ parts }) =>
    parts.some((p) => p.media && /max-width/.test(p.media)
      && /\.dsop-chrome\s*\{[^}]*display:\s*none/.test(p.body))
    || 'no .dsop-chrome { display: none } inside a max-width query'
);

check(
  'the section label cannot outlive its section',
  'as one absolutely positioned element in the sticky chrome it hung 514px below a zero-height box, where sticky clamps the box and not what overflows it — so it ran past the last act and over the next section’s heading.',
  ({ parts, css }) => {
    if (/\.dsop-chrome__rail/.test(css)) {
      return 'the rail is back in the shared chrome; it belongs to the act it names';
    }
    return parts.some((p) => /\.dsop-act__rail\s*\{[^}]*grid-column/.test(p.body))
      || 'no .dsop-act__rail with a grid-column — it is not a column of its act';
  }
);

check(
  'the studio is given the site’s own tokens',
  'the promise the social studio makes is that it cannot go off-brand, and that only holds while the colours come out of site.css rather than being typed again.',
  () => {
    const file = path.join(OUT, 'social', 'data.json');
    if (!fs.existsSync(file)) return true;      // studio not in this build
    let d;
    try { d = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (err) { return 'social/data.json does not parse'; }
    const want = ['--plum-900', '--magenta-500', '--pink-300'];
    const missing = want.filter((k) => !d.tokens || !d.tokens[k]);
    if (missing.length) return missing.map((k) => `no ${k} in social/data.json`);
    if (!d.people || !d.people.length) return 'no portraits reached the studio';
    return true;
  }
);

function run() {
  if (!fs.existsSync(OUT)) {
    console.error(`  ${path.basename(OUT)} is not built`);
    process.exit(1);
  }

  const linked = new Set();
  walk(OUT, (file) => {
    if (!/\.html$/i.test(file)) return;
    if (file.includes(path.join(OUT, 'assets'))) return;
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\/assets\/(?:css|js)\/[A-Za-z0-9._-]+\.(?:css|js)/g)) linked.add(m[0]);
  });

  const css = [...linked]
    .filter((u) => u.endsWith('.css'))
    .map((u) => {
      const f = path.join(OUT, u.slice(1));
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    })
    .join('\n');

  const clean = strip(css);
  const ctx = { parts: blocks(clean), linked: [...linked], css: clean };

  let failed = 0;
  for (const c of checks) {
    let result;
    try { result = c.fn(ctx); } catch (err) { result = 'the check itself threw: ' + err.message; }
    if (result === true) { console.log(`  ok    ${c.name}`); continue; }
    failed++;
    console.log(`  FAIL  ${c.name}`);
    console.log(`        ${c.why}`);
    for (const line of [].concat(result).slice(0, 8)) console.log(`        → ${line}`);
  }
  console.log(`  ${checks.length - failed}/${checks.length} hold`);
  if (failed) process.exit(1);
}

run();
