# 自定义分组(每组数量可不同)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分组功能支持自定义每组数量——输入组数自动近似均分,逐组微调,最后一组自动补差,一键应用于 5 项。

**Architecture:** 数据模型从均匀的 `{sets, reps}` 统一迁移为 `groupReps: number[]` 数组,读取时经 `_exercise()` / `normalizeRecords()` 规范化旧格式(不迁移 localStorage 原始数据);UI 在现有「分组完成(高级)」折叠区内新增内联自定义面板,输入草稿由 app 层持有,输入时仅局部更新 DOM 避免丢焦点。

**Tech Stack:** 零依赖浏览器全局脚本(logic/store/ui/app 分层)+ `node:test`(vm 加载,见 `test/helpers/load.js`)。

**Spec:** `docs/superpowers/specs/2026-08-27-custom-groups-design.md`

**运行测试命令:** 在仓库根目录 `npm test`(等价 `node --test`,自动发现 `test/*.test.js`)。

**单个测试文件运行:** `node --test test/custom-groups.test.js`

---

### Task 1: 测试基建扩展 + `FTLogic.splitEvenly`

**Files:**
- Modify: `test/helpers/load.js`(loadFT 支持自定义 bridge)
- Modify: `js/logic.js:75-83`(groupOptions 旁新增 splitEvenly)
- Create: `test/custom-groups.test.js`

- [ ] **Step 1: 扩展 loadFT 支持自定义 bridge 名单**

`test/helpers/load.js` 中把:

```js
function loadFT(files = ['js/logic.js', 'js/ui.js']) {
  return loadBundle(files, ['FT_CONFIG', 'FT_EXERCISES', 'FTLogic', 'FTUI']);
}
```

改为(加第二个默认参数,现有调用不受影响):

```js
function loadFT(files = ['js/logic.js', 'js/ui.js'], bridgeNames = ['FT_CONFIG', 'FT_EXERCISES', 'FTLogic', 'FTUI']) {
  return loadBundle(files, bridgeNames);
}
```

- [ ] **Step 2: 写失败测试**

创建 `test/custom-groups.test.js`:

```js
// test/custom-groups.test.js —— 自定义分组:拆分算法 / 预览校验 / store 迁移 / UI 渲染

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFT } = require('./helpers/load');

// store 层测试需要把 js/store.js 一并加载并桥接 FTStore
function loadStore() {
  return loadFT(['js/logic.js', 'js/store.js'], ['FT_CONFIG', 'FT_EXERCISES', 'FTLogic', 'FTStore']);
}

// ---- FTLogic.splitEvenly ----

test('splitEvenly:整除时均分', () => {
  const { FTLogic } = loadFT();
  assert.deepEqual(FTLogic.splitEvenly(100, 4), [25, 25, 25, 25]);
  assert.deepEqual(FTLogic.splitEvenly(10, 2), [5, 5]);
});

test('splitEvenly:不整除时余数分给前几组(前大后小)', () => {
  const { FTLogic } = loadFT();
  assert.deepEqual(FTLogic.splitEvenly(100, 3), [34, 33, 33]);
  assert.deepEqual(FTLogic.splitEvenly(7, 3), [3, 2, 2]);
});

test('splitEvenly:组数非法返回 null(<2、>total、非整数、total 非整数)', () => {
  const { FTLogic } = loadFT();
  assert.equal(FTLogic.splitEvenly(100, 1), null);
  assert.equal(FTLogic.splitEvenly(100, 101), null);
  assert.equal(FTLogic.splitEvenly(100, 2.5), null);
  assert.equal(FTLogic.splitEvenly('x', 3), null);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test test/custom-groups.test.js`
Expected: FAIL,`FTLogic.splitEvenly is not a function` 之类错误。

- [ ] **Step 4: 实现 splitEvenly**

`js/logic.js` 中 `groupOptions(target) { ... }`(约 75-83 行)之后新增:

```js
  // 把 total 个拆成 sets 组的近似均匀分组,余数分给前几组(前大后小)
  // 如 (100, 3) → [34, 33, 33];组数非法(非整数 / <2 / >total)返回 null
  splitEvenly(total, sets) {
    if (!Number.isInteger(total) || !Number.isInteger(sets) || sets < 2 || sets > total) return null;
    const base = Math.floor(total / sets);
    const rem = total % sets;
    return Array.from({ length: sets }, (_, i) => (i < rem ? base + 1 : base));
  },
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test test/custom-groups.test.js`
Expected: PASS(3 个 splitEvenly 测试全绿)。

- [ ] **Step 6: Commit**

```bash
git add test/helpers/load.js test/custom-groups.test.js js/logic.js
git commit -m "feat: 新增 splitEvenly 近似均匀拆分算法(自定义分组前置)"
```

---

### Task 2: `FTLogic.customGroupsPreview`(草稿校验纯函数)

**Files:**
- Modify: `js/logic.js`(splitEvenly 之后新增)
- Modify: `test/custom-groups.test.js`(追加测试)

- [ ] **Step 1: 写失败测试**

`test/custom-groups.test.js` 末尾追加:

```js
// ---- FTLogic.customGroupsPreview ----

test('customGroupsPreview:前面组合法则尾组自动补差', () => {
  const { FTLogic } = loadFT();
  const pv = FTLogic.customGroupsPreview(100, ['34', '33']);
  assert.equal(pv.ok, true);
  assert.equal(pv.last, 33);
  assert.equal(pv.sum, 100);
  assert.equal(pv.error, '');
});

test('customGroupsPreview:前面组之和过大则失败', () => {
  const { FTLogic } = loadFT();
  const pv = FTLogic.customGroupsPreview(100, ['60', '50']);
  assert.equal(pv.ok, false);
  assert.equal(pv.last, -10);
  assert.ok(pv.error.includes('过大'), '错误信息应提示前面组数量过大');
});

test('customGroupsPreview:每组须为 ≥1 的整数(空/0/小数/非数字)', () => {
  const { FTLogic } = loadFT();
  for (const bad of [['', '33'], ['0', '33'], ['3.5', '33'], ['abc', '33']]) {
    const pv = FTLogic.customGroupsPreview(100, bad);
    assert.equal(pv.ok, false, `${JSON.stringify(bad)} 应判无效`);
    assert.ok(pv.error.includes('≥1'), `错误信息应说明每组 ≥1:${pv.error}`);
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/custom-groups.test.js`
Expected: 新增 3 个测试 FAIL(`customGroupsPreview is not a function`),既有测试仍 PASS。

- [ ] **Step 3: 实现 customGroupsPreview**

`js/logic.js` 中 `splitEvenly` 之后新增:

```js
  // 自定义分组草稿预览:values 为前 n-1 组的原始输入(字符串),
  // 返回 { ok, last(尾组=目标-前面组之和), sum, error }
  customGroupsPreview(target, values) {
    const nums = values.map((v) => {
      const n = Number(String(v).trim());
      return Number.isInteger(n) ? n : NaN;
    });
    if (nums.some((n) => !Number.isInteger(n) || n < 1)) {
      return { ok: false, last: null, sum: null, error: '每组数量需为 ≥1 的整数' };
    }
    const headSum = nums.reduce((a, b) => a + b, 0);
    const last = target - headSum;
    if (last < 1) {
      return { ok: false, last, sum: headSum, error: '前面组数量过大,最后一组不够分' };
    }
    return { ok: true, last, sum: target, error: '' };
  },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/custom-groups.test.js`
Expected: PASS(全部)。

- [ ] **Step 5: Commit**

```bash
git add js/logic.js test/custom-groups.test.js
git commit -m "feat: 新增 customGroupsPreview 自定义分组草稿校验"
```

---

### Task 3: store 迁移 `groupReps` + ui/app 调用方适配(同一 commit 保证页面可用)

**Files:**
- Modify: `js/store.js`(`_exercise` / `applyGroups` / `_setSetDone` / `clearGroups` / `resetExercise` / `applyGroupsAll` / 新增 `normalizeRecords`,`load`/`importJSON` 接入)
- Modify: `js/ui.js:179-181`(renderBatchSection 读 groupReps)、`js/ui.js:241-242`(renderExerciseCard 读 groupReps)
- Modify: `js/app.js:303-305`(apply-groups-all 构造数组)
- Modify: `test/custom-groups.test.js`(追加测试)

- [ ] **Step 1: 写失败测试**

`test/custom-groups.test.js` 末尾追加:

```js
// ---- FTStore:groupReps 数据模型 ----

test('applyGroups:接收每组数量数组,groupReps/setDone 对齐', () => {
  const { FTStore } = loadStore();
  let s = { startDate: '2024-06-13', records: {} };
  s = FTStore.applyGroups(s, '2024-06-13', 'pushup', [34, 33, 33]);
  const ex = s.records['2024-06-13'].exercises.pushup;
  assert.deepEqual(ex.groupReps, [34, 33, 33]);
  assert.equal(ex.setDone.length, 3);
  assert.equal(ex.completed, 0);
});

test('非均匀分组逐组打卡:completed 按各组数量累加', () => {
  const { FTStore } = loadStore();
  let s = { startDate: '2024-06-13', records: {} };
  s = FTStore.applyGroups(s, '2024-06-13', 'pushup', [34, 33, 33]);
  s = FTStore.toggleSet(s, '2024-06-13', 'pushup', 0);
  assert.equal(s.records['2024-06-13'].exercises.pushup.completed, 34);
  s = FTStore.toggleSet(s, '2024-06-13', 'pushup', 1);
  assert.equal(s.records['2024-06-13'].exercises.pushup.completed, 67);
});

test('旧格式记录(sets/reps)规范化为 groupReps 后可继续打卡', () => {
  const { FTStore } = loadStore();
  const legacy = {
    '2024-06-13': {
      exercises: { pushup: { completed: 25, sets: 4, reps: 25, setDone: [true, false, false, false] } },
    },
  };
  const records = FTStore.normalizeRecords(legacy);
  const ex = records['2024-06-13'].exercises.pushup;
  assert.deepEqual(ex.groupReps, [25, 25, 25, 25]);
  assert.equal(ex.sets, undefined); // 旧字段不再保留
  assert.equal(ex.setDone.length, 4);

  let s = { startDate: '2024-06-13', records };
  s = FTStore.toggleSet(s, '2024-06-13', 'pushup', 1);
  assert.equal(s.records['2024-06-13'].exercises.pushup.completed, 50);
});

test('clearGroups / resetExercise 清空 groupReps', () => {
  const { FTStore } = loadStore();
  let s = { startDate: '2024-06-13', records: {} };
  s = FTStore.applyGroups(s, '2024-06-13', 'pushup', [34, 33, 33]);
  s = FTStore.clearGroups(s, '2024-06-13', 'pushup');
  assert.deepEqual(s.records['2024-06-13'].exercises.pushup.groupReps, []);
  s = FTStore.applyGroups(s, '2024-06-13', 'pushup', [34, 33, 33]);
  s = FTStore.resetExercise(s, '2024-06-13', 'pushup');
  assert.deepEqual(s.records['2024-06-13'].exercises.pushup.groupReps, []);
  assert.deepEqual(s.records['2024-06-13'].exercises.pushup.setDone, []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/custom-groups.test.js`
Expected: 新增 4 个测试 FAIL(applyGroups 收数组时行为不符 / normalizeRecords 不存在),既有测试仍 PASS。

- [ ] **Step 3: 实现 store 改动**

`js/store.js`:

3a. `_exercise()`(原 53-61 行)整体替换为:

```js
  // 取某天某项目的规范化记录(深拷贝,避免外部误改)
  // 旧均匀分组字段 sets/reps 自动迁移为 groupReps 数组(长度 = sets,每项 = reps)
  _exercise(record, exId) {
    const prev = (record.exercises && record.exercises[exId]) || {};
    const groupReps = Array.isArray(prev.groupReps)
      ? [...prev.groupReps]
      : prev.sets && prev.reps
        ? new Array(prev.sets).fill(prev.reps)
        : [];
    return {
      completed: prev.completed || 0,
      groupReps,
      setDone: Array.isArray(prev.setDone) ? prev.setDone.slice(0, groupReps.length) : [],
    };
  },
```

3b. `resetExercise()`(原 79-86 行)替换为:

```js
  resetExercise(state, dateStr, exId) {
    return this.updateExercise(state, dateStr, exId, () => ({
      completed: 0,
      groupReps: [],
      setDone: [],
    }));
  },
```

3c. `applyGroups()`(原 89-96 行)替换为(签名改为数组):

```js
  // 应用分组配置:groupReps 为每组数量数组(如 [34, 33, 33]),重新开始本项目的分组进度
  applyGroups(state, dateStr, exId, groupReps) {
    return this.updateExercise(state, dateStr, exId, () => ({
      completed: 0,
      groupReps: [...groupReps],
      setDone: new Array(groupReps.length).fill(false),
    }));
  },
```

3d. `clearGroups()`(原 98-106 行)替换为:

```js
  // 清除分组配置:保留已完成的个数
  clearGroups(state, dateStr, exId) {
    return this.updateExercise(state, dateStr, exId, (ex) => ({
      completed: ex.completed,
      groupReps: [],
      setDone: [],
    }));
  },
```

3e. `_setSetDone()`(原 109-122 行)中,把开头的守卫和 completed 计算改为按 groupReps:

```js
  _setSetDone(state, dateStr, exId, setIndex, value) {
    return this.updateExercise(state, dateStr, exId, (ex) => {
      const n = ex.groupReps.length;
      if (!n || ex.setDone.length !== n || setIndex >= n) return ex;
      // 顺序约束:只能勾选“第一个未完成组”,或取消“最后一个已完成组”
      let prefix = 0;
      while (ex.setDone[prefix]) prefix++;
      if (value && setIndex !== prefix) return ex;      // 前面的组未完成,不能勾选这组
      if (!value && setIndex !== prefix - 1) return ex; // 只能从最后一组往前取消
      const setDone = [...ex.setDone];
      setDone[setIndex] = value;
      const completed = ex.groupReps.reduce((sum, r, i) => (setDone[i] ? sum + r : sum), 0);
      return { ...ex, setDone, completed };
    });
  },
```

3f. `applyGroupsAll()`(原 134-138 行)替换为:

```js
  // 一键给 5 个项目应用同一分组方案(groupReps 为每组数量数组)
  applyGroupsAll(state, dateStr, groupReps) {
    let s = state;
    for (const ex of FT_EXERCISES) s = this.applyGroups(s, dateStr, ex.id, groupReps);
    return s;
  },
```

3g. `load()` 中(原 16-19 行)返回值改为规范化后的 records,并在 `importJSON` 后新增 `normalizeRecords`:

```js
      return {
        startDate: typeof parsed.startDate === 'string' ? parsed.startDate : FTLogic.todayStr(),
        records: this.normalizeRecords(parsed.records),
      };
```

```js
  // 把历史记录(可能是旧 sets/reps 格式)整体规范化为 groupReps 形态
  normalizeRecords(records) {
    const out = {};
    for (const [dateStr, rec] of Object.entries(records || {})) {
      const exercises = {};
      for (const exId of Object.keys((rec && rec.exercises) || {})) {
        exercises[exId] = this._exercise(rec, exId);
      }
      out[dateStr] = { ...rec, exercises };
    }
    return out;
  },
```

`importJSON()`(原 39-45 行)返回值同步改为:

```js
    return { startDate: parsed.startDate, records: this.normalizeRecords(parsed.records) };
```

- [ ] **Step 4: ui.js 读取点适配(行为不变)**

`js/ui.js` `renderBatchSection` 中(原 179-180 行):

```js
    const ref = record && record.exercises && record.exercises[FT_EXERCISES[0].id];
    const curSets = (ref && ref.sets) || 0;
```

改为:

```js
    const ref = record && record.exercises && record.exercises[FT_EXERCISES[0].id];
    const refGroups = (ref && ref.groupReps) || [];
    const curSets = refGroups.length;
```

`renderExerciseCard` 中(原 241-242 行):

```js
    const sets = (exRec && exRec.sets) || 0;
```

改为:

```js
    const groupReps = (exRec && exRec.groupReps) || [];
    const sets = groupReps.length;
```

- [ ] **Step 5: app.js 调用点适配**

`js/app.js` `handleCheckinAction` 中(原 303-305 行):

```js
    if (action === 'apply-groups-all') {
      this.commit(FTStore.applyGroupsAll(this.state, dateStr, Number(btn.dataset.sets), Number(btn.dataset.reps)));
      return;
    }
```

改为(chips 仍是均匀方案,构造等值数组):

```js
    if (action === 'apply-groups-all') {
      const sets = Number(btn.dataset.sets);
      const reps = Number(btn.dataset.reps);
      this.commit(FTStore.applyGroupsAll(this.state, dateStr, new Array(sets).fill(reps)));
      return;
    }
```

- [ ] **Step 6: 运行全量测试**

Run: `npm test`
Expected: 全部 PASS(含既有 celebration-stats / daily / sw 测试)。

- [ ] **Step 7: 手动冒烟(行为回归)**

Run: `npm run dev` 后浏览器打开 `http://localhost:3000`(端口以 dev-server 输出为准),点开今天(或任一训练日)→「分组完成(高级)」:
- 点 `4组×25` chip → 逐组按钮出现 4 个;完成第 1 组 → 俯卧撑计数 +25
- 「清除分组」→ 逐组按钮消失,计数保留
- 若浏览器 localStorage 里有旧数据:重新打开页面,已分组日期的逐组按钮仍正常显示

- [ ] **Step 8: Commit**

```bash
git add js/store.js js/ui.js js/app.js test/custom-groups.test.js
git commit -m "refactor: 分组数据模型迁移为 groupReps 数组,读取时兼容旧 sets/reps 格式"
```

---

### Task 4: 逐组按钮显示数量 + chips 均匀高亮 + 当前方案摘要

**Files:**
- Modify: `js/ui.js`(renderBatchSection / renderExerciseCard)
- Modify: `test/custom-groups.test.js`(追加测试)

- [ ] **Step 1: 写失败测试**

`test/custom-groups.test.js` 末尾追加:

```js
// ---- UI:逐组数量显示 / chips 高亮 / 当前摘要 ----

function targetsAll(n) {
  const t = {};
  for (const ex of FT_EXERCISES) t[ex.id] = n;
  return t;
}
function recWithGroups(groups, setDone) {
  const exercises = {};
  for (const ex of FT_EXERCISES) {
    exercises[ex.id] = { completed: 0, groupReps: [...groups], setDone: [...setDone] };
  }
  return { exercises };
}

test('renderBatchSection:当前分组摘要显示 N 组与各组数量', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(recWithGroups([34, 33, 33], [false, false, false]), targetsAll(100));
  assert.match(html, /当前 3 组 34\+33\+33/);
});

test('renderBatchSection:非均匀分组不高亮任何 chip', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(recWithGroups([34, 33, 33], [false, false, false]), targetsAll(100));
  assert.doesNotMatch(html, /class="chip on"/);
});

test('renderBatchSection:均匀分组时高亮对应 chip', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(recWithGroups([25, 25, 25, 25], [false, false, false, false]), targetsAll(100));
  assert.match(html, /class="chip on"[\s\S]*?data-sets="4"/);
});

test('renderBatchSection:批量逐组按钮显示每组数量', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(recWithGroups([34, 33, 33], [false, false, false]), targetsAll(100));
  assert.match(html, /第1组·34/);
  assert.match(html, /第2组·33/);
});

test('renderExerciseCard:mini 组按钮显示每组数量,组号在 title', () => {
  const { FTUI, FT_EXERCISES } = loadFT();
  const rec = { exercises: { pushup: { completed: 34, groupReps: [34, 33, 33], setDone: [true, false, false] } } };
  const html = FTUI.renderExerciseCard(FT_EXERCISES[0], 100, rec);
  assert.match(html, /title="第1组 · 34 个"/);
  assert.match(html, />34 ✓</);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/custom-groups.test.js`
Expected: 新增 5 个测试 FAIL(摘要 / 高亮 / 数量显示均未实现),既有测试 PASS。

- [ ] **Step 3: 实现 renderBatchSection 改动**

`js/ui.js` `renderBatchSection` 中:

3a. chips 高亮(原 183-188 行)把 `curSets === o.sets` 的判断改为均匀匹配:

```js
    // 仅当当前分组恰好均匀(每组同值)时,高亮对应 chip
    const uniform = curSets > 0 && refGroups.every((r) => r === refGroups[0]);
    const chips = FTLogic.groupOptions(sharedTarget).map((o) => `
      <button class="chip ${uniform && curSets === o.sets && refGroups[0] === o.reps ? 'on' : ''}"
              data-action="apply-groups-all" data-sets="${o.sets}" data-reps="${o.reps}">
        ${o.sets}组 ×${o.reps}
      </button>`).join('');
```

3b. 逐组按钮(原 204-218 行)把 `${k + 1}组` 处带上数量——`Array.from` 循环内改为:

```js
        return `<button class="set-btn batch ${cls} ${locked ? 'locked' : ''}" data-action="toggle-set-all" data-set="${k}" ${locked ? 'disabled' : ''}>
          第${k + 1}组·${refGroups[k]} <em>${mark}</em>${locked ? '<i class="lock">🔒</i>' : ''}</button>`;
```

3c. 标题行(原 229 行)追加当前摘要:

```js
          <span class="batch-title">分组方案 <small>每项目标 ${sharedTarget} 个 · 一键应用于全部 5 项${curSets > 0 ? ` · 当前 ${curSets} 组 ${refGroups.join('+')}` : ''}</small></span>
```

- [ ] **Step 4: 实现 renderExerciseCard 改动**

`js/ui.js` `renderExerciseCard` 中 mini 按钮模板(原 256-262 行)改为:

```js
      const btns = Array.from({ length: sets }, (_, k) => {
        const locked = !(k === prefix || k === prefix - 1);
        return `<button class="set-btn mini ${setDone[k] ? 'on' : ''} ${locked ? 'locked' : ''}"
            data-action="toggle-set" data-set="${k}"${locked ? ' disabled' : ''}
            title="第${k + 1}组 · ${groupReps[k]} 个" aria-label="第${k + 1}组 ${groupReps[k]} 个">
            ${groupReps[k]}${setDone[k] ? ' ✓' : locked ? ' 🔒' : ''}</button>`;
      }).join('');
```

- [ ] **Step 5: 运行全量测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add js/ui.js test/custom-groups.test.js
git commit -m "feat: 组按钮显示每组数量,chips 均匀匹配高亮,标题显示当前分组摘要"
```

---

### Task 5: 自定义面板渲染 + 样式

**Files:**
- Modify: `js/ui.js`(renderBatchSection 签名加 customOpen/draft;新增 renderCustomGroupsPanel)
- Modify: `styles.css`(文件末尾追加面板样式)
- Modify: `test/custom-groups.test.js`(追加测试)

- [ ] **Step 1: 写失败测试**

`test/custom-groups.test.js` 末尾追加:

```js
// ---- UI:自定义分组面板 ----

test('面板:有效草稿显示每组输入、尾组补差与可点的应用按钮', () => {
  const { FTUI } = loadFT();
  const draft = { target: 100, count: 3, values: ['34', '33'] };
  const html = FTUI.renderBatchSection(null, targetsAll(100), true, draft);
  assert.match(html, /✏️ 自定义/);
  assert.match(html, /value="34"/);
  assert.match(html, /\+33/);          // 尾组自动补差
  assert.match(html, /合计 100 \/ 100 ✓/);
  assert.doesNotMatch(html, /apply-groups-custom" disabled/);
});

test('面板:前面组之和过大时应用按钮禁用并显示错误', () => {
  const { FTUI } = loadFT();
  const draft = { target: 100, count: 3, values: ['60', '50'] };
  const html = FTUI.renderBatchSection(null, targetsAll(100), true, draft);
  assert.match(html, /apply-groups-custom" disabled/);
  assert.match(html, /cg-sum err/);
  assert.match(html, /过大/);
});

test('面板:默认关闭时不渲染(customOpen=false)', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(null, targetsAll(100));
  assert.ok(!html.includes('custom-groups'), '面板不应出现');
  assert.match(html, /✏️ 自定义/); // 按钮仍在
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/custom-groups.test.js`
Expected: 新增 3 个测试 FAIL(面板未实现),既有 PASS。

- [ ] **Step 3: 实现面板渲染**

3a. `js/ui.js` 新增 `renderCustomGroupsPanel`(放在 `renderBatchSection` 之后):

```js
  // 自定义分组面板:组数自动均分 → 前 n-1 组可调 → 最后一组自动补差(只读)
  renderCustomGroupsPanel(target, draft) {
    const groups = FTLogic.splitEvenly(target, draft.count) || FTLogic.splitEvenly(target, 2);
    const count = groups.length;
    // 草稿长度与组数不匹配时(如刚改完组数),回退为均分默认值
    const values = draft.values.length === count - 1 ? draft.values : groups.slice(0, -1).map(String);
    const pv = FTLogic.customGroupsPreview(target, values);
    const inputs = values.map((v, i) => `
      <label class="cg-item"><span>第${i + 1}组</span>
        <input class="cg-rep" data-idx="${i}" type="number" inputmode="numeric" min="1" value="${v}">
      </label>`).join('');
    const tailVal = pv.last === null ? '—' : `+${pv.last}`;
    const sumLine = pv.ok
      ? `合计 ${target} / ${target} ✓`
      : `合计 ${pv.sum === null ? '?' : pv.sum} / ${target} · ${pv.error}`;
    return `
      <div class="custom-groups">
        <div class="cg-row">
          <label class="cg-item"><span>组数</span>
            <input class="cg-count" type="number" inputmode="numeric" min="2" max="${target}" value="${count}">
          </label>
          <span class="cg-hint">改组数自动重新均分 · 最后一组自动补差</span>
        </div>
        <div class="cg-groups">${inputs}
          <label class="cg-item tail"><span>第${count}组</span>
            <input class="cg-rep tail" readonly tabindex="-1" value="${tailVal}">
          </label>
        </div>
        <div class="cg-sum ${pv.ok ? '' : 'err'}">${sumLine}</div>
        <button class="btn btn-mini primary" data-action="apply-groups-custom"${pv.ok ? '' : ' disabled'}>应用分组</button>
      </div>`;
  },
```

3b. `renderBatchSection` 签名(原 174 行)改为:

```js
  renderBatchSection(record, targets, customOpen = false, draft = null) {
```

3c. `renderBatchSection` 内 chips 拼接后加「✏️ 自定义」按钮(与 chips 同一容器):

```js
    const customChip = `
      <button class="chip custom ${customOpen ? 'on' : ''}" data-action="toggle-custom-groups">✏️ 自定义</button>`;
```

`<div class="chips">${chips}</div>` 改为 `<div class="chips">${chips}${customChip}</div>`。

3d. 返回模板中,`batch-row` 之后、`batchSets` 之前插入面板:

```js
    const customPanel = customOpen
      ? this.renderCustomGroupsPanel(sharedTarget, draft || { target: sharedTarget, count: 2, values: [] })
      : '';
```

```js
      <div class="batch-section">
        <div class="batch-row">…</div>
        ${customPanel}
        ${batchSets}
      </div>
```

3e. `renderCheckinBody` 签名与透传(原 132 行、144 行):

```js
  renderCheckinBody(state, dateStr, advancedOpen, customOpen = false, draft = null) {
```

```js
    const batch = this.renderBatchSection(rec, targets, customOpen, draft);
```

- [ ] **Step 4: 追加样式**

`styles.css` 末尾追加:

```css
/* 自定义分组面板(「分组完成(高级)」chips 下方) */
.custom-groups { margin-top: 10px; padding: 10px 12px; border: 1px dashed var(--border); border-radius: 10px; display: flex; flex-direction: column; gap: 8px; }
.cg-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cg-groups { display: flex; flex-wrap: wrap; gap: 6px; }
.cg-item { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--muted); }
.cg-item input { font: inherit; font-size: 14px; width: 64px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
.cg-item.tail input { background: var(--surface-2); color: var(--muted); }
.cg-hint { font-size: 11px; color: var(--muted); }
.cg-sum { font-size: 12px; color: var(--muted); }
.cg-sum.err { color: var(--danger); font-weight: 600; }
```

- [ ] **Step 5: 运行全量测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add js/ui.js styles.css test/custom-groups.test.js
git commit -m "feat: 自定义分组面板渲染(组数均分+逐组微调+尾组补差)"
```

---

### Task 6: app 交互(开关 / 组数变更 / 输入补差 / 应用)

**Files:**
- Modify: `js/app.js`(状态、事件、面板局部更新)

说明:app 层本项目无自动化测试(现有测试只覆盖 logic/ui/store 纯函数),本任务靠前序任务的纯函数测试 + Task 7 手动冒烟兜底。

- [ ] **Step 1: 新增 UI 态与初始化**

`js/app.js` 顶部属性区(原 5-7 行)追加:

```js
  customGroupsOpen: false, // 「✏️ 自定义」面板展开态,跨重渲染保留
  customDraft: null,       // 面板草稿 { target, count, values[](前 n-1 组的字符串输入) }
```

`init()` 中 `this.bindCheckin()` 之后无需改动(草稿在打开面板时惰性初始化)。

- [ ] **Step 2: refreshCheckin 透传面板参数**

`refreshCheckin()`(原 271-272 行)改为:

```js
    document.getElementById('checkin-body').innerHTML =
      FTUI.renderCheckinBody(this.state, dateStr, this.checkinAdvancedOpen, this.customGroupsOpen, this.customDraft);
```

- [ ] **Step 3: bindCheckin 增加 input / change 委托**

`bindCheckin()`(原 274-283 行)末尾追加:

```js
    // 面板内输入只做局部更新(不重渲染,避免输入框丢焦点);组数 change 才重建面板
    body.addEventListener('input', (e) => this.handleCheckinInput(e));
    body.addEventListener('change', (e) => this.handleCheckinChange(e));
```

- [ ] **Step 4: handleCheckinAction 新增两个 action**

批量操作区(`clear-groups-all` 分支之后,原 307-310 行附近)追加:

```js
    if (action === 'toggle-custom-groups') {
      this.toggleCustomGroups();
      return;
    }
    if (action === 'apply-groups-custom') {
      this.applyCustomGroups(dateStr);
      return;
    }
```

- [ ] **Step 5: 实现面板交互方法**

`js/app.js` 中(`handleCheckinAction` 之后、`bindSettings` 之前)新增:

```js
  // ---- 自定义分组面板 ----
  // 打开面板时初始化草稿:有当前分组则预填,否则默认 2 组均分
  initCustomDraft(target, curGroups) {
    if (Array.isArray(curGroups) && curGroups.length >= 2) {
      return { target, count: curGroups.length, values: curGroups.slice(0, -1).map(String) };
    }
    const groups = FTLogic.splitEvenly(target, 2);
    return { target, count: 2, values: groups.slice(0, -1).map(String) };
  },

  toggleCustomGroups() {
    this.customGroupsOpen = !this.customGroupsOpen;
    if (this.customGroupsOpen) {
      const wi = FTLogic.workoutIndexForDate(this.state.startDate, this.selectedDate);
      const targets = FTLogic.targetsForWorkout(this.state.startDate, wi);
      const target = targets[FT_EXERCISES[0].id];
      // 目标变了(换了日期/补打卡)或首次打开:重建草稿
      if (!this.customDraft || this.customDraft.target !== target) {
        const rec = this.state.records[this.selectedDate];
        const ref = rec && rec.exercises && rec.exercises[FT_EXERCISES[0].id];
        this.customDraft = this.initCustomDraft(target, ref && ref.groupReps);
      }
    }
    this.refreshCheckin();
  },

  // 每组数量输入:写草稿 + 仅局部更新面板(尾组/合计/应用按钮)
  handleCheckinInput(e) {
    const input = e.target.closest('.cg-rep:not(.tail)');
    if (!input || !this.customDraft) return;
    const idx = Number(input.dataset.idx);
    if (!Number.isInteger(idx) || idx >= this.customDraft.values.length) return;
    const values = [...this.customDraft.values];
    values[idx] = input.value;
    this.customDraft = { ...this.customDraft, values };
    this.updateCustomPanelDom();
  },

  // 组数变更:合法则按新组数重新均分并重建面板;非法则回弹为草稿里的上一个合法值
  handleCheckinChange(e) {
    const input = e.target.closest('.cg-count');
    if (!input || !this.customDraft) return;
    const count = Number(input.value);
    const groups = FTLogic.splitEvenly(this.customDraft.target, count);
    if (!groups) {
      input.value = String(this.customDraft.count);
      return;
    }
    this.customDraft = { ...this.customDraft, count, values: groups.slice(0, -1).map(String) };
    this.refreshCheckin(); // 重建每组输入框(此时光标已离开组数框)
  },

  // 面板局部更新:重算尾组/合计/应用按钮态,不触发整体重渲染
  updateCustomPanelDom() {
    const panel = document.querySelector('#checkin-body .custom-groups');
    if (!panel || !this.customDraft) return;
    const pv = FTLogic.customGroupsPreview(this.customDraft.target, this.customDraft.values);
    const tail = panel.querySelector('.cg-rep.tail');
    if (tail) tail.value = pv.last === null ? '—' : `+${pv.last}`;
    const sum = panel.querySelector('.cg-sum');
    if (sum) {
      sum.textContent = pv.ok
        ? `合计 ${this.customDraft.target} / ${this.customDraft.target} ✓`
        : `合计 ${pv.sum === null ? '?' : pv.sum} / ${this.customDraft.target} · ${pv.error}`;
      sum.classList.toggle('err', !pv.ok);
    }
    const apply = panel.querySelector('[data-action="apply-groups-custom"]');
    if (apply) apply.disabled = !pv.ok;
  },

  applyCustomGroups(dateStr) {
    if (!this.customDraft) return;
    const pv = FTLogic.customGroupsPreview(this.customDraft.target, this.customDraft.values);
    if (!pv.ok) return;
    const groupReps = this.customDraft.values.map(Number).concat(pv.last);
    this.customGroupsOpen = false; // commit → rerender 时面板收起
    this.commit(FTStore.applyGroupsAll(this.state, dateStr, groupReps));
  },
```

- [ ] **Step 6: 运行全量测试**

Run: `npm test`
Expected: 全部 PASS(app.js 不在测试加载范围,确认无回归)。

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat: 自定义分组面板交互(开关/组数重建/输入补差/一键应用 5 项)"
```

---

### Task 7: SW 缓存 bump + 全量回归 + 手动冒烟

**Files:**
- Modify: `sw.js:3`(CACHE 版本)
- Modify: `README.md`(如含功能说明则补一句;无则跳过)

- [ ] **Step 1: bump 缓存版本**

`sw.js` 第 3 行:

```js
const CACHE = 'workout-v20';
```

- [ ] **Step 2: 全量测试回归**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 3: 手动冒烟清单**

Run: `npm run dev` → 浏览器打开(建议 DevTools → Application → Local Storage 先清掉旧状态,再用旧格式数据验证一次兼容):

1. 打开训练日 →「分组完成(高级)」→ 点 `✏️ 自定义` → 面板展开,默认 2 组均分
2. 组数改 3 → 自动生成 34/33/+33,合计 100/100 ✓
3. 第 1 组改 60 → 尾组变 +7;再改 90 → 尾组 +0?不——90+5=95,尾组 +5;把第 1 组改 98 → 第 2 组 33 时尾组 -31 → 红字「前面组数量过大」+ 应用禁用
4. 输入 `abc`/清空某框 → 红字「每组数量需为 ≥1 的整数」+ 应用禁用
5. 组数改 1 或 200 → 输入框回弹为上一个合法组数
6. 恢复合法(如 34/33)→「应用分组」→ 面板收起,标题显示 `当前 3 组 34+33+33`,chips 无高亮
7. 逐组完成第 1 组 → 5 项计数各 +34;单项卡 mini 按钮显示 `34 ✓`/`33`
8. 中途改组数重新应用 → 分组进度归零(与现状一致)
9. 点其他打卡操作(如完成单项)再回面板 → 输入草稿仍在
10. 旧数据兼容:导入含 `{sets, reps}` 的 JSON 备份 → 分组显示正常

- [ ] **Step 4: Commit**

```bash
git add sw.js README.md
git commit -m "chore: SW 缓存 bump v20(自定义分组上线)"
```

---

## 部署(不在本计划内)

如需发布:`npx wrangler pages deploy . --project-name workout-checkin`(部署前确认 `sw.js` 已 bump)。

## 自检记录

- **Spec 覆盖**:输入方式(Task 5/6)、自动拆分前大后小(Task 1)、组数范围 2~T(Task 1 + Task 6 回弹)、每组 ≥1 整数与补差校验(Task 2)、面板局部更新避免丢焦点(Task 6)、草稿恢复(Task 6)、当前摘要与均匀高亮(Task 4)、逐组按钮数量(Task 4)、数据迁移与兼容(Task 3)、SW bump(Task 7)——全部有对应任务。
- **占位符**:无 TBD/TODO;所有代码步骤均给出完整代码。
- **类型/命名一致性**:`groupReps` 数组、`customGroupsPreview(target, values)`、`splitEvenly(total, sets)`、action 名 `toggle-custom-groups` / `apply-groups-custom`、CSS 类 `cg-*` 在各任务间一致;`renderBatchSection(record, targets, customOpen, draft)` 与 `renderCheckinBody(state, dateStr, advancedOpen, customOpen, draft)` 签名在 Task 5 定义、Task 6 使用一致。
