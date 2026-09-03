/* METUPUK — progressive enhancement only. Every page works with JS disabled. */
(function () {
  'use strict';

  /* --- Theme ------------------------------------------------------------- */
  var root = document.documentElement;
  var STORE = 'metupuk-theme';

  function applyTheme(value) {
    if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value);
    else root.removeAttribute('data-theme');
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      var dark = value === 'dark' || (!value && window.matchMedia('(prefers-color-scheme: dark)').matches);
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    }
  }

  var stored = null;
  try { stored = localStorage.getItem(STORE); } catch (e) { /* private mode */ }
  applyTheme(stored);

  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-theme-toggle]');
    if (!toggle) return;
    var dark = root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORE, next); } catch (e2) { /* ignore */ }
  });

  /* --- Desktop dropdown navigation --------------------------------------- */
  var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav__item--has-panel'));

  function closeAllPanels(except) {
    navItems.forEach(function (item) {
      if (item === except) return;
      item.setAttribute('data-open', 'false');
      var t = item.querySelector('.nav__disc');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }

  navItems.forEach(function (item) {
    var toggle = item.querySelector('.nav__disc');
    if (!toggle) return;
    // The chevron is the only thing that opens the panel. The label beside it
    // is an ordinary link, so the section's own page stays one click away.
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      var open = item.getAttribute('data-open') === 'true';
      closeAllPanels(item);
      item.setAttribute('data-open', open ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    item.addEventListener('mouseenter', function () {
      if (window.matchMedia('(hover: hover)').matches) { closeAllPanels(item); item.setAttribute('data-open', 'true'); toggle.setAttribute('aria-expanded', 'true'); }
    });
    item.addEventListener('mouseleave', function () {
      if (window.matchMedia('(hover: hover)').matches) { item.setAttribute('data-open', 'false'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav__item--has-panel')) closeAllPanels(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllPanels(null);
  });

  /* --- Mobile drawer ------------------------------------------------------ */
  var drawer = document.getElementById('site-drawer');
  var drawerOpen = document.querySelector('[data-drawer-open]');
  var drawerClose = document.querySelector('[data-drawer-close]');
  var lastFocus = null;

  function setDrawer(open) {
    if (!drawer) return;
    drawer.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (drawerOpen) drawerOpen.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      lastFocus = document.activeElement;
      var first = drawer.querySelector('button, a');
      if (first) first.focus();
    } else if (lastFocus) {
      lastFocus.focus();
    }
  }

  if (drawerOpen) drawerOpen.addEventListener('click', function () { setDrawer(true); });
  if (drawerClose) drawerClose.addEventListener('click', function () { setDrawer(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer && !drawer.hidden) setDrawer(false);
  });

  var moveMarker = setUpTocMarker();

  /* --- Table of contents: highlight the section in view ------------------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var targets = tocLinks
      .map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); })
      .filter(Boolean);
    // Which section is being read is "the last heading scrolled past", not
    // "a heading inside a narrow band". The band version left nothing
    // highlighted whenever a section was longer than the band, so the marker
    // blinked out mid-section and reappeared at the next one. There is always
    // exactly one current entry now, so the marker only ever travels.
    // Which entries are being read, plural. The old version picked "the last
    // heading scrolled past", which is only meaningful in a linear document.
    // On a page laid out as a grid, three portraits sit side by side at the
    // same height, so three headings are passed at the same instant and it
    // highlighted whichever happened to come last in the markup. It looked
    // simply wrong: a name lit up that was not the one you were looking at.
    //
    // So it marks everything actually on screen. On a grid that is the row in
    // front of you; in an article it is usually one section.
    function visibleTargets() {
      var header = document.querySelector('.site-header');
      var top = (header ? header.offsetHeight : 0) + 16;
      var bottom = window.innerHeight * 0.9;
      var seen = targets.filter(function (t) {
        var r = t.getBoundingClientRect();
        return r.bottom > top && r.top < bottom;
      });
      if (seen.length) return seen;
      // Between two sections nothing qualifies, so hold the last one passed
      // rather than clearing: the rail should never go blank mid-read.
      var last = targets[0];
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].getBoundingClientRect().top <= top) last = targets[i];
        else break;
      }
      return last ? [last] : [];
    }

    var activeKey = null;
    function syncToc() {
      var ids = visibleTargets().map(function (t) { return t.id; });
      var key = ids.join('|');
      // Reading the marker's position forces a layout. That is worth doing
      // when the answer changes and wasteful on every other frame.
      if (key === activeKey) return;
      activeKey = key;

      var current = [];
      tocLinks.forEach(function (a) {
        var id = decodeURIComponent(a.hash.slice(1));
        if (ids.indexOf(id) >= 0) current.push(a);
      });

      tocLinks.forEach(function (a) {
        a.classList.toggle('is-reading', current.indexOf(a) >= 0);
        a.removeAttribute('aria-current');
      });
      // aria-current names one location, so only the first carries it while
      // the class shows the reader the whole group.
      if (current[0]) current[0].setAttribute('aria-current', 'true');
      moveMarker(current);
    }

    // Coalesced into one frame: the handler only reads positions and sets a
    // class, and the marker's own CSS transition does the moving, so nothing
    // here runs per-frame animation work.
    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; syncToc(); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    syncToc();
  }

  /* --- Table of contents: the marker that travels between entries --------- */
  function setUpTocMarker() {
    var list = document.querySelector('.toc ol');
    if (!list) return function () {};
    var marker = document.createElement('span');
    marker.className = 'toc__marker';
    marker.setAttribute('data-init', 'false');
    marker.setAttribute('aria-hidden', 'true');
    list.appendChild(marker);

    var last = null;
    function place(group) {
      var reading = Array.isArray(group) ? group.filter(Boolean) : (group ? [group] : []);
      if (reading.length) last = reading;
      var shown = reading.length ? reading : last;
      if (!shown || !shown.length) return;

      // The bar covers everything on screen, so a row of three portraits gets
      // one continuous mark rather than a single name picked out of three.
      var first = shown[0];
      var final = shown[shown.length - 1];
      var top = first.offsetTop;
      var height = Math.max(1, (final.offsetTop + final.offsetHeight) - top);
      marker.style.opacity = reading.length ? '1' : '0';
      marker.style.transform = 'translateY(' + top + 'px) scaleY(' + height + ')';

      // The rail can be taller than its own box, so what is being read has to
      // be brought into view or the marker travels somewhere nobody can see.
      // Scrolling the list directly, rather than scrollIntoView, keeps the page
      // itself exactly where the reader put it.
      var box = list.getBoundingClientRect();
      var a1 = first.getBoundingClientRect();
      var a2 = final.getBoundingClientRect();
      if (a1.top < box.top || a2.bottom > box.bottom) {
        var mid = top + height / 2;
        var to = mid - list.clientHeight / 2;
        var smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (list.scrollTo) list.scrollTo({ top: to, behavior: smooth ? 'smooth' : 'auto' });
        else list.scrollTop = to;
      }

      if (marker.getAttribute('data-init') === 'false') {
        // Commit the first position, then let later moves animate.
        void marker.offsetHeight;
        marker.setAttribute('data-init', 'true');
      }
    }
    // Entries reflow when the column narrows, so the marker is re-measured.
    var pending;
    window.addEventListener('resize', function () {
      clearTimeout(pending);
      pending = setTimeout(function () { place(null); }, 150);
    });
    return place;
  }


  /* --- The strip behind the social marks ---------------------------------- */
  /* One custom property on the rail, four small backgrounds moved by it, in
     the same coalesced frame as everything else that reads the scroll. */
  (function () {
    var rail = document.querySelector('.social-rail');
    if (!rail || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var icons = Array.prototype.slice.call(rail.querySelectorAll('.social-rail__icon'));
    if (!icons.length) return;

    // Each mark is a window onto ONE piece of artwork, not four copies of the
    // same slice. Offsetting every icon by its own position in the rail is what
    // makes the strip continuous: without it all four showed the same fragment
    // at the same moment, which reads as a repeated logo rather than as
    // something you are moving across.
    // Re-measured on resize: the mark shrinks at 1280px, so offsets taken once
    // at load had every icon reading the wrong slice after crossing it.
    var offsets = [];
    function measure() {
      var top = icons[0].getBoundingClientRect().top;
      offsets = icons.map(function (el) {
        return Math.round(el.getBoundingClientRect().top - top);
      });
    }

    // The artwork tile is 72 x 1900 and is drawn to the width of the mark, so
    // its height on screen scales with it. Offsets wrap within one tile: the
    // strip repeats, so travelling further than that shows the same thing while
    // pushing a finite layer out of the circle.
    var TILE_W = 72, TILE_H = 1900;
    function tileHeight() {
      var w = icons[0].getBoundingClientRect().width || TILE_W;
      return TILE_H * (w / TILE_W);
    }
    var tile = TILE_H;

    var queued = false;
    function paint() {
      var y = window.scrollY * 0.35;
      for (var i = 0; i < icons.length; i++) {
        // A transform on the artwork layer, not the icon's background position.
        // background-position cannot be composited, so the old version repainted
        // four SVG backgrounds on every frame of every scroll.
        var offset = (y + offsets[i]) % tile;
        icons[i].style.setProperty('--art-y', (-offset).toFixed(1) + 'px');
      }
    }
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; paint(); });
    }
    measure();
    tile = tileHeight();
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    var remeasure;
    window.addEventListener('resize', function () {
      clearTimeout(remeasure);
      remeasure = setTimeout(function () { measure(); tile = tileHeight(); paint(); }, 150);
    }, { passive: true });
  })();

  /* --- How far through the page you are ---------------------------------- */
  /* Only on pages long enough for the question to arise. The bar is a scaled
     transform, so it costs no layout, and it reuses the frame the header and
     the contents rail already share rather than opening a third listener. */
  (function () {
    var article = document.querySelector('main .prose');
    if (!article) return;
    var doc = document.documentElement;
    if (doc.scrollHeight < window.innerHeight * 2.5) return;

    var bar = document.createElement('div');
    bar.className = 'read-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    // The bar tracks the article, not the document. Measured against the whole
    // page it was still climbing through the footer, where it read as a stray
    // rule across the top of it rather than as progress through anything.
    var footer = document.querySelector('.site-footer');
    var queued = false;
    function paint() {
      var end = (footer ? footer.offsetTop : doc.scrollHeight) - window.innerHeight;
      var pct = end > 0 ? Math.min(1, Math.max(0, window.scrollY / end)) : 0;
      bar.style.transform = 'scaleX(' + pct.toFixed(4) + ')';
      // Once the reading is behind you, the bar has nothing left to say.
      bar.style.opacity = pct >= 1 ? '0' : '1';
    }
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; paint(); });
    }
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  })();

  /* --- Site search -------------------------------------------------------- */
  var dialog = document.getElementById('search-dialog');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var index = null;
  var indexPromise = null;

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(root.dataset.base + 'search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { index = data; return data; })
      .catch(function () { index = []; return []; });
    return indexPromise;
  }

  function openSearch() {
    if (!dialog) return;
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    loadIndex();
    if (input) { input.value = ''; input.focus(); }
    render('');
  }

  function closeSearch() {
    if (!dialog) return;
    dialog.hidden = true;
    document.body.style.overflow = '';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function score(doc, terms) {
    var title = doc.t.toLowerCase();
    var body = doc.b.toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var inTitle = title.indexOf(term);
      var inBody = body.indexOf(term);
      if (inTitle < 0 && inBody < 0) return 0;
      if (inTitle === 0) total += 60;
      else if (inTitle > 0) total += 30;
      if (inBody >= 0) total += 6;
    }
    return total;
  }

  function snippet(doc, terms) {
    var body = doc.b;
    var lower = body.toLowerCase();
    var at = -1;
    for (var i = 0; i < terms.length && at < 0; i++) at = lower.indexOf(terms[i]);
    if (at < 0) at = 0;
    var start = Math.max(0, at - 60);
    var text = (start > 0 ? '…' : '') + body.slice(start, start + 190).trim() + '…';
    var out = escapeHtml(text);
    terms.forEach(function (t) {
      if (!t) return;
      out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return out;
  }

  function render(query) {
    if (!results) return;
    var q = query.trim().toLowerCase();
    if (!q) {
      results.innerHTML = '<li class="search-empty">Type to search every page and article on the site.</li>';
      return;
    }
    if (!index) {
      results.innerHTML = '<li class="search-empty">Loading…</li>';
      loadIndex().then(function () { render(query); });
      return;
    }
    var terms = q.split(/\s+/).filter(Boolean);
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var s = score(index[i], terms);
      if (s > 0) hits.push({ doc: index[i], s: s });
    }
    hits.sort(function (a, b) { return b.s - a.s; });
    if (!hits.length) {
      results.innerHTML = '<li class="search-empty">No matches for “' + escapeHtml(query) + '”.</li>';
      return;
    }
    results.innerHTML = hits.slice(0, 30).map(function (h) {
      return '<li><a href="' + h.doc.u + '">' +
        '<span class="r-kind">' + escapeHtml(h.doc.k) + '</span>' +
        '<span class="r-title">' + escapeHtml(h.doc.t) + '</span>' +
        '<span class="r-snip">' + snippet(h.doc, terms) + '</span>' +
        '</a></li>';
    }).join('');
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-search-open]')) { e.preventDefault(); openSearch(); return; }
    if (e.target.closest('[data-search-close]')) { closeSearch(); return; }
    if (dialog && !dialog.hidden && e.target === dialog) closeSearch();
  });

  if (input) {
    var timer;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(input.value); }, 120);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        var first = results && results.querySelector('a');
        if (first) first.focus();
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog && !dialog.hidden) { closeSearch(); return; }
    if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      openSearch();
    }
  });

  /* --- Header gains a border once the page has scrolled ------------------- */
  var header = document.querySelector('.site-header');
  if (header) {
    // No injected sentinel element — an extra node at the top of <body> is one
    // more thing that can paint a stray hairline. The scroll position is the
    // only fact needed here.
    var stuck = null;
    var setStuck = function () {
      var now = window.scrollY > 4;
      if (now === stuck) return;
      stuck = now;
      header.classList.toggle('is-stuck', now);
    };
    // Coalesced into one frame, like the contents rail below. A scroll can fire
    // far more often than the screen refreshes; there is no reason to answer
    // the same question twice between two paints.
    var stuckQueued = false;
    var onStuckScroll = function () {
      if (stuckQueued) return;
      stuckQueued = true;
      requestAnimationFrame(function () { stuckQueued = false; setStuck(); });
    };
    setStuck();
    window.addEventListener('scroll', onStuckScroll, { passive: true });
  }

  /* --- Sections settle in as they come into view -------------------------- */
  /* Opt in only when the browser can do it properly; otherwise content is
     visible from the start, which is the correct fallback. */
  if ('IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // The homepage had this and no other page did, which is why every article
    // read as a static wall. What settles in is the visual events only -- a
    // picture, an embed, a quotation, a grid. Running text is deliberately left
    // alone: prose that fades in as you reach it is slower to read, not more
    // engaging, and this is a site people read while they are unwell.
    var blocks = document.querySelectorAll([
      'main .section > .wrap > *', 'main .hero__copy', 'main .hero__stat',
      'main .card', 'main .portrait', 'main .route',
      'main .act',
      'main .prose > figure', 'main .prose > .c-embed', 'main .prose > blockquote',
      'main .prose > .prose-grid', 'main .prose > .c-card', 'main .prose > .c-gallery',
      'main .prose > .c-video', 'main .prose > .c-buttons',
      'main .prose > p:has(> img)',
      // The cells, not the grid around them. A grid is one element, so
      // observing it revealed 59 profiles the instant its top edge appeared
      // and the whole nine screens below were already showing by the time they
      // were reached. Watching each card means they arrive in front of the
      // reader, a row at a time.
      'main .profile', 'main .tmm_member', 'main .story',
    ].join(', '));
    if (blocks.length) {
      root.classList.add('js-reveal');
      // The cascade is worked out per batch, not from the position in the
      // markup. Capping a DOM index meant the first row of a grid cascaded
      // 0/80/160ms and every row after it sat at the cap, so three cards landed
      // together on every row but the first. Whatever crosses in the same
      // frame is what gets staggered, which is right for any column count and
      // for a single column too.
      var revealObserver = new IntersectionObserver(function (entries, obs) {
        var arriving = entries.filter(function (en) { return en.isIntersecting; });
        if (!arriving.length) return;
        // Reading order: down the page, then across it.
        arriving.sort(function (a, b) {
          var ra = a.boundingClientRect, rb = b.boundingClientRect;
          return (ra.top - rb.top) || (ra.left - rb.left);
        });
        arriving.forEach(function (en, i) {
          // 70ms apart, four deep. Past that a cascade stops reading as one
          // movement and starts reading as a queue.
          en.target.style.setProperty('--reveal-delay', Math.min(i, 3) * 70 + 'ms');
          en.target.classList.add('is-visible');
          obs.unobserve(en.target);
        });
      }, {
        // Start a little before the block is reached, so it has settled by the
        // time it is actually being looked at rather than moving under the eye.
        rootMargin: '0px 0px -4% 0px',
        threshold: 0.01,
      });

      Array.prototype.forEach.call(blocks, function (el) {
        el.setAttribute('data-reveal', '');
        revealObserver.observe(el);
      });

      // Anything already on screen at load should not fade in.
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(blocks, function (el) {
          if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
            el.classList.add('is-visible');
          }
        });
      });

      // Safety net: content must never stay hidden because an observer did not
      // fire. If anything is still un-revealed after a few seconds, show it.
      window.setTimeout(function () {
        Array.prototype.forEach.call(blocks, function (el) {
          el.classList.add('is-visible');
        });
      }, 4000);
    }
  }

  /* --- The hero figure counts up ------------------------------------------
     Purely decorative: the number is already in the HTML, so it is correct
     before, during and after this runs, and for anyone without JavaScript. */
  var counter = document.querySelector('[data-count-to]');
  if (counter && 'IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var target = parseInt(counter.getAttribute('data-count-to'), 10);
    if (target > 0) {
      new IntersectionObserver(function (entries, obs) {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();

        // Every number is held a constant fraction less than the one before, so
        // the count keeps accelerating the whole way instead of reaching a
        // speed and staying there.
        //
        // Halving was too violent for that. It hit the floor by the fifth
        // number, which left twenty-six of the thirty-one running at one flat
        // speed: the opening read as deliberate and everything after it read as
        // having been let go of. A gentler ratio spends the drama across the
        // whole count.
        //
        //   1    2    3    5    10   20   31
        //   460  408  363  286  158  48   26ms
        //
        // OPENING and TOTAL are the two knobs worth touching. The ratio between
        // beats is solved from them, so changing the opening beat does not
        // silently stretch the whole thing to a different length.
        var OPENING = 460;   // ms held on the first number
        var TOTAL = 4000;    // ms to reach the target, near enough
        var FLOOR = 26;      // at least one frame each, so no number is skipped

        // Solve r in TOTAL = OPENING * (1 + r + r^2 + ... + r^(n-1)). The sum
        // rises monotonically with r, so bisection converges; it runs once, on
        // a number under a hundred, and forty passes is far more than enough.
        var n = target;
        var lo = 0.5;
        var hi = 0.999;
        var r = 0.888;
        for (var p = 0; p < 40; p++) {
          r = (lo + hi) / 2;
          if (OPENING * (1 - Math.pow(r, n)) / (1 - r) < TOTAL) lo = r;
          else hi = r;
        }

        var schedule = [];
        var elapsed = 0;
        for (var k = 0; k < n; k++) {
          elapsed += Math.max(FLOOR, OPENING * Math.pow(r, k));
          schedule.push(elapsed);
        }

        var card = counter.closest ? counter.closest('.hero__stat') : null;
        var start = null;
        var shown = 0;

        var tick = function (now) {
          if (start === null) start = now;
          var t = now - start;
          var value = shown;
          while (value < target && t >= schedule[value]) value++;
          if (value !== shown) {
            shown = value;
            counter.textContent = String(value);
            // The number drives its own crescendo. Written once per number
            // rather than once per frame — thirty-one writes across four
            // seconds, not two hundred and forty.
            counter.style.setProperty('--count', (value / target).toFixed(3));
          }
          if (shown < target) {
            requestAnimationFrame(tick);
          } else {
            // Hand the arrival to CSS. The count ends at full size, which is
            // exactly where the landing animation begins, so the two meet
            // without a jump. The card takes the same classes so the label and
            // note can follow through a beat behind.
            counter.classList.remove('is-counting');
            counter.classList.add('is-landed');
            if (card) {
              card.classList.remove('is-counting');
              card.classList.add('is-landed');
            }
          }
        };

        counter.textContent = '0';
        counter.style.setProperty('--count', '0');
        counter.classList.add('is-counting');
        if (card) card.classList.add('is-counting');
        requestAnimationFrame(tick);
      // rootMargin, not threshold. On a phone this number is already fully
      // visible when the page loads — 671px down a 812px screen — so the
      // count ran itself out while the reader was still on the headline and
      // said 31 by the time they got there.
      //
      // A threshold cannot fix that: the ratio is 1 on load and stays 1 all
      // the way down, so nothing is ever crossed and no second callback
      // arrives. Discounting the bottom quarter of the viewport moves where
      // intersection begins, which is a real transition — it fires the
      // moment the reader actually reaches the number.
      }, { threshold: 0.6, rootMargin: '0px 0px -25% 0px' }).observe(counter);
    }
  }

  /* --- Scrollytelling: emphasise the panel currently in view --------------
     The pinning itself is CSS position:sticky. This only decides which panel
     is the "current" one, so the others can recede. */
  var scrollies = document.querySelectorAll('.scrolly');
  if (scrollies.length && 'IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    Array.prototype.forEach.call(scrollies, function (scrolly) {
      var panels = scrolly.querySelectorAll('.scrolly__panel');
      if (!panels.length) return;

      // Mark the section active so the pinned image can settle out of its
      // slight over-scale once it is on screen.
      new IntersectionObserver(function (entries) {
        scrolly.classList.toggle('is-active', entries[0].isIntersecting);
      }, { threshold: 0.01 }).observe(scrolly);

      // Which panel is current is also stamped on the section itself, so the
      // artwork pinned behind the copy can respond to it. The panels are the
      // only thing that knows where the reader is, and the art is not their
      // sibling — it lives inside the pinned layer — so a data attribute on the
      // common ancestor is what joins the two.
      var mark = function (el) {
        var n = Array.prototype.indexOf.call(panels, el) + 1;
        if (n > 0) scrolly.setAttribute('data-panel', String(n));
      };

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            Array.prototype.forEach.call(panels, function (p) { p.classList.remove('is-current'); });
            en.target.classList.add('is-current');
            mark(en.target);
          }
        });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

      Array.prototype.forEach.call(panels, function (p) { io.observe(p); });
      // The first panel is current before any scrolling happens.
      panels[0].classList.add('is-current');
      mark(panels[0]);
    });
  }


  /* --- Forms ---------------------------------------------------------------
     The form works without any of this: it is a plain form that posts, and
     with JavaScript off the browser submits it and the host replies. This only
     improves the reply.

     Three things it adds. The answer arrives in place, so the person stays on
     the page they were reading rather than being thrown to a generic host
     page. The button says what it is doing while it does it. And a failure is
     told to the user with another way through, instead of vanishing: someone
     who types their details and presses send must never be left assuming it
     worked when it did not. */
  Array.prototype.forEach.call(document.querySelectorAll('form.form'), function (form) {
    var done = form.parentNode.querySelector('.form__done');
    var failed = form.parentNode.querySelector('.form__error');
    var button = form.querySelector('[type="submit"]');
    if (!done || !button) return;

    form.addEventListener('submit', function (e) {
      // Let the browser do its own validation first; it is better than ours.
      if (!form.checkValidity()) return;
      e.preventDefault();

      var label = button.textContent;
      button.disabled = true;
      button.textContent = 'Sending…';
      failed.hidden = true;

      var body = new URLSearchParams(new FormData(form)).toString();
      fetch(form.getAttribute('action') || window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
      })
        .then(function (res) {
          if (!res.ok) throw new Error(res.status);
          form.hidden = true;
          done.hidden = false;
          // Move focus to the confirmation, or a screen reader stays on a
          // button that is no longer there.
          done.setAttribute('tabindex', '-1');
          done.focus();
        })
        .catch(function () {
          failed.hidden = false;
          button.disabled = false;
          button.textContent = label;
        });
    });
  });
  /* --- Topic filter disclosure -------------------------------------------- */
  var filterToggle = document.querySelector('.filters__toggle');
  if (filterToggle) {
    var moreTopics = document.getElementById('more-topics');
    filterToggle.addEventListener('click', function () {
      var open = filterToggle.getAttribute('aria-expanded') === 'true';
      filterToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (moreTopics) moreTopics.hidden = open;
    });
  }

  /* --- Wide tables scroll rather than break the layout -------------------- */
  document.querySelectorAll('.prose table').forEach(function (t) {
    if (t.parentElement && t.parentElement.classList.contains('table-scroll')) return;
    var w = document.createElement('div');
    w.className = 'table-scroll';
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });
})();

/* --- Masonry for team-member grids ---------------------------------------
   CSS columns balance by height, but they cannot split a card that says
   break-inside: avoid, so one very long biography leaves a whole column short
   and a block of dead space beside it. Place each card into whichever column
   is shortest at that moment instead. Pure enhancement: without JS the CSS
   column fallback still renders every card. */
(function () {
  var wrap = document.querySelector('.tmm_wrap');
  if (!wrap) return;
  var members = Array.prototype.slice.call(wrap.querySelectorAll('.tmm_member'));
  if (members.length < 2) return;

  var MIN_COL = 272; // matches the 17rem minimum in the CSS fallback
  var current = 0;

  function layout() {
    var n = Math.max(1, Math.min(3, Math.floor(wrap.clientWidth / MIN_COL)));
    if (n === current) return;
    current = n;

    var cols = [];
    for (var i = 0; i < n; i++) {
      var col = document.createElement('div');
      col.className = 'tmm_col';
      cols.push(col);
    }

    wrap.classList.add('is-masonry');
    wrap.style.setProperty('--masonry-cols', String(n));
    // Empty the wrapper first so a re-layout does not measure stale columns.
    wrap.querySelectorAll('.tmm_col').forEach(function (c) { c.remove(); });
    cols.forEach(function (c) { wrap.appendChild(c); });

    // Measure every card at its final width before assigning any of them.
    cols[0].style.gridColumn = '1 / -1';
    members.forEach(function (m) { cols[0].appendChild(m); });
    cols[0].style.gridColumn = '';
    var sized = members.map(function (m, i) { return { el: m, i: i, h: m.offsetHeight }; });

    // Longest-first, into whichever column is shortest. Placing in document
    // order lets one very long biography land last and leave a column stranded;
    // placing the big ones first packs the small ones around them.
    var totals = cols.map(function () { return 0; });
    var picked = cols.map(function () { return []; });
    sized.slice().sort(function (a, b) { return b.h - a.h; }).forEach(function (item) {
      var k = 0;
      for (var i = 1; i < totals.length; i++) if (totals[i] < totals[k]) k = i;
      totals[k] += item.h;
      picked[k].push(item);
    });

    // Within a column, restore document order so reading down it still follows
    // the order the charity wrote the page in.
    picked.forEach(function (list, k) {
      list.sort(function (a, b) { return a.i - b.i; });
      list.forEach(function (item) { cols[k].appendChild(item.el); });
    });
  }

  layout();
  var pending;
  window.addEventListener('resize', function () {
    clearTimeout(pending);
    pending = setTimeout(layout, 150);
  });
})();
