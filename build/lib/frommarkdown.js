// Markdown -> HTML, the exact inverse of tomarkdown.js.
//
// This is not a general Markdown implementation and must not become one. It
// only has to read back what tomarkdown.js writes, and that is a deliberately
// small subset: anything the exporter could not express cleanly was passed
// through as raw HTML rather than approximated. So every construct here has a
// counterpart over there, and a round trip has to return the same content it
// started with — the content check in export-content.js is what proves it.
//
// The escaping matters most. tomarkdown.js escapes the characters that would
// otherwise read as syntax; if this file does not unescape exactly the same
// set, real prose comes back peppered with backslashes.

const INLINE_ESCAPES = /\\([\\`*_[\]])/g;
const LINE_ESCAPES = /^(\s*)\\([#>+-]|\d+\.)(\s)/gm;

function unescapeText(s) {
  return s.replace(LINE_ESCAPES, '$1$2$3').replace(INLINE_ESCAPES, '$1');
}

// A line that is raw HTML rather than Markdown. The exporter emits whole
// elements for anything it could not express, so a block starting with a tag
// is passed through untouched.
const HTML_LINE = /^\s*<\/?[a-zA-Z][\w-]*(\s|\/?>)/;

// Find the next occurrence of a marker that is not itself escaped.
//
// indexOf is not good enough here. One post opens an emphasis on text that
// begins with seven literal asterisks — `<em>*******PLEASE…</em>` — which the
// exporter correctly writes as `*\*\*\*\*\*\*\*PLEASE…*`. Searching naively for
// the closing `*` lands on the first `\*`, so the emphasis closes after a lone
// backslash and the remaining asterisks spill into the page as text. A closing
// marker has to be a real marker.
function findUnescaped(text, marker, from) {
  for (let k = from; k < text.length; k++) {
    if (text[k] === '\\') { k += 1; continue; }
    if (text.startsWith(marker, k)) return k;
  }
  return -1;
}

function inline(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // An escape consumes the next character verbatim, so syntax cannot be
    // matched inside it.
    //
    // The set is both of the escaper's, not just the inline one. A heading
    // written "### 1. Awareness" is stored as "### \1. Awareness", because at
    // the point tomarkdown escaped it that "1." began a line and would have
    // been read as a numbered list. By the time it gets here the "### " has
    // been stripped, so the line-start unescape no longer matches and the
    // backslash reached the reader — five pages of the site carried a visible
    // "\1." in their text.
    //
    // Extending the set is safe because a literal backslash is itself escaped
    // on the way out: any lone backslash in stored Markdown was put there by
    // the escaper, so removing it can only restore what was written.
    if (ch === '\\' && i + 1 < text.length && /[\\`*_[\]#>+-]/.test(text[i + 1])) {
      out += text[i + 1];
      i += 2;
      continue;
    }

    // The same, for the numbered-list escape: a digit run followed by a dot.
    if (ch === '\\' && /^\d+\./.test(text.slice(i + 1))) {
      i += 1;
      continue;
    }

    // Raw HTML is passed straight through, tag and all.
    if (ch === '<') {
      const close = text.indexOf('>', i);
      if (close !== -1 && /^<\/?[a-zA-Z]/.test(text.slice(i, i + 2) + text[i + 2] || '')) {
        out += text.slice(i, close + 1);
        i = close + 1;
        continue;
      }
    }

    if (ch === '`') {
      const end = findUnescaped(text, '`', i + 1);
      if (end !== -1) {
        out += `<code>${text.slice(i + 1, end)}</code>`;
        i = end + 1;
        continue;
      }
    }

    if (text.startsWith('**', i)) {
      const end = findUnescaped(text, '**', i + 2);
      if (end !== -1) {
        out += `<strong>${inline(text.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (ch === '*') {
      const end = findUnescaped(text, '*', i + 1);
      if (end !== -1 && end > i + 1) {
        out += `<em>${inline(text.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    // ![alt](src) before [text](href), because the image marker starts with a
    // character the link rule would otherwise swallow.
    if (ch === '!' && text[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(text.slice(i));
      if (m) {
        out += `<img src="${m[2]}" alt="${m[1]}">`;
        i += m[0].length;
        continue;
      }
    }

    if (ch === '[') {
      const m = /^\[([^\]]*)\]\(([^\s)]*)(?:\s+"([^"]*)")?\)/.exec(text.slice(i));
      if (m) {
        const title = m[3] ? ` title="${m[3]}"` : '';
        out += `<a href="${m[2]}"${title}>${inline(m[1])}</a>`;
        i += m[0].length;
        continue;
      }
    }

    out += ch;
    i += 1;
  }
  return out;
}

// A hard break in the exporter's output is two trailing spaces before a
// newline. Everything else inside a paragraph is a soft wrap.
function paragraph(lines) {
  return inline(lines.join('\n')).replace(/ {2}\n/g, '<br>\n');
}

function listItems(lines, ordered, depth) {
  const marker = ordered ? /^(\s*)\d+\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/;
  const items = [];
  let current = null;

  for (const line of lines) {
    const m = marker.exec(line);
    const indent = (line.match(/^\s*/) || [''])[0].length;
    if (m && indent <= depth + 1) {
      if (current) items.push(current);
      current = { text: [m[2]], nested: [] };
    } else if (current) {
      // A deeper line belongs to the item above it: either a nested list or a
      // continuation of its text.
      if (/^\s*([-*]|\d+\.)\s/.test(line)) current.nested.push(line.replace(/^ {2}/, ''));
      else current.text.push(line.trim());
    }
  }
  if (current) items.push(current);

  return items.map((it) => {
    const nested = it.nested.length ? blocks(it.nested.join('\n')) : '';
    return `<li>${paragraph(it.text)}${nested}</li>`;
  }).join('\n');
}

function blocks(md) {
  if (!md) return '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // Fenced code.
    if (/^```/.test(line.trim())) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre>${body.join('\n')}</pre>`);
      continue;
    }

    if (/^---+\s*$/.test(line.trim())) { out.push('<hr>'); i += 1; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && (/^>\s?/.test(lines[i]) || (body.length && lines[i].trim()))) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${blocks(body.join('\n'))}</blockquote>`);
      continue;
    }

    const listStart = /^(\s*)([-*]|\d+\.)\s+/.exec(line);
    if (listStart) {
      const ordered = /\d/.test(listStart[2]);
      const body = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|```|---+\s*$)/.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>\n${listItems(body, ordered, 0)}\n</${tag}>`);
      continue;
    }

    // Raw HTML: take the whole run of lines up to a blank one, untouched. The
    // exporter emits complete elements, so this cannot split one in half.
    if (HTML_LINE.test(line)) {
      const body = [];
      while (i < lines.length && lines[i].trim()) { body.push(lines[i]); i += 1; }
      out.push(body.join('\n'));
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !HTML_LINE.test(lines[i])
      && !/^(#{1,6}\s|>|```|---+\s*$)/.test(lines[i].trim())
      && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) out.push(`<p>${paragraph(para)}</p>`);
    else { out.push(lines[i]); i += 1; }
  }

  return out.join('\n');
}

module.exports = { fromMarkdown: blocks, unescapeText };
