// daily-store.js —— 每日打卡的 localStorage 持久化层（key 与健身计划隔离）
// 所有变更均「返回新状态」，遵循不可变更新（不直接修改原对象）。

const DailyStore = {
  KEY: 'daily_checkin_state_v1',

  defaultState() {
    return { startDate: DailyLogic.todayStr(), records: {} };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this.defaultState();
      return this.importJSON(raw);
    } catch (e) {
      console.error('[Daily] 数据读取失败，使用默认状态', e);
      return this.defaultState();
    }
  },

  save(state) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[Daily] 数据保存失败', e);
      alert('数据保存失败，浏览器存储可能已满或被禁用。');
    }
  },

  exportJSON(state) {
    return JSON.stringify(state, null, 2);
  },

  importJSON(text) {
    const parsed = JSON.parse(text);
    if (
      typeof parsed.startDate !== 'string' ||
      !DailyLogic.isValidDateStr(parsed.startDate) ||
      !parsed.records ||
      typeof parsed.records !== 'object' ||
      Array.isArray(parsed.records)
    ) {
      throw new Error('文件格式不正确');
    }
    return { startDate: parsed.startDate, records: parsed.records };
  },

  // ---- 不可变更新助手 ----
  setStartDate(state, startDate) {
    return { ...state, startDate };
  },

  // 跳过当天（生理期等特殊原因）：写入与打卡同构的 skip 记录——
  // 不返钱、不占 50 天名额，但不断签；checkin 可直接覆盖，cancelCheckin 可撤回
  skip(state, dateStr) {
    return {
      ...state,
      records: { ...state.records, [dateStr]: { type: 'skip', at: new Date().toISOString() } },
    };
  },

  // 打卡 / 切换类型：写入当天类型与打卡时间，返回全新 state
  checkin(state, dateStr, type) {
    return {
      ...state,
      records: { ...state.records, [dateStr]: { type, at: new Date().toISOString() } },
    };
  },

  // 取消打卡：移除当天记录
  cancelCheckin(state, dateStr) {
    const records = { ...state.records };
    delete records[dateStr];
    return { ...state, records };
  },
};
