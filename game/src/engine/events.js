import { EVENTS, DRAW_GATE } from '../data/events.js';
import { evalCondition } from './dsl.js';
import { toCents } from './state.js';

const TIMING_STREAM = { morning_pre: 'event_morning_pre', morning: 'event_morning', evening: 'event_evening' };
const ONCE = 999;

function inCooldown(state, ev) {
  const until = state.Cooldowns[ev.id];
  return until !== undefined && state.Day < until;
}

function eligible(state, ev, timing) {
  return ev.timing === timing
    && evalCondition(ev.condition, state)
    && !inCooldown(state, ev);
}

// must_fire（附录 A 第 14 字段 / E.3）：窗口内且本局尚未触发过，强制选中、跳过概率门与权重。
// 时机不限：附录 A 的定义写在 Schema 里而不是某一步的伪码里，回签审复 §五 的「好事保底」用的就是第 10 步晚间事件
function forcedEvent(state, timing) {
  return EVENTS.find(ev => ev.must_fire && eligible(state, ev, timing)
    && !state.EventHistory.includes(ev.id)
    && state.Day >= ev.must_fire.from && state.Day <= ev.must_fire.to) || null;
}

// 正文 3.14 第 2 / 6 / 10 步：先过滤（条件 + 冷却）再过概率门，再按 weight 种子抽，至多 1 条
export function drawEvent(state, timing, rng) {
  const forced = forcedEvent(state, timing);
  if (forced) return forced;
  const pool = EVENTS.filter(ev => eligible(state, ev, timing));
  if (!pool.length) return null;
  const gate = pool[0].pool === 'special' ? DRAW_GATE.special : DRAW_GATE.daily;
  if (!rng.chance(gate, TIMING_STREAM[timing])) return null;
  const shifted = pool.map(ev => ({ ev, w: state.WeightShifts[ev.id]?.weight ?? ev.weight }));
  const picked = rng.pickWeighted(shifted, x => x.w, TIMING_STREAM[timing]);
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
  }
}

// 第 10 步（或第 6 步）玩家选择落地：明账 + 暗线 + 历史 / 冷却
export function resolveChoice(state, ev, actionId) {
  const action = (ev.actions || []).find(a => a.id === actionId) || null;
  const slot = ev.timing === 'evening' ? 'eventCashEvening' : 'eventCashMorning';
  applyOps(state, action ? action.open : ev.open, slot);
  const hidden = (action?.hidden || ev.effect_hidden || []).filter(h => !h.when);
  for (const h of hidden) applyHidden(state, h);
  state.EventHistory.push(ev.id);
  state.Cooldowns[ev.id] = state.Day + (action?.cooldown ?? ev.cooldown ?? ONCE);
  return { event: ev, action };
}

export function applyHidden(state, h) {
  if (h.Rep) state.Rep = Math.max(0, Math.min(100, state.Rep + h.Rep));
  if (h.C) { state.C = Math.max(0, state.C + h.C); state.H += h.C; }
  if (h.H) state.H += h.H;
  if (h.Risk) state.Risk = Math.max(0, Math.min(100, state.Risk + h.Risk));
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
