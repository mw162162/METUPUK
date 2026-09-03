// Write tina/config.ts from the component registry.
//
//   node build/make-tina-config.js
//
// The same rule as the Sveltia config: a component is described once, in
// build/lib/components.js, and every place that needs to know about it is
// generated from there. Hand-writing a second schema is how an editor comes to
// offer a component the site cannot render.
//
// Two decisions in here are worth knowing about, because they are not the
// obvious ones.
//
// Markdown bodies are plain strings with a textarea, not Tina's rich-text.
// rich-text parses Markdown into an MDX tree and writes it back out from that
// tree — and this content is not clean Markdown. It has raw <img> tags inside
// prose, HTML entities WordPress left behind, and escaping conventions of our
// own. Sveltia's rich-text editor did exactly this and turned a bold sentence
// on /about-metupuk/ into literal asterisks; Tina's would have more to
// misunderstand, not less. A textarea cannot corrupt what it does not parse.
//
// And the block key is Tina's, not ours. Tina stores which template a block is
// under `_template`, hardcoded in its GraphQL layer, where these files have
// always used `type`. That is 895 blocks across 300 files to migrate — see
// build/migrate-block-key.js, which does it and checks nothing was lost.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { COMPONENTS } = require('./lib/components');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(ROOT, 'src', 'admin', 'config.base.yml');
const OUT = path.join(ROOT, 'tina', 'config.ts');

const q = (v) => JSON.stringify(v);

// One editor's field vocabulary into another's. Anything without a mapping is
// reported rather than guessed at, because a field that silently becomes a
// plain string is a field that quietly loses its options.
function toTinaField(f, indent = 6) {
  const pad = ' '.repeat(indent);
  const out = [];
  const name = f.name;
  const label = f.label || name;
  const req = f.required === false ? false : undefined;

  const common = (type, extra = []) => {
    out.push(`${pad}{`);
    out.push(`${pad}  type: ${q(type)},`);
    out.push(`${pad}  name: ${q(name)},`);
    out.push(`${pad}  label: ${q(label)},`);
    if (f.hint) out.push(`${pad}  description: ${q(f.hint)},`);
    extra.forEach((line) => out.push(`${pad}  ${line}`));
    out.push(`${pad}},`);
  };

  switch (f.widget) {
    case 'string':
      common('string');
      break;
    case 'text':
      common('string', ['ui: { component: "textarea" },']);
      break;
    case 'markdown':
      // See the note at the top: a textarea, deliberately.
      common('string', ['ui: { component: "textarea" },']);
      break;
    case 'number':
      common('number');
      break;
    case 'boolean':
      common('boolean');
      break;
    case 'image':
      common('image');
      break;
    case 'file':
      common('image');
      break;
    case 'datetime':
      common('datetime');
      break;
    case 'code':
      common('string', ['ui: { component: "textarea" },']);
      break;
    case 'select': {
      const options = (f.options || []).map((o) => (typeof o === 'string' ? q(o) : q(o.value)));
      common('string', [
        f.multiple ? 'list: true,' : '',
        `options: [${options.join(', ')}],`,
      ].filter(Boolean));
      break;
    }
    case 'list': {
      const sub = f.fields || (f.field ? [f.field] : []);
      out.push(`${pad}{`);
      out.push(`${pad}  type: "object",`);
      out.push(`${pad}  name: ${q(name)},`);
      out.push(`${pad}  label: ${q(label)},`);
      out.push(`${pad}  list: true,`);
      if (f.hint) out.push(`${pad}  description: ${q(f.hint)},`);
      out.push(`${pad}  fields: [`);
      sub.forEach((s) => out.push(...toTinaField(s, indent + 4)));
      out.push(`${pad}  ],`);
      out.push(`${pad}},`);
      break;
    }
    default:
      console.warn(`  ! no Tina equivalent for widget "${f.widget}" on field "${name}" — written as a string`);
      common('string');
  }
  return out;
}

function templates() {
  const out = [];
  for (const c of COMPONENTS) {
    out.push('        {');
    out.push(`          name: ${q(c.name)},`);
    out.push(`          label: ${q(c.label)},`);
    out.push('          fields: [');
    c.fields.forEach((f) => out.push(...toTinaField(f, 12)));
    out.push('          ],');
    out.push('        },');
  }
  return out.join('\n');
}

// The page and post fields are stated once, in config.base.yml, and both
// editors are built from them. Only the sections list differs, because that is
// where each editor spells blocks its own way.
function collectionFields(collectionName) {
  const doc = yaml.load(fs.readFileSync(BASE, 'utf8'));
  const collection = (doc.collections || []).find((c) => c.name === collectionName);
  if (!collection) throw new Error(`no "${collectionName}" collection in config.base.yml`);

  const out = [];
  for (const f of collection.fields) {
    if (f.name === 'sections') {
      out.push('      {');
      out.push('        type: "object",');
      out.push('        name: "sections",');
      out.push('        label: "Sections",');
      out.push('        list: true,');
      out.push('        templates: [');
      out.push(templates());
      out.push('        ],');
      out.push('      },');
      continue;
    }
    out.push(...toTinaField(f, 6));
  }
  return out.join('\n');
}

function build() {
  const src = [
    '// Generated by build/make-tina-config.js — do not edit.',
    '//',
    '// Components come from build/lib/components.js, which is also where the',
    '// build gets its renderers. Page and post fields come from',
    '// src/admin/config.base.yml. Change either of those and run the generator.',
    'import { defineConfig } from "tinacms";',
    '',
    'export default defineConfig({',
    '  branch: process.env.TINA_BRANCH || "main",',
    '  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID || null,',
    '  token: process.env.TINA_TOKEN || null,',
    '  build: {',
    '    outputFolder: "admin",',
    '    publicFolder: "dist",',
    '  },',
    '  media: {',
    '    tina: {',
    '      // Tina stores at <publicFolder>/<mediaRoot> and references',
    '      // /<mediaRoot>/..., which is exactly where this site already keeps',
    '      // its pictures — so no path rewriting is needed anywhere.',
    '      mediaRoot: "media",',
    '      publicFolder: ".",',
    '    },',
    '  },',
    '  schema: {',
    '    collections: [',
    '      {',
    '        name: "pages",',
    '        label: "Pages",',
    '        path: "content/pages",',
    '        format: "md",',
    '        fields: [',
    collectionFields('pages'),
    '        ],',
    '      },',
    '      {',
    '        name: "posts",',
    '        label: "News and blog",',
    '        path: "content/posts",',
    '        format: "md",',
    '        fields: [',
    collectionFields('posts'),
    '        ],',
    '      },',
    '    ],',
    '  },',
    '});',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, src);
  return COMPONENTS.length;
}

if (require.main === module) {
  const n = build();
  console.log(`tina/config.ts written — ${n} block templates`);
}

module.exports = { build };
