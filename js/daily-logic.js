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
    const maxWalk = total * (DAILY_CONFIG.maxConsecutiveSkips + 1);
    let used = 0; // 已占用的生效名额（done + missed）
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

  // ---- 计划日程 ----
  // 某日期对应第几个打卡日（1-based）；null 表示计划外日期（含 startDate 非法的情况）
  checkinIndexForDate(startDate, dateStr) {
    const diff = this.diffDays(dateStr, startDate);
    if (!Number.isFinite(diff) || diff < 0 || diff >= DAILY_CONFIG.totalDays) return null;
    return diff + 1;
  },
  // 第 i 个打卡日对应的日期
  checkinDate(startDate, i) {
    return this.toDateStr(this.addDays(this.parseDate(startDate), i - 1));
  },
  lastCheckinDate(startDate) {
    return this.checkinDate(startDate, DAILY_CONFIG.totalDays);
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
  computeStatus(state) {
    const today = this.todayStr();
    const records = state.records || {};
    let completed = 0;
    let firstMissed = null;
    let allDone = true;
    const typeCounts = {};
    for (const t of DAILY_TYPES) typeCounts[t.id] = 0;

    for (let i = 1; i <= DAILY_CONFIG.totalDays; i++) {
      const dstr = this.checkinDate(state.startDate, i);
      const rec = records[dstr];
      const done = this.isCheckedIn(rec);
      const isPast = this.diffDays(dstr, today) < 0; // 严格小于今天才算过期
      if (done) {
        completed++;
        typeCounts[rec.type]++;
      } else {
        allDone = false;
      }
      if (isPast && !done && firstMissed === null) firstMissed = i;
    }

    const broken = firstMissed !== null;
    const earned = broken ? firstMissed - 1 : completed; // 断签前连续完成数
    const returned = earned * DAILY_CONFIG.perDay;
    const lost = broken ? (DAILY_CONFIG.totalDays - earned) * DAILY_CONFIG.perDay : 0;
    const recoverable = broken ? 0 : (DAILY_CONFIG.totalDays - completed) * DAILY_CONFIG.perDay;

    let phase = 'ongoing';
    if (allDone) phase = 'done';
    else if (broken) phase = 'failed';

    return {
      completed,
      remainingDays: DAILY_CONFIG.totalDays - completed,
      firstMissed,
      broken,
      returned,
      lost,
      recoverable,
      phase,
      typeCounts,
      totalDays: DAILY_CONFIG.totalDays,
      deposit: DAILY_CONFIG.deposit,
    };
  },
};
