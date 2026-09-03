// Write a content file's front matter.
//
// Small enough to write by hand: the shapes here are strings, numbers, lists
// and plain objects. JSON's string escaping is a valid YAML double-quoted
// scalar, and anything multi-line uses a literal block so Markdown stays
// readable in the file instead of becoming one long escaped line.
//
// It lives on its own because three different tools write these files — the
// WordPress export, the site importer, and the retyping pass — and three
// writers means three slightly different files for the same content, which
// shows up as a diff nobody asked for the first time two of them touch the
// same page.
function scalar(v, indent) {
  if (v == null || v === '') return '""';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (!s.includes('\n')) return JSON.stringify(s);
  const pad = ' '.repeat(indent + 2);
  return `|-\n${s.split('\n').map((l) => (l ? pad + l : '')).join('\n')}`;
}

function yamlValue(v, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return ' []';
    return '\n' + v.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return `${pad}  - ` + yamlObject(item, indent + 4).replace(/^\s+/, '');
      }
      return `${pad}  - ${scalar(item, indent + 4)}`;
    }).join('\n');
  }
  if (v && typeof v === 'object') return '\n' + yamlObject(v, indent + 2);
  return ' ' + scalar(v, indent);
}

function yamlObject(obj, indent) {
  const pad = ' '.repeat(indent);
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${pad}${k}:${yamlValue(v, indent)}`)
    .join('\n');
}

// Which component a block is has two names, and this is the seam between them.
//
// On disk it is `_template`, because that is what Tina reads and the key is
// hardcoded in its GraphQL layer. Everywhere in this codebase it is `type`,
// because that is what a renderer, a splitter and an importer have always
// called it and renaming it in all of them would be a large change to satisfy
// a detail of one editor.
//
// So the translation happens here, at the one point where blocks become a file
// and back. Reading tolerates either spelling, which is what lets the
// migration run in any order without a broken build in between.
const BLOCK_KEY_ON_DISK = '_template';

function toDisk(front) {
  if (!front || !Array.isArray(front.sections)) return front;
  const sections = front.sections.map((b) => {
    if (!b || typeof b !== 'object' || b.type === undefined) return b;
    const out = {};
    for (const [k, v] of Object.entries(b)) {
      if (k === 'type') out[BLOCK_KEY_ON_DISK] = v;
      else out[k] = v;
    }
    return out;
  });
  return { ...front, sections };
}

function fromDisk(front) {
  if (!front || !Array.isArray(front.sections)) return front;
  const sections = front.sections.map((b) => {
    if (!b || typeof b !== 'object') return b;
    if (b[BLOCK_KEY_ON_DISK] === undefined) return b;   // already `type`
    const out = {};
    for (const [k, v] of Object.entries(b)) {
      if (k === BLOCK_KEY_ON_DISK) out.type = v;
      else out[k] = v;
    }
    return out;
  });
  return { ...front, sections };
}

// The whole file: front matter and nothing else. A page's body lives in its
// sections, not below the fence, so there is no third part to write.
function contentFile(front) {
  return `---\n${yamlObject(toDisk(front), 0)}\n---\n`;
}

module.exports = { contentFile, toDisk, fromDisk, yamlObject, yamlValue, scalar };
