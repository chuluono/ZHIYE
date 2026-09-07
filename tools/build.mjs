/* ============================================================
 * 知野 ZHIYE · 静态构建生成器（零依赖，Node 22+）
 * ============================================================
 * 用途：把 js/posts.js 中的文章预渲染为真正的静态 HTML，
 *       让搜索引擎与 AI 爬虫（不执行 JavaScript）也能直接
 *       抓取文章全文 —— 这是 SEO / GEO 的关键一步。
 *
 * 产物：
 *   posts/<slug>/index.html   每篇文章的静态页（完整 SEO head + JSON-LD）
 *   sitemap.xml               站点地图
 *   sitemap.xml               站点地图
 *   llms.txt                  AI 爬虫友好的站点索引（GEO）
 *   llms-full.txt             全部文章全文（Markdown，供 AI 检索引用）
 *
 * 用法：node tools/build.mjs
 * 日常发文：改 js/posts.js → 跑本脚本 → git push（三步，见 README.md）
 * ============================================================ */

import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/* ============================================================
 * ★★★ 站点唯一配置 ★★★
 * 优先读环境变量 SITE_URL（GitHub Actions 自动传入正式地址），
 * 本地未设置时保持占位符，不影响开发预览。
 * sitemap / canonical / OG / llms.txt 都引用它。
 * ============================================================ */
const SITE_URL = (process.env.SITE_URL || "https://YOUR-SITE.example").replace(/\/+$/, "");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "posts");

/* ---------- 载入文章数据（js/posts.js 是浏览器脚本，vm 沙箱执行） ---------- */
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(path.join(ROOT, "js", "posts.js"), "utf8"), sandbox, {
  filename: "js/posts.js",
});
const BLOG = sandbox.window.BLOG;
if (!BLOG || !Array.isArray(BLOG.posts)) {
  console.error("未从 js/posts.js 读到文章数据");
  process.exit(1);
}
if (!BLOG.posts.length) {
  console.log("提示：当前 0 篇文章，仅重建 sitemap.xml / llms.txt");
}

/* ---------- 载入 marked（本地 UMD 版，Node 可直接 require） ---------- */
const require = createRequire(import.meta.url);
const markedMod = require(path.join(ROOT, "lib", "marked.min.js"));
const markedParse = markedMod.parse || markedMod.marked.parse;

/* ---------- 工具 ---------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeXml(s) {
  return escapeHtml(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
function readingMin(content) {
  return Math.max(1, Math.round(content.replace(/\s/g, "").length / 400));
}
function fmtDateCN(s) {
  const p = s.split("-");
  return parseInt(p[0], 10) + " 年 " + parseInt(p[1], 10) + " 月 " + parseInt(p[2], 10) + " 日";
}
function dateRFC822(s) {
  return new Date(s + "T12:00:00+08:00").toUTCString();
}
/* JSON-LD 安全嵌入：防止内容里出现 </script> 提前闭合标签 */
function jsonLd(obj) {
  return JSON.stringify(obj, null, 2).replace(/<\//g, "<\\/");
}
const sorted = BLOG.posts.slice().sort((a, b) => b.date.localeCompare(a.date));

/* ---------- 系列教程索引：series.id → 按部分排序的章节列表 ---------- */
const seriesMap = {};
BLOG.posts.forEach((p) => {
  if (!p.series) return;
  const id = p.series.id;
  if (!seriesMap[id]) seriesMap[id] = [];
  seriesMap[id].push(p);
});
Object.keys(seriesMap).forEach((id) => {
  seriesMap[id].sort((a, b) => a.series.part - b.series.part);
});

/* ---------- 渲染正文（作者本人内容，信任处理；如粘贴外部内容请先自查） ---------- */
function renderContent(md) {
  let html = markedParse(md);
  /* 文章正文内的一级标题降级为 h2，保证每页只有一个 h1（页面主标题） */
  html = html.replace(/<h1>/g, "<h2>").replace(/<\/h1>/g, "</h2>");
  /* 独占一段的图片（带 alt）包装为 figure + 图注，懒加载 */
  html = html.replace(
    /<p><img([^>]*?)alt="([^"]*)"([^>]*?)><\/p>/g,
    function (_m, pre, alt, post) {
      return '<figure class="post-figure"><img loading="lazy" decoding="async"' + pre + 'alt="' + alt + '"' + post + '><figcaption>' + alt + "</figcaption></figure>";
    }
  );
  /* 正文内图片路径：构建产物位于 posts/<slug>/ 子目录，需加 ../../ 前缀 */
  html = html.replace(/src="img\//g, 'src="../../img/');
  /* 正文内站内链接同样加前缀（写法：[文字](posts/<slug>/)，根路径下也成立） */
  html = html.replace(/href="posts\//g, 'href="../../posts/');
  return html;
}

/* 品牌合作文章（post.sponsored === true）：
   1. 正文里的外部链接自动加 rel="sponsored nofollow"（Google 链接合规要求）并新窗口打开；
   2. 页面与卡片显示「合作推广」披露标识。 */
function applySponsored(html, post) {
  if (!post.sponsored) return html;
  return html.replace(/<a href="(https?:\/\/[^"]*)"([^>]*)>/g, '<a href="$1"$2 rel="sponsored nofollow noopener" target="_blank">');
}

/* ---------- 文章页静态 head（替换 article.html 的 BUILD_HEAD 区间） ---------- */
function buildHead(post) {
  const url = SITE_URL + "/posts/" + post.slug + "/";
  const tags = (post.tags || []).map((t) => '    <meta property="article:tag" content="' + escapeHtml(t) + '">').join("\n");
  const blog = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date + "T00:00:00+08:00",
    dateModified: post.date + "T00:00:00+08:00",
    inLanguage: "zh-CN",
    keywords: (post.tags || []).join(", "),
    wordCount: post.content.replace(/\s/g, "").length,
    author: { "@type": "Person", name: BLOG.author, url: SITE_URL + "/about.html", sameAs: ["https://github.com/chuluono"] },
    publisher: { "@type": "Person", name: BLOG.author },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url: url,
    image: SITE_URL + "/" + (post.coverImg || "img/brand-icon.png"),
    articleSection: (post.tags || []),
    isPartOf: { "@type": "Blog", name: BLOG.siteName, url: SITE_URL },
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: SITE_URL + "/" },
      { "@type": "ListItem", position: 2, name: post.title, item: url },
    ],
  };
  /* FAQPage 结构化数据（GEO：AI 搜索最常引用的形态，对应文内 FAQ 小节） */
  const faqSchema = Array.isArray(post.faq) && post.faq.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } : null;
  return [
    "  <title>" + escapeHtml(post.title) + " · " + escapeHtml(BLOG.siteName) + "</title>",
    '  <meta name="description" content="' + escapeHtml(post.excerpt) + '">',
    '  <meta name="author" content="' + escapeHtml(BLOG.author) + '">',
    '  <meta name="keywords" content="' + escapeHtml((post.tags || []).join(",")) + '">',
    '  <link rel="canonical" href="' + url + '">',
    '  <meta name="robots" content="index,follow,max-image-preview:large">',
    '  <meta property="og:type" content="article">',
    '  <meta property="og:site_name" content="' + escapeHtml(BLOG.siteName) + '">',
    '  <meta property="og:title" content="' + escapeHtml(post.title) + " · " + escapeHtml(BLOG.siteName) + '">',
    '  <meta property="og:description" content="' + escapeHtml(post.excerpt) + '">',
    '  <meta property="og:url" content="' + url + '">',
    '  <meta property="og:locale" content="zh_CN">',
    '  <meta property="og:image" content="' + SITE_URL + "/" + (post.coverImg || "img/brand-icon.png") + '">',
    '  <meta property="article:published_time" content="' + post.date + 'T00:00:00+08:00">',
    '  <meta property="article:author" content="' + escapeHtml(BLOG.author) + '">',
    tags,
    '  <meta name="twitter:card" content="summary_large_image">',
    '  <meta name="twitter:title" content="' + escapeHtml(post.title) + " · " + escapeHtml(BLOG.siteName) + '">',
    '  <meta name="twitter:description" content="' + escapeHtml(post.excerpt) + '">',
    '  <meta name="twitter:image" content="' + SITE_URL + "/" + (post.coverImg || "img/brand-icon.png") + '">',
    '  <script type="application/ld+json">' + jsonLd(blog) + "</script>",
    '  <script type="application/ld+json">' + jsonLd(crumbs) + "</script>",
    faqSchema ? '  <script type="application/ld+json">' + jsonLd(faqSchema) + "</script>" : "",
  ].filter(Boolean).join("\n");
}

/* ---------- 系列教程侧栏：菜鸟教程式章节目录（点击进入对应章节页面） ---------- */
function seriesAsideHTML(post) {
  const members = seriesMap[post.series.id];
  const items = members.map((p) => {
    const cur = p.slug === post.slug;
    const num = String(p.series.part).padStart(2, "0");
    return '        <li><a class="chapter-link' + (cur ? " current" : "") + '"' + (cur ? ' aria-current="page"' : "") + ' href="../../posts/' + p.slug + '/"><i>' + num + "</i><span>" + escapeHtml(p.title) + "</span></a></li>";
  }).join("\n");
  return [
    '<aside class="series-side" id="seriesSide">',
    '  <div class="series-side-head"><span aria-hidden="true">📚</span><b>' + escapeHtml(post.series.title) + '</b><span class="series-side-count">' + post.series.part + " / " + members.length + "</span></div>",
    '  <nav class="series-chapters" aria-label="系列章节列表，点击进入对应章节页面">',
    "    <ol>",
    items,
    "    </ol>",
    "  </nav>",
    "</aside>",
  ].join("\n");
}

/* ---------- 文章页静态正文（结构与 article.html 动态渲染完全一致） ---------- */
function buildBody(post) {
  const tagChips = (post.tags || []).map(function (t) {
    return '<a class="tag-chip" href="../../index.html?tag=' + encodeURIComponent(t) + '">' + escapeHtml(t) + "</a>";
  }).join("");

  /* 延伸阅读：同标签优先，不足补最新 */
  const related = BLOG.posts
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ post: p, shared: (p.tags || []).filter((t) => (post.tags || []).indexOf(t) !== -1).length }))
    .sort((a, b) => b.shared - a.shared || b.post.date.localeCompare(a.post.date))
    .slice(0, 3)
    .map((x) => x.post);

  const relatedHTML = related.map(function (p) {
    return '<a class="mini-card reveal" href="../../posts/' + p.slug + '/">' +
      '<span class="emoji">' + p.emoji + "</span><span><h3>" + escapeHtml(p.title) +
      '</h3><div class="mini-meta">' + fmtDateCN(p.date) + " · 约 " + readingMin(p.content) + " 分钟</div></span></a>";
  }).join("");

  /* 上一篇 / 下一篇：系列教程按章节顺序（上一章/下一章），普通文章按日期 */
  let older, newer, dirPrev = "← 上一篇", dirNext = "下一篇 →";
  if (post.series) {
    const members = seriesMap[post.series.id];
    const ci = members.findIndex((p) => p.slug === post.slug);
    older = members[ci - 1];
    newer = members[ci + 1];
    dirPrev = "← 上一章";
    dirNext = "下一章 →";
  } else {
    const idx = sorted.findIndex((p) => p.slug === post.slug);
    older = sorted[idx + 1];
    newer = sorted[idx - 1];
  }
  const nb =
    (older
      ? '<a class="neighbor-card prev" id="navOlder" href="../../posts/' + older.slug + '/"><div class="dir">' + dirPrev + '</div><div class="t">' + escapeHtml(older.title) + "</div></a>"
      : "<span></span>") +
    (newer
      ? '<a class="neighbor-card next" id="navNewer" href="../../posts/' + newer.slug + '/"><div class="dir">' + dirNext + '</div><div class="t">' + escapeHtml(newer.title) + "</div></a>"
      : "<span></span>");

  const sponsorBadge = post.sponsored ? '<span class="sponsored-badge">合作推广</span>' : "";
  return [
    post.coverImg
      ? '<div class="article-banner" style="background: linear-gradient(135deg, ' + post.cover[0] + ", " + post.cover[1] + ')" aria-hidden="true"><img class="cover-img" src="../../' + post.coverImg + '" alt="" loading="lazy"></div>'
      : '<div class="article-banner" style="background: linear-gradient(135deg, ' + post.cover[0] + ", " + post.cover[1] + ')" aria-hidden="true"><span>' + post.emoji + "</span></div>",
    '<h1 class="article-title">' + escapeHtml(post.title) + "</h1>",
    '<div class="article-meta">',
      '<div class="meta-author"><img class="meta-avatar" src="../../img/avatar.png" alt="' + escapeHtml(BLOG.author) + ' 的头像">',
      '<div class="meta-text"><b>' + escapeHtml(BLOG.author) + '</b><span>发布于 ' + fmtDateCN(post.date) + " · 约 " + readingMin(post.content) + " 分钟读完</span></div></div>",
      '<div class="post-tags">' + sponsorBadge + tagChips + "</div></div>",
    '<div class="markdown-body" id="mdBody">' + applySponsored(renderContent(post.content), post) + "</div>",
    '<div class="end-mark" aria-hidden="true"><span class="line l"></span><span class="star">✦</span><span class="line r"></span></div>',
    '<p class="end-thanks">感谢阅读 · 期待与你交流</p>',
    '<section class="related"><div class="section-head"><h2>延伸阅读</h2></div><div class="related-grid">' + relatedHTML + "</div></section>",
    '<nav class="post-neighbor" id="neighbor">' + nb + "</nav>",
    '<p class="article-keyboard">键盘 <kbd>←</kbd> <kbd>→</kbd> 可快速切换文章</p>',
  ].join("");
}

/* ---------- 生成每篇文章的静态页 ---------- */
function buildPostPage(post) {
  let tpl = readFileSync(path.join(ROOT, "article.html"), "utf8");

  /* 1. 替换 head 区间 */
  const headStart = tpl.indexOf("<!-- BUILD_HEAD_START");
  const headEnd = tpl.indexOf("<!-- BUILD_HEAD_END -->");
  if (headStart === -1 || headEnd === -1) {
    throw new Error("article.html 缺少 BUILD_HEAD 标记");
  }
  tpl = tpl.slice(0, headStart) + buildHead(post) + "\n  " + tpl.slice(headEnd + "<!-- BUILD_HEAD_END -->".length);

  /* 2. 注入预渲染正文 */
  tpl = tpl.replace(
    '<article id="articleRoot"></article>',
    '<article id="articleRoot" data-prerendered="1">' + buildBody(post) + "</article>"
  );

  /* 2.5 系列教程：右侧页内目录替换为菜鸟教程式左侧章节列表侧栏 */
  if (post.series) {
    tpl = tpl.replace(/<aside class="toc" id="toc" hidden>[\s\S]*?<\/aside>/, seriesAsideHTML(post));
    tpl = tpl.replace('class="container article-wrap"', 'class="container article-wrap has-series"');
  }

  /* 3. 模板中的根级相对路径 → 子目录相对路径（../../） */
  tpl = tpl
    .replace(/href="index\.html"/g, 'href="../../index.html"')
    .replace(/href="notes\.html"/g, 'href="../../notes.html"')
    .replace(/href="about\.html"/g, 'href="../../about.html"')
    .replace(/href="css\//g, 'href="../../css/')
    .replace(/src="js\//g, 'src="../../js/')
    .replace(/src="lib\//g, 'src="../../lib/');
  return tpl;
}

/* ---------- sitemap.xml ---------- */
function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const lastmod = sorted.length ? sorted[0].date : today;
  const urls = [
    { loc: "/", lastmod: lastmod, freq: "daily", pri: "1.0" },
    { loc: "/notes.html", lastmod: today, freq: "weekly", pri: "0.6" },
    { loc: "/about.html", lastmod: today, freq: "monthly", pri: "0.6" },
  ].concat(sorted.map((p) => ({ loc: "/posts/" + p.slug + "/", lastmod: p.date, freq: "monthly", pri: "0.8" })));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) =>
      "  <url>\n    <loc>" + escapeXml(SITE_URL + u.loc) + "</loc>\n" +
      "    <lastmod>" + u.lastmod + "</lastmod>\n" +
      "    <changefreq>" + u.freq + "</changefreq>\n" +
      "    <priority>" + u.pri + "</priority>\n  </url>"
    ),
    "</urlset>",
  ].join("\n");
}

/* ---------- llms.txt / llms-full.txt（GEO：让 AI 一次读懂并收录全站） ---------- */
function buildLlms() {
  return [
    "# " + BLOG.siteName,
    "",
    "> " + BLOG.tagline + "。作者 " + BLOG.author + "，一名喜欢折腾的前端开发者，沉迷编程、音乐与 AI，白天写代码，晚上写博客。",
    "本站为纯静态个人博客，全部文章为原创中文内容，主题涵盖：AI 资讯与工具实测、编程技术与知识分享、音乐与生活随笔。",
    "所有文章均为 Markdown 书写，欢迎引用，引用时请注明作者与原文链接。",
    "",
    "## 文章列表",
    "",
    ...sorted.map(function (p) {
      return "- [" + p.title + "](" + SITE_URL + "/posts/" + p.slug + "/)：" + p.excerpt + (p.tags && p.tags.length ? "（主题关键词：" + p.tags.join("、") + "）" : "");
    }),
    "",
    "## 补充页面",
    "",
    "- [关于作者](" + SITE_URL + "/about.html)：" + BLOG.author + " 的介绍、技术栈与时间线",
    "- [随笔](" + SITE_URL + "/notes.html)：碎碎念、短想法与生活片段",
    "",
  ].join("\n");
}
function buildLlmsFull() {
  const parts = sorted.map(function (p) {
    return [
      "----------------------------------------",
      "标题: " + p.title,
      "链接: " + SITE_URL + "/posts/" + p.slug + "/",
      "日期: " + p.date,
      "标签: " + (p.tags || []).join("、"),
      "摘要: " + p.excerpt,
      "",
      p.content,
    ].join("\n");
  });
  return [
    "# " + BLOG.siteName + " · 全部文章全文（" + sorted.length + " 篇）",
    "> 作者: " + BLOG.author + " | " + BLOG.tagline,
    "> 本文件由 tools/build.mjs 自动生成，供 AI 检索与引用；转载请注明出处。",
    "",
    ...parts,
    "",
  ].join("\n");
}

/* ---------- 主流程 ---------- */
console.log("开始构建（站点地址: " + SITE_URL + "）");
if (SITE_URL.includes("YOUR-SITE.example")) {
  console.log("⚠ 提示：SITE_URL 还是占位符，部署后请修改 tools/build.mjs 顶部的 SITE_URL 并重新构建");
}

rmSync(POSTS_DIR, { recursive: true, force: true });
for (const p of sorted) {
  const dir = path.join(POSTS_DIR, p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), buildPostPage(p));
  console.log("  ✓ posts/" + p.slug + "/index.html");
}
writeFileSync(path.join(ROOT, "sitemap.xml"), buildSitemap());
writeFileSync(path.join(ROOT, "llms.txt"), buildLlms());
writeFileSync(path.join(ROOT, "llms-full.txt"), buildLlmsFull());
console.log("  ✓ sitemap.xml / llms.txt / llms-full.txt");
console.log("构建完成：共 " + sorted.length + " 篇文章。");
