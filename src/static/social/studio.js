/* METUPUK — social templates
   ---------------------------------------------------------------------------
   Draws finished posts on a canvas, at the exact pixel size each platform
   wants, from the site's own tokens.

   Canvas rather than a screenshot of styled HTML. Turning a DOM node into an
   image means serialising it into an SVG foreignObject, and a webfont does not
   survive that trip — the export comes back in Times while the preview looked
   right. Drawing directly means the pixels downloaded are the pixels shown,
   and that a 1080x1080 post is 1080x1080 rather than whatever the screen was.

   Nothing here decides what the brand looks like. Colours come from
   /social/data.json, which the build reads out of site.css; the thirty-one and
   the venues come from the same content the site is built from. Change a
   colour in the stylesheet, or add a woman to the exhibition, and this follows
   without being edited. */
(function () {
  'use strict';

  var SIZES = {
    square: { w: 1080, h: 1080, label: 'Square', note: 'Instagram and Facebook feed' },
    story:  { w: 1080, h: 1920, label: 'Story',  note: 'Instagram and Facebook stories' },
    wide:   { w: 1200, h: 675,  label: 'Wide',   note: 'X, and shared link previews' }
  };
  var TEMPLATES = {
    figure: 'The figure',
    person: 'One of the 31',
    venue:  'Venue',
    quote:  'Quote'
  };

  var canvas = document.getElementById('art');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');
  var dimsEl = document.getElementById('dims');

  var data = null;
  var images = {};
  var state = { template: 'figure', size: 'square', ground: 'plum', tag: '#BusyLivingWithMets', fields: {} };

  var DISPLAY = '"Archivo","Arial Narrow",system-ui,sans-serif';
  var BODY = '"Inter",-apple-system,"Segoe UI",sans-serif';
  /* The exhibition's duotone, copied as one string rather than reproduced as
     maths, so this and the stylesheet cannot drift apart. */
  var DUOTONE = 'grayscale(1) contrast(1.06) sepia(1) hue-rotate(276deg) saturate(1.7) brightness(0.92)';

  function tok(name, fallback) { return (data && data.tokens && data.tokens[name]) || fallback; }
  function grounds() {
    if (state.ground === 'magenta') return [tok('--magenta-600', '#b52b65'), tok('--plum-800', '#440729')];
    if (state.ground === 'deep') return [tok('--plum-950', '#1c0310'), tok('--plum-900', '#2b0519')];
    return [tok('--plum-900', '#2b0519'), tok('--plum-800', '#440729')];
  }

  function lines(g, text, maxW) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var out = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (g.measureText(next).width > maxW && line) { out.push(line); line = words[i]; }
      else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  /* Shrink until it fits the box it was given. A headline nobody can read
     because it ran off the bottom is worse than one set a size smaller. */
  function fit(g, text, maxW, maxH, weight, family, start, min, lh) {
    var size = start;
    while (size > min) {
      g.font = weight + ' ' + size + 'px ' + family;
      var ls = lines(g, text, maxW);
      if (ls.length * size * lh <= maxH) {
        return { size: size, lines: ls, lh: lh, weight: weight, family: family };
      }
      size -= Math.max(1, Math.round(size * 0.04));
    }
    g.font = weight + ' ' + min + 'px ' + family;
    return { size: min, lines: lines(g, text, maxW), lh: lh, weight: weight, family: family };
  }

  function draw(g, block, x, y, colour) {
    g.fillStyle = colour;
    g.font = block.weight + ' ' + block.size + 'px ' + block.family;
    for (var i = 0; i < block.lines.length; i++) {
      g.fillText(block.lines[i], x, y + i * block.size * block.lh);
    }
    return y + block.lines.length * block.size * block.lh;
  }

  function load(src) {
    if (!src) return Promise.resolve(null);
    if (images[src]) return Promise.resolve(images[src]);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { images[src] = img; resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /* Fill a box without squashing anybody. */
  function cover(g, img, x, y, w, h) {
    var r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    var dw = img.naturalWidth * r, dh = img.naturalHeight * r;
    g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function photo(g, img, x, y, w, h, duo) {
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    if (duo && 'filter' in g) g.filter = DUOTONE;
    cover(g, img, x, y, w, h);
    g.filter = 'none';
    g.restore();
  }

  function scrim(g, x, y, w, h, from, to) {
    var grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, from); grad.addColorStop(1, to);
    g.fillStyle = grad; g.fillRect(x, y, w, h);
  }

  /* Every post signs itself. The mark, the name, the campaign's tag — so a
     picture that ends up screenshotted and reshared still says who it is. */
  function footer(g, S, u, pad, mark) {
    var base = S.h - pad;
    var markW = 0;
    if (mark) {
      var d = Math.round(58 * u);
      g.save();
      g.beginPath(); g.arc(pad + d / 2, base - d / 2, d / 2, 0, Math.PI * 2); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.clip();
      cover(ctx, mark, pad, base - d, d, d);
      g.restore();
      markW = d + Math.round(16 * u);
    }
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.font = '900 ' + Math.round(26 * u) + 'px ' + DISPLAY;
    g.fillText('MET UP UK', pad + markW, base - Math.round(29 * u));
    g.textAlign = 'right';
    g.font = '600 ' + Math.round(21 * u) + 'px ' + BODY;
    g.fillStyle = tok('--pink-300', '#ff6fb5');
    g.fillText(state.tag, S.w - pad, base - Math.round(29 * u));
    g.textAlign = 'left';
    g.textBaseline = 'top';
  }

  /* Paint one post onto any surface. The preview is one caller; saving all
     three sizes at once is another, and a second brand would be a third. The
     size is an argument rather than read from the page, which is the whole
     reason a post can be produced at a size nobody is currently looking at. */
  function paint(g, S) {
    if (!data) return;
    /* One unit of type per size, so the same template reads the same on a
       square as on a story instead of being retuned three times. */
    var u = Math.min(S.w, S.h) / 1080;
    var pad = Math.round(Math.min(S.w, S.h) * 0.085);
    var colW = S.w - pad * 2;
    var f = state.fields;

    g.clearRect(0, 0, S.w, S.h);
    g.textBaseline = 'top'; g.textAlign = 'left';

    var ground = grounds();
    var bg = g.createLinearGradient(0, 0, S.w, S.h);
    bg.addColorStop(0, ground[0]); bg.addColorStop(1, ground[1]);
    g.fillStyle = bg; g.fillRect(0, 0, S.w, S.h);

    /* Each template keeps its own picture. One shared slot meant switching from
       a woman to a venue left her face behind the venue's name — the words said
       Liverpool Central Library over a portrait. */
    var src = state.template === 'person' ? f.personImage
      : state.template === 'venue' ? f.venueImage : '';
    var picture = images[src] || null;
    var mark = images['/brand/metupuk-logo-180.png'] || null;
    var wide = state.size === 'wide';
    var y = pad;
    /* Where the words have to stop. Every block below sizes itself against the
       space actually left rather than a fraction of the canvas: at fixed
       fractions a long sentence ran under the signature and the line beneath it
       fell off the bottom edge entirely, on the one size nobody checks because
       the preview looked fine at another. */
    var footH = Math.round(104 * u);
    var safeB = S.h - pad - footH;

    if (state.template === 'person' && picture) {
      if (wide) {
        photo(g, picture, S.w * 0.42, 0, S.w * 0.58, S.h, true);
        var side = g.createLinearGradient(0, 0, S.w, 0);
        side.addColorStop(0, ground[0]); side.addColorStop(0.6, ground[0]); side.addColorStop(1, 'rgba(43,5,25,0)');
        g.fillStyle = side; g.fillRect(0, 0, S.w, S.h);
      } else {
        var ph = Math.round(S.h * 0.68);
        photo(g, picture, 0, 0, S.w, ph, true);
        scrim(g, 0, ph - Math.round(340 * u), S.w, Math.round(340 * u), 'rgba(28,3,16,0)', ground[0]);
      }
    }

    if (state.template === 'venue' && picture) {
      photo(g, picture, 0, 0, S.w, S.h, false);
      scrim(g, 0, 0, S.w, S.h, 'rgba(28,3,16,0.5)', 'rgba(28,3,16,0.93)');
    }

    var boxW = (state.template === 'person' && wide) ? Math.round(colW * 0.5) : colW;

    if (state.template === 'figure') {
      var num = String(f.number || '31');
      g.font = '900 ' + Math.round(400 * u) + 'px ' + DISPLAY;
      y = Math.round(S.h * (state.size === 'story' ? 0.24 : wide ? 0.10 : 0.13));
      /* The figure takes the width it can, and no more than a third of the
         room between here and the signature. */
      var numSize = Math.round(Math.min(
        400 * u * Math.min(1, (colW * 0.95) / g.measureText(num).width),
        (safeB - y) * 0.42
      ));
      g.font = '900 ' + numSize + 'px ' + DISPLAY;
      g.fillStyle = tok('--pink-300', '#ff6fb5');
      g.fillText(num, pad, y);
      y += numSize * 0.97;
      g.fillStyle = tok('--magenta-500', '#d2246f');
      g.fillRect(pad, y + Math.round(16 * u), Math.round(150 * u), Math.round(10 * u));
      y += Math.round(58 * u);
      var noteRoom = f.note ? Math.round((safeB - y) * 0.34) : 0;
      y = draw(g, fit(g, f.headline, colW, safeB - y - noteRoom, '900', DISPLAY,
                   Math.round(96 * u), Math.round(30 * u), 1.06),
               pad, y, '#fff') + Math.round(24 * u);
      if (f.note) {
        draw(g, fit(g, f.note, colW, Math.max(0, safeB - y), '400', BODY,
                 Math.round(40 * u), Math.round(18 * u), 1.4),
             pad, y, tok('--pink-100', '#ffdcec'));
      }
    }

    if (state.template === 'person') {
      var top = wide ? Math.round(S.h * 0.28) : Math.round(S.h * 0.68) - Math.round(210 * u);
      var lineRoom = f.line ? Math.round((safeB - top) * 0.45) : 0;
      y = draw(g, fit(g, f.name || '', boxW, Math.max(0, safeB - top - lineRoom), '900', DISPLAY,
                   Math.round(84 * u), Math.round(34 * u), 1.05),
               pad, top, '#fff') + Math.round(18 * u);
      if (f.line) {
        draw(g, fit(g, f.line, boxW, Math.max(0, safeB - y), '400', BODY,
                 Math.round(38 * u), Math.round(18 * u), 1.42),
             pad, y, tok('--pink-100', '#ffdcec'));
      }
    }

    if (state.template === 'venue') {
      var status = (f.status || 'Showing now').toUpperCase();
      g.font = '800 ' + Math.round(24 * u) + 'px ' + DISPLAY;
      var sw = g.measureText(status).width;
      var chipH = Math.round(56 * u), px = Math.round(26 * u);
      y = Math.round(S.h * (state.size === 'story' ? 0.30 : wide ? 0.12 : 0.17));
      g.fillStyle = tok('--magenta-500', '#d2246f');
      if (g.roundRect) { g.beginPath(); g.roundRect(pad, y, sw + px * 2, chipH, chipH / 2); g.fill(); }
      else g.fillRect(pad, y, sw + px * 2, chipH);
      g.fillStyle = '#fff';
      g.textBaseline = 'middle';
      g.fillText(status, pad + px, y + chipH / 2);
      g.textBaseline = 'top';
      y += chipH + Math.round(38 * u);
      var datesRoom = Math.round(60 * u);
      var venueRoom = Math.round((safeB - y - datesRoom) * 0.34);
      y = draw(g, fit(g, f.city || '', colW, safeB - y - datesRoom - venueRoom, '900', DISPLAY,
                   Math.round(150 * u), Math.round(44 * u), 1.02),
               pad, y, '#fff') + Math.round(18 * u);
      y = draw(g, fit(g, f.venue || '', colW, Math.max(0, safeB - y - datesRoom), '600', BODY,
                   Math.round(44 * u), Math.round(20 * u), 1.3),
               pad, y, tok('--pink-100', '#ffdcec')) + Math.round(14 * u);
      g.font = '600 ' + Math.round(34 * u) + 'px ' + BODY;
      g.fillStyle = tok('--pink-300', '#ff6fb5');
      g.fillText(f.dates || '', pad, y);
    }

    if (state.template === 'quote') {
      y = Math.round(S.h * (state.size === 'story' ? 0.22 : wide ? 0.10 : 0.14));
      g.font = '900 ' + Math.round(190 * u) + 'px ' + DISPLAY;
      g.fillStyle = tok('--magenta-500', '#d2246f');
      g.fillText('“', pad - Math.round(12 * u), y - Math.round(46 * u));
      y += Math.round(105 * u);
      var whoRoom = f.who ? Math.round(70 * u) : 0;
      y = draw(g, fit(g, f.quote || '', colW, Math.max(0, safeB - y - whoRoom), '700', DISPLAY,
                   Math.round(84 * u), Math.round(26 * u), 1.2),
               pad, y, '#fff') + Math.round(32 * u);
      if (f.who) {
        g.font = '600 ' + Math.round(32 * u) + 'px ' + BODY;
        g.fillStyle = tok('--pink-300', '#ff6fb5');
        g.fillText('— ' + f.who, pad, y);
      }
    }

    footer(g, S, u, pad, mark);
    
  }

  /* Draw the post the page is showing. */
  function render() {
    var S = SIZES[state.size];
    canvas.width = S.w; canvas.height = S.h;
    paint(ctx, S);
    dimsEl.textContent = S.w + ' × ' + S.h + ' · ' + S.note;
    countWords();
  }

  /* Draw it at a size nobody is looking at. This is the point of paint taking
     its surface: one post, every shape it needs to exist in, without the
     preview flickering through them. */
  function renderTo(key) {
    var S = SIZES[key];
    var off = document.createElement('canvas');
    off.width = S.w; off.height = S.h;
    var was = state.size;
    state.size = key;
    paint(off.getContext('2d'), S);
    state.size = was;
    return off;
  }

  function saveCanvas(cv, name) {
    return new Promise(function (resolve) {
      cv.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); resolve(); }, 400);
      }, 'image/png');
    });
  }

  /* Alt text, written from the same fields as the picture.
     Not an extra: a charity posting a photograph of a woman who recorded her
     own film should say who is in it, and alt text is the half of a post that
     gets left blank because it is written separately from everything else. */
  function altText() {
    var f = state.fields;
    if (state.template === 'figure') {
      return 'The figure ' + f.number + ' in large type, over the words: ' + f.headline + '.';
    }
    if (state.template === 'person') {
      return 'A portrait of ' + (f.name || 'a woman from the exhibition')
        + ', tinted in the campaign’s pink. Beside it: ' + (f.line || '') ;
    }
    if (state.template === 'venue') {
      return 'A photograph of ' + (f.venue || 'the venue') + ' in ' + (f.city || '')
        + '. The Darker Side of Pink exhibition, ' + (f.dates || '') + '.';
    }
    return 'A quotation set in large type: “' + (f.quote || '') + '”, '
      + (f.who || 'METUPUK') + '.';
  }

  /* What each platform will actually show before it cuts the caption off. */
  var LIMITS = { square: 125, story: 125, wide: 280 };
  function countWords() {
    var el = document.getElementById('caption-count');
    if (!el) return;
    var n = caption().length;
    var lim = LIMITS[state.size] || 280;
    el.textContent = n + ' characters · ' + (n <= lim
      ? 'shows in full'
      : 'cut off after about ' + lim + ' on this platform');
    el.className = 'note' + (n > lim ? ' warn' : '');
  }

  /* --- Controls ------------------------------------------------------------- */

  function chips(host, entries, current, pick) {
    host.innerHTML = '';
    entries.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = e.label;
      b.setAttribute('aria-pressed', String(e.key === current));
      b.addEventListener('click', function () { pick(e.key); });
      host.appendChild(b);
    });
  }
  function entriesOf(obj, labelOf) {
    return Object.keys(obj).map(function (k) { return { key: k, label: labelOf(k) }; });
  }
  function paintTemplates() {
    chips(document.getElementById('templates'),
      entriesOf(TEMPLATES, function (k) { return TEMPLATES[k]; }),
      state.template, chooseTemplate);
  }
  function paintSizes() {
    chips(document.getElementById('sizes'),
      entriesOf(SIZES, function (k) { return SIZES[k].label; }),
      state.size, chooseSize);
  }
  function chooseTemplate(k) {
    state.template = k; paintTemplates(); buildFields();
    var want = k === 'person' ? state.fields.personImage
      : k === 'venue' ? state.fields.venueImage : '';
    load(want).then(render);
  }
  function chooseSize(k) { state.size = k; paintSizes(); render(); }

  function field(host, id, label, value, type, options) {
    var l = document.createElement('label'); l.htmlFor = id; l.textContent = label;
    var el;
    if (type === 'select') {
      el = document.createElement('select');
      options.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.value; op.textContent = o.label; el.appendChild(op);
      });
    } else if (type === 'textarea') { el = document.createElement('textarea'); }
    else { el = document.createElement('input'); el.type = 'text'; }
    el.id = id;
    el.value = value == null ? '' : value;
    host.appendChild(l); host.appendChild(el);
    return el;
  }
  function bind(el, key) {
    var go = function () { state.fields[key] = el.value; render(); };
    el.addEventListener('input', go);
    el.addEventListener('change', go);
    return el;
  }

  function buildFields() {
    var host = document.getElementById('fields');
    host.innerHTML = '<legend>Words</legend>';
    var f = state.fields;

    if (state.template === 'figure') {
      bind(field(host, 'f-number', 'Figure', f.number, 'text'), 'number');
      bind(field(host, 'f-headline', 'Sentence', f.headline, 'textarea'), 'headline');
      bind(field(host, 'f-note', 'Smaller line (optional)', f.note, 'textarea'), 'note');
    }

    if (state.template === 'person') {
      var sel = field(host, 'f-person', 'Who', f.personImage, 'select',
        data.people.map(function (p) { return { value: p.image, label: p.name }; }));
      var nameEl = bind(field(host, 'f-name', 'Name', f.name, 'text'), 'name');
      bind(field(host, 'f-line', 'Her line', f.line, 'textarea'), 'line');
      sel.addEventListener('change', function () {
        var p = data.people.filter(function (x) { return x.image === sel.value; })[0];
        state.fields.personImage = sel.value;
        if (p) { state.fields.name = p.name; nameEl.value = p.name; }
        load(sel.value).then(render);
      });
    }

    if (state.template === 'venue') {
      var vsel = field(host, 'f-venue-pick', 'Venue', '0', 'select',
        data.venues.map(function (v, i) {
          return { value: String(i), label: v.city + ' — ' + v.venue };
        }));
      var st = bind(field(host, 'f-status', 'Status', f.status, 'text'), 'status');
      var ci = bind(field(host, 'f-city', 'City', f.city, 'text'), 'city');
      var ve = bind(field(host, 'f-venue', 'Venue', f.venue, 'text'), 'venue');
      var da = bind(field(host, 'f-dates', 'Dates', f.dates, 'text'), 'dates');
      vsel.addEventListener('change', function () {
        var v = data.venues[+vsel.value];
        if (!v) return;
        state.fields.city = v.city; state.fields.venue = v.venue; state.fields.dates = v.dates;
        state.fields.status = v.status === 'current' ? 'Showing now'
          : v.status === 'coming' ? 'Coming soon' : 'Finished';
        state.fields.venueImage = v.image || '';
        ci.value = v.city; ve.value = v.venue; da.value = v.dates; st.value = state.fields.status;
        load(state.fields.venueImage).then(render);
      });
    }

    if (state.template === 'quote') {
      bind(field(host, 'f-quote', 'Quote', f.quote, 'textarea'), 'quote');
      bind(field(host, 'f-who', 'Who said it', f.who, 'text'), 'who');
    }
  }

  /* Opening values that are already a usable post, so the first thing anybody
     sees is the thing working rather than an empty form. */
  function defaults() {
    var v = data.venues.filter(function (x) { return x.status === 'current'; })[0] || data.venues[0] || {};
    var p = data.people[0] || {};
    state.fields = {
      number: '31',
      headline: 'women in the UK die every day from metastatic breast cancer',
      note: 'It is the biggest cancer killer of women under 50.',
      name: p.name || '', personImage: p.image || '',
      venueImage: v.image || '',
      line: 'She recorded her own film for the exhibition.',
      city: v.city || '', venue: v.venue || '', dates: v.dates || '',
      status: v.status === 'current' ? 'Showing now' : 'Coming soon',
      quote: 'Give us a chance to live and don’t write us off.',
      who: 'METUPUK'
    };
  }

  /* The words that go with the picture. A post is both, and the caption is the
     half that usually gets retyped from memory and drifts. */
  function caption() {
    var f = state.fields, site = (data && data.site) || 'metupuk.org.uk';
    var body =
      state.template === 'figure' ? f.number + ' ' + f.headline + (f.note ? ' ' + f.note : '') :
      state.template === 'person' ? f.name + ' — ' + f.line :
      state.template === 'venue' ? 'The Darker Side of Pink is in ' + f.city
        + ' — ' + f.venue + ', ' + f.dates + '.' :
      '“' + f.quote + '” — ' + f.who;
    return body + '\n\n' + site + '\n' + state.tag;
  }

  function say(msg) {
    statusEl.textContent = msg;
    window.setTimeout(function () { statusEl.innerHTML = '&nbsp;'; }, 2600);
  }

  function filename() {
    var f = state.fields;
    var stem = state.template === 'person' ? (f.name || 'portrait')
      : state.template === 'venue' ? (f.city || 'venue')
      : state.template === 'quote' ? 'quote' : 'the-figure';
    return 'metupuk-' + stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + state.size + '.png';
  }

  function start() {
    paintTemplates();
    paintSizes();

    var tagSel = document.getElementById('tag');
    data.tags.forEach(function (t) {
      var o = document.createElement('option'); o.value = t; o.textContent = t; tagSel.appendChild(o);
    });
    tagSel.value = state.tag;
    tagSel.addEventListener('change', function () { state.tag = tagSel.value; render(); });

    document.getElementById('ground').addEventListener('change', function (e) {
      state.ground = e.target.value; render();
    });

    document.getElementById('download').addEventListener('click', function () {
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename();
        document.body.appendChild(a); a.click(); a.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        say('Saved ' + filename());
      }, 'image/png');
    });

    document.getElementById('copy').addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(caption()).then(function () { say('Caption copied'); });
      } else {
        say('Copy is not available in this browser');
      }
    });

    document.getElementById('copy-alt').addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(altText()).then(function () { say('Alt text copied'); });
      } else {
        say('Copy is not available in this browser');
      }
    });

    /* Every shape at once. A volunteer posting the same thing to the feed, to
       stories and to X should not have to find this page three times. */
    document.getElementById('download-all').addEventListener('click', async function () {
      var keys = Object.keys(SIZES);
      say('Saving ' + keys.length + ' sizes…');
      for (var i = 0; i < keys.length; i++) {
        var was = state.size;
        state.size = keys[i];
        var name = filename();
        state.size = was;
        await saveCanvas(renderTo(keys[i]), name);
      }
      say('Saved all ' + keys.length);
    });

    /* Any photograph, not only the ones the site already has. */
    var picker = document.getElementById('own-image');
    if (picker) {
      picker.addEventListener('change', function () {
        var file = picker.files && picker.files[0];
        if (!file) return;
        var url = URL.createObjectURL(file);
        var key = state.template === 'venue' ? 'venueImage' : 'personImage';
        load(url).then(function (img) {
          if (!img) { say('That file could not be read as a picture'); return; }
          state.fields[key] = url;
          render();
          say('Using your picture');
        });
      });
    }

    buildFields();
    Promise.all([
      load(state.fields.personImage),
      load(state.fields.venueImage),
      load('/brand/metupuk-logo-180.png')
    ]).then(render);
  }

  fetch('/social/data.json').then(function (r) { return r.json(); }).then(function (d) {
    data = d;
    defaults();
    /* Webfonts must be in memory before anything is drawn: canvas does not wait
       for them, it draws in whatever it has, and the export is quietly in the
       wrong typeface while the page around it looks right. */
    var need = ['900 100px Archivo', '700 60px Archivo', '800 30px Archivo',
                '600 30px Inter', '400 40px Inter'];
    return (document.fonts
      ? Promise.all(need.map(function (n) { return document.fonts.load(n); }))
      : Promise.resolve()).then(start);
  }).catch(function () {
    statusEl.textContent = 'Could not load /social/data.json — run the build first.';
  });
}());
