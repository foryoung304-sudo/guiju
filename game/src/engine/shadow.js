import { CAT, CONFIG } from '../data/constants.js';
import { roundJin } from './state.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 正文 3.4：备菜档位对当日批次品质的修正（认真 +10 / 将就 0 / 跳过 −8），M2 起生效
function prepAdjust(state, cat) {
  if (!CONFIG.prep) return 0;
  const group = cat === 'VG' || cat === 'BF' || cat === 'NS' ? 0 : cat === 'SP' ? 2 : 1;
  const v = state.Prep[group];
  return v === '认真' ? 10 : v === '跳过' ? -8 : 0;
}

// 当日综合品质 Q = clamp(Q_原料 + Q_调味 + Q_添加剂, 0, 100)；零销量走 3.4 例外记 50
export function computeQ(state) {
  let num = 0;
  let den = 0;
  for (const x of state.today.consumed) {
    const w = CAT[x.batch.cat].qWeight;
    num += x.qty * (x.batch.q + prepAdjust(state, x.batch.cat)) * w;
    den += x.qty * w;
  }
  if (roundJin(state.today.J) <= 0 || den <= 0) return { Q: 50, Qraw: null, zeroSales: true };
  const Qraw = num / den;
  const Qtaste = CONFIG.flavor ? clamp((state.M_base - 0.70) * 20, -6, 6) : 0;
  const Qadd = state.AdditiveTier === 'more' ? -8 : state.AdditiveTier === 'less' ? -4 : 0;
  return { Q: clamp(Qraw + Qtaste + Qadd, 0, 100), Qraw, zeroSales: false };
}

// 每洒一碗当日 Rep −0.5，单日至多 −1.5（正文 3.11 v4.9 判定口径）
export function spillRepPenalty(bowls) {
  return Math.min(1.5, bowls * 0.5);
}

// 票据覆盖率 = 近 30 天带票食材采购额 ÷ 近 30 天食材采购额（SP1 自制两边都不进，见 D.1 / 回签点 5）
export function receiptRate(state) {
  const total = state.ReceiptWindow.reduce((s, x) => s + x.total, 0);
  if (total <= 0) return 1.0;
  return state.ReceiptWindow.reduce((s, x) => s + x.withTicket, 0) / total;
}

// 正文 3.14 第 9 步暗线结算（M1 口径：无添加剂项、无显多秤 ΔJ）
export function applyShadow(state, { shortOrders, spillBowls }) {
  const t = state.today;
  const { Q, zeroSales } = computeQ(state);
  state.Q = Q;
  t.Q = Q;
  t.QZeroSales = zeroSales;

  const addC = zeroSales ? 0 : (state.AdditiveTier === 'more' ? 0.6 : state.AdditiveTier === 'less' ? 0.3 : 0);
  const addRisk = zeroSales ? 0 : (state.AdditiveTier === 'more' ? 3 : state.AdditiveTier === 'less' ? 2 : 0);
  const spill = spillRepPenalty(spillBowls);

  // 黑心增量只由 Q 驱动；零销量时跳过 Q 驱动项，事件与实际操作增量照常
  const 黑心 = zeroSales ? 0 : Math.max(0, (60 - Q) / 20);
  const inc = 黑心 + addC + shortOrders * 0.2;
  state.C = clamp(state.C + inc, 0, 100);
  state.H += inc;
  if (!zeroSales && Q >= 85) state.C = Math.max(0, state.C - 0.5);
  // §〇.1 第 11 条（签复 b48ec8e §三，店主签「豁免」）：分量作假产生的 Risk 增量不受 Rep ≥60 的 −2/日 抵扣，
  // 其余来源照常吃抵扣。Risk 因此分两池记：RiskShort = 分量作假池（亲手短斤，显多秤接线后 ΔJ×0.3 同进本池，
  // 裁定 9a959bd §三）；非分量来源为可抵扣池。
  // 若不分池（先加短斤再整体 −2），天天短斤 +1.5 与 −2 相加为净 −0.5/日，Risk 恒在低位，
  // 正本 3.4「约 27 天到 40 入池 / 约 47 天到 70 硬触发」这条时间线就守不住。
  const shortInc = shortOrders * 0.5;
  let 可抵 = Math.max(0, state.Risk - state.RiskShort) + 黑心 * 5 + addRisk;
  if (!zeroSales && state.Rep >= 60) 可抵 = Math.max(0, 可抵 - 2);
  state.RiskShort = clamp(state.RiskShort + shortInc, 0, 100);
  state.Risk = clamp(state.RiskShort + 可抵, 0, 100);

  state.Rep = clamp(state.Rep + (zeroSales ? 0 : (Q - 50) * 0.06) - spill, 0, 100);

  // 熟客增长：Q ≥ 70 且不在冻结期 → +3，上限 = 基础销量 × 0.6
  if (Q >= 70 && state.R_frozen_days === 0) {
    state.R = Math.min(Math.floor(state.BaseSales * 0.6), state.R + 3);
  }

  if (state.Risk >= 100) state.risk_100_pending = true;
  state.Wmax = Math.max(state.Wmax, roundJin(t.J));
  state.ReceiptRate = receiptRate(state);

  const cap = Math.max(1, state.BaseSales * 0.6);
  const target = clamp(Math.round(state.Rep * 0.9 + 10 * Math.min(state.R, cap) / cap), 0, 100);
  state.P = Math.round(0.7 * state.P + 0.3 * target);
  return { Q, zeroSales };
}
