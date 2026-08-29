// daily-app.js —— 每日打卡页应用入口：持有状态、挂载 DOM、绑定事件
// 与健身计划（app.js）完全独立，仅复用同一套样式与交互模式。

const DailyApp = {
  state: null,
  view: { year: 0, month: 0 }, // 日历当前视图（month 为 0-based）
  selectedDate: null,

  init() {
    this.state = DailyStore.load();
    const now = new Date();
    this.view = { year: now.getFullYear(), month: now.getMonth() };

    this.bindGlobal();
    this.bindModals();
    this.bindCalendar();
    this.bindCheckin();
    this.bindSettings();
    this.bindAudioUnlock();

    this.rerender();
  },

  // 移动端自动播放策略：AudioContext 必须在用户手势中创建/恢复才能发声。
  // 在「首次任意手势」时解锁音频上下文，后续庆祝的金币声一定能播出来。
  bindAudioUnlock() {
    if (this._audioUnlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const unlock = () => {
      if (!this._audioCtx) this._audioCtx = new AC();
      if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
      this._audioUnlocked = true;
    };
    const opts = { once: true, passive: true };
    document.addEventListener('pointerdown', unlock, opts);
    document.addEventListener('touchstart', unlock, opts);
    document.addEventListener('keydown', unlock, opts);
  },

  // 全量刷新（统计 + 日历 + 打卡弹窗）
  rerender() {
    document.getElementById('stats').innerHTML = DailyUI.renderStats(this.state);
    document.getElementById('month-label').textContent =
      `${this.view.year} 年 ${this.view.month + 1} 月`;
    document.getElementById('calendar').innerHTML =
      DailyUI.renderCalendar(this.state, this.view.year, this.view.month, this.selectedDate);

    const checkinOpen = !document.getElementById('modal-checkin').classList.contains('hidden');
    if (this.selectedDate && checkinOpen) this.refreshCheckin();
  },

  // 应用一次状态变更：保存 + 刷新
  commit(nextState) {
    const prevState = this.state;
    this.state = nextState;
    DailyStore.save(this.state);
    this.rerender();
    // 轻触感反馈（PWA；iOS 无 Vibration API 时自动跳过）
    if (navigator.vibrate) navigator.vibrate(10);
    this.maybeCelebrate(prevState, this.state);
  },

  // 打卡日由“未打卡”变为“已打卡”时，弹出庆祝动画（提醒收 ¥200）
  maybeCelebrate(prev, next) {
    const dateStr = this.selectedDate;
    if (!dateStr) return;
    if (DailyLogic.scheduleDayOf(next, dateStr) === null) return;
    const wasDone = DailyLogic.isCheckedIn(prev && prev.records[dateStr]);
    const isDone = DailyLogic.isCheckedIn(next.records[dateStr]);
    if (!wasDone && isDone) this.showCelebration(dateStr);
  },

  showCelebration(dateStr) {
    const overlay = document.getElementById('celebration');
    overlay.querySelector('h2').textContent =
      !dateStr || dateStr === DailyLogic.todayStr() ? '今日打卡成功！' : '补打卡成功！';
    overlay.querySelector('#celebrate-stats').innerHTML =
      DailyUI.renderCelebrationStats(this.state);
    overlay.classList.remove('hidden');
    // 庆祝触感（双脉冲；iOS 自动 no-op）
    if (navigator.vibrate) navigator.vibrate([10, 40, 20]);
    // 重新触发卡片弹出动画
    const card = overlay.querySelector('.celebration-card');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    this.spawnConfetti();
    this.playCoinSound();
  },

  // 金币到账音效：Web Audio 合成（双音“叮—叮” + 上行琶音），无需音频文件
  async playCoinSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._audioCtx) this._audioCtx = new AC();
      const ctx = this._audioCtx;
      // 等待上下文真正恢复为 running 再排音，避免移动端在 suspended 态下静默丢音
      if (ctx.state !== 'running') await ctx.resume();
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
      console.warn('[Daily] 音效播放失败', e);
    }
  },

  spawnConfetti() {
    const layer = document.getElementById('confetti-layer');
    layer.innerHTML = '';
    // 尊重「减少动态效果」：不撒彩纸，仅保留静态庆祝卡
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15'];
    const emojis = ['💸', '💰', '🎉', '💪', '📚'];
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
      this.closeModal('modal-checkin'); // 收款后顺手关掉今天的打卡弹框
    });
  },

  gotoToday() {
    const now = new Date();
    this.view = { year: now.getFullYear(), month: now.getMonth() };
    this.rerender();
    const today = DailyLogic.todayStr();
    if (DailyLogic.scheduleDayOf(this.state, today) !== null) {
      this.openCheckin(today);
    }
  },

  exportData() {
    const blob = new Blob([DailyStore.exportJSON(this.state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-checkin-${DailyLogic.todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = DailyStore.importJSON(reader.result);
        if (!confirm('导入将覆盖当前所有每日打卡数据，是否继续？')) return;
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
      if (DailyLogic.scheduleDayOf(this.state, dateStr) !== null) {
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
    const { title, sub } = DailyUI.renderCheckinTitle(this.state, dateStr);
    document.getElementById('checkin-title').textContent = title;
    document.getElementById('checkin-sub').textContent = sub;
    document.getElementById('checkin-body').innerHTML =
      DailyUI.renderCheckinBody(this.state, dateStr);
  },
  bindCheckin() {
    // 事件委托：容器稳定，内部每次刷新重建
    document.getElementById('checkin-body').addEventListener('click', (e) => this.handleCheckinAction(e));
  },
  handleCheckinAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const dateStr = this.selectedDate;
    const action = btn.dataset.action;
    if (DailyLogic.scheduleDayOf(this.state, dateStr) === null) return;

    if (action === 'replay-celebrate') {
      this.showCelebration(dateStr);
      return;
    }
    if (action === 'checkin') {
      this.commit(DailyStore.checkin(this.state, dateStr, btn.dataset.type));
      return;
    }
    if (action === 'cancel-checkin') {
      if (!confirm('确定取消这天的打卡吗？取消后金额与进度会重新计算。')) return;
      this.commit(DailyStore.cancelCheckin(this.state, dateStr));
      return;
    }
    if (action === 'skip-day') {
      // 防御：仅计划内未打卡日可跳过（canSkip 只管连跳上限，挡不住计划外/已打卡/已跳过的陈旧点击）
      const day = DailyLogic.scheduleDayOf(this.state, dateStr);
      if (!day || day.kind === 'done' || day.kind === 'skipped') return;
      if (!DailyLogic.canSkip(this.state, dateStr)) {
        alert('连续跳过不能超过 6 天，请先完成一次打卡。');
        return;
      }
      if (!confirm('确定跳过这一天吗？不断签、不返 ¥200，后续日程顺延 1 天。')) return;
      this.commit(DailyStore.skip(this.state, dateStr));
      return;
    }
    if (action === 'cancel-skip') {
      const past = DailyLogic.diffDays(dateStr, DailyLogic.todayStr()) < 0;
      const msg = past
        ? '确定取消跳过吗？该日已过去，取消后将记为漏卡，若因此断签金额将无法返还。'
        : '确定取消跳过吗？这天恢复为待打卡，进度与日程会重新计算。';
      if (!confirm(msg)) return;
      this.commit(DailyStore.cancelCheckin(this.state, dateStr));
      return;
    }
  },

  // ---- 设置弹窗 ----
  bindSettings() {
    document.getElementById('btn-settings').addEventListener('click', () => {
      document.getElementById('setting-start-date').value = this.state.startDate;
      this.openModal('modal-settings');
    });
    document.getElementById('setting-start-date').addEventListener('change', (e) => {
      if (e.target.value) this.commit(DailyStore.setStartDate(this.state, e.target.value));
    });
    document.getElementById('btn-reset-all').addEventListener('click', () => {
      if (!confirm('确定清空所有每日打卡数据吗？此操作不可恢复。')) return;
      this.commit(DailyStore.defaultState());
      this.closeModal('modal-settings');
    });
    document.getElementById('btn-test-celebration').addEventListener('click', () => {
      this.closeModal('modal-settings');
      this.showCelebration(DailyLogic.todayStr());
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

document.addEventListener('DOMContentLoaded', () => DailyApp.init());
