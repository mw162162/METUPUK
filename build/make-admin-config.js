// Write the editor's config.yml from the component registry.
//
//   node build/make-admin-config.js
//
// The component list a client sees when they press "Add section" has to match
// what the build can actually render. Keeping the two by hand meant a
// component could be offered in the editor and silently ignored at build time,
// or — the way it actually went wrong — rendered by the build and missing from
// the editor entirely.
//
// So the editor config is generated. src/admin/config.base.yml holds the parts
// that are genuinely per-site (which repo, which collections, what a page's
// own fields are) and marks two places for this to fill in:
//
//   # @components         the component definitions
//   # @component-types    the list offered inside a collection
//
// Edit the base file for site settings. Edit build/lib/components.js for
// components. Never edit the generated file — it is overwritten on every build.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { COMPONENTS } = require('./lib/components');

const BASE = path.join(__dirname, '..', 'src', 'admin', 'config.base.yml');
const OUT = path.join(__dirname, '..', 'src', 'static', 'admin', 'config.yml');

// YAML wants a quoted string, a bare boolean and a bare number. Quoting a
// boolean turns it into the string "true", which a tick box will not read back.
function scalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return JSON.stringify(String(v == null ? '' : v));
}

function fieldLines(field, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  let first = true;
  const put = (text) => {
    lines.push(first ? `${' '.repeat(indent - 2)}- ${text}` : `${pad}${text}`);
    first = false;
  };

  for (const [key, value] of Object.entries(field)) {
    if (value === undefined) continue;
    if (key === 'fields' && Array.isArray(value)) {
      put('fields:');
      for (const sub of value) lines.push(...fieldLines(sub, indent + 4));
    } else if (key === 'field' && value && typeof value === 'object') {
      put('field:');
      for (const [k, v] of Object.entries(value)) lines.push(`${pad}  ${k}: ${scalar(v)}`);
    } else if (Array.isArray(value)) {
      put(`${key}: [${value.map(scalar).join(', ')}]`);
    } else {
      put(`${key}: ${scalar(value)}`);
    }
  }
  return lines;
}

// The registry is ordered for matching — specific before general, so a
// <figure class="c-card"> is read as a card. That is a technical constraint
// and it is not the order to hand a client, who wants Text and Image at the
// top and the raw-HTML escape hatch at the bottom. menuOrder is the one that
// appears in "Add section"; the two stay in one file so a component is still
// described exactly once.
function menuOrder() {
  return COMPONENTS.slice().sort((a, b) => {
    const ai = a.menuOrder == null ? COMPONENTS.indexOf(a) + 100 : a.menuOrder;
    const bi = b.menuOrder == null ? COMPONENTS.indexOf(b) + 100 : b.menuOrder;
    return ai - bi;
  });
}

function definitions() {
  const lines = ['definitions:'];
  for (const c of menuOrder()) {
    lines.push(`  ${c.name}: &${c.name}`);
    lines.push(`    label: ${scalar(c.label)}`);
    lines.push(`    name: ${c.name}`);
    lines.push(`    summary: ${scalar(c.summary)}`);
    lines.push('    fields:');
    for (const f of c.fields) lines.push(...fieldLines(f, 8));
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '');
}

function typeList(indent) {
  const pad = ' '.repeat(indent);
  return [`${pad}types:`, ...menuOrder().map((c) => `${pad}  - *${c.name}`)].join('\n');
}

// Topics, offered as a list to pick from rather than a box to type into.
//
// They were free text, and the value stored is the slug — so a client typing
// "Research" instead of "research" did not get a warning, they got a post that
// had quietly vanished from the Research topic page. Generated from
// content/categories.yml so the list cannot drift from the real one.
function categoryField(indent) {
  const pad = ' '.repeat(indent);
  const file = path.join(__dirname, '..', 'content', 'categories.yml');
  let topics = {};
  try {
    topics = yaml.load(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    // No topic list, so no field. Better a missing field than one offering
    // nothing, which a client cannot tell apart from a broken editor.
    return `${pad}# no content/categories.yml — topics field omitted`;
  }
  const options = Object.entries(topics)
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .map(([slug, name]) => `${pad}      - { label: ${scalar(name)}, value: ${scalar(slug)} }`);
  if (!options.length) return `${pad}# content/categories.yml is empty — topics field omitted`;

  return [
    `${pad}- label: "Topics"`,
    `${pad}  name: categories`,
    `${pad}  widget: select`,
    `${pad}  multiple: true`,
    `${pad}  required: false`,
    `${pad}  hint: "Which topic pages this post appears on. Pick as many as fit."`,
    `${pad}  options:`,
    ...options,
  ].join('\n');
}

function build() {
  const base = fs.readFileSync(BASE, 'utf8');
  let filled = base.replace(/^# @components$/m, definitions());
  filled = filled.replace(/^( *)# @component-types$/gm, (_, pad) => typeList(pad.length));
  filled = filled.replace(/^( *)# @categories$/gm, (_, pad) => categoryField(pad.length));

  const header = [
    '# Generated by build/make-admin-config.js — do not edit.',
    '#',
    '# Site settings live in src/admin/config.base.yml.',
    '# Components live in build/lib/components.js, which is also where the build',
    '# gets its renderers, so the editor cannot offer a component the site cannot',
    '# render.',
    '',
  ].join('\n');

  fs.writeFileSync(OUT, header + filled);
  return COMPONENTS.length;
}

if (require.main === module) {
  const n = build();
  console.log(`admin config written — ${n} components offered`);
}

module.exports = { build };
