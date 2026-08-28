#!/usr/bin/env node
// webaudit — a site quality audit for static sites and live URLs.
//
//   node tools/webaudit dist                     audit a built directory
//   node tools/webaudit https://example.com      crawl and audit a live site
//
//   --external      also check every outbound link over the network
//   --json <file>   write the full findings as JSON
//   --html <file>   write a shareable HTML report
//   --max <n>       page limit when crawling (default 300)
//   --quiet         summary only
const path = require('path');
const fs = require('fs');
const { fromDirectory, fromUrl } = require('./lib/collect');
const { run } = require('./lib/checks');
const { checkExternal, toFindings } = require('./lib/external');
const { renderHtml, renderConsole } = require('./lib/report');

function parseArgs(argv) {
  const opts = { target: null, external: false, json: null, html: null, max: 300, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--external') opts.external = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--json') opts.json = argv[++i];
    else if (a === '--html') opts.html = argv[++i];
    else if (a === '--max') opts.max = +argv[++i];
    else if (!a.startsWith('--')) opts.target = a;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.target) {
    console.error('Usage: node tools/webaudit <dist-dir|url> [--external] [--json out.json] [--html out.html]');
    process.exit(1);
  }

  const started = Date.now();
  let site;
  if (/^https?:\/\//i.test(opts.target)) {
    process.stdout.write(`Crawling ${opts.target} …\n`);
    site = await fromUrl(opts.target, { maxPages: opts.max });
  } else {
    const dir = path.resolve(opts.target);
    if (!fs.existsSync(dir)) { console.error(`No such directory: ${dir}`); process.exit(1); }
    site = fromDirectory(dir);
  }

  if (!site.pages.length) { console.error('No HTML pages found.'); process.exit(1); }

  const { findings, linkData } = run(site);

  if (opts.external && linkData.externalTargets.size) {
    const total = linkData.externalTargets.size;
    process.stdout.write(`Checking ${total} outbound links …`);
    const results = await checkExternal(linkData.externalTargets, {
      onProgress: (n, t) => { if (n % 25 === 0) process.stdout.write(` ${n}/${t}`); },
    });
    process.stdout.write('\n');
    findings.push(...toFindings(results, linkData.externalTargets));
  }

  const report = {
    target: opts.target,
    generated: new Date().toISOString(),
    pages: site.pages.length,
    words: site.pages.reduce((a, p) => a + (p.words || 0), 0),
    assets: site.assets ? site.assets.size : null,
    externalLinks: linkData.externalTargets.size,
    durationMs: Date.now() - started,
    findings,
  };

  if (!opts.quiet) renderConsole(report);
  else {
    const by = (s) => findings.filter((f) => f.severity === s).length;
    console.log(`${report.pages} pages · ${by('error')} errors · ${by('warning')} warnings · ${by('notice')} notices`);
  }

  if (opts.json) {
    fs.mkdirSync(path.dirname(path.resolve(opts.json)), { recursive: true });
    fs.writeFileSync(opts.json, JSON.stringify(report, null, 2));
    console.log(`\nJSON written to ${opts.json}`);
  }
  if (opts.html) {
    fs.mkdirSync(path.dirname(path.resolve(opts.html)), { recursive: true });
    fs.writeFileSync(opts.html, renderHtml(report));
    console.log(`HTML report written to ${opts.html}`);
  }

  process.exit(findings.some((f) => f.severity === 'error') ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
