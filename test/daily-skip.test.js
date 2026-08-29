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

test('buildSchedule：合法最坏情形（每个生效日前连跳 6 天）不触发截断', () => {
  const ft = load();
  const { DailyLogic } = ft;
  const start = '2020-01-01';
  const records = {};
  let off = 0;
  for (let i = 0; i < 50; i++) {
    for (let k = 0; k < 6; k++) records[dateOff(ft, start, off++)] = { type: 'skip' };
    records[dateOff(ft, start, off++)] = { type: 'fitness' };
  }
  const sched = DailyLogic.buildSchedule({ startDate: start, records });
  assert.equal(sched.days.length, 350); // 50×7 恰好用满名额，不截断
  assert.equal(sched.lastDate, dateOff(ft, start, 349));
});

// ---- 日程 API（签名改为 state） ----

test('日程 API：checkinIndexForDate / checkinDate / lastCheckinDate 吃 state，随跳过顺延', () => {
  const { DailyLogic } = load();
  const state = {
    startDate: '2026-06-13',
    records: {
      '2026-06-13': { type: 'fitness' },
      '2026-06-14': { type: 'skip' },
    },
  };
  assert.equal(DailyLogic.scheduleDayOf(state, '2026-06-14').kind, 'skipped');
  assert.equal(DailyLogic.checkinIndexForDate(state, '2026-06-14'), null); // 跳过日无序号
  assert.equal(DailyLogic.checkinIndexForDate(state, '2026-06-15'), 2);    // 顺延后的第 2 生效日
  assert.equal(DailyLogic.checkinDate(state, 2), '2026-06-15');
  assert.equal(DailyLogic.lastCheckinDate(state), '2026-08-02');
  assert.equal(DailyLogic.scheduleDayOf(state, '2026-06-12'), null);       // 计划外
  assert.equal(DailyLogic.checkinIndexForDate(state, '2026-06-12'), null);
  assert.equal(DailyLogic.checkinDate(state, 51), null); // 越界序号返回 null
});

test('日程 API：startDate 非法时返回 null 而非 NaN', () => {
  const { DailyLogic } = load();
  assert.equal(DailyLogic.checkinIndexForDate({ startDate: '2026/7/1', records: {} }, '2026-07-01'), null);
  assert.equal(DailyLogic.checkinIndexForDate({ startDate: 'abc', records: {} }, '2026-07-01'), null);
  assert.equal(DailyLogic.checkinIndexForDate({ startDate: '', records: {} }, '2026-07-01'), null);
  assert.equal(DailyLogic.lastCheckinDate({ startDate: '2026/7/1', records: {} }), null);
  assert.equal(DailyLogic.checkinDate({ startDate: '', records: {} }, 1), null);
});

// ---- 金额与断签 ----

test('computeStatus：跳过日不返钱不断签，skippedCount 计入', () => {
  const { DailyLogic } = load();
  const state = {
    startDate: '2026-06-13', // day1=昨天 day2=今天
    records: {
      '2026-06-13': { type: 'fitness' },
      '2026-06-14': { type: 'skip' },
    },
  };
  const s = DailyLogic.computeStatus(state);
  assert.equal(s.completed, 1);
  assert.equal(s.skippedCount, 1);
  assert.equal(s.broken, false);
  assert.equal(s.phase, 'ongoing');
  assert.equal(s.returned, 200);     // 只有 1 天实际打卡
  assert.equal(s.recoverable, 9800); // 仍按 50 个实际打卡日计算
  assert.equal(s.remainingDays, 49);
});

test('computeStatus：跳过日夹在打卡中间不产生断签缺口', () => {
  const { DailyLogic } = load();
  const state = {
    startDate: '2026-06-11', // 06-11..06-14 已过，06-15 今天
    records: {
      '2026-06-11': { type: 'fitness' },
      '2026-06-12': { type: 'skip' },
      '2026-06-13': { type: 'study' },
      '2026-06-14': { type: 'skip' },
    },
  };
  const s = DailyLogic.computeStatus(state);
  assert.equal(s.broken, false);
  assert.equal(s.completed, 2);
  assert.equal(s.skippedCount, 2);
  assert.equal(s.returned, 400);
  assert.equal(s.recoverable, 9600); // (50-2)*200：跳过不占名额，仍可返满 1 万
});

test('computeStatus：漏卡日断签金额按实际打卡数（跳过不计钱）', () => {
  const { DailyLogic } = load();
  const state = {
    startDate: '2026-06-10', // 06-10..06-14 已过，06-15 今天
    records: {
      '2026-06-10': { type: 'fitness' },
      '2026-06-11': { type: 'skip' },
      // 2026-06-12 漏卡（过去无记录）→ 断签
      '2026-06-13': { type: 'study' },
    },
  };
  const s = DailyLogic.computeStatus(state);
  assert.equal(s.broken, true);
  assert.equal(s.firstMissed, 2); // 漏卡日是第 2 个生效日
  assert.equal(s.returned, 200);  // 断签点前实际打卡 1 天（跳过不返钱）
  assert.equal(s.lost, 9800);     // (50-1)*200：returned + lost = 1 万
  assert.equal(s.phase, 'failed');
});

test('computeStatus：漏卡日补跳后断签恢复', () => {
  const { DailyLogic } = load();
  // 06-13 打卡、06-14 过去未处理 → 断签；把 06-14 改为跳过后恢复
  const before = { startDate: '2026-06-13', records: { '2026-06-13': { type: 'fitness' } } };
  assert.equal(DailyLogic.computeStatus(before).broken, true);
  const after = {
    startDate: '2026-06-13',
    records: { '2026-06-13': { type: 'fitness' }, '2026-06-14': { type: 'skip' } },
  };
  const s = DailyLogic.computeStatus(after);
  assert.equal(s.broken, false);
  assert.equal(s.completed, 1);
  assert.equal(s.skippedCount, 1);
  assert.equal(s.phase, 'ongoing');
});

test('computeStatus：打卡覆盖跳过后金额与日程收回顺延', () => {
  const { DailyLogic } = load();
  const state1 = { startDate: '2026-06-13', records: { '2026-06-14': { type: 'skip' } } };
  assert.equal(DailyLogic.lastCheckinDate(state1), '2026-08-02');
  const state2 = {
    ...state1,
    records: { '2026-06-14': { type: 'study', at: '2026-06-14T08:00:00.000Z' } },
  };
  const s = DailyLogic.computeStatus(state2);
  assert.equal(s.skippedCount, 0);
  assert.equal(s.completed, 1);
  assert.equal(s.returned, 0); // 06-13 漏卡在前 → 断签，断签点前无实际打卡
  assert.equal(DailyLogic.lastCheckinDate(state2), '2026-08-01'); // 顺延收回
});
