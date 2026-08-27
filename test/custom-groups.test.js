// test/custom-groups.test.js —— 自定义分组：拆分算法 / 预览校验 / store 迁移 / UI 渲染

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFT } = require('./helpers/load');

// store 层测试需要把 js/store.js 一并加载并桥接 FTStore
function loadStore() {
  return loadFT(['js/logic.js', 'js/store.js'], ['FT_CONFIG', 'FT_EXERCISES', 'FTLogic', 'FTStore']);
}

// ---- FTLogic.splitEvenly ----
// 注：结果数组诞生于 vm 上下文（原型属另一 realm），先用扩展运算符拷到宿主数组再 deepEqual。

test('splitEvenly：整除时均分', () => {
  const { FTLogic } = loadFT();
  assert.deepEqual([...FTLogic.splitEvenly(100, 4)], [25, 25, 25, 25]);
  assert.deepEqual([...FTLogic.splitEvenly(10, 2)], [5, 5]);
});

test('splitEvenly：不整除时余数分给前几组（前大后小）', () => {
  const { FTLogic } = loadFT();
  assert.deepEqual([...FTLogic.splitEvenly(100, 3)], [34, 33, 33]);
  assert.deepEqual([...FTLogic.splitEvenly(7, 3)], [3, 2, 2]);
});

test('splitEvenly：组数非法返回 null（<2、>total、非整数、total 非整数）', () => {
  const { FTLogic } = loadFT();
  assert.equal(FTLogic.splitEvenly(100, 1), null);
  assert.equal(FTLogic.splitEvenly(100, 101), null);
  assert.equal(FTLogic.splitEvenly(100, 2.5), null);
  assert.equal(FTLogic.splitEvenly('x', 3), null);
  assert.equal(FTLogic.splitEvenly(100.5, 3), null); // 数值型非整数 total
  assert.deepEqual([...FTLogic.splitEvenly(100, 100)], new Array(100).fill(1)); // sets===total 临界合法
});

// ---- FTLogic.customGroupsPreview ----

test('customGroupsPreview：前面组合法则尾组自动补差', () => {
  const { FTLogic } = loadFT();
  const pv = FTLogic.customGroupsPreview(100, ['34', '33']);
  assert.equal(pv.ok, true);
  assert.equal(pv.last, 33);
  assert.equal(pv.sum, 100);
  assert.equal(pv.error, '');
  // 输入两侧带空格：trim 后有效
  assert.equal(FTLogic.customGroupsPreview(100, [' 34 ', '33']).ok, true);
  // 数值型输入：applyCustomGroups 将走的路径
  const pvNum = FTLogic.customGroupsPreview(100, [34, 33]);
  assert.equal(pvNum.ok, true);
  assert.equal(pvNum.last, 33);
});

test('customGroupsPreview：前面组之和过大则失败', () => {
  const { FTLogic } = loadFT();
  const pv = FTLogic.customGroupsPreview(100, ['60', '50']);
  assert.equal(pv.ok, false);
  assert.equal(pv.last, -10);
  assert.ok(pv.error.includes('过大'), '错误信息应提示前面组数量过大');
});

test('customGroupsPreview：每组须为 ≥1 的整数（空/0/负数/小数/非数字）', () => {
  const { FTLogic } = loadFT();
  for (const bad of [['', '33'], ['0', '33'], ['-5', '33'], ['3.5', '33'], ['abc', '33']]) {
    const pv = FTLogic.customGroupsPreview(100, bad);
    assert.equal(pv.ok, false, `${JSON.stringify(bad)} 应判无效`);
    assert.ok(pv.error.includes('≥1'), `错误信息应说明每组 ≥1：${pv.error}`);
  }
  // target 本身非法：整体直接拒绝，不做分组计算
  const pvBad = FTLogic.customGroupsPreview(NaN, ['50']);
  assert.equal(pvBad.ok, false);
  assert.equal(pvBad.error, '目标数量非法');
});

// ---- FTStore：groupReps 数据模型 ----

test('applyGroups：接收每组数量数组，groupReps/setDone 对齐', () => {
  const { FTStore } = loadStore();
  let s = { startDate: '2024-06-13', records: {} };
  s = FTStore.applyGroups(s, '2024-06-13', 'pushup', [34, 33, 33]);
  const ex = s.records['2024-06-13'].exercises.pushup;
  assert.deepEqual([...ex.groupReps], [34, 33, 33]);
  assert.equal(ex.setDone.length, 3);
  assert.equal(ex.completed, 0);
});

test('非均匀分组逐组打卡：completed 按各组数量累加', () => {
  const { FTStore } = loadStore();
  let s = { startDate: '2024-06-13', records: {} };
  s = FTStore.applyGroups(s, '2024-06-13', 'pushup', [34, 33, 33]);
  s = FTStore.toggleSet(s, '2024-06-13', 'pushup', 0);
  assert.equal(s.records['2024-06-13'].exercises.pushup.completed, 34);
  s = FTStore.toggleSet(s, '2024-06-13', 'pushup', 1);
  assert.equal(s.records['2024-06-13'].exercises.pushup.completed, 67);
});

test('旧格式记录（sets/reps）规范化为 groupReps 后可继续打卡', () => {
  const { FTStore } = loadStore();
  const legacy = {
    '2024-06-13': {
      exercises: { pushup: { completed: 25, sets: 4, reps: 25, setDone: [true, false, false, false] } },
    },
  };
  const records = FTStore.normalizeRecords(legacy);
  const ex = records['2024-06-13'].exercises.pushup;
  assert.deepEqual([...ex.groupReps], [25, 25, 25, 25]);
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
  assert.deepEqual([...s.records['2024-06-13'].exercises.pushup.groupReps], []);
  s = FTStore.applyGroups(s, '2024-06-13', 'pushup', [34, 33, 33]);
  s = FTStore.resetExercise(s, '2024-06-13', 'pushup');
  assert.deepEqual([...s.records['2024-06-13'].exercises.pushup.groupReps], []);
  assert.deepEqual([...s.records['2024-06-13'].exercises.pushup.setDone], []);
});

// ---- normalizeRecords 迁移风险路径 ----
// 注：对象同样诞生于 vm 上下文，先展开拷贝到宿主对象再 deepEqual（同数组惯例）。

test('normalizeRecords：空输入与非法类型返回 {}', () => {
  const { FTStore } = loadStore();
  assert.deepEqual({ ...FTStore.normalizeRecords(null) }, {});
  assert.deepEqual({ ...FTStore.normalizeRecords({}) }, {});
  assert.deepEqual({ ...FTStore.normalizeRecords('abc') }, {}); // 字符串型 records：守卫生效
});

test('applyGroupsAll + toggleSetAll 批量链路：completed 按各组数量同步累加', () => {
  const { FTStore, FT_EXERCISES } = loadStore();
  let s = { startDate: '2024-06-13', records: {} };
  s = FTStore.applyGroupsAll(s, '2024-06-13', [34, 33, 33]);
  s = FTStore.toggleSetAll(s, '2024-06-13', 0);
  for (const ex of FT_EXERCISES) {
    assert.equal(s.records['2024-06-13'].exercises[ex.id].completed, 34, `${ex.id} 第 1 组后应为 34`);
  }
  s = FTStore.toggleSetAll(s, '2024-06-13', 1);
  for (const ex of FT_EXERCISES) {
    assert.equal(s.records['2024-06-13'].exercises[ex.id].completed, 67, `${ex.id} 第 2 组后应为 67`);
  }
});

test('脏数据 setDone 超长：规范化截断到 groupReps 长度，completed 不丢', () => {
  const { FTStore } = loadStore();
  const dirty = {
    '2024-06-13': {
      exercises: { pushup: { completed: 100, sets: 4, reps: 25, setDone: [true, true, true, true, true] } },
    },
  };
  const records = FTStore.normalizeRecords(dirty);
  const ex = records['2024-06-13'].exercises.pushup;
  assert.deepEqual([...ex.groupReps], [25, 25, 25, 25]);
  assert.equal(ex.setDone.length, 4); // 超出 groupReps 长度的勾选被截断
  assert.equal(ex.completed, 100);    // 已完成进度保留
});

test('脏数据 groupReps 非正整数元素：规范化时被过滤，completed 不丢', () => {
  const { FTStore } = loadStore();
  const records = FTStore.normalizeRecords({
    '2024-06-13': { exercises: { pushup: { completed: 5, groupReps: [34, 'x', -1, 33], setDone: [] } } },
  });
  const ex = records['2024-06-13'].exercises.pushup;
  assert.deepEqual([...ex.groupReps], [34, 33]);
  assert.equal(ex.setDone.length, 0); // setDone 与过滤后长度对齐
  assert.equal(ex.completed, 5);      // 已完成进度保留
});

// ---- UI:逐组数量显示 / chips 高亮 / 当前摘要 ----

// 辅助构造器需要遍历项目列表，共享一次加载（FTUI/FTLogic 均为纯函数，可安全复用）
const FT = loadFT();

function targetsAll(n) {
  const t = {};
  for (const ex of FT.FT_EXERCISES) t[ex.id] = n;
  return t;
}
function recWithGroups(groups, setDone) {
  const exercises = {};
  for (const ex of FT.FT_EXERCISES) {
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
  assert.match(html, /class="chip on"\s+data-action="apply-groups-all" data-sets="4"/);
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
  assert.match(html, />33 🔒</); // prefix=1：第 3 组锁定不可点
});

test('renderBatchSection:无分组时不显示当前摘要', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(recWithGroups([], []), targetsAll(100));
  assert.doesNotMatch(html, /当前 \d+ 组/);
});

test('renderBatchSection:摘要均匀显示每组 N,非均匀超过 6 组截断', () => {
  const { FTUI } = loadFT();
  const eight = FTUI.renderBatchSection(
    recWithGroups([17, 17, 13, 13, 10, 10, 10, 10], new Array(8).fill(false)),
    targetsAll(100),
  );
  assert.match(eight, /当前 8 组 17\+17\+13\+13\+10\+10\+…/);
  const uniform = FTUI.renderBatchSection(recWithGroups([25, 25, 25, 25], [false, false, false, false]), targetsAll(100));
  assert.match(uniform, /当前 4 组 每组 25/);
});

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
  assert.match(html, /-10/);          // 缺口原样显示
  assert.doesNotMatch(html, /\+-10/); // 不出现 +号拼负数的「+-10」
});

test('面板:默认关闭时不渲染面板,但 ✏️ 按钮仍在', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(null, targetsAll(100));
  // 注意断言面板容器而非裸 'custom-groups'：chip 的 data-action="toggle-custom-groups" 含该子串
  assert.ok(!html.includes('class="custom-groups"'), '面板不应出现');
  assert.match(html, /✏️ 自定义/);
});

test('面板回退:组数非法(>目标)回退 2 组均分,长度不符的草稿一并重置', () => {
  const { FTUI } = loadFT();
  const draft = { target: 100, count: 200, values: ['34', '33'] };
  const html = FTUI.renderBatchSection(null, targetsAll(100), true, draft);
  assert.match(html, /value="2"/);    // 组数框回退 2
  assert.match(html, /value="50"/);   // 前组输入回退均分 50
  assert.match(html, /\+50/);         // 尾组 +50
});

test('面板回退:values 长度与组数不匹配时,输入框回退均分默认值', () => {
  const { FTUI } = loadFT();
  const draft = { target: 100, count: 4, values: ['40'] };
  const html = FTUI.renderBatchSection(null, targetsAll(100), true, draft);
  assert.match(html, /value="4"/);    // 组数框保持 4
  assert.match(html, /value="25"/);   // 前 3 组输入回退均分 25
  assert.match(html, /\+25/);         // 尾组 +25
  assert.doesNotMatch(html, /value="40"/); // 旧草稿值被丢弃
});

test('面板回退:draft 为 null 时按 2 组均分初始化,应用按钮可点', () => {
  const { FTUI } = loadFT();
  const html = FTUI.renderBatchSection(null, targetsAll(100), true, null);
  assert.match(html, /value="2"/);
  assert.match(html, /value="50"/);
  assert.match(html, /\+50/);
  assert.match(html, /合计 100 \/ 100 ✓/);
  assert.doesNotMatch(html, /apply-groups-custom" disabled/);
});
