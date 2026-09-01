# The editing system

Two halves.

**Front end** — Sveltia CMS at `/admin/`. It reads `admin/config.yml`, shows the
client a list of pages and a menu of components, and writes the result back as
files in `content/`. That is the same directory the build reads, so an edit is a
commit and a commit is a new site.

**Back end** — `worker.js`, a Cloudflare Worker. It exists for one reason: so the
client signs in with an email address and never learns what GitHub is.

## Why not just use the GitHub backend

Sveltia can talk to GitHub directly from the browser, and that needs no server
at all. But it means every person who edits the site needs a GitHub account and
an invitation to the repository. For a charity trustee that is a wall, and
"create a GitHub account" is a bad sentence to say during a sale.

## How this works instead

1. `/admin/` sits behind Cloudflare Access, which checks the visitor's email
   against a list and sends them a one-time code. No password, no GitHub.
2. Once through, the page asks the Worker for a token.
3. The Worker checks the Access JWT that Cloudflare attached to the request, and
   only then returns a GitHub token from its secret store.
4. Sveltia uses that token to read and write the repository.

The client sees: enter email, enter code, edit the site.

## What the token can do

A fine-grained personal access token, scoped to **one repository** and to
**Contents: read and write** only. It cannot touch other repositories, cannot
change settings, cannot delete the repo. It reaches the browser of someone who
has already proved they are on the allow-list — which is the same access they
are being given anyway.

Rotate it if someone leaves. That is one setting change, not a migration.

## Deploying it

Needs a Cloudflare account and a GitHub token; both steps are yours because
they involve credentials.

1. Create a fine-grained GitHub PAT: one repository, Contents read/write.
2. `npx wrangler secret put GITHUB_TOKEN` in this directory.
3. `npx wrangler deploy`.
4. In Cloudflare Zero Trust, add an Access application covering `/admin/*` and
   `/cms-token`, with an email allow-list policy. Set `ACCESS_AUD` in
   `wrangler.toml` to that application's audience tag.
5. Set `repo` and `branch` in `src/static/admin/config.yml`.

Until step 4 is done the Worker refuses every request, because an unprotected
token endpoint is worse than no endpoint.
