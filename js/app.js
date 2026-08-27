// app.js —— 应用入口：持有状态、挂载 DOM、绑定事件

const FTApp = {
  state: null,
  view: { year: 0, month: 0 }, // 日历当前视图（month 为 0-based）
  selectedDate: null,
  checkinAdvancedOpen: false, // 训练弹窗「分组完成（高级）」折叠态，跨重渲染保留
  customGroupsOpen: false, // 「✏️ 自定义」面板展开态，跨重渲染保留
  customDraft: null, // 面板草稿 { target, count, values[]（前 n-1 组的字符串输入） }

  init() {
    this.state = FTStore.load();
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
  // 这里在「首次任意手势」(点今天 / 点日历 / 点项目……) 时就解锁音频上下文，
  // 这样后续触发庆祝时上下文已是 running，金币声一定能播出来。
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
    // 轻触感反馈（PWA；iOS 无 Vibration API 时自动跳过）
    if (navigator.vibrate) navigator.vibrate(10);
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
      console.warn('[FT] 音效播放失败', e);
    }
  },

  spawnConfetti() {
    const layer = document.getElementById('confetti-layer');
    layer.innerHTML = '';
    // 尊重「减少动态效果」：不撒彩纸，仅保留静态庆祝卡
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
    document.getElementById('checkin-body').innerHTML =
      FTUI.renderCheckinBody(this.state, dateStr, this.checkinAdvancedOpen, this.customGroupsOpen, this.customDraft);
  },
  bindCheckin() {
    // 事件委托：容器稳定，内部每次刷新重建
    const body = document.getElementById('checkin-body');
    body.addEventListener('click', (e) => this.handleCheckinAction(e));
    // 捕获「高级」折叠态：每次 commit 会整体重渲染 body，靠这里记下开关避免回弹
    body.addEventListener('toggle', (e) => {
      const d = e.target.closest('details.advanced');
      if (d) this.checkinAdvancedOpen = d.hasAttribute('open');
    }, true);
    // 面板内输入只做局部更新（不重渲染，避免输入框丢焦点）；组数 change 才重建面板
    body.addEventListener('input', (e) => this.handleCheckinInput(e));
    body.addEventListener('change', (e) => this.handleCheckinChange(e));
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
    if (action === 'quick-complete-day') {
      const wi = FTLogic.workoutIndexForDate(this.state.startDate, dateStr);
      if (wi === null) return;
      const targets = FTLogic.targetsForWorkout(this.state.startDate, wi);
      this.commit(FTStore.quickCompleteDay(this.state, dateStr, targets));
      return;
    }
    if (action === 'apply-groups-all') {
      const sets = Number(btn.dataset.sets);
      const reps = Number(btn.dataset.reps);
      this.commit(FTStore.applyGroupsAll(this.state, dateStr, new Array(sets).fill(reps)));
      return;
    }
    if (action === 'clear-groups-all') {
      this.commit(FTStore.clearGroupsAll(this.state, dateStr));
      return;
    }
    if (action === 'toggle-custom-groups') {
      this.toggleCustomGroups();
      return;
    }
    if (action === 'apply-groups-custom') {
      this.applyCustomGroups(dateStr);
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

  // ---- 自定义分组面板 ----
  // 打开面板时初始化草稿：有当前分组则预填，否则默认 2 组均分
  initCustomDraft(target, curGroups) {
    if (Array.isArray(curGroups) && curGroups.length >= 2) {
      return { target, count: curGroups.length, values: curGroups.slice(0, -1).map(String) };
    }
    const groups = FTLogic.splitEvenly(target, 2);
    return { target, count: 2, values: groups.slice(0, -1).map(String) };
  },

  toggleCustomGroups() {
    this.customGroupsOpen = !this.customGroupsOpen;
    if (this.customGroupsOpen) {
      const wi = FTLogic.workoutIndexForDate(this.state.startDate, this.selectedDate);
      const targets = FTLogic.targetsForWorkout(this.state.startDate, wi);
      const target = targets[FT_EXERCISES[0].id];
      // 目标变了（换了日期/补打卡）或首次打开：重建草稿
      if (!this.customDraft || this.customDraft.target !== target) {
        const rec = this.state.records[this.selectedDate];
        const ref = rec && rec.exercises && rec.exercises[FT_EXERCISES[0].id];
        this.customDraft = this.initCustomDraft(target, ref && ref.groupReps);
      }
    }
    this.refreshCheckin();
  },

  // 每组数量输入：写草稿 + 仅局部更新面板（尾组/合计/应用按钮）
  handleCheckinInput(e) {
    const input = e.target.closest('.cg-rep:not(.tail)');
    if (!input || !this.customDraft) return;
    const idx = Number(input.dataset.idx);
    if (!Number.isInteger(idx) || idx >= this.customDraft.values.length) return;
    const values = [...this.customDraft.values];
    values[idx] = input.value;
    this.customDraft = { ...this.customDraft, values };
    this.updateCustomPanelDom();
  },

  // 组数变更：合法则按新组数重新均分并重建面板；非法则回弹为草稿里的上一个合法值
  handleCheckinChange(e) {
    const input = e.target.closest('.cg-count');
    if (!input || !this.customDraft) return;
    const count = Number(input.value);
    const groups = FTLogic.splitEvenly(this.customDraft.target, count);
    if (!groups) {
      input.value = String(this.customDraft.count);
      return;
    }
    this.customDraft = { ...this.customDraft, count, values: groups.slice(0, -1).map(String) };
    this.refreshCheckin(); // 重建每组输入框（此时光标已离开组数框）
  },

  // 面板局部更新：重算尾组/合计/应用按钮态，不触发整体重渲染
  updateCustomPanelDom() {
    const panel = document.querySelector('#checkin-body .custom-groups');
    if (!panel || !this.customDraft) return;
    const pv = FTLogic.customGroupsPreview(this.customDraft.target, this.customDraft.values);
    const tail = panel.querySelector('.cg-rep.tail');
    if (tail) tail.value = FTUI.formatTail(pv);
    const sum = panel.querySelector('.cg-sum');
    if (sum) {
      sum.textContent = FTUI.formatSumLine(pv, this.customDraft.target);
      sum.classList.toggle('err', !pv.ok);
    }
    const apply = panel.querySelector('[data-action="apply-groups-custom"]');
    if (apply) apply.disabled = !pv.ok;
  },

  applyCustomGroups(dateStr) {
    if (!this.customDraft) return;
    const pv = FTLogic.customGroupsPreview(this.customDraft.target, this.customDraft.values);
    if (!pv.ok) return;
    const groupReps = this.customDraft.values.map(Number).concat(pv.last);
    this.customGroupsOpen = false; // commit → rerender 时面板收起
    this.commit(FTStore.applyGroupsAll(this.state, dateStr, groupReps));
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
