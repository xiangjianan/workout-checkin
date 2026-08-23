# 设置弹窗「功能切换」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在两个打卡页的设置弹窗中新增「功能切换」分组，双卡片一键互跳（`/` ↔ `/100`）。

**Architecture:** 纯静态 HTML + CSS，零 JS。两页各自硬编码本页「当前」卡片与指向另一页的 `<a>` 卡片；仅改 `styles.css`、`index.html`、`100.html`、`sw.js` 四个文件。相对文件名路径（`100.html` / `index.html`）兼容 file://、dev-server、Cloudflare Pages（Pages 会 308 规范化为 `/100`）。

**Tech Stack:** 原生 HTML/CSS（无构建）、Service Worker 缓存（`sw.js`）、`node --test` 现有测试套件。

**Spec:** `docs/superpowers/specs/2026-08-24-settings-route-switch-design.md`

**关于 TDD 的说明:** 本特性无新 JS 逻辑（纯静态 markup/CSS），spec 已明确不新增单测。验证方式 = 现有 `node --test` 全量回归 + dev-server 冒烟检查（curl）+ 手动验收清单。

---

### Task 1: styles.css 添加切换卡片样式

**Files:**
- Modify: `styles.css`（第 251 行 `.data-actions .btn { … }` 之后、第 253 行 `/* Settings */` 之前插入）

- [ ] **Step 1: 插入 `.switch-*` 样式块**

在 `styles.css` 第 251 行后插入（保持既有注释风格，样式全部走 CSS 变量，暗色模式自动适配）：

```css

/* 设置弹窗：功能切换分组（每日 / 健身两页互跳） */
.switch-group { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.switch-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface); text-decoration: none; color: var(--text);
  touch-action: manipulation; transition: border-color .15s, background .15s;
}
.switch-card .switch-emoji { font-size: 22px; line-height: 1; }
.switch-card .switch-name { font-size: 14px; font-weight: 600; }
.switch-card .switch-status { font-size: 12px; color: var(--muted); }
a.switch-card:hover, a.switch-card:active { border-color: var(--primary); background: var(--surface-2); }
.switch-card.is-current { background: var(--surface-2); cursor: default; }
.switch-card.is-current .switch-status { color: var(--primary); font-weight: 600; }
```

说明：hover/active 只作用于 `a.switch-card`，「当前」卡片是 `div`，不会出现误导性高亮；grid `1fr 1fr` 保证任何窄屏下都不塌缩成单列。

- [ ] **Step 2: 确认无语法问题**

Run: `node -e "const s=require('fs').readFileSync('styles.css','utf8'); const o=(s.match(/{/g)||[]).length, c=(s.match(/}/g)||[]).length; if(o!==c){console.error('花括号不配对', o, c); process.exit(1)}; console.log('OK, braces balanced')"`
Expected: `OK, braces balanced`

---

### Task 2: index.html 添加「功能切换」分组（每日页）

**Files:**
- Modify: `index.html`（第 84 行「修改开始日期…」说明段之后、第 85 行 `<div class="settings-group">`（数据管理）之前插入；第 18 行版本号）

- [ ] **Step 1: 插入功能切换分组**

在 `index.html` 第 84 行 `<p class="muted small">修改开始日期会重新计算打卡计划，已记录的打卡按日期保留。</p>` 之后插入：

```html
        <div class="settings-group">
          <h4 class="settings-group-title">功能切换</h4>
          <div class="switch-group">
            <div class="switch-card is-current" aria-current="page">
              <span class="switch-emoji">📅</span>
              <span class="switch-name">每日打卡</span>
              <span class="switch-status">● 当前</span>
            </div>
            <a class="switch-card" href="100.html">
              <span class="switch-emoji">🏋️</span>
              <span class="switch-name">健身打卡</span>
              <span class="switch-status">前往 →</span>
            </a>
          </div>
        </div>
```

- [ ] **Step 2: bump styles.css 引用版本**

`index.html` 第 18 行：`<link rel="stylesheet" href="styles.css?v=16">` → `href="styles.css?v=17"`（JS 引用 `?v=16` 不动，JS 文件未改）。

---

### Task 3: 100.html 添加「功能切换」分组（健身页，镜像）

**Files:**
- Modify: `100.html`（第 84 行「修改开始日期…」说明段之后、第 85 行数据管理分组之前插入；第 18 行版本号）

- [ ] **Step 1: 插入功能切换分组（与 Task 2 镜像：当前=健身，链接=每日）**

在 `100.html` 第 84 行 `<p class="muted small">修改开始日期会重新计算训练计划与目标，已记录的打卡按日期保留。</p>` 之后插入：

```html
        <div class="settings-group">
          <h4 class="settings-group-title">功能切换</h4>
          <div class="switch-group">
            <a class="switch-card" href="index.html">
              <span class="switch-emoji">📅</span>
              <span class="switch-name">每日打卡</span>
              <span class="switch-status">前往 →</span>
            </a>
            <div class="switch-card is-current" aria-current="page">
              <span class="switch-emoji">🏋️</span>
              <span class="switch-name">健身打卡</span>
              <span class="switch-status">● 当前</span>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: bump styles.css 引用版本**

`100.html` 第 18 行：`<link rel="stylesheet" href="styles.css?v=15">` → `href="styles.css?v=17"`（JS 引用 `?v=15` 不动）。

---

### Task 4: sw.js 缓存版本 bump

**Files:**
- Modify: `sw.js`（第 3 行）

- [ ] **Step 1: bump CACHE**

`sw.js` 第 3 行：`const CACHE = 'workout-v17';` → `const CACHE = 'workout-v18';`

说明：两个 HTML 与 styles.css 都变了，必须 bump 否则老访客继续命中旧缓存；新 SW 有 `skipWaiting()` + `clients.claim()`，下次加载立即生效。ASSETS 清单不变（无新增文件）。

---

### Task 5: 验证

- [ ] **Step 1: 现有测试全量回归**

Run: `npm test`
Expected: 全部 pass（本特性无 JS 改动，不应有任何失败）

- [ ] **Step 2: dev-server 冒烟检查**

Run: `npm run dev`（后台，默认端口 7100），然后：

```bash
curl -s http://localhost:7100/   | grep -c 'switch-card'            # 期望 2
curl -s http://localhost:7100/   | grep -o 'href="100.html"'        # 期望命中
curl -s http://localhost:7100/100 | grep -c 'switch-card'           # 期望 2（pretty URL 回退）
curl -s http://localhost:7100/100 | grep -o 'href="index.html"'     # 期望命中
```

- [ ] **Step 3: 手动验收清单**

浏览器逐项确认：
1. `http://localhost:7100/` → ⚙ 设置 → 「功能切换」位于开始日期与数据管理之间
2. 「📅 每日打卡」显示「● 当前」且不可点；「🏋️ 健身打卡」点击跳到健身页
3. 健身页设置弹窗镜像成立，点「📅 每日打卡」跳回
4. 亮/暗色模式下卡片样式正常（暗色用系统模拟）
5. 手机宽度（DevTools 375px）下两卡片仍并排
6. `file://` 直开两个 HTML 文件，互跳正常（验证相对路径）

---

### Task 6: 提交与部署

- [ ] **Step 1: 提交（单一 feat commit，含缓存 bump——遵循仓库 feature-per-commit 约定，cf. 516541d）**

```bash
git add styles.css index.html 100.html sw.js
git commit -m "feat: 设置弹窗新增功能切换，每日/健身两页互跳（缓存 bump v18）"
```

- [ ] **Step 2: 部署到 Cloudflare Pages（先征得用户同意）**

确认用户同意后执行（不要接管道，wrangler 输出会被缓冲）：

```bash
wrangler pages deploy . --project-name workout-checkin --branch main --commit-dirty=true
```

- [ ] **Step 3: 线上验证**

```bash
curl -sL https://workout-checkin-7g3.pages.dev/    | grep -c 'switch-card'   # 期望 2（-L 跟随 308）
curl -sL https://workout-checkin-7g3.pages.dev/100 | grep -c 'switch-card'   # 期望 2
```

注意：Pages 对 `*.html` 做 308 重定向到无扩展名路径，线上点链接后地址栏会规范化为 `/100`，属预期行为。
