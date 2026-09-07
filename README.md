# 知野 ZHIYE · 发文与维护指南

> 纯静态个人博客：无服务器、无数据库、零成本运行。
> 发一篇文章 = 改一个文件 → 跑一条命令 → git push，完事。

---

## 一、三步发一篇新文章

### 第 1 步：在 `js/posts.js` 添加文章对象

打开 `js/posts.js`，往 `posts` 数组**最前面**加一个对象（字段顺序保持一致，方便 diff）：

```js
{
  slug: "my-new-post",                      // 必填：小写字母/数字/连字符，≤64 字符，全局唯一
  title: "文章标题",                         // 必填：≤100 字
  date: "2026-09-03",                       // 必填：YYYY-MM-DD
  tags: ["前端", "生活"],                    // 必填：≤8 个，每个 ≤20 字
  emoji: "✍️",                              // 选填：卡片/封面 emoji，默认 📄
  cover: ["#667eea", "#764ba2"],            // 选填：渐变封面两色 #rrggbb
  excerpt: "一句话摘要，会用在列表卡片和 SEO 描述里。",   // 选填：≤200 字，建议写
  sponsored: true,                          // 选填：品牌合作文章设 true（见下方说明）
  series: { id: "html-tags", title: "HTML 标签速成", part: 1 },  // 选填：系列教程（见下方说明）
  content: `正文 Markdown……`,               // 必填：≤10 万字符
},
```

**系列教程（series）**：想做成「一章一页」的教程时，给该系列每篇文章都加 series 字段——同 `id` 的文章按 `part` 升序组成一个系列。构建自动生成两样东西：

1. 文章页**左侧的章节目录侧栏**（菜鸟教程式）：全部章节常驻列表，点击任意一章进入它的独立页面，当前章高亮；手机端变为顶部横向滑动章节条
2. 底部导航自动变为「**← 上一章 / 下一章 →**」（键盘 ← → 方向键同样可用）

首页列表视图中，一个系列只显示 `part` 最小的一章作为入口（卡片带「系列 · N 章」徽章），其余章节不在首页重复展示，通过文章页章节目录访问。普通文章不写 series 字段即完全不受影响（仍是按日期的上一篇/下一篇）。

**品牌合作文章（sponsored）**：给文章对象加 `sponsored: true` 后，构建会自动完成两件事——

1. 卡片和文章页显示琥珀色「合作推广」披露标识（合规要求：付费内容必须明示）
2. 正文里的外部链接自动加 `rel="sponsored nofollow noopener"` 并新窗口打开（Google 链接合规，不影响本站 SEO 权重）

**content 书写规范（重要）**：

- 内容是 JS 模板字符串，**正文里不要出现反引号 `` ` ``**（会破坏语法）；需要展示代码时用缩进代码块或 `~~~` 围栏
- 标题层级从 `##` 开始用（`#` 会与页面主标题重复，构建时会被自动降级为 `##`）
- 正文内引用其他文章请写完整相对链接：`../../posts/<slug>/`

### 第 2 步：本地构建

```bash
node tools/build.mjs
```

自动生成/更新：

| 产物 | 作用 |
|---|---|
| `posts/<slug>/index.html` | 每篇文章的**静态 HTML 页**（搜索引擎与 AI 爬虫抓全文的关键） |
| `sitemap.xml` | 站点地图 |
| `rss.xml` | RSS 订阅源 |
| `llms.txt` / `llms-full.txt` | AI 优化索引 / 全部文章全文（GEO） |

### 第 3 步：提交并推送

```bash
git add . && git commit -m "新文章：标题" && git push
```

平台监听 `main` 分支自动部署，约 30 秒后文章上线。

---

## 二、本地预览

```bash
# 工作区根目录（personal-blog 的上一级）
node dev-server.mjs
# → http://127.0.0.1:8765
```

或用任何静态服务器（如 `npx serve personal-blog`）。直接双击 index.html 也能看（file:// 下功能齐全）。

---

## 三、一次性配置（首次部署后做）

1. **改正式域名**：把下面文件里的 `https://YOUR-SITE.example` 全部替换为你的正式地址
   - `tools/build.mjs` 顶部的 `SITE_URL` 常量
   - `robots.txt`、`index.html`、`notes.html`、`about.html`
   - 替换后重新跑一次 `node tools/build.mjs`，把更新后的产物一起提交
2. **社交链接**（已配置：GitHub `chuluono` / 邮箱 `chuluo1000@qq.com` / B站）。以后要更换：
   - 首页侧栏作者卡：`index.html` 搜 `社交链接` 注释，改对应 `<a href>`
   - 关于页「找到我」：`about.html` 的 `contact-list` 区块
3. **提交搜索引擎**（各站长平台验证站点后提交 sitemap）：
   - Google Search Console → 提交 `sitemap.xml`
   - Bing Webmaster Tools（顺带覆盖国内必应/部分 AI 搜索）
   - 百度搜索资源平台 → 普通收录提交
4. **（可选）EdgeOne 构建自动化**：项目设置里把构建命令填成 `node tools/build.mjs`，以后只提交 `posts.js` 改动即可，平台自动构建（注意：GitHub Pages 镜像若也想自动构建，需在仓库里提交构建产物，即按上面三步走）

---

## 四、目录结构

```
personal-blog/
├── index.html            首页（侧栏作者卡/最近文章/随笔 + 搜索 + 标签筛选 + 分页列表）
├── article.html          动态兜底渲染页（?slug=；正式收录页在 posts/ 下）
├── notes.html            随笔页（时间轴展示 js/notes.js 全部随笔）
├── about.html / 404.html
├── posts/<slug>/index.html   【构建生成】每篇文章静态页
├── sitemap.xml / rss.xml / llms.txt / llms-full.txt  【构建生成】
├── robots.txt            爬虫规则（含明确欢迎 AI 爬虫）
├── js/posts.js           ★ 文章数据源（唯一需要日常修改的文件）
├── js/notes.js           随笔数据（随笔页 notes.html 展示，改完即生效无需构建）
├── js/main.js            共享脚本（主题/卡片/渐显/进度条）
├── css/style.css         全站样式（双主题，深色 OLED 纯黑）
├── lib/                  marked.js + DOMPurify（本地化，带 SRI 的 CDN 兜底）
├── img/avatar.png        头像
└── tools/build.mjs       ★ 静态构建生成器
```

---

## 五、SEO / GEO 已内置清单

- 每篇文章真实静态 URL（`posts/<slug>/`），HTML 里就是全文 —— 不依赖 JS 渲染，百度与 AI 爬虫也能直接读
- 文章页：canonical、description、keywords、author、OG/Twitter 卡片、`article:published_time`、JSON-LD `BlogPosting` + `BreadcrumbList`
- 首页：JSON-LD `WebSite`；关于页：JSON-LD `Person`（E-E-A-T 作者身份信号）
- 全站 `robots.txt` 明确欢迎 GPTBot / ClaudeBot / PerplexityBot / 豆包等 AI 爬虫
- `llms.txt`（AI 友好索引）+ `llms-full.txt`（全文语料）
- RSS 订阅源 + sitemap
- 语义化 HTML、唯一 h1、图片 alt、`lang="zh-CN"`、响应式与高性能（零阻塞资源）
