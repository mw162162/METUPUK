// Gather the pages to audit, either from a built directory or by crawling a
// live site. Both paths produce the same shape so the checks don't care which.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parse } = require('node-html-parser');

const HTML_EXT = /\.html?$/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function fromDirectory(root, { baseUrl = '' } = {}) {
  const files = walk(root);
  const pages = [];
  const assets = new Map();

  for (const file of files) {
    const rel = '/' + path.relative(root, file).split(path.sep).join('/');
    if (HTML_EXT.test(file)) {
      const html = fs.readFileSync(file, 'utf8');
      const url = rel.replace(/index\.html$/, '');
      pages.push({
        url,
        file,
        html,
        dom: parse(html),
        bytes: Buffer.byteLength(html),
      });
    }
    assets.set(rel, fs.statSync(file).size);
  }

  return {
    kind: 'directory',
    root,
    baseUrl,
    pages: pages.sort((a, b) => a.url.localeCompare(b.url)),
    assets,
    // Does this site-relative URL exist on disk?
    resolve(u) {
      const clean = decodeURIComponent(String(u).split('#')[0].split('?')[0]);
      if (!clean.startsWith('/')) return false;
      if (assets.has(clean)) return true;
      if (assets.has(clean.replace(/\/$/, '') + '/index.html')) return true;
      if (clean === '/' && assets.has('/index.html')) return true;
      return false;
    },
  };
}

function request(url, { method = 'GET', timeout = 15000, redirects = 5 } = {}) {
  return new Promise((resolve) => {
    let mod;
    try { mod = new URL(url).protocol === 'http:' ? http : https; }
    catch { return resolve({ ok: false, status: 0, error: 'bad-url' }); }

    const req = mod.request(url, { method, headers: { 'User-Agent': 'webaudit/1.0 (+site quality checker)' } }, (res) => {
      const { statusCode, headers } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location && redirects > 0) {
        res.resume();
        const next = new URL(headers.location, url).href;
        return resolve(request(next, { method, timeout, redirects: redirects - 1 })
          .then((r) => ({ ...r, redirected: true, finalUrl: r.finalUrl || next })));
      }
      const chunks = [];
      res.on('data', (c) => { if (method === 'GET') chunks.push(c); });
      res.on('end', () => resolve({
        ok: statusCode >= 200 && statusCode < 400,
        status: statusCode,
        headers,
        body: Buffer.concat(chunks).toString('utf8'),
        finalUrl: url,
      }));
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.code || 'error' }));
    req.setTimeout(timeout, () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    req.end();
  });
}

async function fromUrl(startUrl, { maxPages = 300, concurrency = 5 } = {}) {
  const origin = new URL(startUrl).origin;
  const queue = [new URL(startUrl).href];
  const seen = new Set(queue);
  const pages = [];

  const worker = async () => {
    while (queue.length && pages.length < maxPages) {
      const url = queue.shift();
      if (!url) continue;
      const res = await request(url);
      if (!res.ok || !res.body || !/text\/html/i.test(res.headers?.['content-type'] || '')) continue;
      const dom = parse(res.body);
      pages.push({
        url: new URL(url).pathname,
        absolute: url,
        html: res.body,
        dom,
        bytes: Buffer.byteLength(res.body),
        headers: res.headers,
      });
      for (const a of dom.querySelectorAll('a[href]')) {
        let next;
        try { next = new URL(a.getAttribute('href'), url); } catch { continue; }
        if (next.origin !== origin) continue;
        next.hash = '';
        if (seen.has(next.href) || seen.size > maxPages * 3) continue;
        seen.add(next.href);
        queue.push(next.href);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return {
    kind: 'url',
    root: origin,
    baseUrl: origin,
    pages: pages.sort((a, b) => a.url.localeCompare(b.url)),
    assets: new Map(),
    resolve: null, // live sites are checked over the network instead
  };
}

module.exports = { fromDirectory, fromUrl, request };
