# METUPUK — rebuilt site

A static rebuild of [metupuk.org.uk](https://metupuk.org.uk), migrated from
WordPress with no content loss and no change to any public URL.

```bash
npm install

# One-off asset preparation (writes into _scrape/assets, safe to re-run)
node build/make-portraits.js   # crop sharp portraits from the campaign cards
node build/make-renditions.js  # generate the wide sizes banners need

node build/build.js            # generate dist/
node build/optimise-images.js  # re-encode oversized images in place
node build/verify.js           # prove nothing was lost, nothing is broken
node tools/webaudit dist       # full SEO / accessibility / performance audit
```

The two `make-*` scripts only need running when the source assets change; the
build reads whatever renditions are on disk.

Serve the result with any static host:

```bash
npx serve dist -l 4321
```

## What is in here

| Path | What it is |
| --- | --- |
| `dist/` | The built site. This is what you deploy. |
| `_scrape/` | The raw WordPress export and downloaded media. Input only — not deployed. |
| `build/` | The site generator. |
| `src/assets/` | Stylesheet and JavaScript for the site. |
| `tools/webaudit/` | A reusable site audit tool. See its own README. |

## How the migration works

Content was pulled from the WordPress REST API rather than scraped from HTML, so
every page and post arrived as structured data: **73 pages, 228 posts, 663 media
records**. A handful of pages built entirely in Elementor return empty content
over the API; those fall back to the rendered HTML captured in `_scrape/html/`.

The pipeline, in order:

1. **`lib/model.js`** — assembles one content model. Resolves featured images,
   categories, page hierarchy and excerpts. Rewrites every media reference to a
   local `/media/…` path.
2. **`lib/clean.js`** — turns Elementor's div soup and pasted-from-Word markup
   into semantic HTML. Accordions become `<details>`, image boxes become cards,
   Swiper carousels become plain image grids, and everything else is unwrapped
   down to the content. Attributes are whitelisted.
3. **`lib/links.js`** — repairs links that were already broken on the old site,
   now that the complete set of valid URLs is known. Anything unresolvable is
   unlinked rather than shipped as a dead link.
4. **`lib/enrich.js`** — renumbers heading outlines so they never skip a level,
   adds intrinsic image dimensions from the media library, gives image-only
   links an accessible name, and replaces WordPress's remote emoji images with
   the actual characters.
5. **`lib/exhibition.js`** — the *Darker Side of Pink* exhibition was a separate
   bespoke microsite outside WordPress. Its 31 portraits, 31 films and tour dates
   are extracted and rebuilt as a page inside the main site.
6. **`build.js`** — renders every page, then copies only the media the built
   pages actually reference.

Two asset scripts run ahead of the build:

- **`make-portraits.js`** — the exhibition microsite only ships 220x120
  landscape thumbnails, which look soft shown as portraits. The charity's own
  1920x1080 campaign cards hold the same photographs, so this crops the subject
  out of those, avoiding the logo, the pull-quote and the campaign lockup.
- **`make-renditions.js`** — WordPress topped out at 1024px for several banner
  images, so a desktop browser upscaled them. This generates the 1440px and
  1920px widths from the original upload.

## URL policy

Every original URL is preserved exactly, including dated post paths like
`/2024/10/why-i-volunteer-with-metupuk/`. Nothing that currently ranks or is
bookmarked breaks. `verify.js` asserts this on every build.

## Verification

`build/verify.js` is the safety net for the migration itself. It checks that
every character of every source page appears, in order, in the rendered output —
insertions are allowed, omissions are not — and that no internal link, image or
original URL is broken.

```
HTML pages built:        376
Dead internal links:     0
Missing local media:     0
Content-loss warnings:   0
Original URLs now 404:   0
```

`tools/webaudit` is the broader, reusable quality check: SEO, accessibility,
performance and infrastructure. It is not specific to this project.

## Known gaps

- **Alt text.** 1,017 images carry `alt=""`. Alt text was taken from the media
  library wherever the charity had written it; the rest cannot be invented
  safely and need a human who knows the photographs.
- **Donate button.** It points at `/help-us/#donate`, matching the old site,
  which had no payment provider wired up. Point it at JustGiving, CAF or Stripe.
- **Analytics.** None installed, by design — this is the charity's decision to
  make. A privacy-first tool avoids a cookie banner entirely.
