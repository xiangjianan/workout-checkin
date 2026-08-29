// daily-ui.js —— 每日打卡页的纯渲染函数，返回 HTML 字符串（不直接读写状态）

const DailyUI = {
  fmtMoney(n) {
    return '¥' + n.toLocaleString('zh-CN');
  },

  // 打卡时间 → 本地可读格式（MM-DD HH:mm）
  fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  renderStats(state) {
    const s = DailyLogic.computeStatus(state);
    const phaseMap = {
      ongoing: { text: '进行中', cls: 'ongoing' },
      done: { text: '已完成 🎉', cls: 'done' },
      failed: { text: '已断签', cls: 'failed' },
    };
    const ph = phaseMap[s.phase];
    const pct = Math.round((s.completed / s.totalDays) * 100);
    // 跳过副行：有跳过记录时前置「已跳过 N 天」（断签提示优先展示）
    const skipNote = s.skippedCount > 0 ? `已跳过 ${s.skippedCount} 天 · ` : '';
    const subLine = s.broken
      ? `第 ${s.firstMissed} 天未打卡，之后金额无法返还（点击该日补卡可挽回）`
      : `${skipNote}距离目标 ${s.remainingDays} 天`;
    const rightMoney = s.broken
      ? { label: '已损失', value: this.fmtMoney(s.lost), cls: 'lost' }
      : { label: '待返还', value: this.fmtMoney(s.recoverable), cls: 'pending' };

    const typeChips = DAILY_TYPES.map((t) => `
        <div class="type-chip">
          <span class="type-chip-name">${t.emoji} ${t.name}</span>
          <b>${s.typeCounts[t.id] || 0}</b><i>天</i>
        </div>`).join('');

    return `
      <div class="stat-hero ${ph.cls}">
        <div class="hero-top">
          <span class="hero-phase">${ph.text}</span>
          <span class="hero-pct">${pct}%</span>
        </div>
        <div class="hero-count"><b>${s.completed}</b><i>/ ${s.totalDays} 天</i></div>
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
      <div class="type-stats">${typeChips}</div>
    `;
  },

  // 庆祝弹窗里的整体进度概览
  renderCelebrationStats(state) {
    const s = DailyLogic.computeStatus(state);
    const pct = Math.round((s.completed / s.totalDays) * 100);
    const moneySub = s.broken
      ? `已断签，已损失 ${this.fmtMoney(s.lost)}`
      : `已返还 ${this.fmtMoney(s.returned)}`;
    const typeSub = DAILY_TYPES.map((t) => `${t.emoji}${s.typeCounts[t.id] || 0}`).join(' · ');

    return `
      <div class="celebrate-stats">
        <div class="cs-progress">
          <div class="cs-progress-head">
            <span class="cs-label">整体进度</span>
            <span class="cs-pct">${pct}%</span>
          </div>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <div class="cs-progress-sub">已完成 ${s.completed} / ${s.totalDays} 天</div>
        </div>
        <div class="cs-grid">
          <div class="cs-item">
            <div class="cs-label">距离目标</div>
            <div class="cs-value">${s.remainingDays}<span class="cs-unit"> 天</span></div>
            <div class="cs-sub">${typeSub}</div>
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
    const today = DailyLogic.todayStr();
    const records = state.records || {}; // 与逻辑层同口径：无 records 键的 state 也是合法输入
    // 一次推导整月共用（跳过日不占名额，序号随跳过顺延）
    const sched = DailyLogic.buildSchedule(state);
    const first = new Date(year, month, 1);
    const startWeekday = (first.getDay() + 6) % 7; // 周一为首列
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < startWeekday; i++) html += `<div class="cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = DailyLogic.toDateStr(new Date(year, month, d));
      const day = sched.byDate[dateStr] || null; // null = 计划外
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedDate;

      if (day) {
        const rec = records[dateStr];
        const done = day.kind === 'done';
        const status = done
          ? 'done'
          : day.kind === 'skipped'
            ? 'skipped'
            : day.kind === 'missed'
              ? 'missed'
              : isToday ? 'pending' : 'future';
        const mark = done
          ? DailyLogic.typeOf(rec).emoji
          : day.kind === 'skipped' ? '🩡' : day.kind === 'missed' ? '✗' : '';
        const badge = day.index === null ? '' : `<span class="badge">#${day.index}</span>`;
        const label = day.index === null ? '已跳过' : `第${day.index}天${done ? ' 已打卡' : ''}`;
        html += `
          <div class="cell workout ${status} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
               data-date="${dateStr}" role="button" tabindex="0" aria-label="${dateStr} ${label}">
            <span class="day-num">${d}</span>
            ${badge}
            <span class="mark">${mark}</span>
          </div>`;
      } else {
        // 计划外日期（50 个生效名额之外，含跳过顺延出的尾部，不标记任何内容）
        html += `
          <div class="cell rest ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
            <span class="day-num">${d}</span>
          </div>`;
      }
    }
    return html;
  },

  renderCheckinTitle(state, dateStr) {
    const day = DailyLogic.scheduleDayOf(state, dateStr); // 跳过日在计划内但无序号，须用日程判定
    const d = DailyLogic.parseDate(dateStr);
    const cn = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    if (!day) return { title: cn, sub: '计划外日期' };
    if (day.kind === 'skipped') return { title: `${cn} · 跳过日`, sub: '不断签 · 不返钱 · 日程顺延 1 天' };
    return { title: `${cn} · 第 ${day.index} 天`, sub: '健身 / 学习 二选一打卡（+¥200）' };
  },

  renderCheckinBody(state, dateStr) {
    const day = DailyLogic.scheduleDayOf(state, dateStr);
    if (!day) {
      return `<p class="muted rest-note">这一天不在 50 天计划内 💤</p>`;
    }
    const records = state.records || {}; // 与逻辑层同口径：无 records 键的 state 也是合法输入
    const rec = records[dateStr];

    // 两个二选一大按钮（跳过覆盖 / 待打卡两分支共用，仅提示语随场景不同）
    const choiceBtns = (hint) => DAILY_TYPES.map((t) => `
      <button class="choice-btn" data-action="checkin" data-type="${t.id}">
        <span class="ce">${t.emoji}</span>
        <span class="cn">${t.name}打卡</span>
        <span class="chint">${hint(t)}</span>
      </button>`).join('');

    // 已跳过：覆盖打卡（返 ¥200、收回顺延）或取消跳过
    if (day.kind === 'skipped') {
      const btns = choiceBtns(() => '身体恢复？打卡返 ¥200，日程收回顺延');
      return `
        <div class="day-status is-skipped">
          🩡 已跳过这天 ${rec.at ? `<span class="muted small">（${this.fmtTime(rec.at)}）</span>` : ''}
          <span class="muted small">不断签 · 不返 ¥200 · 日程顺延 1 天</span>
        </div>
        <div class="choice-grid">${btns}</div>
        <button class="skip-cancel" data-action="cancel-skip">↩️ 取消跳过（恢复为待打卡）</button>
      `;
    }

    // 已打卡：展示当前类型 + 切换 / 取消 / 重播
    if (day.kind === 'done') {
      const curType = DailyLogic.typeOf(rec);
      const other = DAILY_TYPES.find((t) => t.id !== curType.id);
      return `
        <div class="day-status is-done">
          ✅ 已打卡 <strong>${curType.emoji} ${curType.name}</strong>
          ${rec.at ? `<span class="muted small">（${this.fmtTime(rec.at)}）</span>` : ''}
          <button class="replay" data-action="replay-celebrate">🎉 重播动画</button>
        </div>
        <div class="choice-grid done">
          <button class="choice-btn switch" data-action="checkin" data-type="${other.id}">
            <span class="ce">${other.emoji}</span>
            <span class="cn">改为${other.name}</span>
            <span class="chint">点错类别？一键切换</span>
          </button>
          <button class="choice-btn cancel" data-action="cancel-checkin">
            <span class="ce">↩️</span>
            <span class="cn">取消打卡</span>
            <span class="chint">当天记录将删除</span>
          </button>
        </div>
      `;
    }

    // 未打卡（漏卡/待打卡）：两个大按钮二选一 + 特殊原因跳过
    // canSkip 只管连跳上限——计划外/已打卡走不到这，靠上面的分支天然挡住；
    // 连跳达上限时按钮仅视觉置灰 + aria 提示，点击仍走 app 层 alert 解释
    const btns = choiceBtns((t) => `今天做了${t.name}？点这里`);
    const canSkip = DailyLogic.canSkip(state, dateStr);
    const skipCls = canSkip ? 'skip-btn' : 'skip-btn is-blocked';
    const skipAttrs = canSkip ? '' : ' aria-disabled="true" title="连续跳过不能超过 6 天"';
    return `
      <div class="day-status">健身 / 学习，今天完成哪样？</div>
      <div class="choice-grid">${btns}</div>
      <button class="${skipCls}" data-action="skip-day"${skipAttrs}>
        🩡 特殊原因跳过这天
      </button>
      <p class="muted small choice-note">打卡成功即返 ¥200；生理期等特殊原因可跳过——不断签、不返钱、日程顺延 1 天。</p>
    `;
  },
};
