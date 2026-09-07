# 🚀 零成本部署指南 — 无服务器、无域名、无信用卡，国内直连流畅

> 本方案解决三个约束：**¥0 预算**、**无需信用卡**、**中国大陆不用 VPN 流畅访问**。
> 2026-09 起，知野 ZHIYE为**纯静态架构**：发文 = 改 `js/posts.js` → `node tools/build.mjs` → `git push`（详见 README.md）。

---

## 一、为什么不是 GitHub Pages？

GitHub Pages 本身免费且好用，但**服务器在海外**：2026 年至今，国内多数地区和运营商对 `*.github.io` 的访问仍不稳定（解析慢、加载卡顿、间歇性无法打开）。"国内流畅访问"这个目标它达不到。

**正确姿势：GitHub 只当代码仓库（免费），部署交给国内可直连的平台 —— 两者组合，体验和 GitHub Pages 一样（git push 即自动上线），但国内访客秒开。**

| 方案对比（2026-09 实测结论） | 国内访问 | 费用 | 信用卡 | 备注 |
|---|---|---|---|---|
| GitHub Pages | ❌ 不稳定 | 免费 | 不需要 | 可作海外镜像（见第五节） |
| Gitee Pages | — | 已停服 | — | — |
| Vercel / Netlify | ❌ 被墙/慢 | 免费 | 不需要 | — |
| Cloudflare Pages | ⚠️ 一般 | 免费 | 不需要 | — |
| **腾讯云 EdgeOne Pages ✅** | **✅ 流畅直连** | **免费** | **不需要** | 静态站点最佳选择 |

---

## 二、推荐架构

```
你写文章（js/posts.js）
      │  node tools/build.mjs（生成静态文章页 / sitemap / RSS / llms.txt）
      ▼
git push → GitHub 仓库（代码托管 + 完整备份，免费）
      │
      ▼ 自动构建部署（约 30 秒）
腾讯云 EdgeOne Pages（免费）
  └── 纯静态博客  →  https://你的项目.edgeone.app（国内直连）
        ├── 每篇文章真实静态页 posts/<slug>/（SEO/GEO 关键）
        ├── sitemap.xml / rss.xml / llms.txt（收录与 AI 可见性）
        └── robots.txt（欢迎搜索引擎与 AI 爬虫）
```

- 平台官方承诺**长期免费版**，无需信用卡，注册腾讯云账号（手机号/微信）+ 实名认证即可
- 全球 3200+ 边缘节点（亚洲 2500+），默认域名 `*.edgeone.app` 目前国内可直连、无需备案
- 免费额度（个人博客用不完）：

| 资源 | 免费版额度 |
|---|---|
| CDN 流量 / 请求数 | **不限量** |
| Edge Functions / Cloud Functions | 300 万次/月（纯静态用不到） |
| KV 存储 | 1 GB（纯静态用不到） |
| 构建次数 | 500 次/月 |
| 项目数 / 总容量 | 40 个 / 5 GB |

> 参考来源：腾讯云官方《限制与配额》cloud.tencent.com/document/product/1552/132789；官方定价页明确"免费版永久提供，商业化前超限也不中断服务"。

---

## 三、部署步骤（约 15 分钟）

### 第 1 步：把博客推上 GitHub

1. 在 GitHub 新建仓库（如 `personal-blog`，Public/Private 均可）
2. 本地执行：

```bash
cd personal-blog
git init
git add .
git commit -m "init: 个人博客"
git remote add origin https://github.com/<你的用户名>/personal-blog.git
git branch -M main
git push -u origin main
```

### 第 2 步：开通 EdgeOne Pages

1. 打开 `console.cloud.tencent.com`，用微信/手机号注册登录，完成**实名认证**（身份证，免费，不需要信用卡）
2. 控制台搜索 **EdgeOne** → 左侧菜单找到 **Pages** → 点击**立即开通**（免费）

### 第 3 步：连接 GitHub 仓库自动部署

1. Pages 控制台 → **创建项目** → **导入 Git 仓库** → 授权 GitHub
2. 选中 `personal-blog` 仓库，构建配置填写：
   - **框架预设**：无 / 静态站点
   - **构建命令**：留空（推荐：构建产物随代码提交，见 README 三步流程）或填 `node tools/build.mjs`（平台自动构建）
   - **输出目录**：`.`（仓库根目录）
   - **部署分支**：`main`
3. 点击部署，约 30 秒后获得 `https://personal-blog-xxxx.edgeone.app`

### 第 4 步：上线后一次性配置（SEO/GEO 收尾，10 分钟）

1. **替换正式域名**：全局搜索 `https://YOUR-SITE.example`，替换为你的实际地址：
   - `tools/build.mjs` 顶部 `SITE_URL`、`robots.txt`、`index.html`、`notes.html`、`about.html`
   - 重新 `node tools/build.mjs` 并提交（生成产物会带上正确域名）
2. **提交站长平台**（验证后提交 `sitemap.xml`）：
   - Google Search Console、Bing Webmaster Tools、百度搜索资源平台
3. **确认收录**：搜索 `site:你的域名` 观察收录进度；AI 侧可通过在 ChatGPT/Perplexity 提问你的文章主题来验证引用

### 第 5 步：日常更新

见 README.md「三步发一篇新文章」。核心就一句：

```bash
# 改 js/posts.js → node tools/build.mjs → git push
```

---

## 四、SEO / GEO 说明

本站已内置面向搜索引擎与 AI（GEO，生成引擎优化）的全部基础设施，无需额外配置：

| 层面 | 已内置 |
|---|---|
| 可抓取性 | 每篇文章真实静态 HTML（不依赖 JS 渲染），百度/AI 爬虫直接读全文 |
| 结构化数据 | 文章页 JSON-LD `BlogPosting` + `BreadcrumbList`；首页 `WebSite`；关于页 `Person` |
| 社交分享 | OG / Twitter Card 全套（标题、描述、图片、发布时间、标签） |
| 站点地图 | `sitemap.xml`（自动生成） |
| 订阅 | `rss.xml` |
| AI 可见性 | `robots.txt` 明确欢迎 GPTBot/ClaudeBot/PerplexityBot/Bytespider 等；`llms.txt` 站点索引 + `llms-full.txt` 全文语料 |
| 网页体验 | 语义化 HTML、唯一 h1、图片 alt、深浅双主题、零外部阻塞资源、HTTPS（平台默认） |

内容侧建议（影响最大的三件事）：标题写清"是什么/怎么做"、正文有可引用的结论段落、坚持稳定更新频率。

---

## 五、双保险（可选）：GitHub Pages 海外镜像

同一份代码也可以同时开一个 GitHub Pages（仓库 Settings → Pages → main 分支），作为海外访客的备用入口。国内访客走 EdgeOne，海外访客走 GitHub，互不影响。本仓库已含 `404.html`（使用站点根路径跳转），GitHub Pages 会自动用它兜底无效链接。

---

## 六、注意事项与风险声明

1. **默认域名合规风险**：`*.edgeone.app` 目前国内可直连，但平台对未备案域名的国内访问政策可能随合规要求调整（国际站已有默认域名访问受限的先例）。若未来遇到访问受限（如 401），解决方案是绑定自定义域名：
   - 未备案域名 → 走海外节点，国内仍可访问但速度一般
   - 已备案域名（域名约 ¥30-60/年 + 免费备案，备案通常要求持有云资源，需届时核实资格）→ 解锁中国大陆节点加速，最稳
2. **免费政策**：官方承诺免费版长期提供；商业化后额度可能调整，但纯静态博客的用量远低于当前额度。
3. **内容合规**：国内平台托管需遵守相关规定，博客内容避免违规即可正常使用。
4. **备份意识**：GitHub 仓库就是完整备份；文章数据源只在 `js/posts.js` 一处，随时可迁移到任何平台。

---

*最后更新：2026-09-03 · 纯静态架构 · 基于 EdgeOne Pages 免费版当前政策与公开实测*

---

## ✨ 2026-09 更新：GitHub Actions 自动构建已内置

仓库已含 `.github/workflows/deploy.yml`：**push 到 main → 云端自动构建 → 自动发布 GitHub Pages**，构建产物（posts/、sitemap、llms*.txt）已加入 .gitignore 不再入库，你只需要提交源文件。

- 站点地址自动计算（用户页仓库用根路径 / 项目仓库用子路径），SITE_URL 占位符在云端构建时自动替换，本地源码零改动
- 首次使用：GitHub 仓库 → Settings → Pages → Source 选 **GitHub Actions** 即可
- 若改走 EdgeOne Pages：连接 GitHub 仓库后把构建命令设为 `node tools/build.mjs`、发布目录设为根目录，同样自动化（workflow 不会干扰此路径）
