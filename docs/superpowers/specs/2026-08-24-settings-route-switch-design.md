# 设置弹窗「功能切换」路由跳转 · 设计文档

- 日期：2026-08-24
- 状态：已确认（用户已认可设计方案）

## 背景与目标

项目现有两个相互独立的功能页：

| 路径 | 文件 | 功能 | 应用代码 |
| --- | --- | --- | --- |
| `/` | `index.html` | 📅 每日打卡（健身/学习二选一 · 50 天 · 1 万对赌） | `js/daily-*.js`（DailyApp） |
| `/100` | `100.html` | 🏋️ 健身打卡（每隔一天 · 100 天 · 50 次训练） | `js/{logic,store,ui,app}.js`（FTApp） |

两页只共享 `styles.css`，零共享 JS。目前切换功能只能手动改 URL。

**目标**：在两页的设置弹窗中新增「功能切换」分组，两张并排卡片一键跳到另一功能。

## 方案选型

**选定：静态 HTML + CSS，零 JS。**

- 备选 B（新增共享 `js/switcher.js` 渲染组件）：被否——打破「两 app 零共享 JS」的结构约定，为 ~10 行 markup 引入新脚本与 SW 资产清单变更，得不偿失。
- 备选 C（合并单页 + hash 路由）：被否——重写两个独立 app，YAGNI。

## UI 设计

**位置**：`modal-settings` 内，「计划开始日期」字段之后、「数据管理」分组之前。

**结构**：复用现有 `.settings-group` + `.settings-group-title`（标题「功能切换」），内部为两列卡片 grid：

```
── 功能切换 ─────────────
┌──────────┐  ┌──────────┐
│ 📅 每日   │  │ 🏋️ 健身  │
│ 打卡      │  │ 打卡     │
│ ● 当前    │  │ 前往 →   │
└──────────┘  └──────────┘
```

- `index.html`：左卡「📅 每日打卡」为当前（非链接）；右卡「🏋️ 健身打卡」为 `<a href="100.html">前往 →</a>`
- `100.html`：左卡「📅 每日打卡」为 `<a href="index.html">前往 →</a>`；右卡「🏋️ 健身打卡」为当前
- 当前卡片：弱化样式 + 角标「● 当前」+ `aria-current="page"`；跳转卡片：语义 `<a>`，整卡可点，hover/active 有反馈

## 路由

使用**相对文件名路径**（`100.html` / `index.html`），不依赖 `/100` pretty URL，三种运行环境全部可用：

1. `file://` 本地双击直开
2. `node scripts/dev-server.js` 局域网服务（含 Cloudflare Pages 同款 pretty URL 回退）
3. Cloudflare Pages 线上（`/100.html` 与 `/100` 均可直接响应）

跳转为普通整页导航，由现有 Service Worker（cache-first）接管，目标页离线亦可达。

## 样式

`styles.css` 追加（预计 ~30 行）：

- `.switch-group`：两列等宽 grid，窄屏（<380px）保持两列不塌缩
- `.switch-card`：卡片基础样式（边框、圆角、内边距、emoji + 名称 + 状态行）
- `.switch-card.is-current`：当前态（弱化、去指针、角标「● 当前」）
- `.switch-card` 为链接时：hover/active 边框与背景反馈

## 明确不做

- 不加跳转确认弹窗（导航无副作用）
- 不做「记住上次功能」（URL 即状态；两个 PWA manifest 本就提供独立入口）
- 不新增 JS 逻辑、不新增共享脚本
- 不改 `_redirects`、manifest、SW fetch 策略

## 发布配套

- `styles.css` 有改动，两页引用版本统一 bump 至 `v=17`：`index.html`（v16→v17）、`100.html`（v15→v17）；JS 文件未改动，其 `?v=` 保持不变
- `sw.js` `CACHE`：`workout-v17` → `workout-v18`（两个 HTML 与 styles.css 均进入缓存失效范围，部署前必做）

## 测试与验收

- 自动化：无新逻辑，不新增单测；跑现有 `node --test` 全量确认无回归
- 手动验收：
  1. `npm run dev` 打开两页设置弹窗，确认分组位置、当前态标注、卡片互跳
  2. `file://` 直开两个 HTML，验证相对路径跳转
  3. 线上部署后验证 SW 更新流程（检查更新 → 新设置弹窗出现切换分组）
