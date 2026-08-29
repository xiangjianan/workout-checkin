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

test('computeStatus：断签点之后的跳过仍计入 skippedCount，金额不变', () => {
  const { DailyLogic } = load();
  // 06-01 打卡，06-02 漏卡断签；06-10（断签点之后）跳过
  const state = {
    startDate: '2026-06-01',
    records: { '2026-06-01': { type: 'fitness' }, '2026-06-10': { type: 'skip' } },
  };
  const st = DailyLogic.computeStatus(state);
  assert.equal(st.skippedCount, 1);
  assert.equal(st.returned, 200);
  assert.equal(st.lost, 9800);
});

test('computeStatus：脏数据防御——空日程/超长截断不得误报已完成', () => {
  const ft = load();
  const { DailyLogic } = ft;
  const invalid = DailyLogic.computeStatus({ startDate: '2026-6-1', records: {} }); // 非法 startDate → 空日程
  assert.equal(invalid.phase, 'ongoing');
  assert.equal(invalid.completed, 0);
  // 400 个连续 skip 记录：buildSchedule 的 350 天防死循环上限会截断
  const skipRecords = {};
  for (let i = 0; i < 400; i++) skipRecords[dateOff(ft, '2026-01-01', i)] = { type: 'skip' };
  const truncated = DailyLogic.computeStatus({ startDate: '2026-01-01', records: skipRecords });
  assert.equal(truncated.phase, 'ongoing'); // 全 skip 截断后 completed=0，不得误报 done
});

// ---- 连跳上限 ----

test('canSkip：连续跳过最多 6 天，第 7 天禁止；隔天断链重新可跳', () => {
  const ft = load();
  const { DailyLogic } = ft;
  const start = '2026-06-01';
  const records = {};
  for (let i = 4; i <= 9; i++) records[dateOff(ft, start, i)] = { type: 'skip' }; // 06-05..06-10 连跳 6
  const state = { startDate: start, records };
  assert.equal(DailyLogic.canSkip(state, dateOff(ft, start, 9)), true);  // 第 6 天本身可跳
  assert.equal(DailyLogic.canSkip(state, dateOff(ft, start, 10)), false); // 第 7 天禁止
  assert.equal(DailyLogic.canSkip(state, dateOff(ft, start, 11)), true);  // 06-12 与前段隔了未跳的 06-11，断链
});

test('canSkip：中间打卡一天即重新计数', () => {
  const ft = load();
  const { DailyLogic } = ft;
  const start = '2026-06-01';
  const records = {};
  for (let i = 4; i <= 9; i++) records[dateOff(ft, start, i)] = { type: 'skip' };
  records[dateOff(ft, start, 10)] = { type: 'fitness' }; // 06-11 打卡断链
  const state = { startDate: start, records };
  assert.equal(DailyLogic.canSkip(state, dateOff(ft, start, 11)), true); // 06-12 重新计数
});

test('canSkip：在已有跳过段紧邻前后插入会合并计数，同样受上限约束', () => {
  const ft = load();
  const { DailyLogic } = ft;
  const three = {
    startDate: '2026-06-01',
    records: {
      '2026-06-06': { type: 'skip' },
      '2026-06-07': { type: 'skip' },
      '2026-06-08': { type: 'skip' },
    },
  };
  assert.equal(DailyLogic.canSkip(three, '2026-06-05'), true); // 合并后 4 连跳
  assert.equal(DailyLogic.canSkip(three, '2026-06-09'), true);
  const start = '2026-06-01';
  const sixRecords = {};
  for (let i = 4; i <= 9; i++) sixRecords[dateOff(ft, start, i)] = { type: 'skip' };
  const six = { startDate: start, records: sixRecords };
  assert.equal(DailyLogic.canSkip(six, '2026-06-11'), false); // 后插并入 7 连
  assert.equal(DailyLogic.canSkip(six, '2026-06-04'), false); // 前插并入 7 连
});

test('canSkip：非法日期返回 false', () => {
  const { DailyLogic } = load();
  assert.equal(DailyLogic.canSkip({ startDate: '2026-06-01', records: {} }, '2026/6/15'), false);
});

// ---- 持久化：不可变更新 ----

test('DailyStore.skip：写入 skip 记录且不可变；打卡可覆盖，cancelCheckin 可撤回', () => {
  const ft = load();
  const { DailyStore, DailyLogic } = ft;
  const s0 = { startDate: '2026-06-13', records: {} };
  const s1 = DailyStore.skip(s0, '2026-06-14');
  assert.notEqual(s1, s0);
  assert.notEqual(s1.records, s0.records);
  assert.equal(DailyLogic.isSkipped(s1.records['2026-06-14']), true);
  assert.equal(typeof s1.records['2026-06-14'].at, 'string'); // 记录跳过时间
  assert.equal('2026-06-14' in s0.records, false);            // 原状态未被污染

  const s2 = DailyStore.checkin(s1, '2026-06-14', 'fitness'); // 打卡覆盖跳过
  assert.equal(s2.records['2026-06-14'].type, 'fitness');
  assert.equal(s1.records['2026-06-14'].type, 'skip');        // 前一状态保持不变

  const s3 = DailyStore.skip(s1, '2026-06-15');
  const s4 = DailyStore.cancelCheckin(s3, '2026-06-15');      // 取消跳过 = 删除该日记录
  assert.equal('2026-06-15' in s4.records, false);
  assert.equal(DailyLogic.isSkipped(s3.records['2026-06-15']), true);
});

test('canSkip：state 无 records 键时不炸，视为无跳过记录', () => {
  const { DailyLogic } = load();
  assert.equal(DailyLogic.canSkip({ startDate: '2026-06-01' }, '2026-06-02'), true);
});

test('DailyStore.skip：保留同日之外的既有记录', () => {
  const { DailyStore } = load();
  const s0 = { startDate: '2026-06-01', records: { '2026-06-01': { type: 'fitness' } } };
  const s1 = DailyStore.skip(s0, '2026-06-02');
  assert.equal(s1.records['2026-06-01'].type, 'fitness');
});

test('canSkip：前后两段跳过加自身恰好 6 天，允许', () => {
  const { DailyLogic } = load();
  const state = {
    startDate: '2026-06-01',
    records: {
      '2026-06-03': { type: 'skip' }, // 后向 2 天：06-03、06-04
      '2026-06-04': { type: 'skip' },
      '2026-06-06': { type: 'skip' }, // 前向 3 天：06-06、06-07、06-08
      '2026-06-07': { type: 'skip' },
      '2026-06-08': { type: 'skip' },
    },
  };
  // 06-05：后向 06-04、06-03（2）+ 自身（1）+ 前向 06-06..06-08（3）= 6，恰好达上限
  assert.equal(DailyLogic.canSkip(state, '2026-06-05'), true);
  // 06-06：后向 06-05 无记录即断链，06-03/06-04 那段不并入；1 + 前向 2 = 3
  assert.equal(DailyLogic.canSkip(state, '2026-06-06'), true);
});

// ---- 渲染 ----

test('DailyUI：未打卡日弹窗含跳过按钮与顺延说明', () => {
  const { DailyUI } = load();
  const state = { startDate: '2026-06-14', records: {} };
  const html = DailyUI.renderCheckinBody(state, TODAY); // 今天（第 2 天）未打卡
  assert.match(html, /data-action="skip-day"/);
  assert.ok(html.includes('特殊原因跳过这天'));
  assert.ok(html.includes('顺延 1 天'));
});

test('DailyUI：已跳过日弹窗展示状态 + 覆盖打卡 + 取消跳过', () => {
  const { DailyUI } = load();
  const state = {
    startDate: '2026-06-14',
    records: { [TODAY]: { type: 'skip', at: '2026-06-15T08:00:00.000Z' } },
  };
  const html = DailyUI.renderCheckinBody(state, TODAY);
  assert.ok(html.includes('已跳过'));
  assert.match(html, /data-action="cancel-skip"/);
  assert.match(html, /data-action="checkin" data-type="fitness"/);
  assert.match(html, /data-action="checkin" data-type="study"/);
});

test('DailyUI：跳过日标题与副行', () => {
  const { DailyUI } = load();
  const state = { startDate: '2026-06-14', records: { [TODAY]: { type: 'skip' } } };
  const { title, sub } = DailyUI.renderCheckinTitle(state, TODAY);
  assert.ok(title.includes('跳过日'));
  assert.ok(sub.includes('不断签'));
});

test('DailyUI：日历跳过日显示 🩡、skipped 样式、无序号徽标；后一天序号顺延', () => {
  const { DailyUI } = load();
  const state = {
    startDate: '2026-06-14',
    records: {
      '2026-06-14': { type: 'fitness' },
      [TODAY]: { type: 'skip' },
    },
  };
  const html = DailyUI.renderCalendar(state, 2026, 5, TODAY); // 6 月（0-based 5）
  const cell = cellOf(html, TODAY);
  assert.ok(cell.includes('skipped'));
  assert.ok(cell.includes('🩡'));
  assert.ok(!cell.includes('badge')); // 跳过日无 #N 徽标
  const next = cellOf(html, '2026-06-16');
  assert.ok(next.includes('#2</span>')); // 后一天顺延为第 2 个生效日（带 </span> 防 #20 前缀误命中）
});

test('DailyUI：未打卡日 canSkip 允许时跳过按钮无禁用标记', () => {
  const { DailyUI } = load();
  const state = { startDate: '2026-06-14', records: {} };
  const html = DailyUI.renderCheckinBody(state, TODAY); // 今天（第 2 天）未打卡，无跳过记录 → 允许
  assert.ok(!html.includes('is-blocked'));
  assert.ok(!html.includes('aria-disabled'));
});

test('DailyUI：canSkip 不允许时跳过按钮带 is-blocked/aria-disabled/title', () => {
  const ft = load();
  const { DailyUI } = ft;
  const start = '2026-06-01';
  const records = {};
  for (let i = 8; i <= 13; i++) records[dateOff(ft, start, i)] = { type: 'skip' }; // 06-09..06-14 连跳 6
  const state = { startDate: start, records };
  const html = DailyUI.renderCheckinBody(state, TODAY); // 06-15 后向 6 连跳 + 自身 = 7 → 禁止
  assert.ok(html.includes('skip-btn is-blocked'));
  assert.ok(html.includes('aria-disabled="true"'));
  assert.ok(html.includes('title="连续跳过不能超过 6 天"'));
});

test('DailyUI：统计副行显示已跳过天数', () => {
  const { DailyUI } = load();
  const state = {
    startDate: '2026-06-13',
    records: {
      '2026-06-13': { type: 'fitness' },
      '2026-06-14': { type: 'skip' },
    },
  };
  const html = DailyUI.renderStats(state);
  assert.ok(html.includes('已跳过 1 天'));
});
