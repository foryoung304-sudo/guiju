import { EVENTS, DRAW_GATE } from '../data/events.js';
import { evalCondition } from './dsl.js';
import { toCents } from './state.js';
import { destroyTicketless, judgeBigInspection, judgeRoutineInspection } from './inspection.js';

const TIMING_STREAM = { morning_pre: 'event_morning_pre', morning: 'event_morning', evening: 'event_evening' };
const ONCE = 999;

function inCooldown(state, ev) {
  const until = state.Cooldowns[ev.id];
  return until !== undefined && state.Day < until;
}

// 正文 §八 M1 行「明确不做（全部 M2 接入）：…特殊事件、完整事件池」→ 复现已签发 M1 带时只放行 ship='M1' 的四条。
// 关掉整层不改变任何数值，只把 M2 新增行挡在抽取池外（与 laborOn / competitionOn 同一条理由）。
function inScope(state, ev) {
  return state.eventScope !== 'm1' || ev.ship === 'M1';
}

function eligible(state, ev, timing) {
  return ev.timing === timing
    && inScope(state, ev)
    && evalCondition(ev.condition, state)
    && !inCooldown(state, ev);
}

// weight_shift（正文 5.3「事件结算后立即生效；持续到目标事件被触发为止，或满 7 天自动过期」）：
// 同目标多份取最大值不叠加，故写入时比大小；读取时过期即当作不存在
export function weightOf(state, ev) {
  const shift = state.WeightShifts[ev.id];
  if (shift && state.Day <= shift.expireDay) return shift.weight;
  return ev.weight;
}

export function shiftWeight(state, target, weight, days = 7) {
  const cur = state.WeightShifts[target];
  if (cur && state.Day <= cur.expireDay) {
    state.WeightShifts[target] = { weight: Math.max(cur.weight, weight), expireDay: Math.max(cur.expireDay, state.Day + days) };
  } else {
    state.WeightShifts[target] = { weight, expireDay: state.Day + days };
  }
}

// 第 11 步清理：过期未用的 shift 一律删除（附录 F.6「7 天或目标触发过期」）
export function expireShifts(state) {
  for (const [id, s] of Object.entries(state.WeightShifts)) {
    if (state.Day > s.expireDay) delete state.WeightShifts[id];
  }
}

// must_fire（附录 A 第 14 字段 / E.3）：窗口内且本局尚未触发过，强制选中、跳过概率门与权重。
// 时机不限：附录 A 的定义写在 Schema 里而不是某一步的伪码里，回签审复 §五 的「好事保底」用的就是第 10 步晚间事件
function forcedEvent(state, timing) {
  return EVENTS.find(ev => ev.must_fire && eligible(state, ev, timing)
    && !state.EventHistory.includes(ev.id)
    && state.Day >= ev.must_fire.from && state.Day <= ev.must_fire.to) || null;
}

// 正文 3.14 第 2 / 6 / 10 步：先过滤（条件 + 冷却）再过概率门，再按 weight 种子抽，至多 1 条。
// 同日排序（正文 5.3 末「DSL 补全定义」）：特殊事件先于日常事件；硬触发不走概率门也不走权重。
// 关掉竞争层时特殊池恒空 → 只走一次 daily 门与一次 pickWeighted，抽取次数与 M1 完全同轨（已签发带不许漂）。
export function drawEvent(state, timing, rng) {
  const forced = forcedEvent(state, timing);
  if (forced) return forced;
  const stream = TIMING_STREAM[timing];
  const ready = pool => EVENTS.filter(ev => ev.pool === pool && eligible(state, ev, timing));

  const specials = ready('special');
  const hard = specials.find(ev => ev.hard);
  if (hard) return hard;
  const soft = specials.filter(ev => !ev.hard && weightOf(state, ev) > 0);
  if (soft.length && rng.chance(DRAW_GATE.special, stream)) {
    const picked = rng.pickWeighted(soft.map(ev => ({ ev, w: weightOf(state, ev) })), x => x.w, stream);
    if (picked) return picked.ev;
  }

  const pool = ready('daily');
  if (!pool.length) return null;
  if (!rng.chance(DRAW_GATE.daily, stream)) return null;
  const picked = rng.pickWeighted(pool.map(ev => ({ ev, w: weightOf(state, ev) })), x => x.w, stream);
  return picked ? picked.ev : null;
}

// 声明式 op 入账。现金一律即时扣/收并记入当日事件账对应时点（晨间 → 第 6 步、晚间 → 第 11 步），
// 第 11 步只按事件账净额累加 NP，不重复改现金。
export function applyOps(state, ops, slot) {
  for (const op of ops || []) {
    if (op.cash !== undefined) {
      state.Cash += op.cash;
      state.today[slot] += op.cash;
    }
    if (op.nextDayTrafficMult !== undefined) state.next_day_traffic_mult = op.nextDayTrafficMult;
    if (op.eventDemandMult !== undefined) state.event_demand_mult = op.eventDemandMult;
    if (op.d0Buff !== undefined) {
      state.d0_buff_mult *= op.d0Buff.mult;
      state.d0_buff_days = Math.max(state.d0_buff_days, op.d0Buff.days);
    }
    if (op.priceMultToday) {
      for (const c of op.priceMultToday.cats) state.today.priceMultToday[c] = op.priceMultToday.mult;
    }
    if (op.deposit !== undefined) {
      // E.5：定金 = round(15 × 均碗斤数 × 当日每斤价 × 20%)
      const cents = toCents(op.deposit.bowls * state.AvgJinPerBowl * state.PricePerJin * op.deposit.rate);
      state.Cash += cents;
      state.today[slot] += cents;
    }
    if (op.reserveBowls !== undefined) {
      state.event_reserve_bowls = op.reserveBowls;
      state.pendingReserve = { bowls: op.reserveBowls };
    }
    // E.9 价格战：写三日倒计时；改价式本身在竞争层按 PricewarDays 每日结算（附录 G.3）
    if (op.pricewarDays !== undefined) state.PricewarDays = op.pricewarDays;
    // E.8 回流 <30 档：熟客存量不扣（正文 3.4 保底承诺优先），改为冻结 7 日不增长
    if (op.rFrozenDays !== undefined) state.R_frozen_days = op.rFrozenDays;
    // E.7/E.8/E.10 的「结算页留言位多一条（① 类强制信号）」：固定文案，不走第 12 步的随机选材
    if (op.forcedComment) state.today.forcedComments.push(op.forcedComment);
    // E.4「结算页多一行“今日已立账”」一类的明账文字（正文 3.7：疼的数字要在结算里列明）
    if (op.dayNote) { if (!state.today.notes.includes(op.dayNote)) state.today.notes.push(op.dayNote); }
    // E.6 销毁决策：按成本记非现金资产损失并扣库存，现金一分不动（正文 3.14 第 11 步）
    if (op.destroyUnticketed) destroyTicketless(state);
    // E.9 涨薪留住：此后每日工钱 +15 元（勘误批 b 项），持续到本局结束
    if (op.wageRaise) state.WageRaiseCents = (state.WageRaiseCents || 0) + op.wageRaise;
    // E.9 让他走：缺席 14 日，且带一条「请假」没有的产能惩罚 ×0.90（成因记在 PoachedAway 上）
    if (op.xiaodouAbsentDays !== undefined) {
      state.XiaodouAbsentDays = op.xiaodouAbsentDays;
      if (op.poached) state.PoachedAway = true;
    }
  }
}

// 分支可用性（正文 :169「分支可用性写死」的两类前置）：
// · requires = 硬前置（E.9「签合同」须已购 fac_contract）——引擎侧也拒绝，选了等于没选；
// · gate:'afford' = 现金不足时置灰（E.2 罚款 150 / E.9 涨薪 1800）。这条按正文只写在界面那一侧，
//   无头模拟的代选不按它改道（否则已签发的 M1 带会因「模拟线被迫走另一分支」而整体漂移），差异已登记回报。
export function isActionAvailable(state, action) {
  return !action?.requires || evalCondition(action.requires, state);
}

export function isActionAffordable(state, action) {
  if (action?.gate !== 'afford') return true;
  const owed = (action.open || []).reduce((s, o) => s + (o.cash && o.cash < 0 ? -o.cash : 0), 0);
  return state.Cash >= owed;
}

// 第 10 步（或第 6 步）玩家选择落地：明账 + 暗线 + 历史 / 冷却 / weight_shift
export function resolveChoice(state, ev, actionId) {
  const picked = (ev.actions || []).find(a => a.id === actionId) || null;
  const action = picked && isActionAvailable(state, picked) ? picked : null;
  const slot = ev.timing === 'evening' ? 'eventCashEvening' : 'eventCashMorning';
  // 玩家不做选择的事件（E.8「按 Rep 自动分版」）走 auto_branch：条件式命中第一条即该档
  const branch = !action && Array.isArray(ev.auto_branch) ? ev.auto_branch.find(b => evalCondition(b.cond, state)) || null : null;
  const set = action || branch;
  applyOps(state, set ? set.open : ev.open, slot);
  const hidden = (set ? set.hidden : ev.effect_hidden || []).filter(h => !h.when);
  for (const h of hidden) applyHidden(state, h);
  // E.6 / E.9 的公式判定挂在明账之后：流程写死「通知 → 玩家销毁决策 → 公式判定」，销毁先进账才能进销毁比例
  const judgment = ev.scoreCheck === 'big' ? judgeBigInspection(state)
    : ev.scoreCheck === 'routine' ? judgeRoutineInspection(state) : null;
  state.EventHistory.push(ev.id);
  delete state.WeightShifts[ev.id];                       // 5.3：shift 持续到目标事件被触发为止
  state.Cooldowns[ev.id] = state.Day + (action?.cooldown ?? ev.cooldown ?? ONCE);
  const shift = action?.weightShift ?? ev.weightShift;
  if (shift) shiftWeight(state, shift.target, shift.weight, shift.days ?? 7);
  return { event: ev, action, branch, judgment };
}

export function applyHidden(state, h) {
  if (h.Rep) state.Rep = Math.max(0, Math.min(100, state.Rep + h.Rep));
  if (h.C) { state.C = Math.max(0, state.C + h.C); state.H += h.C; }
  if (h.H) state.H += h.H;
  if (h.Risk) {
    state.Risk = Math.max(0, Math.min(100, state.Risk + h.Risk));
    // 裁定 9a959bd §二：执法清算穿得过保护池（豁免只挡每日 −2），顺序 = 先扣可抵扣池、不足再扣保护池。
    // 下面这一行即该顺序的等价闭式：可抵扣池够扣时 RiskShort 原样留着，不够时差额落到保护池上。
    state.RiskShort = Math.min(state.RiskShort, state.Risk);
  }
  if (h.R) state.R = Math.max(0, state.R + h.R);
  if (h.L) state.L = Math.min(10, state.L + h.L);
}

// E.5 次日结算：预订 15 碗已并入当日 D_pre，实际成交碗数 ≥ 15 记全额交付（Rep +1），否则部分/未交付（Rep −1）
export function resolvePendingReserve(state) {
  const pending = state.pendingReserve;
  if (!pending) return null;
  state.pendingReserve = null;
  const delivered = Math.floor(state.today.bowls || 0) >= pending.bowls;
  const delta = delivered ? 1 : -1;
  state.Rep = Math.max(0, Math.min(100, state.Rep + delta));
  state.today.reserveDelivered = delivered;
  state.today.reservePartial = !delivered;
  return { delivered, Rep: delta };
}
