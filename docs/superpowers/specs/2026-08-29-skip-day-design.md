# 每日打卡「跳过当天」设计(生理期等特殊原因)

日期:2026-08-29
状态:已获用户批准

## 背景与目标

当前「每日二选一打卡」是 50 个连续日历日的对赌:`startDate` 起固定映射,
第 i 天 = `startDate + i − 1`,过去的未打卡日即断签,之后金额全部损失。
生理期等特殊原因无法训练时,只能断签或虚假补卡。

目标:支持「跳过某天」——跳过日不返钱、不占 50 天名额,但不断签,
后续日程自动顺延;连续跳过受上限约束。

## 需求决策(已确认)

1. **金额**:跳过日不返 ¥200、不计入 50 天;50 天 = 50 次实际打卡,
   计划截止日随跳过次数顺延。
2. **连续上限**:最多连跳 6 天,第 7 天禁止;中间正常打卡一天即重新计数;
   总跳过次数不设上限。
3. **范围**:任意计划内未打卡日都可跳(过去漏卡日 / 今天 / 未来日);
   漏卡日补跳可救回断签(与补卡同机制)。
4. **覆盖与取消**:已跳过日仍可打卡(直接覆盖,照常返 ¥200、收回一天顺延);
   另有「取消跳过」单独撤回。

## 数据模型(方案 A:跳过作为一种记录类型)

- `DAILY_CONFIG` 新增 `maxConsecutiveSkips: 6`。
- 跳过记录与打卡记录同构:`records[date] = { type: 'skip', at: <ISO> }`。
- `DailyStore.skip(state, date)` 写入跳过(不可变更新);`checkin` 天然覆盖跳过;
  `cancelCheckin` 兼作取消跳过(删除该日记录)。
- 状态 shape 不变(`{ startDate, records }`),导入导出与旧 localStorage 数据零迁移。

## 日程推导(`buildSchedule`)

从 `startDate` 起逐日历日走一遍,维护「生效天数」计数
(已打卡 + 漏卡各占 1 个名额,**跳过不占名额**):

| 当日记录/状态 | 分类 | 说明 |
|---|---|---|
| fitness/study 记录 | done | 生效,序号 #N,计入 completed |
| skip 记录 | skipped | 🩡 标记,无 #N 序号,不占名额 |
| 已过去且无记录 | missed | 生效,序号 #N,占名额 → 断签点(日历 ✗) |
| 今天/未来、生效数 < 50 | pending | 生效,序号 #N,待打卡日 |
| 生效数已满 50 之后 | 计划外 | 同现有 rest 展示 |

序号 #N 归属所有「生效日」(done/missed/pending),与现行日历一致;
只有跳过日与计划外日期没有序号。

- `checkinIndexForDate` / `checkinDate` / `lastCheckinDate` / `computeStatus`
  改为消费 `buildSchedule` 的结果。
- **签名变更**:序号与日期的映射从此依赖跳过记录,上述三个日程函数的
  第一个参数从 `startDate` 改为 `state`(调用点与测试同步机械替换,断言不变)。
- 计划截止日 = `startDate + 50 + 已跳天数 − 1`,由推导自然得出。
- 连续跳过上限 `canSkip(state, date)`:从该日前一天起往前数日历上连续的
  skip 记录天数,已有 ≥ 6 天则第 7 次禁止;非 skip 日(打卡/漏卡/待打卡)即断链。

## 金额与断签(`computeStatus`)

- 跳过日:不计 completed、不返 ¥200、不断签;`remainingDays = 50 − completed`
  保持不变。
- 断签判定不变:第一个「过去的漏卡日」即断签;`returned` = 断签点前**实际打卡数**
  × 200;`lost = (50 − 该数) × 200`。
- 漏卡日补跳(或补卡)后断签自动恢复。
- 打卡覆盖跳过:日程收回一天顺延,当天照常返 ¥200。

## 交互设计

- **未打卡日弹窗**:健身/学习两个按钮下方加小号按钮「🩡 特殊原因跳过今天」,
  副文案「不断签 · 不返 ¥200 · 日程顺延 1 天」;点击 confirm 确认后生效。
- **已跳过日弹窗**:状态行「🩡 已跳过(MM-DD HH:mm)」+ 健身/学习按钮
  (覆盖跳过)+「取消跳过」按钮(confirm)。
- **日历**:跳过日格子加 `skipped` 样式与 🩡 标记(过去/今天/未来统一),无 #N 徽标。
- **弹窗标题**:跳过日显示 `{M月D日} · 跳过日`,副行「不断签 · 不返钱 · 顺延 1 天」。
- **统计卡**:有跳过时 hero 副行显示「已跳过 N 天 · 距离目标 M 天」
  (N 为计划内 skip 记录总数)。
- **超限反馈**:第 7 次连续跳过时 `alert('连续跳过不能超过 6 天,请先完成一次打卡')`,
  不生效(与现有 confirm/alert 风格一致)。
- 跳过不触发庆祝动画与金币声(`isCheckedIn` 不认 skip 类型)。

## 代码改动

| 文件 | 改动 |
|---|---|
| `daily-logic.js` | `DAILY_CONFIG.maxConsecutiveSkips = 6`;新增 `isSkipped(record)`;新增 `buildSchedule(state)` 逐日推导分类与生效序号;`checkinIndexForDate(state, date)` / `checkinDate(state, i)` / `lastCheckinDate(state)` 改为基于推导(签名 `startDate` → `state`);`computeStatus` 消费推导结果(跳过不计钱不断签,断签金额按实际打卡数);新增 `canSkip(state, date)` 连续上限校验 |
| `daily-store.js` | 新增 `skip(state, date)` 不可变写入 `{ type: 'skip', at }`;`checkin` / `cancelCheckin` 无需改动(覆盖/删除语义天然成立) |
| `daily-ui.js` | `renderCheckinBody`:未打卡日加跳过按钮,已跳过日展示状态 + 覆盖打卡 + 取消跳过;`renderCalendar`:skipped 格子 🩡;`renderStats`:hero 副行拼「已跳过 N 天」;`renderCheckinTitle` 跳过日标题适配 |
| `daily-app.js` | `handleCheckinAction` 新增 `skip-day` / `cancel-skip` 动作(confirm + `canSkip` 校验 + commit);其余无改动 |
| `styles.css` | 跳过按钮、已跳过状态、日历 `skipped` 格子样式 |

## 兼容性

- 旧 localStorage / 导入文件没有 skip 记录 → 推导结果与现行模型完全一致,无需迁移。
- `importJSON` 校验规则不变(records 仍是对象即可;skip 记录靠 `isSkipped`
  类型守卫识别,脏数据不炸)。

## 测试计划(`node --test`)

- `buildSchedule`:跳过后后续序号后移;计划截止日顺延;跳过日无序号不占名额;
  50 名额用尽后的日期为计划外;无跳过时与现行日程完全一致。
- `computeStatus`:跳过日不返钱不断签;断签金额按断签点前实际打卡数;
  漏卡日补跳恢复断签;打卡覆盖跳过收回顺延。
- `canSkip`:连跳 6 天允许、第 7 天禁止;中间打卡一天重置计数;
  日历上不连续的跳过不累计。
- `DailyStore`:`skip` 不可变;打卡覆盖跳过;取消跳过等同删除记录。
- UI 渲染:未打卡日跳过按钮;已跳过弹窗(状态 + 覆盖 + 取消);日历 🩡 格子;
  统计副行「已跳过 N 天」。
- 回归:无跳过场景下现有断言全部保持(仅日程函数调用点机械换签名)。

## 不做的事(YAGNI)

- 不做跳过原因备注、跳过日历总览报表。
- 不做总跳过次数上限(只限连续 6 天)。
- 不改健身计划(logic.js / store.js / ui.js / app.js)那套打卡体系。
