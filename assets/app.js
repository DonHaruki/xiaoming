(function () {
  "use strict";

  var D = window.SITE_DATA;
  var $ = function (id) { return document.getElementById(id); };
  if (!D) { document.body.insertAdjacentHTML("afterbegin", "<p>内容暂未载入。</p>"); return; }

  var BASE_TITLE = document.title;
  var ALBUMS = { day: "OCEAN SIDE", dusk: "ADVENTURE", night: "TROPIC OF CAPRICORN" };
  var THREAD_ORDER = ["路", "光", "时间", "告别"];
  var DUSK_SUBS = ["影视与音乐", "现当代与女性", "古典与武侠", "外国文学与理论"];
  var DEFAULT_LIMIT = 12;

  var DAY_CAPTIONS = {
    "__pick__": "从五年百余篇中挑出的十二篇代表作；点「全部」可阅完整编年。",
    "": "2021–2026 全部写作编年，带色点者为选目推荐篇。",
    "单车志": "记录两轮之上的流动哲思、路线认知与感官漫游。",
    "散文与随笔": "自省、困顿、日常生活观察与青年心路。",
    "阳实随笔": "从教时光、讲台体察与师生羁绊。"
  };

  var THREAD_CAPTIONS = {
    "路": "脉络 · 路（按时间先后排列）：从徒步看城到单车漫游的城市穿行线。",
    "光": "脉络 · 光（按时间先后排列）：从台灯、白日梦、夏色到夜段歌谣的光度流转。",
    "时间": "脉络 · 时间（按时间先后排列）：从十九岁到二十三岁的生日与时间意识。",
    "告别": "脉络 · 告别（按时间先后排列）：毕业、离校与几场漫长的道别。"
  };

  var DUSK_CAPTIONS = {
    "__pick__": "从七十六篇评论中挑出的十篇；点「全部」或按下方主题切入。",
    "": "文学、影视、戏剧、哲学思辨与文本细读（2021–2026 全编年）。",
    "影视与音乐": "电影、动画、特摄、流行歌谣与银幕观影史。",
    "现当代与女性": "萧红、张爱玲、王安忆、鲁迅与女性形象细读。",
    "古典与武侠": "红楼梦、四书、古典诗文、读史与金庸古龙。",
    "外国文学与理论": "西方文学经典、精神分析、存在主义与思想史笔记。"
  };

  var state = {
    band: "day",
    query: "",
    expand: { day: false, dusk: false, night: false, books: false },
    lastTrigger: null,
    echoId: null,
    readerId: null,
    history: [],
    category: "__pick__",
    thread: "",
    duskSub: "__pick__",
    content: null,
    search: {},
    contentReady: false,
    contentPromise: null,
    copyTimer: null
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function stripHTML(html) {
    return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

  D.essays.forEach(function (e) {
    INDEX.set(e.id, e);
    if (e.body) state.search[e.id] = stripHTML(e.body);
  });

  var bookItems = D.books.map(function (entry, i) {
    var obj = typeof entry === "string" ? { title: entry } : entry;
    var ids = Array.isArray(obj.ids) ? obj.ids.filter(function (id) { return INDEX.has(id); }) : [];
    return {
      id: "book-" + String(i + 1).padStart(3, "0"),
      title: obj.title,
      term: obj.term || "",
      ids: ids,
      kind: "book"
    };
  });

  var byBand = {
    day: D.essays.filter(function (e) { return e.band === "day"; }),
    dusk: D.essays.filter(function (e) { return e.band === "dusk"; }),
    night: D.essays.filter(function (e) { return e.band === "night"; })
  };

  var byThread = {};
  THREAD_ORDER.forEach(function (th) {
    byThread[th] = D.essays
      .filter(function (e) { return e.thread === th; })
      .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
  });

  var bikeSeries = byBand.day
    .filter(function (e) { return e.category === "单车志"; })
    .slice()
    .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });

  function renderSpotlight() {
    var el = $("spotlight");
    if (!el) return;
    var rows = (D.spotlight || []).map(function (s, i) {
      var e = INDEX.get(s.id);
      if (!e) return "";
      var year = (e.date || "").slice(0, 4);
      var meta = [s.tag || e.category, year, e.words ? e.words + " 字" : ""].filter(Boolean).join(" · ");
      return '<button type="button" class="toc-row" data-id="' + esc(e.id) + '">' +
        '<span class="toc-no micro">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="toc-title">' + esc(e.title) + "</span>" +
        '<span class="toc-meta micro">' + esc(meta) + "</span>" +
        '<span class="toc-note">' + esc(s.note || clip(e.excerpt, 48)) + "</span>" +
        "</button>";
    }).join("");
    el.innerHTML = rows;
  }

  function sheetHTML(items, opts) {
    opts = opts || {};
    if (!items.length) {
      return '<div class="cs-empty micro">' + (opts.emptyHTML || "没有命中。") + "</div>";
    }
    return items.map(function (e, i) {
      var pickDot = (opts.showPickDot && e.pick)
        ? '<span class="pick-dot" title="选目" aria-hidden="true"></span>'
        : "";
      var head = '<span class="cs-no micro">' + String(i + 1).padStart(3, "0") + pickDot + "</span>" +
        '<span class="cs-title">' + esc(e.title) + "</span>";
      if (e.kind === "book") {
        if (e.ids && e.ids.length) {
          return '<button type="button" class="cs-item" data-id="' + esc(e.id) +
            '" data-kind="book" data-term="' + esc(e.term) +
            '" data-ids="' + esc(e.ids.join(",")) + '">' + head +
            '<span class="cs-meta micro">站内 ' + e.ids.length + " 篇</span></button>";
        }
        return '<div class="cs-item cs-static">' + head + "</div>";
      }
      var line = clip(e.excerpt, 44);
      var metaParts = [];
      if (opts.showSubtopic && e.subtopic) metaParts.push(e.subtopic);
      else if (opts.showCat && e.category) metaParts.push(e.category);
      if (e.date) metaParts.push(e.date);
      if (e.words) metaParts.push(e.words + " 字");
      var meta = metaParts.join(" · ");
      return '<button type="button" class="cs-item" data-id="' + esc(e.id) + '">' + head +
        '<span class="cs-excerpt">' + esc(line) + "</span>" +
        (meta ? '<span class="cs-meta micro">' + esc(meta) + "</span>" : "") +
        "</button>";
    }).join("");
  }

  function matches(e, q) {
    // 标题、分类、子主题、日期、摘录都进索引；正文到位后再叠加全文。
    var hay = e.title + " " + e.category + " " + (e.subtopic || "") + " " + (e.date || "") + " " + (e.excerpt || "");
    if (state.search[e.id]) hay += " " + state.search[e.id];
    return hay.toLowerCase().indexOf(q) !== -1;
  }

  function jumpButton(band, label) {
    return '<button type="button" class="status-jump" data-jump="' + band + '">' + esc(label) + "</button>";
  }

  function paint(sheetId, items, expanded, statusId, expandId, opts) {
    opts = opts || {};
    var q = state.query.trim().toLowerCase();
    var searching = !!q;
    var shown = (searching || expanded) ? items : items.slice(0, DEFAULT_LIMIT);
    $(sheetId).innerHTML = sheetHTML(shown, {
      emptyHTML: opts.emptyHTML,
      showPickDot: !!opts.showPickDot,
      showCat: !!opts.showCat,
      showSubtopic: !!opts.showSubtopic
    });
    if (statusId && opts.statusHTML !== undefined) {
      $(statusId).innerHTML = opts.statusHTML;
    } else if (statusId) {
      $(statusId).textContent = searching
        ? "命中 " + items.length + (state.contentReady ? "" : " · 检索中")
        : "";
    }
    if (expandId) {
      var btn = $(expandId);
      if (!searching && items.length <= DEFAULT_LIMIT) {
        btn.hidden = true;
      } else {
        btn.hidden = false;
        btn.textContent = searching ? "清除" : (expanded ? "收起" : "全部 " + items.length);
      }
    }
  }

  function renderDayFilters() {
    var pickCount = byBand.day.filter(function (e) { return e.pick; }).length;
    var cats = [];
    byBand.day.forEach(function (e) {
      if (cats.indexOf(e.category) < 0) cats.push(e.category);
    });
    var defs = [
      { label: "精选", val: "__pick__", count: pickCount },
      { label: "全部", val: "", count: byBand.day.length }
    ].concat(cats.map(function (c) {
      return {
        label: c,
        val: c,
        count: byBand.day.filter(function (e) { return e.category === c; }).length
      };
    }));
    $("day-filters").innerHTML = defs.map(function (d) {
      var active = !state.thread && !state.query.trim() && state.category === d.val;
      return '<button type="button" class="filter-btn" data-cat="' + esc(d.val) + '"' +
        ' aria-pressed="' + (active ? "true" : "false") + '">' +
        esc(d.label) + " " + d.count + "</button>";
    }).join("");

    var threadsEl = $("day-threads");
    if (threadsEl) {
      threadsEl.innerHTML = '<span class="thread-label">脉络</span>' + THREAD_ORDER.map(function (th) {
        var active = !state.query.trim() && state.thread === th;
        return '<button type="button" class="filter-btn thread-btn" data-thread="' + esc(th) + '"' +
          ' aria-pressed="' + (active ? "true" : "false") + '">' +
          esc(th) + " " + byThread[th].length + "</button>";
      }).join("");
    }
  }

  function renderDuskFilters() {
    var el = $("dusk-filters");
    if (!el) return;
    var pickCount = byBand.dusk.filter(function (e) { return e.pick; }).length;
    var defs = [
      { label: "精选", val: "__pick__", count: pickCount },
      { label: "全部", val: "", count: byBand.dusk.length }
    ].concat(DUSK_SUBS.map(function (sub) {
      return {
        label: sub,
        val: sub,
        count: byBand.dusk.filter(function (e) { return e.subtopic === sub; }).length
      };
    }));
    el.innerHTML = defs.map(function (d) {
      var active = !state.query.trim() && state.duskSub === d.val;
      return '<button type="button" class="filter-btn" data-sub="' + esc(d.val) + '"' +
        ' aria-pressed="' + (active ? "true" : "false") + '">' +
        esc(d.label) + " " + d.count + "</button>";
    }).join("");
  }

  function renderSheets() {
    var q = state.query.trim().toLowerCase();
    var searching = !!q;

    var dayItems;
    if (searching) {
      dayItems = byBand.day.filter(function (e) { return matches(e, q); });
    } else if (state.thread) {
      dayItems = byThread[state.thread] || [];
    } else if (state.category === "__pick__") {
      dayItems = byBand.day.filter(function (e) { return e.pick; });
    } else if (state.category) {
      dayItems = byBand.day.filter(function (e) { return e.category === state.category; });
    } else {
      dayItems = byBand.day;
    }

    var duskItems;
    if (searching) {
      duskItems = byBand.dusk.filter(function (e) { return matches(e, q); });
    } else if (state.duskSub === "__pick__") {
      duskItems = byBand.dusk.filter(function (e) { return e.pick; });
    } else if (state.duskSub) {
      duskItems = byBand.dusk.filter(function (e) { return e.subtopic === state.duskSub; });
    } else {
      duskItems = byBand.dusk;
    }

    var nightItems = searching
      ? byBand.night.filter(function (e) { return matches(e, q); })
      : byBand.night;

    var dayStatusHTML = "";
    var dayEmptyHTML = "没有命中。";
    if (searching) {
      var total = dayItems.length + duskItems.length + nightItems.length;
      var parts = ["共命中 " + total];
      parts.push("昼 " + dayItems.length);
      parts.push(duskItems.length ? jumpButton("dusk", "黄昏 " + duskItems.length) : "黄昏 0");
      parts.push(nightItems.length ? jumpButton("night", "夜 " + nightItems.length) : "夜 0");
      if (!state.contentReady) parts.push("检索中");
      dayStatusHTML = parts.join(" · ");

      if (!dayItems.length && (duskItems.length || nightItems.length)) {
        var jumps = [];
        if (duskItems.length) jumps.push(jumpButton("dusk", "黄昏 " + duskItems.length + " 篇"));
        if (nightItems.length) jumps.push(jumpButton("night", "夜 " + nightItems.length + " 篇"));
        dayEmptyHTML = "昼区无命中，见下方 " + jumps.join(" / ") + "。";
      }
    }

    var dayCaption = $("day-caption");
    if (dayCaption) {
      dayCaption.textContent = searching
        ? ""
        : (state.thread ? (THREAD_CAPTIONS[state.thread] || "") : (DAY_CAPTIONS[state.category] || ""));
    }
    var duskCaption = $("dusk-caption");
    if (duskCaption) {
      duskCaption.textContent = searching ? "" : (DUSK_CAPTIONS[state.duskSub] || "");
    }

    paint("sheet-day", dayItems, state.expand.day, "search-status", "day-expand", {
      statusHTML: dayStatusHTML,
      emptyHTML: dayEmptyHTML,
      showPickDot: !searching && !state.thread && state.category !== "__pick__",
      showCat: !searching && (state.category === "__pick__" || !!state.thread)
    });
    paint("sheet-dusk", duskItems, state.expand.dusk, "dusk-status", "dusk-expand", {
      showPickDot: !searching && state.duskSub !== "__pick__",
      showSubtopic: !searching && (state.duskSub === "__pick__" || state.duskSub === "")
    });
    paint("sheet-night", nightItems, state.expand.night, "night-status", "night-expand");

    var bookShown = state.expand.books ? bookItems : bookItems.slice(0, DEFAULT_LIMIT);
    $("sheet-books").innerHTML = sheetHTML(bookShown);
    $("book-status").textContent = "";
    var bookBtn = $("book-expand");
    if (bookItems.length <= DEFAULT_LIMIT) {
      bookBtn.hidden = true;
    } else {
      bookBtn.hidden = false;
      bookBtn.textContent = state.expand.books ? "收起" : "全部 " + bookItems.length;
    }
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
        var eid = q.id || "";
        if (eid && INDEX.has(eid)) {
          return '<div class="q-item">' +
            '<button type="button" class="quote-trigger" data-essay="' + esc(eid) + '">' +
            '<span class="q-line">' + esc(q.line) + "</span>" +
            '<span class="micro q-src">《' + esc(q.title) + "》· " + esc(q.date) + "</span>" +
            "</button></div>";
        }
        return '<div class="q-item">' +
          '<p class="q-line">' + esc(q.line) + "</p>" +
          '<cite class="micro q-src">《' + esc(q.title) + "》· " + esc(q.date) + "</cite>" +
          "</div>";
      }).join("");
    });
  }

  function renderSeriesNav(item) {
    var box = $("reader-series");
    if (!box) return;
    var seq = null;
    var label = "";
    if (item.thread && byThread[item.thread] && byThread[item.thread].length > 1) {
      seq = byThread[item.thread];
      label = "脉络 · " + item.thread;
    } else if (item.category === "单车志" && bikeSeries.length > 1) {
      seq = bikeSeries;
      label = "单车志";
    }
    if (!seq) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    var idx = -1;
    for (var i = 0; i < seq.length; i++) {
      if (seq[i].id === item.id) { idx = i; break; }
    }
    if (idx < 0) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    var prev = idx > 0 ? seq[idx - 1] : null;
    var next = idx < seq.length - 1 ? seq[idx + 1] : null;
    var btns = [];
    if (prev) {
      btns.push('<button type="button" class="btn btn-quiet" data-series-go="' + esc(prev.id) + '">上一篇：《' + esc(prev.title) + "》</button>");
    }
    if (next) {
      btns.push('<button type="button" class="btn btn-quiet" data-series-go="' + esc(next.id) + '">下一篇：《' + esc(next.title) + "》</button>");
    }
    box.innerHTML = '<span class="micro">' + esc(label) + "（" + (idx + 1) + " / " + seq.length + "）</span>" +
      '<div class="series-nav-row">' + btns.join("") + "</div>";
    box.hidden = false;
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
        state.contentReady = true;
        Object.keys(j).forEach(function (id) {
          state.search[id] = stripHTML(j[id]);
        });
        if (state.readerId) fillBody(state.readerId, state.content[state.readerId] || "");
        if (state.query.trim()) renderSheets();
        return j;
      })
      .catch(function () {
        state.contentPromise = null;
        if (state.readerId) fillBody(state.readerId, "正文暂未载入。");
      });
    return state.contentPromise;
  }

  function parseEssayHash() {
    var m = /^#e=([a-z0-9-]+)$/i.exec(window.location.hash || "");
    if (!m) return null;
    return INDEX.get(m[1]) || null;
  }

  function updateReaderBack() {
    $("reader-back").hidden = state.history.length === 0;
  }

  function resetCopyBtn() {
    if (state.copyTimer) {
      window.clearTimeout(state.copyTimer);
      state.copyTimer = null;
    }
    $("reader-copy").textContent = "Link";
  }

  function openReader(item, trigger, opts) {
    opts = opts || {};
    if (trigger) state.lastTrigger = trigger;

    if (opts.fromEcho && state.readerId && state.readerId !== item.id) {
      state.history.push(state.readerId);
    } else if (!opts.fromHash && !opts.fromEcho) {
      state.history = [];
    }

    state.readerId = item.id;
    updateReaderBack();
    resetCopyBtn();

    if (!opts.fromHash && window.history && window.history.pushState) {
      var targetHash = "#e=" + encodeURIComponent(item.id);
      if (window.location.hash !== targetHash) {
        window.history.pushState({ essay: item.id }, "", targetHash);
      }
    }

    document.title = item.title + " · 微明";
    var band = item.band || state.band;
    $("reader").dataset.album = band;
    $("reader-album").textContent = ALBUMS[band] || ALBUMS.day;
    $("reader-title").textContent = item.title;
    $("reader-meta").innerHTML = [item.date, item.subtopic || item.category, item.words ? item.words + " 字" : ""]
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

    renderSeriesNav(item);

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

  function closeReader(opts) {
    opts = opts || {};
    state.readerId = null;
    state.history = [];
    updateReaderBack();
    resetCopyBtn();
    document.title = BASE_TITLE;
    $("reader").hidden = true;
    document.body.style.overflow = "";
    if (!opts.fromHash && /^#e=/i.test(window.location.hash || "") && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (state.lastTrigger && state.lastTrigger.focus) state.lastTrigger.focus();
  }

  function copyReaderLink() {
    if (!state.readerId) return;
    var url = window.location.origin + window.location.pathname + window.location.search + "#e=" + encodeURIComponent(state.readerId);
    var done = function () {
      resetCopyBtn();
      $("reader-copy").textContent = "Copied";
      state.copyTimer = window.setTimeout(function () {
        $("reader-copy").textContent = "Link";
        state.copyTimer = null;
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () {
        fallbackCopy(url, done);
      });
    } else {
      fallbackCopy(url, done);
    }
  }

  function fallbackCopy(text, onDone) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); onDone(); } catch (e) {}
    document.body.removeChild(ta);
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

  if ($("spotlight")) {
    $("spotlight").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".toc-row[data-id]");
      if (!btn) return;
      var item = INDEX.get(btn.dataset.id);
      if (item) openReader(item, btn);
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

  document.addEventListener("click", function (ev) {
    var quoteBtn = ev.target.closest(".quote-trigger[data-essay]");
    if (quoteBtn) {
      var essay = INDEX.get(quoteBtn.dataset.essay);
      if (essay) openReader(essay, quoteBtn);
      return;
    }
    var jumpBtn = ev.target.closest(".status-jump[data-jump]");
    if (jumpBtn) {
      var target = $(jumpBtn.dataset.jump);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  $("sheet-books").addEventListener("click", function (ev) {
    var btn = ev.target.closest('.cs-item[data-kind="book"]');
    if (!btn) return;
    var ids = (btn.dataset.ids || "").split(",").filter(Boolean);
    if (ids.length === 1) {
      var single = INDEX.get(ids[0]);
      if (single) { openReader(single, btn); return; }
    }
    var term = btn.dataset.term || "";
    $("q").value = term;
    state.query = term;
    renderDayFilters();
    renderDuskFilters();
    renderSheets();
    ensureContent();

    var hitBands = ids.map(function (id) {
      var e = INDEX.get(id);
      return e ? e.band : "";
    });
    var dest = hitBands.indexOf("day") !== -1 ? "day"
      : (hitBands.indexOf("dusk") !== -1 ? "dusk"
        : (hitBands.indexOf("night") !== -1 ? "night" : "day"));
    $(dest).scrollIntoView({ behavior: "smooth", block: "start" });
    if (dest === "day") $("q").focus({ preventScroll: true });
  });

  $("reader-series").addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-series-go]");
    if (!btn) return;
    var next = INDEX.get(btn.dataset.seriesGo);
    if (next) openReader(next, null, { fromEcho: true });
  });

  $("reader-echo").addEventListener("click", function (ev) {
    if (!ev.target.closest("#echo-go") || !state.echoId) return;
    var next = INDEX.get(state.echoId);
    if (next) openReader(next, null, { fromEcho: true });
  });

  $("reader-back").addEventListener("click", function () {
    if (!state.history.length) return;
    var prevId = state.history.pop();
    var prev = INDEX.get(prevId);
    if (prev) openReader(prev, null, { fromHash: true });
    if (window.history && window.history.replaceState && prev) {
      window.history.replaceState({ essay: prev.id }, "", "#e=" + encodeURIComponent(prev.id));
    }
  });

  $("reader-copy").addEventListener("click", copyReaderLink);

  $("day-filters").addEventListener("click", function (ev) {
    var btn = ev.target.closest(".filter-btn[data-cat]");
    if (!btn) return;
    state.category = btn.dataset.cat;
    state.thread = "";
    if (state.query.trim()) {
      $("q").value = "";
      state.query = "";
    }
    state.expand.day = false;
    renderDayFilters();
    renderDuskFilters();
    renderSheets();
  });

  if ($("day-threads")) {
    $("day-threads").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".thread-btn[data-thread]");
      if (!btn) return;
      var th = btn.dataset.thread;
      if (state.thread === th) {
        state.thread = "";
        state.category = "__pick__";
      } else {
        state.thread = th;
      }
      if (state.query.trim()) {
        $("q").value = "";
        state.query = "";
      }
      state.expand.day = false;
      renderDayFilters();
      renderDuskFilters();
      renderSheets();
    });
  }

  if ($("dusk-filters")) {
    $("dusk-filters").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".filter-btn[data-sub]");
      if (!btn) return;
      state.duskSub = btn.dataset.sub;
      if (state.query.trim()) {
        $("q").value = "";
        state.query = "";
      }
      state.expand.dusk = false;
      renderDayFilters();
      renderDuskFilters();
      renderSheets();
    });
  }

  $("q").addEventListener("focus", ensureContent);
  $("q").addEventListener("input", function () {
    state.query = $("q").value;
    renderDayFilters();
    renderDuskFilters();
    renderSheets();
    if (state.query.trim()) ensureContent();
  });

  function toggleSection(band) {
    if (state.query.trim()) {
      // 搜索态下这枚按钮是「清除」：清空查询、三区一起复原。
      $("q").value = "";
      state.query = "";
      state.expand.day = state.expand.dusk = state.expand.night = false;
      renderDayFilters();
      renderDuskFilters();
      renderSheets();
      $("q").focus();
    } else {
      state.expand[band] = !state.expand[band];
      renderSheets();
    }
  }
  $("day-expand").addEventListener("click", function () { toggleSection("day"); });
  $("dusk-expand").addEventListener("click", function () { toggleSection("dusk"); });
  $("night-expand").addEventListener("click", function () { toggleSection("night"); });
  $("book-expand").addEventListener("click", function () {
    state.expand.books = !state.expand.books;
    renderSheets();
  });

  $("reader-close").addEventListener("click", function () { closeReader(); });
  document.addEventListener("keydown", function (ev) {
    if ($("reader").hidden) return;
    if (ev.key === "Escape") {
      closeReader();
      return;
    }
    if (ev.key === "Tab") {
      var focusables = Array.prototype.slice.call(
        $("reader").querySelectorAll("button:not([hidden]):not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")
      );
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  });

  function syncFromHash() {
    var target = parseEssayHash();
    if (target) {
      if (state.readerId && state.readerId !== target.id && state.history[state.history.length - 1] === target.id) {
        state.history.pop();
      }
      if (state.readerId !== target.id) {
        openReader(target, null, { fromHash: true });
      }
    } else if (state.readerId) {
      closeReader({ fromHash: true });
    }
  }
  window.addEventListener("popstate", syncFromHash);
  window.addEventListener("hashchange", syncFromHash);

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

  renderSpotlight();
  renderDayFilters();
  renderDuskFilters();
  renderVerse();
  renderQuotes();
  renderSheets();
  syncBand();
  syncFromHash();

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(ensureContent, { timeout: 2500 });
  } else {
    window.setTimeout(ensureContent, 300);
  }
})();
