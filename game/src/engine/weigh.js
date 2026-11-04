import { CUSTOMERS, handOrderWeight } from '../data/customers.js';
import { SOLID_CATS, CONFIG } from '../data/constants.js';
import { roundJin } from './state.js';

// 附录 H.1：第 7e 步用 regular 子流抽 3 位（同日不重复；固定摊位档起 4 位），常客线 A–D 走基权 ×（1 + P÷200）
export function handOrderCount(state) {
  return state.Tier >= CONFIG.handOrdersTierFull ? CONFIG.handOrdersPerDayFull : CONFIG.handOrdersPerDay;
}

export function drawHandOrders(state, rng) {
  const picked = rng.pickWeightedWithoutRepeats(
    CUSTOMERS, c => handOrderWeight(c, state.P), handOrderCount(state), 'regular');

  return picked.map(c => ({
    customerId: c.id, name: c.name, role: c.role, bowls: c.bowls,
    lines: SOLID_CATS.filter(cat => c.order[cat]).map(cat => ({ cat, grams: c.order[cat] })),
  }));
}

// 正文 3.2 / 附录 D.5：1 斤 = 500 克，一碗标准 500 克。
// ⚠ 附录 H.2 伪码写 actual_g ÷ 1000，与 3.2、D.5、"模板合计 < 500 克 × 碗数"三处冲突，
//   本案按 ÷500 施工，已登记为待店主回签的勘误。
export const GRAMS_PER_JIN = 500;

// ── 真机修复单 f39f692（Orange 20261104）：称重屏的可选项由柜里的真货决定 ──────────
// 只读两把尺：不写引擎任何字段、不参与扣库存（第 7 步 takeStock 仍是全日唯一扣货口），
// 数值轨一个字没动——它们只回答界面上「这一样能不能按、最多能按出多少克」。
// 柜里这一样有多少克（斤 × 500，与 settleWeighing 同一枚 GRAMS_PER_JIN）
export function stockGrams(state, cat) {
  const jin = cat === 'SP' ? state.StockSoup : state.StockSolid[cat];
  return Math.max(0, Math.round((Number(jin) || 0) * GRAMS_PER_JIN));
}

// 这一单这一样最多称得出多少克：柜量先减掉别的单已经称走的部分（一柜货、几单分）。
// 同一单自己已称的克数不减——封顶的意思是「秤面上的数不许越过柜里有的数」
export function gramsCeilingFor(state, gramsBy, cust, cat) {
  const used = Object.entries(gramsBy || {})
    .filter(([id]) => id !== cust)
    .reduce((sum, [, grams]) => sum + Number(grams?.[cat] || 0), 0);
  return Math.max(0, stockGrams(state, cat) - used);
}

// 附录 H.2：逐品类实际斤数累加进 J 与流水；任一品 ratio < 0.90 记这单一笔短斤
export function settleWeighing(order, gramsByCat) {
  const lines = [];
  let jin = 0;
  let short = false;
  let full = true;
  for (const line of order.lines) {
    const grams = Math.max(0, gramsByCat[line.cat] ?? 0);
    const ratio = grams / line.grams;
    if (ratio < 0.90) short = true;
    if (ratio < 0.98) full = false;
    const qty = roundJin(grams / GRAMS_PER_JIN);
    lines.push({ cat: line.cat, grams, standardGrams: line.grams, ratio: roundJin(ratio), qty });
    jin += qty;
  }
  return {
    customerId: order.customerId, name: order.name, bowls: order.bowls,
    lines, jin: roundJin(jin), short, full: full && !short,
  };
}
