// logic.js —— 计划配置与纯计算（日程、目标、对赌金额、连签状态）
// 不涉及 DOM 与持久化，便于单独理解与测试。

// 全局计划参数
const FT_CONFIG = {
  totalWorkouts: 50, // 总训练次数（100 天计划，隔天一次）
  totalDays: 100,    // 计划总天数
  deposit: 10000,    // 对赌总金额（元）
  perWorkout: 200,   // 每次打卡返还金额（元）
};

// 5 个训练项目：默认均按 2、4、6 … 100 递增。
// 如需调整某项目节奏，改这里的 start / step / max 即可。
const FT_EXERCISES = [
  { id: 'pushup',   name: '俯卧撑',   emoji: '💪', start: 2, step: 2, max: 100 },
  { id: 'situp',    name: '仰卧起坐', emoji: '🔥', start: 2, step: 2, max: 100 },
  { id: 'squat',    name: '蹲起',     emoji: '🦵', start: 2, step: 2, max: 100 },
  { id: 'armer',    name: '臂力器',   emoji: '🏋️', start: 2, step: 2, max: 100 },
  { id: 'dumbbell', name: '哑铃',     emoji: '🤚', start: 2, step: 2, max: 100 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const FTLogic = {
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
  // a 相对 b 的天数差（a 在 b 之后为正）
  diffDays(aStr, bStr) {
    return Math.round((this.parseDate(aStr) - this.parseDate(bStr)) / DAY_MS);
  },

  // ---- 计划与目标 ----
  // 某日期对应第几次训练（1-based）；null 表示非训练日（休息日或计划外）
  workoutIndexForDate(startDate, dateStr) {
    const diff = this.diffDays(dateStr, startDate);
    if (diff < 0 || diff % 2 !== 0) return null;
    const i = diff / 2 + 1;
    if (i < 1 || i > FT_CONFIG.totalWorkouts) return null;
    return i;
  },
  // 第 i 次训练对应的日期
  workoutDate(startDate, i) {
    return this.toDateStr(this.addDays(this.parseDate(startDate), (i - 1) * 2));
  },
  lastWorkoutDate(startDate) {
    return this.workoutDate(startDate, FT_CONFIG.totalWorkouts);
  },
  // 某项目在第 i 次训练的目标个数（按递增规则，封顶 max）
  targetForWorkout(ex, i) {
    return Math.min(ex.start + ex.step * (i - 1), ex.max);
  },
  // 第 i 次训练的全部项目目标 { id: 个数 }
  targetsForWorkout(startDate, i) {
    const t = {};
    for (const ex of FT_EXERCISES) t[ex.id] = this.targetForWorkout(ex, i);
    return t;
  },
  // 某目标个数的全部"可整除"分组方案，按组数升序返回 [{sets, reps}]
  // 例如 target=10 → [1组×10, 2组×5, 5组×2, 10组×1]；3组/4组无法整除则不出现
  groupOptions(target) {
    const opts = [];
    for (let g = 1; g <= target; g++) {
      if (target % g === 0) opts.push({ sets: g, reps: target / g });
    }
    return opts;
  },

  // ---- 单次训练完成判定 ----
  exerciseCompleted(record, exId) {
    return (
      (record && record.exercises && record.exercises[exId] && record.exercises[exId].completed) || 0
    );
  },
  // 当天 5 个项目全部达到目标才算“打卡成功”
  isWorkoutDone(record, targets) {
    if (!record || !record.exercises) return false;
    for (const ex of FT_EXERCISES) {
      if (this.exerciseCompleted(record, ex.id) < (targets[ex.id] ?? 0)) return false;
    }
    return true;
  },

  // ---- 全局状态：连签与对赌金额 ----
  // 规则：从第 1 次起连续打卡；一旦某个“已过期”的训练日未完成，即视为断签，
  // 断签点之后的金额全部损失。
  computeStatus(state) {
    const today = this.todayStr();
    const records = state.records || {};
    let completed = 0;
    let firstMissed = null;
    let allDone = true;

    for (let i = 1; i <= FT_CONFIG.totalWorkouts; i++) {
      const dstr = this.workoutDate(state.startDate, i);
      const targets = this.targetsForWorkout(state.startDate, i);
      const done = this.isWorkoutDone(records[dstr], targets);
      const isPast = this.diffDays(dstr, today) < 0; // 严格小于今天才算过期
      if (done) completed++;
      else allDone = false;
      if (isPast && !done && firstMissed === null) firstMissed = i;
    }

    const broken = firstMissed !== null;
    const earned = broken ? firstMissed - 1 : completed; // 断签前连续完成数
    const returned = earned * FT_CONFIG.perWorkout;
    const lost = broken ? (FT_CONFIG.totalWorkouts - earned) * FT_CONFIG.perWorkout : 0;
    const recoverable = broken ? 0 : (FT_CONFIG.totalWorkouts - completed) * FT_CONFIG.perWorkout;

    let phase = 'ongoing';
    if (allDone) phase = 'done';
    else if (broken) phase = 'failed';

    return {
      completed,
      remainingWorkouts: FT_CONFIG.totalWorkouts - completed,
      remainingDays: (FT_CONFIG.totalWorkouts - completed) * 2,
      firstMissed,
      broken,
      returned,
      lost,
      recoverable,
      phase,
      totalWorkouts: FT_CONFIG.totalWorkouts,
      deposit: FT_CONFIG.deposit,
    };
  },

  // 自开赛以来某项目累计完成的总个数
  cumulativeForExercise(state, exId) {
    const records = state.records || {};
    let sum = 0;
    for (let i = 1; i <= FT_CONFIG.totalWorkouts; i++) {
      sum += this.exerciseCompleted(records[this.workoutDate(state.startDate, i)], exId);
    }
    return sum;
  },
};
