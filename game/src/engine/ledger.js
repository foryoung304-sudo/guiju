import { SOLID_CATS, CAT, PRICE_TIERS, START_CASH_CENTS } from '../data/constants.js';
import { SKU_BY_ID } from '../data/skus.js';
import { toCents, roundJin, takeFromCostPool } from './state.js';
import { recomputeStock, planPayment } from './market.js';
import { priceCoefFor } from './ops.js';

const ALL_STOCK_CATS = SOLID_CATS.concat(['SP']);

export function inventoryValueCents(state) {
  return ALL_STOCK_CATS.reduce((s, c) => s + (state.CostPool[c] || 0), 0);
}

// 正文 3.14 第 8 步：收摊账目（附录 B 口径）
export function settleDay(state) {
  const t = state.today;
  const avg = t.avgCostBefore;

  // COGS = Σ(售出斤数 × 当日品类加权均价) + 耗用份数 × 每份均价 + 打包 + 添加剂
  const ing = {};
  for (const c of SOLID_CATS) ing[c] = takeFromCostPool(state, c, t.soldJin[c] * avg[c] * 100);
  ing.SP = takeFromCostPool(state, 'SP', t.soupUsed * avg.SP * 100);
  const ingredientCents = ALL_STOCK_CATS.reduce((s, c) => s + ing[c], 0);
  const additiveCents = state.AdditiveTier === 'none' ? 0
    : toCents(t.bowls * (state.AdditiveTier === 'more' ? 0.2 : 0.1));
  const cogsCents = ingredientCents + t.packingCents + additiveCents;
  const grossCents = t.revenueCents - cogsCents;
  const writeoff = settleWriteoff(state);

  const tastingNetCents = 0; // 试吃一元角 M2 起，样段恒 0
  const netOpsCents = grossCents - writeoff.cents - state.FixedCost - state.LaborCost + tastingNetCents;

  Object.assign(t, {
    ingCostByCat: ing, ingredientCents, additiveCents, cogsCents, grossCents,
    writeoffCents: writeoff.cents, writeoffDetail: writeoff.detail,
    tastingNetCents, netOpsCents,
  });

  // 现金滚动（采购现金已在第 3 步扣，此处不重复扣）
  state.Cash += t.revenueCents + tastingNetCents - t.packingCents - additiveCents
    - state.FixedCost - state.LaborCost;
  const repay = Math.min(state.DebtSupplier, Math.max(state.Cash, 0));
  state.Cash -= repay;
  state.DebtSupplier -= repay;
  t.repaidCents = repay;
  return t;
}

// 隔夜报损（附录 D.1）：可留次日的只有正经/平价档粉面与豆制品；其余含全部汤底、档 3 / 档 6 当日全损。
// 结算时点：当日第 8 步记入当日报损行（否则最后一天的损失会滑到不存在的次日）。
export function settleWriteoff(state) {
  const loss = { cents: 0, detail: [] };
  const avg = state.today.avgCostBefore;
  for (const c of SOLID_CATS) {
    const isExpired = b => !SKU_BY_ID[b.sku].keep;
    const qty = roundJin(state.Batches.filter(b => b.cat === c && isExpired(b)).reduce((s, b) => s + b.qty, 0));
    if (qty <= 0) continue;
    const cents = takeFromCostPool(state, c, qty * avg[c] * 100);
    loss.cents += cents;
    loss.detail.push({ cat: c, qty, cents });
    state.Batches = state.Batches.filter(b => !(b.cat === c && isExpired(b)));
  }
  const soupQty = roundJin(state.StockSoup);
  if (soupQty > 0) {
    const cents = takeFromCostPool(state, 'SP', soupQty * avg.SP * 100);
    loss.cents += cents;
    loss.detail.push({ cat: 'SP', qty: soupQty, cents });
    state.Batches = state.Batches.filter(b => b.cat !== 'SP');
  }
  recomputeStock(state);
  return loss;
}

// 附录 B 现金桥（对账公式）：现金 = 初始现金 + NP − 净投资 + 全部欠款 + 广告奖励 − 库存资产值
// 正文 3.14 把「现金变动」和「NP 过账」拆在两个时点：第 6/8 步就扣钱，第 11 步才把当日
// 经营净额与事件账记进 NP。这段窗口里桥的右端必须补上当日「已发生、未过账」的净额，
// 否则玩家在结算屏点开进货单会看到一个等于当日净额的假桥差（预检 seed 36832 的 −75 就是固定支出）。
export function bridgeCheck(state) {
  const t = state.today || {};
  const pendingCents = t.eventNetCents !== undefined ? 0
    : (t.netOpsCents || 0) + (t.eventCashMorning || 0) + (t.eventCashEvening || 0);
  const rhs = START_CASH_CENTS + state.NP + pendingCents - state.NetInvestSpent + state.DebtSupplier + state.DebtAd
    + state.AdBonusTotal - inventoryValueCents(state);
  return { ok: state.Cash === rhs, cash: state.Cash, bridge: rhs, diff: state.Cash - rhs, pendingCents };
}

// 附录 C 采购试算：只用公开信息（红线：不许把暗口碑的当日修正加进试算）
export function forecastBasket(state, basket, priceTierId, scenario) {
  const yBowls = state.YesterdaySoldBowls;
  const ySc = state.YesterdayScenario;
  let estBowls;
  let lowConfidence = false;
  if (yBowls > 0 && ySc) {
    // 比值式：昨日售出 × 情境比 × 爬坡比 × 定价系数比 × F 比 × next_day_traffic_mult（份额比样段恒 1）
    estBowls = yBowls * (scenario.trafficTotal / ySc.trafficTotal)
      * (rampNow(state) / state.YesterdayRamp)
      * (priceCoefFor(state, priceTierId, scenario) / state.PriceCoefYday)
      * (state.F / state.YesterdayF)
      * state.next_day_traffic_mult;
  } else {
    // 首日回退式：公开基础销量 × 爬坡 × 情境 × 定价系数 × F ×（口碑代理项）+ 可见熟客到访量 R_v
    // 回签审复 §一.2（实测问题 #3）：口碑代理项由 P÷100 改为与 3.14 第 7 步同式的 0.75 + P×0.005。
    // 原式在 P=20 时给 0.2，低于第 7 步口碑项在任何一天可能的下界 0.75，首日试算因此把需求压到真实的 1/4；
    // 用 P（而不是暗口碑 Rep）保持"试算只用玩家看得见的代理"这条红线不变
    lowConfidence = true;
    estBowls = state.BaseSales * rampNow(state) * scenario.trafficTotal
      * priceCoefFor(state, priceTierId, scenario) * state.F * (0.75 + state.P * 0.005)
      + Math.round(state.R * 0.5);
  }

  const supply = basketSupply(state, basket, scenario);
  const capped = Math.min(estBowls, supply.bowls);
  const perJin = PRICE_TIERS[priceTierId].perJin;
  const estRevenueCents = toCents(capped * scenario.avgJin * perJin);

  // 预计 COGS：按品类拆分后的预计售出量 ×（现有库存 + 本篮）混合均价 + 打包
  const blended = blendedAvgWithBasket(state, basket);
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * scenario.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  const estJin = capped * scenario.avgJin;
  let estCogs = 0;
  for (const c of SOLID_CATS) estCogs += (estJin * omega[c] / Omega) * blended[c] * 100;
  estCogs += capped * scenario.T * blended.SP * 100;
  estCogs += Math.round(capped) * PACKING_UNIT[state.PackingTier] * 100;   // 与结算同口径：元/碗、取整碗数

  const plan = planPayment(state, basket);
  const remainingCredit = Math.max(0, state.CreditCap - state.DebtSupplier - plan.creditUsed);
  return {
    estBowls, supplyBowls: supply.bowls, capped, lowConfidence,
    bottleneck: supply.bottleneck, bottleneckBowls: supply.bottleneckBowls,
    estRevenueCents, estCogsCents: Math.round(estCogs),
    estNetCents: estRevenueCents - Math.round(estCogs) - state.FixedCost,
    cashAfterCents: state.Cash - plan.cashUsed, creditRemainingCents: remainingCredit,
    plan,
  };
}

const PACKING_UNIT = { bag: 0, normal: 0.3, thermal: 0.6 };

function rampNow(state) {
  return { 3: 0.4, 2: 0.6, 1: 0.8 }[state.RampDays] ?? 1.0;
}

// 备货可供碗数：把本篮加进库存后，按第 7 步的品类拆分与汤底封顶模拟最多能出多少碗
// 预检应修⑥：同时报出「卡在哪个品类」——试算只给一个总数，新手看不出是汤底拖住了还是主料不够
function basketSupply(state, basket, scenario) {
  const have = { SP: state.StockSoup };
  for (const c of SOLID_CATS) have[c] = state.StockSolid[c];
  for (const l of basket) {
    const sku = SKU_BY_ID[l.sku];
    have[sku.cat] = (have[sku.cat] || 0) + l.qty;
  }
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * scenario.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  let bowls = Infinity;
  let bottleneck = null;
  for (const c of SOLID_CATS) {
    const perBowl = scenario.avgJin * omega[c] / Omega;
    if (perBowl > 0 && have[c] / perBowl < bowls) { bowls = have[c] / perBowl; bottleneck = c; }
  }
  if (scenario.T > 0 && have.SP / scenario.T < bowls) { bowls = have.SP / scenario.T; bottleneck = 'SP'; }
  const n = Number.isFinite(bowls) && bowls > 0 ? Math.floor(bowls) : 0;
  return { bowls: n, bottleneck, bottleneckBowls: n };
}

function blendedAvgWithBasket(state, basket) {
  const qty = {};
  const val = {};
  for (const c of ALL_STOCK_CATS) {
    qty[c] = c === 'SP' ? state.StockSoup : state.StockSolid[c];
    val[c] = state.CostPool[c] || 0;
  }
  for (const l of basket) {
    const sku = SKU_BY_ID[l.sku];
    qty[sku.cat] += l.qty;
    val[sku.cat] += l.cost;
  }
  const out = {};
  for (const c of ALL_STOCK_CATS) out[c] = qty[c] > 0 ? val[c] / qty[c] / 100 : 0;
  return out;
}
