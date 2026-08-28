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
    function currentTarget() {
      var header = document.querySelector('.site-header');
      var line = (header ? header.offsetHeight : 0) + 120;
      var active = targets[0];
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].getBoundingClientRect().top <= line) active = targets[i];
        else break;
      }
      return active;
    }

    function syncToc() {
      var target = currentTarget();
      var activeId = target ? target.id : null;
      var current = null;
      tocLinks.forEach(function (a) {
        if (activeId && decodeURIComponent(a.hash.slice(1)) === activeId) {
          a.setAttribute('aria-current', 'true');
          current = a;
        } else {
          a.removeAttribute('aria-current');
        }
      });
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
    function place(a) {
      if (a) last = a;
      var target = a || last;
      if (!target) return;
      marker.style.opacity = a ? '1' : '0';
      marker.style.transform =
        'translateY(' + target.offsetTop + 'px) scaleY(' + target.offsetHeight + ')';
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
    var setStuck = function () {
      header.classList.toggle('is-stuck', window.scrollY > 4);
    };
    setStuck();
    window.addEventListener('scroll', setStuck, { passive: true });
  }

  /* --- Sections settle in as they come into view -------------------------- */
  /* Opt in only when the browser can do it properly; otherwise content is
     visible from the start, which is the correct fallback. */
  if ('IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var blocks = document.querySelectorAll(
      'main .section > .wrap > *, main .hero__copy, main .hero__stat, main .card, main .portrait, main .route'
    );
    if (blocks.length) {
      root.classList.add('js-reveal');
      var revealObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-visible');
          obs.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

      Array.prototype.forEach.call(blocks, function (el, i) {
        el.setAttribute('data-reveal', '');
        // Stagger only within a row of siblings, never down the whole page.
        var siblingIndex = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.setProperty('--reveal-delay', Math.min(siblingIndex, 3) * 80 + 'ms');
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

        // Ease IN, not out: the count starts slow and accelerates into the
        // final number. On a figure that means "women who died today" the
        // build reads as dread rather than decoration.
        //
        // t^2 is the usable limit here. Steeper curves stall for a third of a
        // second on the opening numbers, which looks broken rather than tense;
        // this holds the longest pause near 180ms and finishes on ~17ms steps.
        var duration = 1400;
        var start = null;
        var shown = null;

        var tick = function (now) {
          if (start === null) start = now;
          var t = Math.min(1, (now - start) / duration);
          var eased = t * t;
          var value = Math.round(target * eased);
          if (value !== shown) {
            counter.textContent = String(value);
            shown = value;
          }
          if (t < 1) requestAnimationFrame(tick);
          else if (shown !== target) counter.textContent = String(target);
        };

        counter.textContent = '0';
        requestAnimationFrame(tick);
      }, { threshold: 0.6 }).observe(counter);
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

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            Array.prototype.forEach.call(panels, function (p) { p.classList.remove('is-current'); });
            en.target.classList.add('is-current');
          }
        });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

      Array.prototype.forEach.call(panels, function (p) { io.observe(p); });
      // The first panel is current before any scrolling happens.
      panels[0].classList.add('is-current');
    });
  }

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
