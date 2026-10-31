import { CUSTOMERS, handOrderWeight } from '../data/customers.js';
import { SOLID_CATS, CONFIG } from '../data/constants.js';
import { roundJin } from './state.js';

// 附录 H.1：第 7e 步用 regular 子流抽 2 位（同日不重复），常客线 A–D 走基权 ×（1 + P÷200）
export function drawHandOrders(state, rng) {
  const picked = rng.pickWeightedWithoutRepeats(
    CUSTOMERS, c => handOrderWeight(c, state.P), CONFIG.handOrdersPerDay, 'regular');
  return picked.map(c => ({
    customerId: c.id, name: c.name, role: c.role, bowls: c.bowls,
    lines: SOLID_CATS.filter(cat => c.order[cat]).map(cat => ({ cat, grams: c.order[cat] })),
  }));
}

// 正文 3.2 / 附录 D.5：1 斤 = 500 克，一碗标准 500 克。
// ⚠ 附录 H.2 伪码写 actual_g ÷ 1000，与 3.2、D.5、"模板合计 < 500 克 × 碗数"三处冲突，
//   本案按 ÷500 施工，已登记为待店主回签的勘误。
export const GRAMS_PER_JIN = 500;

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
