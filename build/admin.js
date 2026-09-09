// Build the editor that lives at /admin/.
//
// This is a wrapper around `tinacms build` for one reason: without Tina Cloud
// credentials that command fails, and it should not take the whole site down
// with it. A hosted run that has not been given the secrets yet can still
// build every page and run every check — which is most of the value — and say
// plainly that the editor was skipped.
//
// The catch is that a deploy missing dist/admin/ is a deploy that 404s the
// editor, so the workflow refuses to publish unless this actually ran. Skipping
// is safe; skipping and then publishing is not.
//
// Credentials come from the environment in a hosted run and from .env locally,
// which is where the Tina CLI looks too.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KEYS = ['NEXT_PUBLIC_TINA_CLIENT_ID', 'TINA_TOKEN'];

const fromEnvFile = (() => {
  const found = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (value) found[m[1]] = true;
    }
  } catch { /* no .env, which is normal on a build server */ }
  return found;
})();

const have = (k) => Boolean((process.env[k] || '').trim()) || Boolean(fromEnvFile[k]);
const missing = KEYS.filter((k) => !have(k));

if (missing.length) {
  console.log(`  admin     skipped — no ${missing.join(' or ')}`);
  console.log('            The site builds and every check still runs. Publishing is');
  console.log('            held back separately, because a deploy without the editor');
  console.log('            would 404 /admin/ for whoever edits the site.');
  process.exit(0);
}

const run = spawnSync('npx', ['tinacms', 'build', '--skip-cloud-checks'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: ROOT,
});
process.exit(run.status === null ? 1 : run.status);
