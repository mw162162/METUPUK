// Check outbound links over the network. Dead external links are a slow leak:
// they annoy readers and shed the credibility signals that earn rankings.
const { request } = require('./collect');

async function checkExternal(targets, { concurrency = 6, limit = 400, onProgress } = {}) {
  const urls = [...targets.keys()].slice(0, limit);
  const results = new Map();
  let done = 0;

  const worker = async () => {
    while (urls.length) {
      const url = urls.shift();
      if (!url) continue;
      // Some servers reject HEAD; fall back to GET before believing a failure.
      let res = await request(url, { method: 'HEAD', timeout: 12000 });
      if (!res.ok && (res.status === 405 || res.status === 403 || res.status === 0)) {
        res = await request(url, { method: 'GET', timeout: 15000 });
      }
      results.set(url, res);
      done++;
      if (onProgress) onProgress(done, targets.size);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function toFindings(results, targets) {
  const out = [];
  for (const [url, res] of results) {
    const pages = targets.get(url) || [];
    const where = pages[0] || '(site)';
    const extra = pages.length > 1 ? ` (and ${pages.length - 1} other page${pages.length > 2 ? 's' : ''})` : '';

    if (res.status === 404 || res.status === 410) {
      out.push({ id: 'external-dead', severity: 'error', page: where, detail: `Dead external link (${res.status}): ${url}${extra}`, fix: 'Update or remove it. Dead outbound links erode trust and waste crawl budget.' });
    } else if (res.status === 0) {
      out.push({ id: 'external-unreachable', severity: 'warning', page: where, detail: `Could not reach ${url} (${res.error})${extra}`, fix: 'Verify by hand — the host may be down, blocking bots, or gone.' });
    } else if (res.status >= 500) {
      out.push({ id: 'external-server-error', severity: 'warning', page: where, detail: `External link returns ${res.status}: ${url}${extra}`, fix: 'Recheck later; if it persists, replace the link.' });
    } else if (res.redirected) {
      out.push({ id: 'external-redirect', severity: 'notice', page: where, detail: `Redirects to ${res.finalUrl}: ${url}${extra}`, fix: 'Link directly to the final URL to save a round trip.' });
    }
  }
  return out;
}

module.exports = { checkExternal, toFindings };
