// ui.js —— 纯渲染函数，返回 HTML 字符串（不直接读写状态）

const FTUI = {
  fmtMoney(n) {
    return '¥' + n.toLocaleString('zh-CN');
  },

  renderStats(state) {
    const s = FTLogic.computeStatus(state);
    const phaseMap = {
      ongoing: { text: '进行中', cls: 'ongoing' },
      done: { text: '已完成 🎉', cls: 'done' },
      failed: { text: '已断签', cls: 'failed' },
    };
    const ph = phaseMap[s.phase];
    const pct = Math.round((s.completed / s.totalWorkouts) * 100);
    const subLine = s.broken
      ? `第 ${s.firstMissed} 次训练未打卡，之后金额无法返还`
      : `距离目标 ${s.remainingWorkouts} 次 · 约 ${s.remainingDays} 天`;
    const rightMoney = s.broken
      ? { label: '已损失', value: this.fmtMoney(s.lost), cls: 'lost' }
      : { label: '待返还', value: this.fmtMoney(s.recoverable), cls: 'pending' };

    return `
      <div class="stat-hero ${ph.cls}">
        <div class="hero-top">
          <span class="hero-phase">${ph.text}</span>
          <span class="hero-pct">${pct}%</span>
        </div>
        <div class="hero-count"><b>${s.completed}</b><i>/ ${s.totalWorkouts} 次</i></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="hero-sub">${subLine}</div>
      </div>
      <div class="stat-money">
        <div class="money-item">
          <span class="money-label">已返还</span>
          <span class="money-value returned">${this.fmtMoney(s.returned)}</span>
        </div>
        <div class="money-item">
          <span class="money-label">${rightMoney.label}</span>
          <span class="money-value ${rightMoney.cls}">${rightMoney.value}</span>
        </div>
      </div>
    `;
  },

  // 庆祝弹窗里的整体进度概览：进度条 + 百分比 + 距离目标 + 剩余待返还金额
  renderCelebrationStats(state) {
    const s = FTLogic.computeStatus(state);
    const pct = Math.round((s.completed / s.totalWorkouts) * 100);
    const moneySub = s.broken
      ? `已断签，已损失 ${this.fmtMoney(s.lost)}`
      : `已返还 ${this.fmtMoney(s.returned)}`;

    return `
      <div class="celebrate-stats">
        <div class="cs-progress">
          <div class="cs-progress-head">
            <span class="cs-label">整体进度</span>
            <span class="cs-pct">${pct}%</span>
          </div>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <div class="cs-progress-sub">已完成 ${s.completed} / ${s.totalWorkouts} 次</div>
        </div>
        <div class="cs-grid">
          <div class="cs-item">
            <div class="cs-label">距离目标</div>
            <div class="cs-value">${s.remainingWorkouts}<span class="cs-unit"> 次</span></div>
            <div class="cs-sub">约 ${s.remainingDays} 天</div>
          </div>
          <div class="cs-item money">
            <div class="cs-label">剩余待返还</div>
            <div class="cs-value">${this.fmtMoney(s.recoverable)}</div>
            <div class="cs-sub">${moneySub}</div>
          </div>
        </div>
      </div>
    `;
  },

  renderCalendar(state, year, month /* 0-based */, selectedDate) {
    const today = FTLogic.todayStr();
    const first = new Date(year, month, 1);
    const startWeekday = (first.getDay() + 6) % 7; // 周一为首列
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastPlan = FTLogic.lastWorkoutDate(state.startDate);

    let html = '';
    for (let i = 0; i < startWeekday; i++) html += `<div class="cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = FTLogic.toDateStr(new Date(year, month, d));
      const wi = FTLogic.workoutIndexForDate(state.startDate, dateStr);
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedDate;

      if (wi !== null) {
        const rec = state.records[dateStr];
        const targets = FTLogic.targetsForWorkout(state.startDate, wi);
        const done = FTLogic.isWorkoutDone(rec, targets);
        const isPast = FTLogic.diffDays(dateStr, today) < 0;
        const status = done ? 'done' : isPast ? 'missed' : isToday ? 'pending' : 'future';
        const mark = done ? '✓' : isPast ? '✗' : '';
        html += `
          <div class="cell workout ${status} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
               data-date="${dateStr}" role="button" tabindex="0" aria-label="${dateStr} 第${wi}次训练">
            <span class="day-num">${d}</span>
            <span class="badge">#${wi}</span>
            <span class="mark">${mark}</span>
          </div>`;
      } else {
        const inPlan =
          FTLogic.diffDays(dateStr, state.startDate) >= 0 && FTLogic.diffDays(dateStr, lastPlan) <= 0;
        html += `
          <div class="cell rest ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
            <span class="day-num">${d}</span>
            <span class="tag">${inPlan ? '休' : ''}</span>
          </div>`;
      }
    }
    return html;
  },

  renderCheckinTitle(state, dateStr) {
    const wi = FTLogic.workoutIndexForDate(state.startDate, dateStr);
    const d = FTLogic.parseDate(dateStr);
    const cn = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    if (wi === null) return { title: cn, sub: '休息日 · 安心恢复' };
    return { title: `${cn} · 第 ${wi} 次训练`, sub: '完成全部 5 个项目即打卡成功（+¥200）' };
  },

  renderCheckinBody(state, dateStr, advancedOpen, customOpen = false, draft = null) {
    const wi = FTLogic.workoutIndexForDate(state.startDate, dateStr);
    if (wi === null) {
      return `<p class="muted rest-note">这一天不是训练日，安心休息 💤</p>`;
    }
    const targets = FTLogic.targetsForWorkout(state.startDate, wi);
    const rec = state.records[dateStr];
    const dayDone = FTLogic.isWorkoutDone(rec, targets);
    // 当天目标：5 个项目标一致，取首项作每项目标，汇总全天总数
    const perEx = targets[FT_EXERCISES[0].id];
    const total = FT_EXERCISES.reduce((sum, ex) => sum + (targets[ex.id] || 0), 0);
    const rows = FT_EXERCISES.map((ex) => this.renderExerciseCard(ex, targets[ex.id], rec)).join('');
    const batch = this.renderBatchSection(rec, targets, customOpen, draft);

    // 一键完成当天全部，置于分组区之下（已完成时降级为不可点的状态提示）
    const quickBtn = dayDone
      ? `<button class="btn btn-quick-complete done" disabled>✓ 当天已全部完成</button>`
      : `<button class="btn btn-primary btn-quick-complete" data-action="quick-complete-day">✓ 一键完成当天全部</button>`;

    return `
      <div class="day-target">
        <div class="day-target-label">🎯 今日目标</div>
        <div class="day-target-main">
          <span class="day-target-per"><b>${perEx}</b><i>个 / 项</i></span>
          <span class="day-target-total">共 5 项 · 合计 <b>${total}</b> 个</span>
        </div>
      </div>
      <details class="advanced"${advancedOpen ? ' open' : ''}>
        <summary>分组完成（高级）<small>把目标拆成多组，5 项同步逐组完成</small></summary>
        ${batch}
      </details>
      ${quickBtn}
      <div class="day-status ${dayDone ? 'is-done' : ''}">
        ${dayDone
          ? '✅ 本次训练已全部完成 <button class="replay" data-action="replay-celebrate">🎉 重播动画</button>'
          : '完成全部 5 个项目即打卡成功（+¥200）'}
      </div>
      <div class="exercise-list">${rows}</div>
    `;
  },

  // 批量分组区：选择分组方案（一键应用于 5 项）+ 逐组完成（5 项同步）
  renderBatchSection(record, targets, customOpen = false, draft = null) {
    const sharedTarget = targets[FT_EXERCISES[0].id];
    const allSame = FT_EXERCISES.every((ex) => targets[ex.id] === sharedTarget);
    if (!allSame) return ''; // 各项目标不一致时不提供批量分组

    const ref = record && record.exercises && record.exercises[FT_EXERCISES[0].id];
    const refGroups = (ref && ref.groupReps) || [];
    const curSets = refGroups.length;
    const total = FT_EXERCISES.length;

    // 分组方案 chips：只列能整除的方案，点一下即应用
    // 仅当当前分组恰好均匀（每组同值）时，高亮对应 chip
    const uniform = curSets > 0 && refGroups.every((r) => r === refGroups[0]);
    // 标题摘要：均匀显示「每组 N」（50组×2 这类方案全列会占满整行）；非均匀超过 6 组截断
    const summary = curSets > 0 ? ` · 当前 ${curSets} 组 ${
      uniform ? `每组 ${refGroups[0]}`
        : curSets > 6 ? refGroups.slice(0, 6).join('+') + '+…'
        : refGroups.join('+')
    }` : '';
    const chips = FTLogic.groupOptions(sharedTarget).map((o) => `
      <button class="chip ${uniform && curSets === o.sets && refGroups[0] === o.reps ? 'on' : ''}"
              data-action="apply-groups-all" data-sets="${o.sets}" data-reps="${o.reps}">
        ${o.sets}组 ×${o.reps}
      </button>`).join('');
    const customChip = `
      <button class="chip custom ${customOpen ? 'on' : ''}" data-action="toggle-custom-groups">✏️ 自定义</button>`;

    // 自定义分组面板：customOpen 时展开（草稿缺省则按 2 组均分初始化）
    const customPanel = customOpen
      ? this.renderCustomGroupsPanel(sharedTarget, draft || { target: sharedTarget, count: 2, values: [] })
      : '';

    // 逐组完成按钮：点「第N组」一次性标记 5 个项目的第 N 组
    // 顺序约束：前面的组没完成时，后面的组锁定不可点
    let batchSets = '';
    if (curSets > 0) {
      // 各项目的“连续完成前缀”长度（如 [✓,✓,✗,✗] → 2）
      const prefixes = FT_EXERCISES.map((ex) => {
        const e = record && record.exercises && record.exercises[ex.id];
        let p = 0;
        while (e && e.setDone && e.setDone[p]) p++;
        return p;
      });
      const minP = Math.min(...prefixes);
      const maxP = Math.max(...prefixes);

      const btns = Array.from({ length: curSets }, (_, k) => {
        let done = 0;
        for (const ex of FT_EXERCISES) {
          const e = record && record.exercises && record.exercises[ex.id];
          if (e && e.setDone && e.setDone[k]) done++;
        }
        const cls = done === total ? 'on' : done > 0 ? 'partial' : '';
        const mark = done === total ? '✓' : `${done}/${total}`;
        // 可勾选：它是“下一个该做的组”（所有项目前 k 组都完成）
        // 可取消：它是“最后一个完成的组”（只能从后往前取消）
        const canToggle = k === minP || (minP === maxP && k === minP - 1);
        const locked = !canToggle;
        return `<button class="set-btn batch ${cls} ${locked ? 'locked' : ''}" data-action="toggle-set-all" data-set="${k}" ${locked ? 'disabled' : ''}>
          第${k + 1}组·${refGroups[k]} <em>${mark}</em>${locked ? '<i class="lock">🔒</i>' : ''}</button>`;
      }).join('');
      batchSets = `
        <div class="batch-sets">
          <div class="batch-sets-label">逐组完成（按顺序来：前面的组没完成，后面的组会锁定 🔒）</div>
          <div class="sets-row">${btns}</div>
        </div>`;
    }

    return `
      <div class="batch-section">
        <div class="batch-row">
          <span class="batch-title">分组方案 <small>每项目标 ${sharedTarget} 个 · 一键应用于全部 5 项${summary}</small></span>
          <div class="chips">${chips}${customChip}</div>
          ${curSets > 0 ? '<button class="btn btn-mini" data-action="clear-groups-all">清除分组</button>' : ''}
        </div>
        ${customPanel}
        ${batchSets}
      </div>
    `;
  },

  // 尾组显示：补差值带符号（如 +33）；缺口原样显示（-10 / 0）；无效输入显示 —
  formatTail(pv) {
    if (pv.last === null) return '—';
    return pv.last >= 1 ? `+${pv.last}` : String(pv.last);
  },

  // 合计行：有效时「合计 T / T ✓」，否则「合计 X / T · 错误文案」
  formatSumLine(pv, target) {
    return pv.ok
      ? `合计 ${target} / ${target} ✓`
      : `合计 ${pv.sum === null ? '?' : pv.sum} / ${target} · ${pv.error}`;
  },

  // 自定义分组面板：组数自动均分 → 前 n-1 组可调 → 最后一组自动补差（只读）
  renderCustomGroupsPanel(target, draft) {
    // target 非整数或 <2 时 splitEvenly 双双返回 null，groups.length 会抛错，这里直接不渲染
    if (!Number.isInteger(target) || target < 2) return '';
    const groups = FTLogic.splitEvenly(target, draft.count) || FTLogic.splitEvenly(target, 2);
    const count = groups.length;
    // 草稿长度与组数不匹配时（如刚改完组数），回退为均分默认值
    const values = draft.values.length === count - 1 ? draft.values : groups.slice(0, -1).map(String);
    const pv = FTLogic.customGroupsPreview(target, values);
    const inputs = values.map((v, i) => `
      <label class="cg-item"><span>第${i + 1}组</span>
        <input class="cg-rep" data-idx="${i}" type="number" inputmode="numeric" min="1" value="${v}">
      </label>`).join('');
    const tailVal = this.formatTail(pv);
    const sumLine = this.formatSumLine(pv, target);
    return `
      <div class="custom-groups">
        <div class="cg-row">
          <label class="cg-item"><span>组数</span>
            <input class="cg-count" type="number" inputmode="numeric" min="2" max="${target}" value="${count}">
          </label>
          <span class="cg-hint">改组数自动重新均分 · 最后一组自动补差</span>
        </div>
        <div class="cg-groups">${inputs}
          <label class="cg-item tail"><span>第${count}组</span>
            <input class="cg-rep tail" readonly tabindex="-1" value="${tailVal}">
          </label>
        </div>
        <div class="cg-sum ${pv.ok ? '' : 'err'}" aria-live="polite">${sumLine}</div>
        <button class="btn btn-mini primary" data-action="apply-groups-custom"${pv.ok ? '' : ' disabled'}>应用分组</button>
      </div>`;
  },

  renderExerciseCard(ex, target, record) {
    const exRec = record && record.exercises && record.exercises[ex.id];
    const completed = FTLogic.exerciseCompleted(record, ex.id);
    const groupReps = (exRec && exRec.groupReps) || [];
    const sets = groupReps.length;
    const setDone = (exRec && exRec.setDone) || [];
    const pct = Math.min(100, Math.round((completed / target) * 100));
    const isDone = completed >= target;

    // 右侧主操作：未完成 →「完成」；已完成 →「归零」
    const actionBtn = isDone
      ? `<button class="btn btn-mini ghost ex-reset" data-action="reset">归零</button>`
      : `<button class="btn btn-mini primary" data-action="complete">完成</button>`;

    // 分组后：本项目「一组一组」打卡按钮（顺序锁定：只能勾选下一组 / 取消最后一组）
    let setsHtml = '';
    if (sets > 0) {
      let prefix = 0;
      while (setDone[prefix]) prefix++;
      const btns = Array.from({ length: sets }, (_, k) => {
        const locked = !(k === prefix || k === prefix - 1);
        return `<button class="set-btn mini ${setDone[k] ? 'on' : ''} ${locked ? 'locked' : ''}"
            data-action="toggle-set" data-set="${k}"${locked ? ' disabled' : ''}
            title="第${k + 1}组 · ${groupReps[k]} 个" aria-label="第${k + 1}组 ${groupReps[k]} 个">${groupReps[k]}${setDone[k] ? ' ✓' : locked ? ' 🔒' : ''}</button>`;
      }).join('');
      setsHtml = `<div class="sets-row tight">${btns}</div>`;
    }

    return `
      <div class="exercise-row ${isDone ? 'done' : ''}" data-ex-id="${ex.id}">
        <div class="ex-line">
          <span class="ex-emoji">${ex.emoji}</span>
          <span class="ex-name">${ex.name}</span>
          <span class="ex-count ${isDone ? 'done' : ''}">${completed}<i>/${target}</i></span>
          <span class="ex-act">${actionBtn}</span>
        </div>
        <div class="progress slim"><i style="width:${pct}%"></i></div>
        ${setsHtml}
      </div>
    `;
  },
};
