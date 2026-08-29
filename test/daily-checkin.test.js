// test/daily-checkin.test.js —— 每日二选一打卡（50 天对赌）：日程 / 断签 / 类型计数 / 不可变 / 渲染
// 镜像 celebration-stats.test.js 的做法：stub todayStr 固定「今天」，保证可重现。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadDaily } = require('./helpers/load');

const TODAY = '2026-06-15';

// 便捷构造：无跳过场景下的 state（日程推导对无 skip 记录的数据与旧固定日程完全一致）
const plan = (startDate, records = {}) => ({ startDate, records });

function load() {
  const ft = loadDaily();
  ft.DailyLogic.todayStr = () => TODAY;
  return ft;
}

// ---- 配置 ----

test('DAILY_CONFIG：50 天 · 1 万对赌 · 每天 200', () => {
  const { DAILY_CONFIG } = load();
  assert.equal(DAILY_CONFIG.totalDays, 50);
  assert.equal(DAILY_CONFIG.deposit, 10000);
  assert.equal(DAILY_CONFIG.perDay, 200);
});

// ---- 日程：连续 50 天，无休息日 ----

test('日程：startDate 起连续 50 天每天都是打卡日，第 51 天与之前均非打卡日', () => {
  const { DailyLogic } = load();
  const start = '2026-06-13';
  assert.equal(DailyLogic.checkinIndexForDate(plan(start), '2026-06-13'), 1);
  assert.equal(DailyLogic.checkinIndexForDate(plan(start), '2026-06-14'), 2); // 无休息日，连着来
  assert.equal(DailyLogic.checkinIndexForDate(plan(start), '2026-06-15'), 3);
  // 第 50 天 = 06-13 + 49 天 = 08-01
  assert.equal(DailyLogic.checkinDate(plan(start), 50), '2026-08-01');
  assert.equal(DailyLogic.checkinIndexForDate(plan(start), '2026-08-01'), 50);
  assert.equal(DailyLogic.checkinIndexForDate(plan(start), '2026-08-02'), null);
  assert.equal(DailyLogic.checkinIndexForDate(plan(start), '2026-06-12'), null);
  assert.equal(DailyLogic.lastCheckinDate(plan(start)), '2026-08-01');
});

test('isCheckedIn：带合法类型的记录才算已打卡', () => {
  const { DailyLogic } = load();
  assert.equal(DailyLogic.isCheckedIn({ type: 'fitness' }), true);
  assert.equal(DailyLogic.isCheckedIn({ type: 'study' }), true);
  assert.equal(DailyLogic.isCheckedIn({ type: 'other' }), false);
  assert.equal(DailyLogic.isCheckedIn({}), false);
  assert.equal(DailyLogic.isCheckedIn(undefined), false);
});

// ---- 全局状态：断签与金额 ----

test('computeStatus：初始进行中 0/50，待返还 1 万', () => {
  const { DailyLogic } = load();
  const s = DailyLogic.computeStatus({ startDate: TODAY, records: {} });
  assert.equal(s.completed, 0);
  assert.equal(s.broken, false);
  assert.equal(s.phase, 'ongoing');
  assert.equal(s.returned, 0);
  assert.equal(s.recoverable, 10000);
  assert.equal(s.lost, 0);
  assert.equal(s.typeCounts.fitness, 0);
  assert.equal(s.typeCounts.study, 0);
});

test('computeStatus：今天未打卡不算断签', () => {
  const { DailyLogic } = load();
  // day1 = 今天，尚未打卡
  const s = DailyLogic.computeStatus({ startDate: TODAY, records: {} });
  assert.equal(s.broken, false);
  assert.equal(s.phase, 'ongoing');
});

test('computeStatus：打卡 1 天返 200，待返还 9800', () => {
  const { DailyLogic } = load();
  const start = '2026-06-14'; // day1=昨天（已打卡），day2=今天（待打卡）
  const state = { startDate: start, records: { [DailyLogic.checkinDate(plan(start), 1)]: { type: 'fitness' } } };
  const s = DailyLogic.computeStatus(state);
  assert.equal(s.completed, 1);
  assert.equal(s.returned, 200);
  assert.equal(s.recoverable, 9800);
  assert.equal(s.broken, false);
  assert.equal(s.typeCounts.fitness, 1);
  assert.equal(s.typeCounts.study, 0);
});

test('computeStatus：过去日漏卡即断签，剩余全损', () => {
  const { DailyLogic } = load();
  const start = '2026-06-10'; // day1..day5 已过，day6=今天
  // day1 健身、day2 学习、day4 健身；day3 漏卡（过去未打卡）→ 断签
  const records = {
    [DailyLogic.checkinDate(plan(start), 1)]: { type: 'fitness' },
    [DailyLogic.checkinDate(plan(start), 2)]: { type: 'study' },
    [DailyLogic.checkinDate(plan(start), 4)]: { type: 'fitness' },
  };
  const s = DailyLogic.computeStatus({ startDate: start, records });
  assert.equal(s.broken, true);
  assert.equal(s.firstMissed, 3);
  assert.equal(s.returned, 400);        // 断签前连续完成 2 天
  assert.equal(s.lost, 9600);           // (50-2)*200
  assert.equal(s.recoverable, 0);
  assert.equal(s.phase, 'failed');
  assert.equal(s.completed, 3);         // 打卡总数含断签后的 day4
  assert.equal(s.typeCounts.fitness, 2);
  assert.equal(s.typeCounts.study, 1);
});

test('computeStatus：漏卡日补卡后断签恢复', () => {
  const { DailyLogic } = load();
  const start = '2026-06-10'; // day1..day5 已过，day6=今天
  // 断签场景（day3 漏卡）补上 day3 与 day5 后，所有过去日均完成 → 恢复
  const records = {};
  for (let i = 1; i <= 5; i++) records[DailyLogic.checkinDate(plan(start), i)] = { type: i % 2 ? 'fitness' : 'study' };
  const s = DailyLogic.computeStatus({ startDate: start, records });
  assert.equal(s.broken, false);
  assert.equal(s.completed, 5);
  assert.equal(s.returned, 1000);
  assert.equal(s.recoverable, 9000); // (50-5)*200
  assert.equal(s.phase, 'ongoing');
  assert.equal(s.typeCounts.fitness, 3);
  assert.equal(s.typeCounts.study, 2);
});

test('computeStatus：50 天全部打卡 → 已完成，返满 1 万', () => {
  const { DailyLogic } = load();
  const start = TODAY; // 从今天开始，全部补满也不影响「全完成」判定
  const records = {};
  for (let i = 1; i <= 50; i++) records[DailyLogic.checkinDate(plan(start), i)] = { type: i % 2 ? 'fitness' : 'study' };
  const s = DailyLogic.computeStatus({ startDate: start, records });
  assert.equal(s.completed, 50);
  assert.equal(s.phase, 'done');
  assert.equal(s.returned, 10000);
  assert.equal(s.recoverable, 0);
  assert.equal(s.lost, 0);
});

// ---- 持久化：不可变更新 ----

test('DailyStore：checkin 返回新状态，不改原对象', () => {
  const { DailyStore } = load();
  const s0 = { startDate: '2026-06-13', records: {} };
  const s1 = DailyStore.checkin(s0, '2026-06-13', 'fitness');
  assert.notEqual(s1, s0);
  assert.notEqual(s1.records, s0.records);
  assert.equal('2026-06-13' in s0.records, false); // 原状态未被污染
  assert.equal(s1.records['2026-06-13'].type, 'fitness');
  assert.equal(typeof s1.records['2026-06-13'].at, 'string'); // 记录打卡时间
});

test('DailyStore：切换类型与取消打卡均为不可变更新', () => {
  const { DailyStore } = load();
  const date = '2026-06-15';
  const s0 = { startDate: '2026-06-13', records: {} };
  const s1 = DailyStore.checkin(s0, date, 'fitness');
  const s2 = DailyStore.checkin(s1, date, 'study'); // 切换为学习
  assert.equal(s2.records[date].type, 'study');
  assert.equal(s1.records[date].type, 'fitness'); // 前一状态保持不变
  const s3 = DailyStore.cancelCheckin(s2, date);
  assert.equal(date in s3.records, false);
  assert.equal(s2.records[date].type, 'study'); // 取消也不影响原状态
});

test('DailyStore：setStartDate 不可变；defaultState 形状正确', () => {
  const { DailyStore, DailyLogic } = load();
  const s0 = { startDate: '2026-06-13', records: { a: 1 } };
  const s1 = DailyStore.setStartDate(s0, '2026-07-01');
  assert.notEqual(s1, s0);
  assert.equal(s0.startDate, '2026-06-13');
  assert.equal(s1.startDate, '2026-07-01');
  assert.equal(Object.keys(s1.records).length, 1);
  assert.equal(s1.records.a, 1);

  const d = DailyStore.defaultState();
  assert.equal(d.startDate, DailyLogic.todayStr());
  assert.equal(Object.keys(d.records).length, 0);
});

test('DailyStore：importJSON 校验非法输入', () => {
  const { DailyStore } = load();
  const ok = DailyStore.importJSON('{"startDate":"2026-06-13","records":{}}');
  assert.equal(ok.startDate, '2026-06-13');
  assert.throws(() => DailyStore.importJSON('not json'));
  assert.throws(() => DailyStore.importJSON('{"records":{}}'));                       // 缺 startDate
  assert.throws(() => DailyStore.importJSON('{"startDate":"2026-06-13"}'));          // 缺 records
  assert.throws(() => DailyStore.importJSON('{"startDate":"x","records":[]}'));      // records 非对象
  assert.throws(() => DailyStore.importJSON('{"startDate":"2026/7/1","records":{}}'));    // 非法日期格式
  assert.throws(() => DailyStore.importJSON('{"startDate":"2026-6-1","records":{}}'));    // 未补零
  assert.throws(() => DailyStore.importJSON('{"startDate":"2026-13-01","records":{}}'));  // 月越界
});

test('DailyLogic：startDate 非法时日程判定返回 null 而非 NaN', () => {
  const { DailyLogic } = load();
  // 即使脏数据混进来（未经 importJSON 校验），日程判断也不能让 NaN 绕过边界
  assert.equal(DailyLogic.checkinIndexForDate(plan('2026/7/1'), '2026-07-01'), null);
  assert.equal(DailyLogic.checkinIndexForDate(plan('abc'), '2026-07-01'), null);
  assert.equal(DailyLogic.checkinIndexForDate(plan(''), '2026-07-01'), null);
});

// ---- 渲染 ----

test('DailyUI：未打卡日弹窗展示健身/学习两个打卡按钮', () => {
  const { DailyUI } = load();
  const state = { startDate: '2026-06-14', records: {} };
  const html = DailyUI.renderCheckinBody(state, TODAY); // day2 = 今天，未打卡
  assert.match(html, /data-action="checkin" data-type="fitness"/);
  assert.match(html, /data-action="checkin" data-type="study"/);
  assert.ok(html.includes('健身'));
  assert.ok(html.includes('学习'));
  assert.ok(!html.includes('取消打卡'));
});

test('DailyUI：已打卡日弹窗展示当前类型 + 切换 + 取消', () => {
  const { DailyUI } = load();
  const state = { startDate: '2026-06-14', records: { [TODAY]: { type: 'fitness', at: '2026-06-15T08:00:00.000Z' } } };
  const html = DailyUI.renderCheckinBody(state, TODAY);
  assert.match(html, /data-action="cancel-checkin"/);
  assert.ok(html.includes('取消打卡'));
  assert.ok(html.includes('💪'));                       // 当前类型徽标
  assert.match(html, /data-action="checkin" data-type="study"/); // 可切换为学习
  assert.ok(!html.includes('data-action="checkin" data-type="fitness"')); // 不重复提供当前类型
});

test('DailyUI：stats 展示类型统计与金额（进行中/断签）', () => {
  const { DailyLogic, DailyUI } = load();
  const start = '2026-06-11'; // day1..day4 已过且全部打卡，day5=今天 → 进行中
  // 进行中：4 天（健 2 / 学 2），待返还 9200
  const records = {};
  for (let i = 1; i <= 4; i++) records[DailyLogic.checkinDate(plan(start), i)] = { type: i % 2 ? 'fitness' : 'study' };
  const ongoing = DailyUI.renderStats({ startDate: start, records });
  assert.ok(ongoing.includes('💪 健身'));
  assert.ok(ongoing.includes('📚 学习'));
  // 两个类型各计 2 天（chip 内 <b>2</b><i>天</i>）
  assert.equal(ongoing.split('<b>2</b><i>天</i>').length - 1, 2);
  assert.ok(ongoing.includes(DailyUI.fmtMoney(9200)));
  assert.ok(ongoing.includes('待返还'));

  // 断签：day3 漏卡 → 已损失 9600
  const broken = DailyUI.renderStats({
    startDate: start,
    records: {
      [DailyLogic.checkinDate(plan(start), 1)]: { type: 'fitness' },
      [DailyLogic.checkinDate(plan(start), 2)]: { type: 'study' },
      [DailyLogic.checkinDate(plan(start), 4)]: { type: 'fitness' },
    },
  });
  assert.ok(broken.includes('已损失'));
  assert.ok(broken.includes(DailyUI.fmtMoney(9600)));
});

test('DailyUI：日历已打卡日显示类型 emoji，错过显示 ✗', () => {
  const { DailyLogic, DailyUI } = load();
  const start = '2026-06-14';
  const state = {
    startDate: start,
    records: {
      [DailyLogic.checkinDate(plan(start), 1)]: { type: 'study' },  // 昨天：已打卡
      [TODAY]: { type: 'fitness', at: '2026-06-15T08:00:00.000Z' }, // 今天：已打卡
    },
  };
  const html = DailyUI.renderCalendar(state, 2026, 5, TODAY); // 6 月（0-based 5）
  assert.ok(html.includes('data-date="2026-06-14"'));
  assert.ok(html.includes('data-date="2026-06-15"'));
  // 昨天 done + 📚，今天 done + 💪
  const yesterdayCell = cellOf(html, '2026-06-14');
  assert.ok(yesterdayCell.includes('done'));
  assert.ok(yesterdayCell.includes('📚'));
  const todayCell = cellOf(html, '2026-06-15');
  assert.ok(todayCell.includes('done'));
  assert.ok(todayCell.includes('💪'));

  // 漏卡场景：start 提前，中间有过去未打卡日 → ✗
  const start2 = '2026-06-13';
  const html2 = DailyUI.renderCalendar({ startDate: start2, records: {} }, 2026, 5, null);
  const missedCell = cellOf(html2, '2026-06-14');
  assert.ok(missedCell.includes('missed'));
  assert.ok(missedCell.includes('✗'));
});

// 从日历 HTML 中截取某日期的完整 cell（cell 内无嵌套 div，首个 </div> 即闭合）
function cellOf(html, dateStr) {
  const m = html.match(new RegExp('<div[^>]*data-date="' + dateStr + '"[^>]*>[\\s\\S]*?</div>'));
  return m ? m[0] : '';
}

test('DailyUI：庆祝统计展示进度与剩余待返还', () => {
  const { DailyLogic, DailyUI } = load();
  const start = '2026-06-11'; // day1..day4 已过且全部打卡，day5=今天 → 进行中
  const records = {};
  for (let i = 1; i <= 4; i++) records[DailyLogic.checkinDate(plan(start), i)] = { type: 'fitness' };
  const html = DailyUI.renderCelebrationStats({ startDate: start, records });
  assert.match(html, /已完成 4 \/ 50 天/);
  assert.ok(html.includes(DailyUI.fmtMoney(9200)));
  assert.match(html, /剩余待返还/);
});
