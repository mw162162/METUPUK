// Everything that has to happen for a change to be live.
//
//   npm run ship -- "what changed"
//   npm run ship                      (uses a dated message)
//
// There are five steps and they have to happen in this order, which is easy to
// get wrong by hand and was got wrong twice: deploying without rebuilding the
// admin ships a site with no editor, and letting the Netlify CLI run the build
// itself clears dist and throws the admin away again.
//
//   1  build          the site from content/
//   2  verify         refuses to go further if content was lost
//   3  tinacms build  the editor, into dist/admin
//   4  commit + push  so TinaCloud re-indexes and the repo matches what is live
//   5  deploy         prebuilt, with --no-build so nothing overwrites step 3
//
// Nothing is deployed if verify fails. A site that is wrong everywhere is
// worse than a site that is briefly out of date.
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const message = process.argv.slice(2).join(' ').trim()
  || `Site update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

const run = (label, cmd, opts = {}) => {
  process.stdout.write(`\n── ${label}\n`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
    return true;
  } catch (err) {
    if (opts.allowFail) { process.stdout.write(`   (nothing to do)\n`); return false; }
    process.stdout.write(`\n✗ ${label} failed. Nothing has been deployed.\n`);
    process.exit(1);
  }
};

run('Building the site', 'node build/build.js');
run('Checking nothing was lost', 'node build/verify.js');
run('Building the editor', 'npx tinacms build --skip-cloud-checks');
run('Converting images to WebP', 'node build/to-webp.js');

// Committing is allowed to find nothing to commit — a rebuild with no content
// change is a normal thing to ship.
process.stdout.write('\n── Committing\n');
try {
  execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });
  execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: ROOT, stdio: 'inherit' });
} catch {
  process.stdout.write('   nothing to commit\n');
}
run('Pushing to GitHub', 'git push origin main');

run('Deploying', 'npx --yes netlify-cli deploy --dir=dist --prod --no-build');

process.stdout.write('\n✓ Live at https://metupuk.netlify.app\n');
