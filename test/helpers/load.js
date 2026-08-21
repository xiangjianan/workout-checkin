// test/helpers/load.js —— 把零依赖的全局脚本加载到共享 vm 上下文，便于 node:test 测试
// logic.js / ui.js 在浏览器里靠多个 <script> 共享全局作用域；Node 中各文件是独立模块，
// 这里用 vm 还原“同一全局作用域”的加载方式。

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// 把若干全局脚本拼成单次编译并桥接指定符号（const/let 声明留在全局词法环境、
// 不会挂到 ctx 对象上，因此同一编译单元内才能互见；末尾再挂到 globalThis）。
function loadBundle(files, bridgeNames) {
  const ctx = {};
  vm.createContext(ctx);
  const bundle = files
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  const bridge = 'globalThis.__EXPORTS = { ' + bridgeNames.join(', ') + ' };';
  vm.runInContext(bundle + '\n;' + bridge, ctx, { filename: 'bundle.js' });
  return ctx.__EXPORTS;
}

function loadFT(files = ['js/logic.js', 'js/ui.js']) {
  return loadBundle(files, ['FT_CONFIG', 'FT_EXERCISES', 'FTLogic', 'FTUI']);
}

// 每日打卡页（daily.html）：logic / store / ui 三层；app 层依赖 DOM，不在 Node 里加载
function loadDaily(files = ['js/daily-logic.js', 'js/daily-store.js', 'js/daily-ui.js']) {
  return loadBundle(files, ['DAILY_CONFIG', 'DAILY_TYPES', 'DailyLogic', 'DailyStore', 'DailyUI']);
}

module.exports = { loadFT, loadDaily, ROOT };
