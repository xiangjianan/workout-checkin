// test/daily-skip.test.js —— 每日打卡「跳过这天」：日程推导 / 连跳上限 / 金额 / 不可变 / 渲染
// 与 daily-checkin.test.js 相同做法：stub todayStr 固定「今天」，保证可重现。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadDaily } = require('./helpers/load');

const TODAY = '2026-06-15';

function load() {
  const ft = loadDaily();
  ft.DailyLogic.todayStr = () => TODAY;
  return ft;
}

// 从 start 偏移 n 天的日期串（独立于日程推导，便于构造测试数据）
function dateOff(ft, start, n) {
  return ft.DailyLogic.toDateStr(ft.DailyLogic.addDays(ft.DailyLogic.parseDate(start), n));
}

// 从日历 HTML 中截取某日期的完整 cell（cell 内无嵌套 div，首个 </div> 即闭合）
function cellOf(html, dateStr) {
  const m = html.match(new RegExp('<div[^>]*data-date="' + dateStr + '"[^>]*>[\\s\\S]*?</div>'));
  return m ? m[0] : '';
}

// ---- 配置 ----

test('DAILY_CONFIG：连续跳过上限为 6 天', () => {
  const { DAILY_CONFIG } = load();
  assert.equal(DAILY_CONFIG.maxConsecutiveSkips, 6);
});

// ---- 记录判定 ----

test('isSkipped：仅 type=skip 的记录算跳过', () => {
  const { DailyLogic } = load();
  assert.equal(DailyLogic.isSkipped({ type: 'skip' }), true);
  assert.equal(DailyLogic.isSkipped({ type: 'fitness' }), false);
  assert.equal(DailyLogic.isSkipped({}), false);
  assert.equal(DailyLogic.isSkipped(undefined), false);
});

// ---- 日程推导 ----

test('buildSchedule：无跳过时与固定 50 天日程一致', () => {
  const { DailyLogic } = load();
  const sched = DailyLogic.buildSchedule({ startDate: '2026-06-13', records: {} });
  assert.equal(sched.days.length, 50);
  assert.equal(sched.days[0].date, '2026-06-13');
  assert.equal(sched.days[0].kind, 'missed');   // 过去且无记录
  assert.equal(sched.days[0].index, 1);
  assert.equal(sched.byDate['2026-06-15'].kind, 'pending'); // 今天待打卡
  assert.equal(sched.byDate['2026-06-15'].index, 3);
  assert.equal(sched.days[49].date, '2026-08-01');
  assert.equal(sched.lastDate, '2026-08-01');
});

test('buildSchedule：跳过日不占名额无序号，后续序号后移、截止日顺延', () => {
  const { DailyLogic } = load();
  const state = {
    startDate: '2026-06-13',
    records: {
      '2026-06-13': { type: 'fitness' }, // 第 1 个生效日
      '2026-06-14': { type: 'skip' },    // 跳过：无序号、不占名额
    },
  };
  const sched = DailyLogic.buildSchedule(state);
  assert.equal(sched.byDate['2026-06-13'].kind, 'done');
  assert.equal(sched.byDate['2026-06-13'].index, 1);
  assert.equal(sched.byDate['2026-06-14'].kind, 'skipped');
  assert.equal(sched.byDate['2026-06-14'].index, null);
  assert.equal(sched.byDate['2026-06-15'].kind, 'pending');
  assert.equal(sched.byDate['2026-06-15'].index, 2); // 今天顺延为第 2 个生效日
  assert.equal(sched.days.length, 51);               // 50 名额 + 1 跳过 = 51 个日历日
  assert.equal(sched.lastDate, '2026-08-02');
});

test('buildSchedule：50 天全部打卡后，之后的日期为计划外', () => {
  const ft = load();
  const { DailyLogic } = ft;
  const records = {};
  for (let i = 0; i < 50; i++) records[dateOff(ft, TODAY, i)] = { type: 'fitness' };
  const sched = DailyLogic.buildSchedule({ startDate: TODAY, records });
  assert.equal(sched.days.length, 50);
  assert.equal(sched.byDate[dateOff(ft, TODAY, 50)], undefined); // 第 51 个日历日不在计划内
  assert.equal(sched.lastDate, dateOff(ft, TODAY, 49));
});

test('buildSchedule：脏数据连续 skip 不会死循环（推导长度有上限）', () => {
  const ft = load();
  const { DailyLogic, DAILY_CONFIG } = ft;
  const records = {};
  for (let i = 0; i < 400; i++) records[dateOff(ft, '2020-01-01', i)] = { type: 'skip' };
  const sched = DailyLogic.buildSchedule({ startDate: '2020-01-01', records });
  assert.ok(sched.days.length <= DAILY_CONFIG.totalDays * (DAILY_CONFIG.maxConsecutiveSkips + 1));
});

test('buildSchedule：startDate 非法时返回空日程而非报错', () => {
  const { DailyLogic } = load();
  const sched = DailyLogic.buildSchedule({ startDate: 'abc', records: {} });
  // 注：days 诞生于 vm 上下文（原型属另一 realm），先展开拷到宿主数组再 deepEqual。
  assert.deepEqual([...sched.days], []);
  assert.equal(sched.lastDate, null);
});
