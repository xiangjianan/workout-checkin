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
    const subLine = s.broken
      ? `第 ${s.firstMissed} 天未打卡，之后金额无法返还（点击该日补卡可挽回）`
      : `距离目标 ${s.remainingDays} 天`;
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
    const first = new Date(year, month, 1);
    const startWeekday = (first.getDay() + 6) % 7; // 周一为首列
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < startWeekday; i++) html += `<div class="cell empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = DailyLogic.toDateStr(new Date(year, month, d));
      const di = DailyLogic.checkinIndexForDate(state, dateStr);
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedDate;

      if (di !== null) {
        const rec = state.records[dateStr];
        const done = DailyLogic.isCheckedIn(rec);
        const type = done ? DailyLogic.typeOf(rec) : null;
        const isPast = DailyLogic.diffDays(dateStr, today) < 0;
        const status = done ? 'done' : isPast ? 'missed' : isToday ? 'pending' : 'future';
        const mark = done ? type.emoji : isPast ? '✗' : '';
        html += `
          <div class="cell workout ${status} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
               data-date="${dateStr}" role="button" tabindex="0" aria-label="${dateStr} 第${di}天${done ? ' 已打卡' : ''}">
            <span class="day-num">${d}</span>
            <span class="badge">#${di}</span>
            <span class="mark">${mark}</span>
          </div>`;
      } else {
        // 计划外日期（50 天连续打卡，没有休息日，计划外不标记任何内容）
        html += `
          <div class="cell rest ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
            <span class="day-num">${d}</span>
          </div>`;
      }
    }
    return html;
  },

  renderCheckinTitle(state, dateStr) {
    const di = DailyLogic.checkinIndexForDate(state, dateStr);
    const d = DailyLogic.parseDate(dateStr);
    const cn = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    if (di === null) return { title: cn, sub: '计划外日期' };
    return { title: `${cn} · 第 ${di} 天`, sub: '健身 / 学习 二选一打卡（+¥200）' };
  },

  renderCheckinBody(state, dateStr) {
    const di = DailyLogic.checkinIndexForDate(state, dateStr);
    if (di === null) {
      return `<p class="muted rest-note">这一天不在 50 天计划内 💤</p>`;
    }
    const rec = state.records[dateStr];
    const done = DailyLogic.isCheckedIn(rec);
    const curType = done ? DailyLogic.typeOf(rec) : null;

    // 未打卡：两个大按钮二选一
    if (!done) {
      const btns = DAILY_TYPES.map((t) => `
        <button class="choice-btn" data-action="checkin" data-type="${t.id}">
          <span class="ce">${t.emoji}</span>
          <span class="cn">${t.name}打卡</span>
          <span class="chint">今天做了${t.name}？点这里</span>
        </button>`).join('');
      return `
        <div class="day-status">健身 / 学习，今天完成哪样？</div>
        <div class="choice-grid">${btns}</div>
        <p class="muted small choice-note">打卡成功即返 ¥200，每天只需完成其中一类。</p>
      `;
    }

    // 已打卡：展示当前类型 + 切换 / 取消 / 重播
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
  },
};
