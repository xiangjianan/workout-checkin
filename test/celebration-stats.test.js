// test/celebration-stats.test.js —— 庆祝弹窗统计信息渲染（纯函数 renderCelebrationStats）

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadFT } = require('./helpers/load');

// 把目标值转成一条“全部达标”的打卡记录
function doneRecord(targets) {
  const exercises = {};
  for (const [id, n] of Object.entries(targets)) {
    exercises[id] = { completed: n };
  }
  return { exercises };
}

test('renderCelebrationStats：初始进度 1/50，待返还金额与百分比正确', () => {
  const { FTLogic, FTUI } = loadFT();
  FTLogic.todayStr = () => '2024-06-15'; // 固定“今天”，保证可重现

  const startDate = '2024-06-13';
  // workout 1 = 06-13（过去，完成）；workout 2 = 06-15（今天，未完成）；workout 3+ 未来
  const state = {
    startDate,
    records: { '2024-06-13': doneRecord(FTLogic.targetsForWorkout(startDate, 1)) },
  };

  const html = FTUI.renderCelebrationStats(state);
  const s = FTLogic.computeStatus(state);

  // 前置：状态本身符合预期
  assert.equal(s.completed, 1);
  assert.equal(s.recoverable, 9800);

  // 整体进度（用户需求 1）：进度条宽度 + “已完成 X / 50 次”
  assert.match(html, /width:\s*2%/i);
  assert.match(html, /已完成 1 \/ 50 次/);

  // 百分比 + 距离目标（用户需求 2）
  assert.match(html, /2%/);
  assert.match(html, /距离目标/);
  assert.match(html, /49/); // 剩余 49 次
  assert.match(html, /约 98 天/); // 49*2 天

  // 剩余待返还金额（用户需求 3）：用同一格式化函数构造期望串，规避 locale 分组分符
  assert.ok(html.includes(FTUI.fmtMoney(9800)), '应包含待返还 ¥9,800');
  assert.ok(html.includes(FTUI.fmtMoney(200)), '应包含已返还 ¥200');
  assert.match(html, /剩余待返还/);
});

test('renderCelebrationStats：完成 5 次后进度更新为 10%，剩余待返还递减', () => {
  const { FTLogic, FTUI } = loadFT();
  FTLogic.todayStr = () => '2024-06-15';

  // 让 workout 6 落在未来，避免“过去未完成”触发断签
  const startDate = '2024-06-07';
  // workout 1..5：06-07 / 06-09 / 06-11 / 06-13 / 06-15；workout 6 = 06-17（未来）
  const records = {};
  for (let i = 1; i <= 5; i++) {
    records[FTLogic.workoutDate(startDate, i)] =
      doneRecord(FTLogic.targetsForWorkout(startDate, i));
  }
  const state = { startDate, records };

  const html = FTUI.renderCelebrationStats(state);
  const s = FTLogic.computeStatus(state);

  assert.equal(s.completed, 5);
  assert.equal(s.broken, false);
  assert.equal(s.recoverable, 9000);
  assert.equal(s.returned, 1000);

  assert.match(html, /width:\s*10%/i);
  assert.match(html, /已完成 5 \/ 50 次/);
  assert.match(html, /约 90 天/); // 剩余 45 次 → 90 天
  assert.ok(html.includes(FTUI.fmtMoney(9000)), '待返还应为 ¥9,000');
  assert.ok(html.includes(FTUI.fmtMoney(1000)), '已返还应为 ¥1,000');
});

test('renderCelebrationStats：断签后待返还为 ¥0 并提示已损失', () => {
  const { FTLogic, FTUI } = loadFT();
  FTLogic.todayStr = () => '2024-06-15';

  const startDate = '2024-05-01'; // workout 4 = 05-07（过去）未完成 → 断签
  const records = {};
  for (let i = 1; i <= 3; i++) {
    records[FTLogic.workoutDate(startDate, i)] =
      doneRecord(FTLogic.targetsForWorkout(startDate, i));
  }
  const state = { startDate, records };

  const html = FTUI.renderCelebrationStats(state);
  const s = FTLogic.computeStatus(state);

  assert.equal(s.broken, true);
  assert.equal(s.recoverable, 0);
  assert.equal(s.lost, 9400); // (50-3)*200

  assert.ok(html.includes(FTUI.fmtMoney(0)), '断签后待返还应为 ¥0');
  assert.ok(html.includes(FTUI.fmtMoney(9400)), '应提示已损失 ¥9,400');
});
