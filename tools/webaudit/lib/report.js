// Console and HTML output for an audit run.

const RULE_HELP = {
  'title-missing': 'Search snippet',
  'description-missing': 'Search snippet',
  'og-missing': 'Social sharing',
  'schema-missing': 'Structured data',
  'sitemap-missing': 'Discoverability',
  'analytics-missing': 'Measurement',
  'page-orphan': 'Discoverability',
};

const COLOURS = {
  error: '\x1b[31m', warning: '\x1b[33m', notice: '\x1b[36m',
  bold: '\x1b[1m', dim: '\x1b[2m', reset: '\x1b[0m',
};
const useColour = process.stdout.isTTY;
const c = (name, s) => (useColour ? COLOURS[name] + s + COLOURS.reset : s);

function group(findings) {
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.id)) byRule.set(f.id, { id: f.id, severity: f.severity, fix: f.fix, items: [] });
    byRule.get(f.id).items.push(f);
  }
  const order = { error: 0, warning: 1, notice: 2 };
  return [...byRule.values()].sort((a, b) =>
    order[a.severity] - order[b.severity] || b.items.length - a.items.length);
}

function renderConsole(report) {
  const { findings } = report;
  const count = (s) => findings.filter((f) => f.severity === s).length;

  console.log('');
  console.log(c('bold', `  Audit — ${report.target}`));
  console.log(c('dim', `  ${report.pages} pages · ${report.words.toLocaleString()} words` +
    (report.assets ? ` · ${report.assets} files` : '') +
    ` · ${report.externalLinks} outbound links · ${(report.durationMs / 1000).toFixed(1)}s`));
  console.log('');
  console.log(`  ${c('error', '● ' + count('error') + ' errors')}   ` +
              `${c('warning', '● ' + count('warning') + ' warnings')}   ` +
              `${c('notice', '● ' + count('notice') + ' notices')}`);
  console.log('');

  for (const rule of group(findings)) {
    const tag = rule.severity === 'error' ? 'ERROR' : rule.severity === 'warning' ? 'WARN ' : 'NOTE ';
    console.log(`  ${c(rule.severity, tag)} ${c('bold', rule.id)} ${c('dim', `(${rule.items.length})`)}`);
    for (const item of rule.items.slice(0, 5)) {
      console.log(`        ${c('dim', item.page)}  ${item.detail}`);
    }
    if (rule.items.length > 5) console.log(c('dim', `        …and ${rule.items.length - 5} more`));
    if (rule.fix) console.log(c('dim', `        → ${rule.fix}`));
    console.log('');
  }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderHtml(report) {
  const { findings } = report;
  const count = (s) => findings.filter((f) => f.severity === s).length;
  const rules = group(findings);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Site audit — ${esc(report.target)}</title>
<style>
  :root{--bg:#fff;--fg:#16161a;--muted:#5b5b66;--line:#e4e4ea;--card:#fff;
        --error:#c02626;--warn:#a8690a;--note:#1f6feb;--tint:#f7f7fa}
  @media(prefers-color-scheme:dark){:root{--bg:#0f0f12;--fg:#eaeaf0;--muted:#a0a0ad;
        --line:#2a2a32;--card:#17171c;--error:#ff6b6b;--warn:#e3a53c;--note:#6ea8ff;--tint:#131318}}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:960px;margin:0 auto;padding:2.5rem 1.25rem 5rem}
  h1{font-size:1.7rem;margin:0 0 .35rem}
  .meta{color:var(--muted);font-size:.9rem;margin-bottom:2rem}
  .totals{display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:2.5rem}
  .total{flex:1;min-width:140px;border:1px solid var(--line);border-radius:10px;padding:1rem;background:var(--card)}
  .total b{display:block;font-size:2rem;line-height:1}
  .total span{color:var(--muted);font-size:.85rem}
  .e b{color:var(--error)}.w b{color:var(--warn)}.n b{color:var(--note)}
  .rule{border:1px solid var(--line);border-radius:10px;margin-bottom:1rem;background:var(--card);overflow:hidden}
  .rule>summary{cursor:pointer;padding:.9rem 1.1rem;display:flex;gap:.75rem;align-items:center;font-weight:600}
  .rule>summary::-webkit-details-marker{display:none}
  .badge{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;padding:.2em .55em;border-radius:4px;color:#fff}
  .badge.error{background:var(--error)}.badge.warning{background:var(--warn)}.badge.notice{background:var(--note)}
  .n-items{margin-left:auto;color:var(--muted);font-weight:400;font-size:.9rem}
  .body{padding:0 1.1rem 1.1rem}
  .fix{background:var(--tint);border-radius:8px;padding:.75rem .9rem;margin:0 0 .9rem;font-size:.92rem}
  ul{margin:0;padding-left:1.1rem}li{margin:.3rem 0;font-size:.92rem}
  code{background:var(--tint);padding:.1em .35em;border-radius:4px;font-size:.88em}
  .page{color:var(--muted)}
</style></head><body><div class="wrap">
<h1>Site audit</h1>
<p class="meta"><code>${esc(report.target)}</code> · ${report.pages} pages · ${report.words.toLocaleString()} words · ${report.externalLinks} outbound links<br>Generated ${esc(report.generated)}</p>
<div class="totals">
  <div class="total e"><b>${count('error')}</b><span>Errors — broken or costing traffic now</span></div>
  <div class="total w"><b>${count('warning')}</b><span>Warnings — fix soon</span></div>
  <div class="total n"><b>${count('notice')}</b><span>Notices — worth improving</span></div>
</div>
${rules.map((r) => `<details class="rule"${r.severity === 'error' ? ' open' : ''}>
  <summary><span class="badge ${r.severity}">${r.severity}</span> ${esc(r.id)}<span class="n-items">${r.items.length}</span></summary>
  <div class="body">
    ${r.fix ? `<p class="fix"><strong>Fix:</strong> ${esc(r.fix)}</p>` : ''}
    <ul>${r.items.slice(0, 60).map((i) => `<li><span class="page">${esc(i.page)}</span> — ${esc(i.detail)}</li>`).join('')}</ul>
    ${r.items.length > 60 ? `<p class="page">…and ${r.items.length - 60} more</p>` : ''}
  </div>
</details>`).join('\n')}
</div></body></html>`;
}

module.exports = { renderConsole, renderHtml, group, RULE_HELP };
