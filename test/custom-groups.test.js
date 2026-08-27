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
