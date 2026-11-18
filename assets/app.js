(function () {
  "use strict";

  var D = window.SITE_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { document.body.insertAdjacentHTML("afterbegin", "<p>内容暂未载入。</p>"); return; }

  var ALBUMS = { day: "OCEAN SIDE", dusk: "ADVENTURE", night: "TROPIC OF CAPRICORN" };
  var TAGS = { day: "DAY", dusk: "DUSK", night: "NIGHT" };
  var DEFAULT_LIMIT = 12;

  var state = {
    band: "day",
    query: "",
    expand: { day: false, dusk: false, night: false, books: false },
    lastTrigger: null,
    echoId: null,
    readerId: null,
    category: "",
    content: null,
    search: null,
    contentPromise: null,
    searchPromise: null
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var INDEX = new Map();

  // 摘句在卡片上截断时收在句读处，并补省略号，避免「我喜欢沿着不」这种断口。
  function clip(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var last = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("，"), cut.lastIndexOf("；"),
      cut.lastIndexOf("！"), cut.lastIndexOf("？"));
    if (last >= Math.floor(n * 0.55)) cut = cut.slice(0, last + 1);
    return cut + "…";
  }

  D.essays.forEach(function (e) { INDEX.set(e.id, e); });

  var bookItems = D.books.map(function (name, i) {
    var term = name.split(/[（(\[（]/)[0].slice(0, 8);
    return { id: "book-" + String(i + 1).padStart(3, "0"), title: name, term: term, kind: "book" };
  });

  var byBand = {
    day: D.essays.filter(function (e) { return e.band === "day"; }),
    dusk: D.essays.filter(function (e) { return e.band === "dusk"; }),
    night: D.essays.filter(function (e) { return e.band === "night"; })
  };

  function sheetHTML(items, opts) {
    opts = opts || {};
    if (!items.length) return '<div class="cs-empty micro">没有命中。</div>';
    return items.map(function (e, i) {
      var head = '<span class="cs-no micro">' + String(i + 1).padStart(3, "0") + "</span>" +
        '<span class="cs-title">' + esc(e.title) + "</span>";
      var extra = e.kind === "book" ? ' data-kind="book" data-term="' + esc(e.term) + '"' : "";
      if (e.kind === "book") {
        return '<button type="button" class="cs-item" data-id="' + esc(e.id) + '"' + extra + ">" + head + "</button>";
      }
      var line = clip(e.excerpt, 44);
      var meta = opts.showBand ? TAGS[e.band] || "" : "";
      return '<button type="button" class="cs-item" data-id="' + esc(e.id) + '">' + head +
        '<span class="cs-excerpt">' + esc(line) + "</span>" +
        (meta ? '<span class="cs-meta micro">' + esc(meta) + "</span>" : "") +
        "</button>";
    }).join("");
  }

  function matches(e, q) {
    // 标题、分类、日期、摘录都进索引；全文到位后再叠加正文。
    var hay = e.title + " " + e.category + " " + (e.date || "") + " " + (e.excerpt || "");
    if (state.search && state.search[e.id]) hay += " " + state.search[e.id];
    return hay.toLowerCase().indexOf(q) !== -1;
  }

  function paint(sheetId, items, expanded, statusId, expandId) {
    var q = state.query.trim().toLowerCase();
    var searching = !!q;
    var shown = (searching || expanded) ? items : items.slice(0, DEFAULT_LIMIT);
    $(sheetId).innerHTML = sheetHTML(shown, { showBand: searching });
    if (statusId) {
      $(statusId).textContent = searching
        ? "命中 " + items.length + (state.search ? "" : " · 检索中")
        : "";
    }
    if (expandId) {
      $(expandId).textContent = searching ? "清除" : (expanded ? "收起" : "全部");
    }
  }

  function renderFilters() {
    var cats = [];
    D.essays.forEach(function (e) {
      if (e.band === "day" && cats.indexOf(e.category) < 0) cats.push(e.category);
    });
    var labels = ["全部"].concat(cats);
    $("day-filters").innerHTML = labels.map(function (c) {
      var val = c === "全部" ? "" : c;
      var count = c === "全部"
        ? byBand.day.length
        : byBand.day.filter(function (e) { return e.category === c; }).length;
      var active = state.category === val;
      return '<button type="button" class="filter-btn" data-cat="' + esc(val) + '"' +
        ' aria-pressed="' + (active ? "true" : "false") + '">' +
        esc(c) + " " + count + "</button>";
    }).join("");
  }

  function renderSheets() {
    var q = state.query.trim().toLowerCase();
    var searching = !!q;
    var dayItems = searching
      ? D.essays.filter(function (e) { return e.band === "day" && matches(e, q); })
      : byBand.day.filter(function (e) { return !state.category || e.category === state.category; });
    var duskItems = searching
      ? D.essays.filter(function (e) { return e.band === "dusk" && matches(e, q); })
      : byBand.dusk;
    var nightItems = searching
      ? D.essays.filter(function (e) { return e.band === "night" && matches(e, q); })
      : byBand.night;

    paint("sheet-day", dayItems, state.expand.day, "search-status", "day-expand");
    paint("sheet-dusk", duskItems, state.expand.dusk, "dusk-status", "dusk-expand");
    paint("sheet-night", nightItems, state.expand.night, "night-status", "night-expand");

    var bookShown = state.expand.books ? bookItems : bookItems.slice(0, DEFAULT_LIMIT);
    $("sheet-books").innerHTML = sheetHTML(bookShown);
    $("book-status").textContent = "";
    $("book-expand").textContent = state.expand.books ? "收起" : "全部";
  }

  function renderVerse() {
    var picks = ["菊池桃子", "诗作", "多少遗恨"];
    var found = picks.map(function (t) {
      return D.essays.filter(function (e) { return e.title === t; })[0];
    }).filter(Boolean);
    $("verse-set").innerHTML = found.map(function (e) {
      return '<div class="verse-card">' +
        "<h4>" + esc(e.title) + "</h4>" +
        '<span class="micro">' + esc(e.date) + "</span>" +
        '<div style="margin-top:18px">' + (e.body || "") + "</div>" +
        "</div>";
    }).join("");
  }

  function renderQuotes() {
    ["day", "dusk", "night"].forEach(function (band) {
      var rows = (D.quotes && D.quotes[band]) || [];
      $("quotes-" + band).innerHTML = rows.map(function (q) {
        return '<div class="q-item">' +
          '<p class="q-line">' + esc(q.line) + "</p>" +
          '<cite class="micro q-src">《' + esc(q.title) + "》· " + esc(q.date) + "</cite>" +
          "</div>";
      }).join("");
    });
  }

  function fillBody(id, html) {
    if (state.readerId !== id) return;
    $("reader-body").innerHTML = html;
  }

  function ensureContent() {
    if (state.contentPromise) return state.contentPromise;
    state.contentPromise = fetch("assets/content.json")
      .then(function (r) { if (!r.ok) throw new Error("content"); return r.json(); })
      .then(function (j) {
        state.content = j;
        if (state.readerId) fillBody(state.readerId, state.content[state.readerId] || "");
        return j;
      })
      .catch(function () {
        state.contentPromise = null;
        if (state.readerId) fillBody(state.readerId, "正文暂未载入。");
      });
    return state.contentPromise;
  }

  function ensureSearch() {
    if (state.searchPromise) return state.searchPromise;
    state.searchPromise = fetch("assets/search.json")
      .then(function (r) { if (!r.ok) throw new Error("search"); return r.json(); })
      .then(function (j) {
        state.search = j;
        if (state.query.trim()) renderSheets();
        return j;
      })
      .catch(function () {
        state.searchPromise = null;
        /* 检索退回标题与摘录，功能不中断 */
      });
    return state.searchPromise;
  }

  function openReader(item, trigger) {
    if (trigger) state.lastTrigger = trigger;
    state.readerId = item.id;
    var band = item.band || state.band;
    $("reader").dataset.album = band;
    $("reader-album").textContent = ALBUMS[band] || ALBUMS.day;
    $("reader-title").textContent = item.title;
    $("reader-meta").innerHTML = [item.date, item.category, item.words ? item.words + " 字" : ""]
      .filter(Boolean).map(function (t) { return '<span class="micro">' + esc(t) + "</span>"; }).join("");

    var body = null;
    if (item.body != null) body = item.body;
    else if (state.content) body = state.content[item.id];
    if (body != null) {
      $("reader-body").innerHTML = body;
    } else {
      $("reader-body").innerHTML = '<p class="micro">取正文中…</p>';
      ensureContent().then(function () {
        fillBody(item.id, state.content ? (state.content[item.id] || "") : "正文暂未载入。");
      });
    }

    var ec = item.echo;
    state.echoId = ec ? ec.id : null;
    $("reader-echo").innerHTML = ec
      ? '<span class="micro">另一处' + (ec.thread ? " · " + esc(ec.thread) : "") + "</span>" +
        "<p>「" + esc(ec.line) + "」</p>" +
        '<button type="button" class="btn btn-quiet" id="echo-go">读《' + esc(ec.title) + "》</button>"
      : "";
    $("reader").hidden = false;
    $("reader").scrollTop = 0;
    document.body.style.overflow = "hidden";
    $("reader-close").focus();
  }

  function closeReader() {
    state.readerId = null;
    $("reader").hidden = true;
    document.body.style.overflow = "";
    if (state.lastTrigger && state.lastTrigger.focus) state.lastTrigger.focus();
  }

  var bands = Array.prototype.slice.call(document.querySelectorAll("[data-band]"));
  function syncBand() {
    var mid = Math.max(80, window.innerHeight * 0.35);
    var cur = "day";
    for (var i = 0; i < bands.length; i++) {
      var r = bands[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) { cur = bands[i].dataset.band; break; }
      if (r.top > mid) break;
    }
    if (cur === state.band) return;
    state.band = cur;
    $("site-header").dataset.album = cur;
    $("header-meta").textContent = ALBUMS[cur];
    Array.prototype.forEach.call(document.querySelectorAll("nav a[data-nav]"), function (a) {
      if (a.dataset.nav === cur) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  ["sheet-day", "sheet-dusk", "sheet-night"].forEach(function (id) {
    $(id).addEventListener("click", function (ev) {
      var btn = ev.target.closest(".cs-item[data-id]");
      if (!btn) return;
      var item = INDEX.get(btn.dataset.id);
      if (item) openReader(item, btn);
    });
  });

  $("sheet-books").addEventListener("click", function (ev) {
    var btn = ev.target.closest('.cs-item[data-kind="book"]');
    if (!btn) return;
    $("q").value = btn.dataset.term;
    state.query = btn.dataset.term;
    renderSheets();
    ensureSearch();
    $("day").scrollIntoView({ behavior: "smooth", block: "start" });
    $("q").focus({ preventScroll: true });
  });

  $("reader-echo").addEventListener("click", function (ev) {
    if (!ev.target.closest("#echo-go") || !state.echoId) return;
    var next = INDEX.get(state.echoId);
    if (next) openReader(next, null);
  });

  $("day-filters").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".filter-btn[data-cat]");
    if (!btn) return;
    state.category = btn.dataset.cat;
    if (state.query.trim()) {
      $("q").value = "";
      state.query = "";
    }
    state.expand.day = false;
    renderFilters();
    renderSheets();
  });

  $("q").addEventListener("focus", ensureSearch);
  $("q").addEventListener("input", function () {
    state.query = $("q").value;
    renderSheets();
    if (state.query.trim()) ensureSearch();
  });

  function toggleSection(band, btnId) {
    if (state.query.trim()) {
      // 搜索态下这枚按钮是「清除」：清空查询、三区一起复原。
      $("q").value = "";
      state.query = "";
      state.category = "";
      state.expand.day = state.expand.dusk = state.expand.night = false;
      renderFilters();
      renderSheets();
      $("q").focus();
    } else {
      state.expand[band] = !state.expand[band];
      renderSheets();
    }
  }
  $("day-expand").addEventListener("click", function () { toggleSection("day", "day-expand"); });
  $("dusk-expand").addEventListener("click", function () { toggleSection("dusk", "dusk-expand"); });
  $("night-expand").addEventListener("click", function () { toggleSection("night", "night-expand"); });
  $("book-expand").addEventListener("click", function () {
    state.expand.books = !state.expand.books;
    renderSheets();
  });

  $("reader-close").addEventListener("click", closeReader);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !$("reader").hidden) closeReader();
  });

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    var fired = false;
    var run = function () {
      if (fired) return;
      fired = true;
      syncBand();
      ticking = false;
    };
    window.requestAnimationFrame(run);
    // 兜底：标签页不可见时 rAF 会被暂停，靠定时器保证换肤与导航态跟上。
    window.setTimeout(run, 150);
  }, { passive: true });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".expose").forEach(function (el) { io.observe(el); });
  }

  renderFilters();
  renderVerse();
  renderQuotes();
  renderSheets();
  syncBand();

  function prefetch() {
    ensureContent();
    ensureSearch();
  }
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(prefetch, { timeout: 2500 });
  } else {
    window.setTimeout(prefetch, 300);
  }
})();
