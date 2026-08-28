# webaudit

A dependency-light site quality audit for static sites and live URLs. Built to
answer one question before you hand a site over: *is this actually right?*

```bash
node tools/webaudit dist                    # audit a built directory
node tools/webaudit https://example.com     # crawl and audit a live site
```

Exits `1` if any error-level finding is present, so it drops straight into CI.

## Options

| Flag | Meaning |
| --- | --- |
| `--external` | Also check every outbound link over the network (HEAD, falling back to GET) |
| `--json <file>` | Write the full findings as JSON |
| `--html <file>` | Write a shareable HTML report |
| `--max <n>` | Page limit when crawling a live site (default 300) |
| `--quiet` | One-line summary only |

## What it checks

**Links and documents**
Broken internal links · missing images, scripts and stylesheets · linked PDFs and
Office documents that were never uploaded · in-page anchors that point at ids
which don't exist · placeholder `href="#"` links · links with no accessible name ·
generic link text ("click here") · orphan pages with no inbound internal links ·
internal links written as absolute URLs · `target="_blank"` without `rel="noopener"` ·
dead, unreachable and redirecting external links (with `--external`)

**SEO**
Missing, short, long or duplicated titles · missing, short, long or duplicated meta
descriptions · missing canonicals · missing or multiple `<h1>` · missing Open Graph
and `og:image` · missing or malformed JSON-LD · thin content · URL hygiene
(uppercase, over-long, date-stamped paths)

**Accessibility**
Missing `lang` · images with no `alt` attribute · images with no intrinsic
dimensions (layout shift) · heading levels that skip · unlabelled form controls ·
missing `<main>` landmark · multiple unlabelled `<nav>` elements · no skip link ·
missing viewport · viewport that blocks pinch-zoom

**Image sharpness**
Reads each image's real dimensions from the file header — not the `width`
attribute, which is only a claim — takes the widest candidate the browser can
pick from `srcset`, and compares it against the width the layout actually paints
it at. Distinguishes three cases:

- `image-upscaled` (error) — a larger rendition already exists on disk and the
  markup is pointing at a smaller one. Fixable today.
- `image-source-lowres` (warning) — the original upload is the ceiling. Only a
  better photograph fixes it.
- `image-soft` (warning) — sharp at 1x but under 2x, so soft on a retina screen.

Display widths come from a profile keyed on each element's own classes, since
only the site's CSS knows how wide a component renders. The profile distinguishes
**fluid** slots (CSS stretches the image to fill) from **intrinsic** ones (the
image keeps its own size under `max-width: 100%`) — get that wrong and every
small icon in a wide column reads as a false positive. Edit `DEFAULT_PROFILE` in
`lib/sharpness.js` for another site.

**Performance**
Oversized HTML · render-blocking scripts in `<head>` · excessive inline styles ·
images over a size threshold · a media library still entirely in JPEG/PNG

**Infrastructure**
Missing `robots.txt`, `sitemap.xml`, custom 404 or RSS feed · no analytics of any
kind installed

## Severity

- **error** — actively broken, or costing traffic today
- **warning** — will hurt reach or usability; fix soon
- **notice** — worth improving, not urgent

## Reusing it on another project

The tool has one dependency (`node-html-parser`) and no config. Copy the
`tools/webaudit` directory into any project and point it at a build output or a
URL. Two files are worth knowing about:

- `lib/checks.js` — every rule lives here. Each pushes
  `{ id, severity, page, detail, fix }`. Adding a house rule is a few lines.
- `lib/report.js` — console and HTML rendering.

Findings are grouped by rule rather than listed page by page, so a site-wide
problem reads as one item with a count rather than 300 separate lines.

## Companion script

`build/optimise-images.js` re-encodes oversized JPEG and PNG files in place —
same filenames, so no HTML changes are needed.

```bash
node build/optimise-images.js --max-width 2000 --kb 400 --dry
```

Requires `sharp`. On the METUPUK build it cut 131 MB of images to 55 MB.
