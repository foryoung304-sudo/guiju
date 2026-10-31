import { CAT, SOLID_CATS, PACKING, PACKING_SPILL } from '../data/constants.js';
import { toCents, roundJin } from './state.js';
import { stockAvgCost, takeStock, rampCoef } from './market.js';
import { PRICE_TIERS } from '../data/constants.js';

// 正文 3.5 定价档系数（招牌档受 Rep 与考试周修正）
export function priceCoefFor(state, tierId = state.PriceTier, scenario = state.today.scenario) {
  const t = PRICE_TIERS[tierId];
  if (t.id !== 'signature') return t.coef;
  let c = state.Rep >= 50 ? t.coefRep50 : t.coef;
  if (scenario && scenario.examWeek) c *= t.examMult;
  return c;
}

// 正文 3.14 第 7 步：唯一主公式。样段期 S ≡ 1（无竞争分流），无备菜/调味/人工/产能截断。
export function runBusiness(state, handResults, rng) {
  const sc = state.today.scenario;
  const t = state.today;

  // 7a 竞争前需求 D0
  const ramp = rampCoef(state);
  const D0 = state.BaseSales * ramp * sc.trafficTotal * priceCoefFor(state)
    * (0.75 + state.Rep * 0.005) * state.F * state.next_day_traffic_mult * state.d0_buff_mult;
  state.next_day_traffic_mult = 1.0;
  if (state.d0_buff_days > 0) {
    state.d0_buff_days -= 1;
    if (state.d0_buff_days <= 0) { state.d0_buff_days = 0; state.d0_buff_mult = 1.0; }
  }

  // 7b 样段期无同行分流
  const S = 1;

  // 7c 需求合成（碗）
  state.R_v = Math.round(state.R * 0.5);
  const D_pre = D0 * S + state.R_v + state.reg_reserved_bowls + state.event_reserve_bowls;
  const D = D_pre * state.event_demand_mult;
  state.event_reserve_bowls = 0;
  state.reg_reserved_bowls = 0;

  // 7c-2 汤底封顶（耗汤份数 = 情境系数 T）：全日可售碗数（含亲手单）都吃这个上限
  const soupCapBowls = state.StockSoup / sc.T;
  const D_eff = Math.min(D, soupCapBowls);
  if (D_eff < D) t.soupSoldOut = true;
  const bowlCap = Math.max(0, Math.round(D_eff));
  state.event_demand_mult = 1.0;

  // 7d 需求折斤与品类拆分
  const W = D_eff * sc.avgJin;
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * sc.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  const Wcat = Object.fromEntries(SOLID_CATS.map(c => [c, roundJin(W * omega[c] / Omega)]));

  // 7e 三层拆分：先定各层碗数（亲手单优先）→ 折斤 → 按 ω/Ω 拆品类 → 逐层扣库存
  const avgCostBefore = Object.fromEntries(SOLID_CATS.concat(['SP']).map(c => [c, stockAvgCost(state, c)]));
  const N_R_want = state.R_v;
  const N_hand_want = handResults.reduce((s, o) => s + o.bowls, 0);
  const N_auto_want = Math.max(0, bowlCap - N_hand_want - N_R_want);

  const consumed = [];
  const soldByCat = Object.fromEntries(SOLID_CATS.map(c => [c, 0]));
  let bowlBudget = bowlCap;

  // ① 亲手层：逐单扣实际过称斤数；库存不够就按可供斤数成交、记分量嘀咕，不顺移不挪用（3.11 / H.2）
  let handJin = 0;
  let N_hand = 0;
  for (const order of handResults) {
    if (order.bowls > bowlBudget) { t.handRefused = (t.handRefused || 0) + 1; markSellout(t, 'SP'); continue; }
    let taken = 0;
    for (const line of order.lines) {
      if (line.qty <= 0) continue;
      const got = takeStock(state, line.cat, line.qty, consumed);
      taken = roundJin(taken + got);
      soldByCat[line.cat] = roundJin(soldByCat[line.cat] + got);
      if (got < line.qty - 0.0005) t.portionGrudge = true;
    }
    handJin = roundJin(handJin + taken);
    order.jinServed = taken;
    bowlBudget -= order.bowls;
    N_hand += order.bowls;
  }

  // ② 熟客层
  const N_R = Math.min(N_R_want, bowlBudget);
  bowlBudget -= N_R;
  let regularSold = 0;
  const regularShort = {};
  for (const c of SOLID_CATS) {
    const want = (N_R * sc.avgJin * omega[c]) / Omega;
    const got = takeStock(state, c, want, consumed);
    regularSold = roundJin(regularSold + got);
    regularShort[c] = roundJin(want - got);
    soldByCat[c] = roundJin(soldByCat[c] + got);
    if (got < want - 0.0005) markSellout(t, c);
  }

  // ③ 自动层
  const N_auto = Math.min(N_auto_want, bowlBudget);
  let autoSold = 0;
  const autoShort = {};
  for (const c of SOLID_CATS) {
    const want = (N_auto * sc.avgJin * omega[c]) / Omega;
    const got = takeStock(state, c, want, consumed);
    autoSold = roundJin(autoSold + got);
    autoShort[c] = roundJin(want - got);
    soldByCat[c] = roundJin(soldByCat[c] + got);
    if (got < want - 0.0005) markSellout(t, c);
  }

  // 7f 单轮溢出：短货斤数 ×30% 按 ω 比例流向有余货的品类，每品类不超过剩余库存
  const unmet = roundJin(SOLID_CATS.reduce((s, c) => s + regularShort[c] + autoShort[c], 0));
  const overflowPool = unmet * 0.30;
  const receivers = SOLID_CATS.filter(c => state.StockSolid[c] > 0);
  const recvOmega = receivers.reduce((s, c) => s + omega[c], 0);
  let overflowSold = 0;
  if (recvOmega > 0) {
    for (const c of receivers) {
      const want = roundJin(Math.min((overflowPool * omega[c]) / recvOmega, state.StockSolid[c]));
      if (want <= 0) continue;
      overflowSold = roundJin(overflowSold + takeStock(state, c, want, consumed));
    }
  }

  // 7h 销量与流水（产能截断 M2 起，见 §八 范围限定）
  const J_solid = roundJin(handJin + regularSold + autoSold + overflowSold);
  const bowls = roundJin(J_solid / sc.avgJin);
  const soupTaken = takeStock(state, 'SP', Math.min(state.StockSoup, bowls * sc.T), consumed);
  const J_bill = J_solid;

  t.rampCoef = ramp;
  t.D0 = D0; t.D = D; t.D_eff = D_eff; t.S = S; t.W = roundJin(W);
  t.wants = Wcat;
  t.layerBowls = { hand: N_hand, regular: N_R, auto: N_auto };
  t.soldJin = Object.fromEntries(SOLID_CATS.map(c => [c, roundJin(soldByCat[c])]));
  t.soldJinHand = handJin;
  t.soupUsed = soupTaken;
  t.J = J_solid;
  t.J_bill = J_bill;
  t.bowls = bowls;
  t.revenueCents = toCents(J_bill * state.PricePerJin);
  // 定版开关②：餐盒 0.30 元/碗（不是每斤）。t.bowls 是斤数换算出来的连续量，
  // 收银台按实际递出去的碗数一只一只算，故先取整再乘单价；结算行同用这个数。
  t.packingCents = toCents(Math.round(bowls) * PACKING[state.PackingTier]);
  t.consumed = consumed;
  t.avgCostBefore = avgCostBefore;

  // 正文 3.11：外带碗数逐碗用 packing 子流抽漏洒；暗线代价（每碗 Rep −0.5、单日至多 −1.5）在第 9 步结算
  const takeawayBowls = Math.floor(bowls * sc.takeawayShare);
  t.takeawayBowls = takeawayBowls;
  t.spillBowls = 0;
  for (let i = 0; i < takeawayBowls; i++) if (rng.chance(PACKING_SPILL[state.PackingTier], 'packing')) t.spillBowls += 1;

  return t;
}

function markSellout(t, c) {
  if (!t.soldOutCats.includes(c)) t.soldOutCats.push(c);
}
