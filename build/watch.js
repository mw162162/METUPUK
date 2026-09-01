// Rebuild when the content changes.
//
//   npm run dev
//
// Two speeds, deliberately.
//
// Editing one page re-renders just that page, in about forty milliseconds, by
// keeping the model and the link resolver in memory. That is the number that
// decides whether the editor's preview feels live: at thirteen seconds you wait
// and lose your place, at forty milliseconds the page has already changed by
// the time you look up.
//
// But a page never changes alone. Its title is in the news index, its excerpt is
// on the homepage, its URL is in the sitemap and the feed. So the fast render is
// followed by a full build a couple of seconds later, quietly. The editor gets
// its answer immediately and the rest of the site catches up without anyone
// waiting for it.
//
// Anything that is not a single content file — stylesheet, script, template,
// a renamed page — goes straight to a full build. The fast path is for the case
// that happens a hundred times an hour, not for every case.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PageBuilder } = require('./lib/incremental');

const ROOT = path.join(__dirname, '..');
const WATCH = ['content', path.join('src', 'assets'), path.join('src', 'static')];
const DEBOUNCE_MS = 250;
const SETTLE_MS = 2500;

const pages = new PageBuilder();
let timer = null;
let settle = null;
let running = false;
let queued = false;

function fullBuild(reason, quiet) {
  if (running) { queued = true; return; }
  running = true;
  const started = Date.now();
  if (!quiet) process.stdout.write(`\n· rebuilding (${reason})… `);

  const child = spawn(process.execPath, [path.join(__dirname, 'build.js')], { cwd: ROOT });
  let err = '';
  child.stdout.on('data', (d) => {
    const s = String(d);
    if (!quiet && /Built \d+ pages/.test(s)) process.stdout.write(s.trim().split('\n')[0]);
  });
  child.stderr.on('data', (d) => { err += d; });

  child.on('close', (code) => {
    running = false;
    if (code === 0) {
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(quiet ? `  · indexes caught up (${secs}s)` : `  (${secs}s)`);
      // The in-memory model is now behind the build that just ran.
      pages.prime();
    } else {
      console.log('\n  BUILD FAILED — the preview is showing the previous version.');
      console.log(err.trim().split('\n').slice(0, 6).map((l) => '    ' + l).join('\n'));
    }
    if (queued) { queued = false; fullBuild('changes during the last build'); }
  });
}

function onChange(rel, file) {
  const full = path.join(ROOT, rel, file || '');

  // Fast path: one content file, no URL change.
  if (rel === 'content' && file && file.endsWith('.md') && !running) {
    const t = Date.now();
    let url = null;
    try { url = pages.rebuild(full); } catch { url = null; }
    if (url) {
      console.log(`· ${url}  (${Date.now() - t}ms)`);
      // Everything that lists this page catches up shortly.
      clearTimeout(settle);
      settle = setTimeout(() => fullBuild('indexes', true), SETTLE_MS);
      return;
    }
  }
  fullBuild(file ? `${rel}/${file}` : rel);
}

function watch(rel) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return;
  fs.watch(dir, { recursive: true }, (_event, file) => {
    if (file && /(^|[\\/])\./.test(file)) return; // editor swap files
    clearTimeout(timer);
    timer = setTimeout(() => onChange(rel, file), DEBOUNCE_MS);
  });
  console.log(`  watching ${rel}/`);
}

console.log('Watching for changes. Edit at /admin/, press Save, and the preview follows.\n');
WATCH.forEach(watch);
fullBuild('first run');
