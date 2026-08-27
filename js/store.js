// store.js —— localStorage 持久化层
// 所有变更均“返回新状态”，遵循不可变更新（不直接修改原对象）。

const FTStore = {
  KEY: 'fitness_tracker_state_v1',

  defaultState() {
    return { startDate: FTLogic.todayStr(), records: {} };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this.defaultState();
      const parsed = JSON.parse(raw);
      return {
        startDate: typeof parsed.startDate === 'string' ? parsed.startDate : FTLogic.todayStr(),
        records: this.normalizeRecords(parsed.records),
      };
    } catch (e) {
      console.error('[FT] 数据读取失败，使用默认状态', e);
      return this.defaultState();
    }
  },

  // 把历史记录（可能是旧 sets/reps 格式）整体规范化为 groupReps 形态
  normalizeRecords(records) {
    const out = {};
    for (const [dateStr, rec] of Object.entries(records && typeof records === 'object' ? records : {})) {
      const exercises = {};
      for (const exId of Object.keys((rec && rec.exercises) || {})) {
        exercises[exId] = this._exercise(rec, exId);
      }
      out[dateStr] = { ...rec, exercises };
    }
    return out;
  },

  save(state) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[FT] 数据保存失败', e);
      alert('数据保存失败，浏览器存储可能已满或被禁用。');
    }
  },

  exportJSON(state) {
    return JSON.stringify(state, null, 2);
  },

  importJSON(text) {
    const parsed = JSON.parse(text);
    if (typeof parsed.startDate !== 'string' || !parsed.records || typeof parsed.records !== 'object') {
      throw new Error('文件格式不正确');
    }
    return { startDate: parsed.startDate, records: this.normalizeRecords(parsed.records) };
  },

  // ---- 不可变更新助手 ----
  setStartDate(state, startDate) {
    return { ...state, startDate };
  },

  // 取某天某项目的规范化记录（深拷贝，避免外部误改）
  // 旧均匀分组字段 sets/reps 自动迁移为 groupReps 数组（长度 = sets，每项 = reps）
  _exercise(record, exId) {
    const prev = (record.exercises && record.exercises[exId]) || {};
    const groupReps = Array.isArray(prev.groupReps)
      ? [...prev.groupReps]
      : prev.sets && prev.reps
        ? new Array(prev.sets).fill(prev.reps)
        : [];
    return {
      completed: prev.completed || 0,
      groupReps,
      setDone: Array.isArray(prev.setDone) ? prev.setDone.slice(0, groupReps.length) : [],
    };
  },

  // 对某天某项目应用一次变更，返回全新 state
  updateExercise(state, dateStr, exId, updater) {
    const prevRec = state.records[dateStr] || { exercises: {} };
    const nextEx = updater(this._exercise(prevRec, exId));
    const nextRec = { ...prevRec, exercises: { ...prevRec.exercises, [exId]: nextEx } };
    return { ...state, records: { ...state.records, [dateStr]: nextRec } };
  },

  // 标为完成：只升不降（已超目标则保持）
  completeExercise(state, dateStr, exId, target) {
    return this.updateExercise(state, dateStr, exId, (ex) => ({
      ...ex,
      completed: Math.max(ex.completed, target),
    }));
  },

  resetExercise(state, dateStr, exId) {
    return this.updateExercise(state, dateStr, exId, () => ({
      completed: 0,
      groupReps: [],
      setDone: [],
    }));
  },

  // 应用分组配置：groupReps 为每组数量数组（如 [34, 33, 33]），重新开始本项目的分组进度
  applyGroups(state, dateStr, exId, groupReps) {
    return this.updateExercise(state, dateStr, exId, () => ({
      completed: 0,
      groupReps: [...groupReps],
      setDone: new Array(groupReps.length).fill(false),
    }));
  },

  // 清除分组配置：保留已完成的个数
  clearGroups(state, dateStr, exId) {
    return this.updateExercise(state, dateStr, exId, (ex) => ({
      completed: ex.completed,
      groupReps: [],
      setDone: [],
    }));
  },

  // 把指定组的完成状态设为 value（内部助手）
  _setSetDone(state, dateStr, exId, setIndex, value) {
    return this.updateExercise(state, dateStr, exId, (ex) => {
      const n = ex.groupReps.length;
      if (!n || ex.setDone.length !== n || setIndex >= n) return ex;
      // 顺序约束：只能勾选“第一个未完成组”，或取消“最后一个已完成组”
      let prefix = 0;
      while (ex.setDone[prefix]) prefix++;
      if (value && setIndex !== prefix) return ex;      // 前面的组未完成，不能勾选这组
      if (!value && setIndex !== prefix - 1) return ex; // 只能从最后一组往前取消
      const setDone = [...ex.setDone];
      setDone[setIndex] = value;
      const completed = ex.groupReps.reduce((sum, r, i) => (setDone[i] ? sum + r : sum), 0);
      return { ...ex, setDone, completed };
    });
  },
  _isSetDone(state, dateStr, exId, setIndex) {
    const rec = state.records[dateStr];
    const ex = rec && rec.exercises && rec.exercises[exId];
    return !!(ex && ex.setDone && ex.setDone[setIndex]);
  },
  toggleSet(state, dateStr, exId, setIndex) {
    return this._setSetDone(state, dateStr, exId, setIndex, !this._isSetDone(state, dateStr, exId, setIndex));
  },

  // —— 批量操作（作用于当天全部 5 个项目）——
  // 一键给 5 个项目应用同一分组方案（groupReps 为每组数量数组）
  applyGroupsAll(state, dateStr, groupReps) {
    let s = state;
    for (const ex of FT_EXERCISES) s = this.applyGroups(s, dateStr, ex.id, groupReps);
    return s;
  },
  // 清除 5 个项目的分组配置（保留各自已完成个数）
  clearGroupsAll(state, dateStr) {
    let s = state;
    for (const ex of FT_EXERCISES) s = this.clearGroups(s, dateStr, ex.id);
    return s;
  },
  // 切换“第 setIndex 组”在 5 个项目上的状态：
  // 若 5 项该组都已完成 → 全部取消；否则全部置为完成
  toggleSetAll(state, dateStr, setIndex) {
    let allOn = true;
    for (const ex of FT_EXERCISES) {
      if (!this._isSetDone(state, dateStr, ex.id, setIndex)) { allOn = false; break; }
    }
    let s = state;
    for (const ex of FT_EXERCISES) s = this._setSetDone(s, dateStr, ex.id, setIndex, !allOn);
    return s;
  },

  // 一键完成当天全部项目
  quickCompleteDay(state, dateStr, targets) {
    let s = state;
    for (const ex of FT_EXERCISES) {
      s = this.completeExercise(s, dateStr, ex.id, targets[ex.id]);
    }
    return s;
  },
};
