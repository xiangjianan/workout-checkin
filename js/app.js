// app.js —— 应用入口：持有状态、挂载 DOM、绑定事件

const FTApp = {
  state: null,
  view: { year: 0, month: 0 }, // 日历当前视图（month 为 0-based）
  selectedDate: null,

  init() {
    this.state = FTStore.load();
    const now = new Date();
    this.view = { year: now.getFullYear(), month: now.getMonth() };

    this.bindGlobal();
    this.bindModals();
    this.bindCalendar();
    this.bindCheckin();
    this.bindSettings();

    this.rerender();
  },

  // 全量刷新（统计 + 日历 + 打卡弹窗）
  rerender() {
    document.getElementById('stats').innerHTML = FTUI.renderStats(this.state);
    document.getElementById('month-label').textContent =
      `${this.view.year} 年 ${this.view.month + 1} 月`;
    document.getElementById('calendar').innerHTML =
      FTUI.renderCalendar(this.state, this.view.year, this.view.month, this.selectedDate);

    const checkinOpen = !document.getElementById('modal-checkin').classList.contains('hidden');
    if (this.selectedDate && checkinOpen) this.refreshCheckin();
  },

  // 应用一次状态变更：保存 + 刷新
  commit(nextState) {
    const prevState = this.state;
    this.state = nextState;
    FTStore.save(this.state);
    this.rerender();
    this.maybeCelebrate(prevState, this.state);
  },

  // 训练日由“未完成”变为“完成”时，弹出庆祝动画（提醒收 ¥200）
  maybeCelebrate(prev, next) {
    const dateStr = this.selectedDate;
    if (!dateStr) return;
    const wi = FTLogic.workoutIndexForDate(next.startDate, dateStr);
    if (wi === null) return;
    const targets = FTLogic.targetsForWorkout(next.startDate, wi);
    const wasDone = FTLogic.isWorkoutDone(prev && prev.records[dateStr], targets);
    const isDone = FTLogic.isWorkoutDone(next.records[dateStr], targets);
    if (!wasDone && isDone) this.showCelebration(dateStr);
  },

  showCelebration(dateStr) {
    const overlay = document.getElementById('celebration');
    overlay.querySelector('h2').textContent =
      !dateStr || dateStr === FTLogic.todayStr() ? '今日训练打卡成功！' : '补打卡成功！';
    overlay.querySelector('#celebrate-stats').innerHTML =
      FTUI.renderCelebrationStats(this.state);
    overlay.classList.remove('hidden');
    // 重新触发卡片弹出动画
    const card = overlay.querySelector('.celebration-card');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    this.spawnConfetti();
    this.playCoinSound();
  },

  // 金币到账音效：Web Audio 合成（双音“叮—叮” + 上行琶音），无需音频文件
  playCoinSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._audioCtx) this._audioCtx = new AC();
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime + 0.05;

      const tone = (freq, t, dur, type, vol) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + dur + 0.05);
      };

      // 经典金币声：B5 → E6（方波，短促清脆）
      tone(988, 0, 0.12, 'square', 0.12);
      tone(1319, 0.09, 0.45, 'square', 0.12);
      // 上行琶音点缀（三角波，更有“到账”仪式感）
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15 + i * 0.07, 0.3, 'triangle', 0.10));
      // 收尾高音“叮”
      tone(2093, 0.45, 0.5, 'sine', 0.08);
    } catch (e) {
      console.warn('[FT] 音效播放失败', e);
    }
  },

  spawnConfetti() {
    const layer = document.getElementById('confetti-layer');
    layer.innerHTML = '';
    const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15'];
    const emojis = ['💸', '💰', '🎉', '💪'];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 120; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      if (i % 5 === 0) {
        p.classList.add('emoji');
        p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        p.style.fontSize = (16 + Math.random() * 20) + 'px';
      } else {
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.width = (6 + Math.random() * 8) + 'px';
        p.style.height = (8 + Math.random() * 10) + 'px';
      }
      p.style.left = Math.random() * 100 + 'vw';
      p.style.animationDelay = (Math.random() * 0.9) + 's';
      p.style.animationDuration = (2.4 + Math.random() * 2) + 's';
      frag.appendChild(p);
    }
    layer.appendChild(frag);
  },

  // ---- 顶部操作 ----
  bindGlobal() {
    document.getElementById('btn-today').addEventListener('click', () => this.gotoToday());
    document.getElementById('btn-export').addEventListener('click', () => this.exportData());
    document.getElementById('btn-import').addEventListener('click', () =>
      document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
    document.getElementById('celebration-close').addEventListener('click', () => {
      document.getElementById('celebration').classList.add('hidden');
      this.closeModal('modal-checkin'); // 收款后顺手关掉今天的任务弹框
    });
  },

  gotoToday() {
    const now = new Date();
    this.view = { year: now.getFullYear(), month: now.getMonth() };
    this.rerender();
    const today = FTLogic.todayStr();
    if (FTLogic.workoutIndexForDate(this.state.startDate, today) !== null) {
      this.openCheckin(today);
    }
  },

  exportData() {
    const blob = new Blob([FTStore.exportJSON(this.state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitness-${FTLogic.todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = FTStore.importJSON(reader.result);
        if (!confirm('导入将覆盖当前所有数据，是否继续？')) return;
        this.commit(next);
        alert('导入成功');
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  },

  // ---- 日历 ----
  bindCalendar() {
    document.getElementById('prev-month').addEventListener('click', () => this.shiftMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => this.shiftMonth(1));

    const grid = document.getElementById('calendar');
    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell || cell.classList.contains('empty')) return;
      const dateStr = cell.dataset.date;
      if (!dateStr) return;
      if (FTLogic.workoutIndexForDate(this.state.startDate, dateStr) !== null) {
        this.openCheckin(dateStr);
      }
    });
    // 键盘可达性：Enter / Space 触发点击
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('.cell');
      if (cell) {
        e.preventDefault();
        cell.click();
      }
    });
  },

  shiftMonth(delta) {
    let { year, month } = this.view;
    month += delta;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    this.view = { year, month };
    this.rerender();
  },

  // ---- 弹窗通用 ----
  bindModals() {
    document.querySelectorAll('.close-modal').forEach((btn) =>
      btn.addEventListener('click', () => this.closeModal(btn.dataset.modal)));
    document.querySelectorAll('.modal-backdrop').forEach((bd) =>
      bd.addEventListener('click', () => this.closeModal(bd.parentElement.id)));
  },
  openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  },
  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  // ---- 打卡弹窗 ----
  openCheckin(dateStr) {
    this.selectedDate = dateStr;
    this.openModal('modal-checkin');
    this.refreshCheckin();
    this.rerender(); // 同步日历选中态
  },
  refreshCheckin() {
    const dateStr = this.selectedDate;
    if (!dateStr) return;
    const { title, sub } = FTUI.renderCheckinTitle(this.state, dateStr);
    document.getElementById('checkin-title').textContent = title;
    document.getElementById('checkin-sub').textContent = sub;
    document.getElementById('checkin-body').innerHTML = FTUI.renderCheckinBody(this.state, dateStr);
  },
  bindCheckin() {
    // 事件委托：容器稳定，内部每次刷新重建
    document.getElementById('checkin-body').addEventListener('click', (e) =>
      this.handleCheckinAction(e));

    document.getElementById('quick-complete-day').addEventListener('click', () => {
      const dateStr = this.selectedDate;
      const wi = FTLogic.workoutIndexForDate(this.state.startDate, dateStr);
      if (wi === null) return;
      const targets = FTLogic.targetsForWorkout(this.state.startDate, wi);
      this.commit(FTStore.quickCompleteDay(this.state, dateStr, targets));
    });
  },
  handleCheckinAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const dateStr = this.selectedDate;
    const action = btn.dataset.action;
    if (FTLogic.workoutIndexForDate(this.state.startDate, dateStr) === null) return;

    // —— 批量操作（作用于全部 5 个项目，无需 exId）——
    if (action === 'replay-celebrate') {
      this.showCelebration(dateStr);
      return;
    }
    if (action === 'apply-groups-all') {
      this.commit(FTStore.applyGroupsAll(this.state, dateStr, Number(btn.dataset.sets), Number(btn.dataset.reps)));
      return;
    }
    if (action === 'clear-groups-all') {
      this.commit(FTStore.clearGroupsAll(this.state, dateStr));
      return;
    }
    if (action === 'toggle-set-all') {
      this.commit(FTStore.toggleSetAll(this.state, dateStr, Number(btn.dataset.set)));
      return;
    }

    // —— 单项操作 ——
    const card = btn.closest('[data-ex-id]');
    const exId = card ? card.dataset.exId : null;
    if (!exId) return;
    const wi = FTLogic.workoutIndexForDate(this.state.startDate, dateStr);

    switch (action) {
      case 'complete': {
        const ex = FT_EXERCISES.find((x) => x.id === exId);
        this.commit(FTStore.completeExercise(this.state, dateStr, exId, FTLogic.targetForWorkout(ex, wi)));
        break;
      }
      case 'reset':
        this.commit(FTStore.resetExercise(this.state, dateStr, exId));
        break;
      case 'toggle-set':
        this.commit(FTStore.toggleSet(this.state, dateStr, exId, Number(btn.dataset.set)));
        break;
    }
  },

  // ---- 设置弹窗 ----
  bindSettings() {
    document.getElementById('btn-settings').addEventListener('click', () => {
      document.getElementById('setting-start-date').value = this.state.startDate;
      this.openModal('modal-settings');
    });
    document.getElementById('setting-start-date').addEventListener('change', (e) => {
      if (e.target.value) this.commit(FTStore.setStartDate(this.state, e.target.value));
    });
    document.getElementById('btn-reset-all').addEventListener('click', () => {
      if (!confirm('确定清空所有打卡数据吗？此操作不可恢复。')) return;
      this.commit(FTStore.defaultState());
      this.closeModal('modal-settings');
    });
    document.getElementById('btn-test-celebration').addEventListener('click', () => {
      this.closeModal('modal-settings');
      this.showCelebration(FTLogic.todayStr());
    });
    document.getElementById('btn-check-update').addEventListener('click', () => this.checkUpdate());
  },

  // 检查更新：注销 Service Worker + 清空网页缓存 + 刷新，强制从服务器拉取最新前端代码。
  // localStorage 里的打卡数据不受影响。
  async checkUpdate() {
    const btn = document.getElementById('btn-check-update');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在更新…';
    try {
      // 注销 Service Worker，下次加载会重新注册最新 sw.js
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      // 清空所有网页缓存，强制重新从服务器下载
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      window.location.reload();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = orig;
      alert('更新失败，请手动刷新页面重试：' + (e && e.message ? e.message : e));
    }
  },
};

document.addEventListener('DOMContentLoaded', () => FTApp.init());
