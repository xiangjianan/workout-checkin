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
});
