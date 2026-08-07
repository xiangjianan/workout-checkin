// test/helpers/load.js —— 把零依赖的全局脚本加载到共享 vm 上下文，便于 node:test 测试
// logic.js / ui.js 在浏览器里靠多个 <script> 共享全局作用域；Node 中各文件是独立模块，
// 这里用 vm 还原“同一全局作用域”的加载方式。

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadFT(files = ['js/logic.js', 'js/ui.js']) {
  const ctx = {};
  vm.createContext(ctx);
  // 拼接成单次编译：const/let 声明留在全局词法环境、不会挂到 ctx 对象上，
  // 因此同一编译单元内才能互见；末尾再把需要的符号桥接到 globalThis。
  const bundle = files
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  vm.runInContext(
    bundle + '\n;globalThis.__FT = { FT_CONFIG, FT_EXERCISES, FTLogic, FTUI };',
    ctx,
    { filename: 'bundle.js' }
  );
  return ctx.__FT;
}

module.exports = { loadFT, ROOT };
