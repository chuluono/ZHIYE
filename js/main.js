/* ============================================================
 * 知野 ZHIYE · 共享脚本
 * 主题切换（View Transition 过渡 + T 键快捷键）/ 工具函数
 * 卡片渲染（相对时间 + 搜索高亮）/ 滚动渐显 / 进度环回顶部
 * ============================================================ */
(function () {
  "use strict";

  /* 标记 JS 已启用（reveal 动画仅在启用时生效，无 JS 环境内容照常显示） */
  document.documentElement.classList.add("js");

  /* 跨页过渡抵达标记：经 View Transition 导航进入本页时，
     跳过滚动渐显，让内容随过渡一同到位（否则过渡结束后内容才二次弹入，观感卡顿） */
  window.addEventListener("pagereveal", function (e) {
    if (e.viewTransition) document.documentElement.classList.add("vt-arrived");
  }, { once: true });

  /* ---------- 主题 ---------- */
  var THEME_KEY = "blog-theme";

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    /* 图标不需要 JS 管理：CSS 按 data-theme 渲染 ::before，首帧即正确 */
  }

  /* 过渡进行中忽略新的切换请求：防止连点 / 按住 T 自动重复
     造成「切过去又切回来」的往返闪烁 */
  var themeBusy = false;

  function toggleTheme() {
    if (themeBusy) return;
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    if (document.startViewTransition) {
      /* 挂 .theme-vt 让 CSS 区分「主题切换（纯淡入）」与「页面导航（带位移）」两套动画 */
      var html = document.documentElement;
      themeBusy = true;
      html.classList.add("theme-vt");
      var vt = document.startViewTransition(function () {
        applyTheme(next);
      });
      vt.finished.finally(function () {
        themeBusy = false;
        html.classList.remove("theme-vt");
      });
    } else {
      applyTheme(next);
    }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
    document.querySelectorAll(".theme-toggle").forEach(function (b) {
      b.addEventListener("click", toggleTheme);
    });
  }

  /* 快捷键 T：切换主题（输入框聚焦或正在选中文本时忽略） */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "t" && e.key !== "T") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    if (String(window.getSelection && window.getSelection() || "")) return;
    toggleTheme();
  });

  /* ---------- 工具函数 ---------- */
  /* 站点根前缀：静态文章页位于 posts/<slug>/ 子目录，资源与链接需回退两级；
     首页/随笔/关于等根级页面为空串。 */
  var ROOT = /\/posts\/[^/]+\/(index\.html)?$/.test(location.pathname) ? "../../" : "";
  window.BLOG_ROOT = ROOT;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* 尊重系统「减弱动态效果」：开启时 JS 平滑滚动改为立即跳转 */
  var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 平滑滚动到元素顶部（block:start，配合各元素的 scroll-margin-top 避让吸顶导航） */
  function smoothTo(el) {
    if (!el) return;
    try { el.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" }); } catch (e) {}
  }

  /* 纯文本关键词高亮（先转义再包裹 mark 标签） */
  function highlight(text, q) {
    var safe = escapeHtml(text);
    if (!q) return safe;
    var re = new RegExp("(" + escapeRegExp(escapeHtml(q)) + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  var H = {
    escapeHtml: escapeHtml,
    highlight: highlight,

    fmtDate: function (s) {
      var p = s.split("-");
      return parseInt(p[0], 10) + " 年 " + parseInt(p[1], 10) + " 月 " + parseInt(p[2], 10) + " 日";
    },

    /* 相对时间：今天 / 昨天 / N 天前 / N 周前 / N 个月前 / N 年前 */
    fmtRelative: function (s) {
      var d = new Date(s + "T00:00:00");
      var days = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (days <= 0) return "今天";
      if (days === 1) return "昨天";
      if (days < 7) return days + " 天前";
      if (days < 30) return Math.floor(days / 7) + " 周前";
      if (days < 365) return Math.max(1, Math.floor(days / 30)) + " 个月前";
      return Math.floor(days / 365) + " 年前";
    },

    readingMin: function (content) {
      var chars = content.replace(/\s/g, "").length;
      return Math.max(1, Math.round(chars / 400));
    },

    sortedPosts: function () {
      return window.BLOG.posts.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    },

    /* 列表视图：一个系列只显示 part 最小的一章作为入口，
       其余章节通过文章页左侧章节目录访问（避免首页被同系列多张卡片刷屏） */
    visiblePosts: function () {
      var all = H.sortedPosts();
      var minPart = {};
      all.forEach(function (p) {
        if (p.series && (!(p.series.id in minPart) || p.series.part < minPart[p.series.id])) {
          minPart[p.series.id] = p.series.part;
        }
      });
      return all.filter(function (p) { return !p.series || p.series.part === minPart[p.series.id]; });
    },

    getPost: function (slug) {
      return window.BLOG.posts.find(function (p) { return p.slug === slug; });
    },

    /* 标签计数。传入 list 时只统计该列表（如首页可见文章），否则统计全站 */
    allTags: function (list) {
      var map = {};
      (list || window.BLOG.posts).forEach(function (p) {
        p.tags.forEach(function (t) { map[t] = (map[t] || 0) + 1; });
      });
      return Object.keys(map)
        .map(function (t) { return [t, map[t]]; })
        .sort(function (a, b) { return b[1] - a[1]; });
    },

    tagChips: function (post) {
      return post.tags.map(function (t) {
        return '<a class="tag-chip" href="' + ROOT + 'index.html?tag=' + encodeURIComponent(t) + '">' + escapeHtml(t) + "</a>";
      }).join("");
    },

    coverStyle: function (post) {
      return "background: linear-gradient(135deg, " + post.cover[0] + ", " + post.cover[1] + ")";
    },

    /* 静态文章页真实地址（SEO 友好，可被搜索引擎与 AI 直接抓取全文） */
    postURL: function (post) {
      return ROOT + "posts/" + encodeURIComponent(post.slug) + "/";
    },

    /* 文章卡片。q 传入搜索关键词时，标题与摘要做高亮 */
    cardHTML: function (post, featured, q) {
      var url = H.postURL(post);
      var badge = post.sponsored ? '<span class="sponsored-badge">合作推广</span>' : "";
      if (post.series) {
        var n = window.BLOG.posts.filter(function (p) { return p.series && p.series.id === post.series.id; }).length;
        badge += '<span class="series-badge">系列 · ' + n + " 章</span>";
      }
      var coverInner = post.coverImg
        ? '<img class="cover-img" src="' + ROOT + post.coverImg + '" alt="" loading="lazy">'
        : "<span>" + post.emoji + "</span>";
      var cover =
        '<a class="' + (featured ? "featured-cover" : "post-cover") + '" href="' + url + '" style="' +
        H.coverStyle(post) + '" aria-hidden="true" tabindex="-1">' + coverInner + "</a>";
      var timeHTML = featured
        ? "<time datetime=\"" + post.date + "\">" + H.fmtDate(post.date) + "</time>"
        : "<time datetime=\"" + post.date + "\" title=\"" + H.fmtDate(post.date) + "\">" + H.fmtRelative(post.date) + "</time>";
      var meta =
        '<div class="post-meta">' + badge + timeHTML + "<span>·</span>" +
        "<span>约 " + H.readingMin(post.content) + " 分钟</span></div>";
      var body =
        '<div class="' + (featured ? "featured-body" : "post-card-body") + '">' + meta +
        '<h2><a href="' + url + '">' + H.highlight(post.title, q) + "</a></h2>" +
        '<p class="excerpt">' + H.highlight(post.excerpt, q) + "</p>" +
        '<div class="post-tags">' + H.tagChips(post) + "</div></div>";
      return '<article class="' + (featured ? "featured-card" : "post-card") + '">' + cover + body + "</article>";
    }
  };
  window.BLOG_HELPERS = H;

  /* ---------- 滚动渐显（IntersectionObserver） ----------
   * 元素可见后加 .visible，动画结束自动移除 reveal 类，
   * 避免残留 transform/transition-delay 干扰卡片 hover 动效。 */
  window.BLOG_initReveal = function (root) {
    var els = (root || document).querySelectorAll(".reveal:not(.visible)");
    if (!els.length) return;
    /* 经跨页过渡抵达：内容已在过渡中亮相，渐显直接跳过 */
    if (document.documentElement.classList.contains("vt-arrived")) {
      Array.prototype.forEach.call(els, function (el) {
        el.classList.add("visible");
        el.classList.remove("reveal");
        el.style.transitionDelay = "";
      });
      return;
    }
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(els, function (el) {
        el.classList.add("visible");
        el.classList.remove("reveal");
        el.style.transitionDelay = "";
      });
      return;
    }
    var ob = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add("visible");
        ob.unobserve(el);
        setTimeout(function () {
          el.classList.remove("reveal", "visible");
          el.style.transitionDelay = "";
        }, 1000);
      });
    }, { threshold: 0.06, rootMargin: "0px 0px -36px 0px" });
    Array.prototype.forEach.call(els, function (el) { ob.observe(el); });
  };

  /* ---------- 回到顶部（SVG 进度环随滚动填充） ---------- */
  var RING_LEN = 131.95; /* 2π × r(21) */

  function updateBackTop(btn) {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    var ring = btn.querySelector(".ring-fg");
    if (ring) ring.style.strokeDashoffset = (RING_LEN * (1 - p)).toFixed(2);
    btn.classList.toggle("show", window.scrollY > 480);
  }

  function initBackTop() {
    var btn = document.getElementById("backTop");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
    });
    window.addEventListener("scroll", function () { updateBackTop(btn); }, { passive: true });
    window.addEventListener("resize", function () { updateBackTop(btn); }, { passive: true });
    updateBackTop(btn);
  }

  /* ---------- 阅读进度条（文章页顶部） ---------- */
  function initProgressBar() {
    var bar = document.getElementById("progressBar");
    if (!bar) return;
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + "%";
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- 文章页目录高亮（scrollspy） ---------- */
  function initScrollSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
    if (!links.length) return;
    var heads = links.map(function (a) {
      return document.getElementById(a.getAttribute("href").slice(1));
    });
    var ticking = false;
    function update() {
      var current = 0;
      heads.forEach(function (h, i) {
        if (h && h.getBoundingClientRect().top <= 140) current = i;
      });
      links.forEach(function (a, i) { a.classList.toggle("active", i === current); });
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }
  window.BLOG_initScrollSpy = initScrollSpy;

  /* ---------- 启动 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initPageEnter();
    initBackTop();
    initProgressBar();
    initHeaderShadow();
    initSeriesSide();
    window.BLOG_initReveal(document);
  });

  /* ---------- 点击复制邮箱 ----------
   * mailto: 依赖本机邮件客户端，预览面板 / 未配置客户端的环境点了没反应；
   * JS 环境下改为复制到剪贴板 + 轻提示，无 JS 时保留 mailto 兜底。 */
  var toastEl = null;
  var toastTimer = null;

  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "copy-toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2000);
  }

  function legacyCopy(text, ok) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); ok(); } catch (e) {}
    document.body.removeChild(ta);
  }

  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-copy-email]") : null;
    if (!el) return;
    e.preventDefault();
    var email = el.getAttribute("data-copy-email");
    function ok() { showToast("邮箱已复制 ✓ " + email); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(ok, function () { legacyCopy(email, ok); });
    } else {
      legacyCopy(email, ok);
    }
  });

  /* ---------- 共享元素过渡：卡片封面 → 文章头图 ----------
   * 点击指向文章页的链接时，把所属卡片的封面（或 emoji）临时设为
   * view-transition-name: post-hero —— 与文章页 .article-banner 配对，
   * 跨页导航时封面无缝变形放大为头图（Chromium 126+，其余浏览器自动忽略）。 */
  document.addEventListener("click", function (e) {
    var link = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!link || !/\/posts\/[^/]+\/?/.test(link.getAttribute("href"))) return;
    var card = link.closest(".post-card, .featured-card, .mini-card");
    if (!card) return;
    var cover = card.querySelector(".post-cover, .featured-cover") || card.querySelector(".emoji");
    if (cover) cover.style.viewTransitionName = "post-hero";
  });

  /* ---------- 页面入场动画：会话内首次加载才播放 ----------
     后续页面切换由 View Transition 交叉淡入呈现，避免每次导航都重播入场动画。 */
  function initPageEnter() {
    var main = document.querySelector("main");
    if (!main) return;
    var seen = null;
    try {
      seen = sessionStorage.getItem("blog-entered");
      sessionStorage.setItem("blog-entered", "1");
    } catch (e) {}
    if (!seen) main.classList.add("page-enter");
  }

  /* ---------- 吸顶导航：滚动后加柔和投影 ---------- */
  function initHeaderShadow() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var ticking = false;
    function update() {
      header.classList.toggle("scrolled", window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- 系列侧栏：章节较多时把当前章节滚动到可视区中央 ---------- */
  function initSeriesSide() {
    var side = document.getElementById("seriesSide");
    if (!side) return;
    var cur = side.querySelector(".chapter-link.current");
    if (!cur || side.scrollHeight <= side.clientHeight + 4) return;
    var target = cur.offsetTop - (side.clientHeight - cur.offsetHeight) / 2;
    side.scrollTop = Math.max(0, target);
  }
})();
