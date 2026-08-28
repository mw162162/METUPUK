// Mirror every referenced media file locally so the new site is self-contained.
const fs = require('fs');
const path = require('path');
const https = require('https');

const S = path.join(__dirname, '..', '_scrape');
const DEST = path.join(S, 'assets');
const urls = fs.readFileSync(path.join(S, 'asset-urls.txt'), 'utf8').split('\n').filter(Boolean);

// Map a remote URL onto a stable local path under /media.
function localPath(u) {
  const p = new URL(u).pathname;
  let rel = p.replace(/^\/wp-content\/uploads\//, '')
             .replace(/^\/wp-content\/plugins\//, 'plugin/')
             .replace(/^\/wp-content\/themes\//, 'theme/')
             .replace(/^\/darker-side-of-pink\//, 'dsop/')
             .replace(/^\/+/, '');
  return decodeURIComponent(rel);
}

function get(u, dest, redirects = 0) {
  return new Promise((resolve) => {
    const mod = u.startsWith('http:') ? require('http') : https;
    const req = mod.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
        res.resume();
        return resolve(get(new URL(res.headers.location, u).href, dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return resolve({ ok: false, code: res.statusCode }); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => resolve({ ok: true })));
      ws.on('error', () => resolve({ ok: false, code: 'write' }));
    });
    req.on('error', (e) => resolve({ ok: false, code: e.code }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ ok: false, code: 'timeout' }); });
  });
}

(async () => {
  const failed = [];
  let done = 0;
  const queue = urls.slice();
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const dest = path.join(DEST, localPath(u));
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { done++; continue; }
      const r = await get(u, dest);
      done++;
      if (!r.ok) failed.push(u + ' :: ' + r.code);
      if (done % 100 === 0) process.stdout.write(done + '/' + urls.length + ' ');
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  fs.writeFileSync(path.join(S, 'asset-failures.txt'), failed.join('\n'));
  console.log('\ndone', done, 'failed', failed.length);
})();
