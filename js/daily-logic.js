// daily-logic.js —— 每日二选一打卡：纯计算（日程、断签金额、类型计数）
// 与健身计划（logic.js）完全独立，不涉及 DOM 与持久化，便于单独理解与测试。

// 全局计划参数：1 万对赌 ÷ 200/天 = 50 个连续打卡日（无休息日）
const DAILY_CONFIG = {
  totalDays: 50,          // 计划总天数（实际打卡名额；跳过不占名额）
  deposit: 10000,         // 对赌总金额（元）
  perDay: 200,            // 每天打卡返还金额（元）
  maxConsecutiveSkips: 6, // 连续跳过上限（生理期等特殊原因），第 7 天禁止
};

// 每天打卡二选一：健身 or 学习
const DAILY_TYPES = [
  { id: 'fitness', name: '健身', emoji: '💪' },
  { id: 'study',   name: '学习', emoji: '📚' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const DailyLogic = {
  // ---- 日期工具（基于本地时间，避免时区错位）----
  toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  },
  todayStr() {
    return this.toDateStr(new Date());
  },
  // 严格校验 YYYY-MM-DD（含真实日历日期，拒绝 2026-13-01 / 2026-6-1 / 2026/7/1）
  isValidDateStr(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    return this.toDateStr(this.parseDate(str)) === str;
  },
  // a 相对 b 的天数差（a 在 b 之后为正）
  diffDays(aStr, bStr) {
    return Math.round((this.parseDate(aStr) - this.parseDate(bStr)) / DAY_MS);
  },

  // ---- 计划日程（推导） ----
  // 从 startDate 起逐日历日推导：跳过日不占 50 个名额，后续打卡日自动顺延。
  // 返回 { days, byDate, lastDate }：
  //   days/byDate: 每个计划内日历日一项 { date, kind, index }
  //     kind: 'done' 已打卡 | 'skipped' 已跳过 | 'missed' 过去漏卡 | 'pending' 今天/未来待打卡
  //     index: 生效序号（1-based），done/missed/pending 有值；skipped 恒为 null
  //   lastDate: 计划内最后一个日历日（第 50 个生效名额用尽那天）
  buildSchedule(state) {
    const days = [];
    const byDate = {};
    const records = (state && state.records) || {};
    if (!this.isValidDateStr(state && state.startDate)) return { days, byDate, lastDate: null };

    const total = DAILY_CONFIG.totalDays;
    // 防脏数据死循环：合法数据两个生效日之间至多连跳 6 天，日程长度 ≤ 50×7
    // 触发上限时返回截断的部分日程（lastDate 并非真正的第 50 个名额日），仅脏数据会走到
    const maxWalk = total * (DAILY_CONFIG.maxConsecutiveSkips + 1);
    let used = 0; // 生效名额消耗（done/missed/pending 各占 1，跳过不占）
    let cursor = this.parseDate(state.startDate);
    let lastDate = null;

    while (used < total && days.length < maxWalk) {
      const dateStr = this.toDateStr(cursor);
      const rec = records[dateStr];
      let day;
      if (this.isCheckedIn(rec)) {
        used++;
        day = { date: dateStr, kind: 'done', index: used };
      } else if (this.isSkipped(rec)) {
        day = { date: dateStr, kind: 'skipped', index: null };
      } else if (this.diffDays(dateStr, this.todayStr()) < 0) {
        used++; // 漏卡也占名额
        day = { date: dateStr, kind: 'missed', index: used };
      } else {
        used++; // 今天/未来：占满剩余名额的待打卡日
        day = { date: dateStr, kind: 'pending', index: used };
      }
      days.push(day);
      byDate[dateStr] = day;
      lastDate = dateStr;
      cursor = this.addDays(cursor, 1);
    }
    return { days, byDate, lastDate };
  },

  // 取某日期的推导结果；计划外（含 startDate 非法）返回 null。
  // 跳过日在计划内但 index 为 null——判断「是否在计划内」用这个，别用 checkinIndexForDate。
  scheduleDayOf(state, dateStr) {
    return this.buildSchedule(state).byDate[dateStr] || null;
  },

  // ---- 计划日程 API（消费推导结果；日程随跳过记录顺延，因此签名吃 state） ----
  // 某日期对应第几个生效打卡日（1-based）；null 表示跳过日或计划外。
  // 判断「是否在计划内」请用 scheduleDayOf（跳过日在计划内但无序号）。
  checkinIndexForDate(state, dateStr) {
    const day = this.scheduleDayOf(state, dateStr);
    return day ? day.index : null;
  },
  // 第 i 个生效打卡日对应的日期；i 超出 50 或 startDate 非法返回 null
  checkinDate(state, i) {
    const day = this.buildSchedule(state).days.find((d) => d.index === i);
    return day ? day.date : null;
  },
  lastCheckinDate(state) {
    return this.buildSchedule(state).lastDate;
  },

  // ---- 打卡判定 ----
  // 记录带合法类型才算已打卡
  isCheckedIn(record) {
    return !!(record && DAILY_TYPES.some((t) => t.id === record.type));
  },
  // 跳过日（生理期等特殊原因）：不打卡、不占 50 天名额、不断签、不返钱
  isSkipped(record) {
    return !!(record && record.type === 'skip');
  },
  // 取打卡类型对象（供 UI 显示名称 / emoji）
  typeOf(record) {
    return DAILY_TYPES.find((t) => t.id === record.type) || null;
  },

  // ---- 全局状态：断签与对赌金额 ----
  // 规则与健身计划一致：从第 1 天起连续打卡；某个「已过期」的打卡日未完成即断签，
  // 断签点之后的金额全部损失（补上漏卡日即恢复）。
  // 跳过日不返钱、不占 50 天名额，但保住连续不断签（后续日程自动顺延）。
  computeStatus(state) {
    const records = state.records || {};
    const total = DAILY_CONFIG.totalDays;
    let completed = 0;      // 实际打卡天数（跳过不计）
    let doneBeforeMiss = 0; // 第一个漏卡日之前的实际打卡数（= 可返金额基数）
    let firstMissed = null;
    let allDone = true;
    let skippedCount = 0;
    const typeCounts = {};
    for (const t of DAILY_TYPES) typeCounts[t.id] = 0;

    for (const day of this.buildSchedule(state).days) {
      if (day.kind === 'skipped') { skippedCount++; continue; }
      if (day.kind === 'done') {
        completed++;
        typeCounts[records[day.date].type]++;
        if (firstMissed === null) doneBeforeMiss++;
      } else if (day.kind === 'missed') {
        allDone = false;
        if (firstMissed === null) firstMissed = day.index;
      } else {
        allDone = false; // pending：今天/未来待打卡
      }
    }

    const broken = firstMissed !== null;
    const earned = broken ? doneBeforeMiss : completed; // 断签前实际打卡数（跳过不计钱）
    const returned = earned * DAILY_CONFIG.perDay;
    const lost = broken ? (total - earned) * DAILY_CONFIG.perDay : 0;
    const recoverable = broken ? 0 : (total - completed) * DAILY_CONFIG.perDay;

    let phase = 'ongoing';
    if (allDone) phase = 'done';
    else if (broken) phase = 'failed';

    return {
      completed,
      remainingDays: total - completed,
      firstMissed,
      broken,
      returned,
      lost,
      recoverable,
      phase,
      typeCounts,
      skippedCount,
      totalDays: DAILY_CONFIG.totalDays,
      deposit: DAILY_CONFIG.deposit,
    };
  },
};
