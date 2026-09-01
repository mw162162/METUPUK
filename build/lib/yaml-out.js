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

// The whole file: front matter and nothing else. A page's body lives in its
// sections, not below the fence, so there is no third part to write.
function contentFile(front) {
  return `---\n${yamlObject(front, 0)}\n---\n`;
}

module.exports = { contentFile, yamlObject, yamlValue, scalar };
