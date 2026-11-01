import { CAT, SOLID_CATS, PACKING, PACKING_SPILL, SCALE_DELTA_J_SHARE } from '../data/constants.js';
import { toCents, roundJin } from './state.js';
import { stockAvgCost, takeStock, rampCoef } from './market.js';
import { capacityJin, tastingConvert } from './production.js';
import { competitionOn, sharesAndS } from './competition.js';
import { PRICE_TIERS } from '../data/constants.js';

// 正文 3.5 定价档系数（招牌档受 Rep 与考试周修正）
export function priceCoefFor(state, tierId = state.PriceTier, scenario = state.today.scenario) {
  const t = PRICE_TIERS[tierId];
  if (t.id !== 'signature') return t.coef;
  let c = state.Rep >= 50 ? t.coefRep50 : t.coef;
  if (scenario && scenario.examWeek) c *= t.examMult;
  return c;
}

// 正文 3.14 第 7 步：唯一主公式。样段期 S ≡ 1（无竞争分流）；备菜/调味/人工/产能截断 M2 起逐项接线。
export function runBusiness(state, handResults, rng) {
  const sc = state.today.scenario;
  const t = state.today;
  // 3.12 出餐产能（斤/日）× 备菜三项连乘 × 小豆在场（合同 ×1.15 / 在场 ×1.10）；未开截断时为 Infinity
  const capJin = capacityJin(state);

  // 7a 竞争前需求 D0
  const ramp = rampCoef(state);
  const D0 = state.BaseSales * ramp * sc.trafficTotal * priceCoefFor(state)
    * (0.75 + state.Rep * 0.005) * state.F * state.next_day_traffic_mult * state.d0_buff_mult;
  state.next_day_traffic_mult = 1.0;
  if (state.d0_buff_days > 0) {
    state.d0_buff_days -= 1;
    if (state.d0_buff_days <= 0) { state.d0_buff_days = 0; state.d0_buff_mult = 1.0; }
  }

  // 7b 竞争系数 S（正文 3.14：四摊吸引力 A_i = P×G×排队惯性×分流，S = 本摊份额 ÷ 0.25 钳 [0.6,1.4]）
  // 样段与已签发的 M1 带走 competitionOn=false 这条路：S ≡ 1、不抽 rival 子流、不写 Share/惯性
  const comp = competitionOn(state) ? sharesAndS(state) : null;
  const S = comp ? comp.S : 1;
  t.S = S;
  t.share = comp ? comp.share : null;

  // 7c 需求合成（碗）：熟客到访量 R_v 与昨日顺延的明日预订合并成当日熟客优先需求，
  // 合计不超过熟客存量 R（3.14 第 7g 步 / 附录 F.4 reg_reserved_bowls），防积压滚大
  state.R_v = Math.round(state.R * 0.5);
  const carriedReserved = state.reg_reserved_bowls;
  const N_R_want = Math.min(state.R, state.R_v + carriedReserved);
  // 正文 3.6 注：试吃转化单「作为正常订单计入当日营业流水与 COGS」→ 并进需求走自动层，
  // 与散客一样吃库存、汤底与产能；份钱本身在第 8 步的试吃账里，不在这里重复计流水
  const convertBowls = tastingConvert(state.TastingCount);
  const D_pre = D0 * S + N_R_want + state.event_reserve_bowls + convertBowls;
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

  // ② 熟客层（3.14 第 7g 步截断：先保亲手全额 → 熟客超出产能的部分顺延为明日预订，不成交、不记售罄惩罚）
  const N_R_stock = Math.min(N_R_want, bowlBudget);
  const capLeftAfterHand = Math.max(0, capJin - handJin);
  const N_R = Math.min(N_R_stock, Math.floor(capLeftAfterHand / sc.avgJin));
  const deferredBowls = N_R_stock - N_R;
  bowlBudget -= N_R;
  const capLeftAfterRegular = Math.max(0, capLeftAfterHand - N_R * sc.avgJin);
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

  // ③ 自动层（只缩这一层：各品类按同一比例缩到剩余产能，库存按缩放后的斤数扣）
  const N_auto = Math.min(N_auto_want, bowlBudget, Math.floor(capLeftAfterRegular / sc.avgJin));
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

  // 7g 顺延账（附录 F.6：连两日未满足 → R −1/人、清零）：昨日带进来的预订今天还是没喂到，
  // 先按人流失那一批，没流失完的继续挂成明日预订
  if (deferredBowls > 0) {
    const lost = Math.min(state.R, carriedReserved, deferredBowls);
    if (lost > 0) {
      state.R = Math.max(0, state.R - lost);
      t.regLost = lost;
    }
    state.reg_reserved_bowls = deferredBowls - lost;
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

  // 7h 销量与流水：实际出菜斤数 J = 优先层 + 自动层（单轮溢出与自动层同轨，附录 G.2 把溢出写在 ③ 之后）；
  // 计费斤数 = 优先层 + 自动层计费斤数，装显多秤时自动层 ×1.08（正文 3.14 第 7h / 附录 D.3），
  // 差额 ΔJ 单列：计流水不计 COGS（没真给货），暗线代价在第 9 步按 ΔJ 折算
  const autoJin = roundJin(autoSold + overflowSold);
  const J_solid = roundJin(handJin + regularSold + autoJin);
  const bowls = roundJin(J_solid / sc.avgJin);
  const soupTaken = takeStock(state, 'SP', Math.min(state.StockSoup, bowls * sc.T), consumed);
  const deltaJ = state.ScaleShowOn ? roundJin(autoJin * SCALE_DELTA_J_SHARE) : 0;
  const J_bill = roundJin(J_solid + deltaJ);

  t.rampCoef = ramp;
  t.D0 = D0; t.D = D; t.D_eff = D_eff; t.S = S; t.W = roundJin(W);
  t.wants = Wcat;
  t.layerBowls = { hand: N_hand, regular: N_R, auto: N_auto };
  t.capJin = Number.isFinite(capJin) ? roundJin(capJin) : null;
  t.deferredBowls = deferredBowls;
  t.soldJin = Object.fromEntries(SOLID_CATS.map(c => [c, roundJin(soldByCat[c])]));
  t.soldJinHand = handJin;
  t.soupUsed = soupTaken;
  t.J = J_solid;
  t.J_bill = J_bill;
  t.autoJin = autoJin;
  t.deltaJ = deltaJ;
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
