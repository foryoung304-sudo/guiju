import { SOLID_CATS, CAT, CONFIG, PACKING, PRICE_TIERS, PREP_STATIONS, TASTING, START_CASH_CENTS, WASH_SKIP_WRITEOFF_MUL,
  SCALE_DELTA_J_SHARE, COMPETITION } from '../data/constants.js';
import { SKU_BY_ID } from '../data/skus.js';
import { toCents, roundJin, takeFromCostPool } from './state.js';
import { recomputeStock, planPayment, takeStock } from './market.js';
import { priceCoefFor } from './ops.js';
import { additiveOf, capacityJin, laborCostCents, tastingConvert, washSkipped } from './production.js';
import { competitionOn, previewShare } from './competition.js';

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
  // 正文 3.12：掺量按第 7h 步未取整碗数计费（界面展示才取整），零销量日 bowls = 0 → 成本自然为 0
  const additiveCents = toCents(t.bowls * additiveOf(state).perBowl);
  const cogsCents = ingredientCents + t.packingCents + additiveCents;
  const grossCents = t.revenueCents - cogsCents;
  // 试吃账先于报损：样品是当天倒出去的，走到报损这一步柜里的汤底已经按当日全损清空了
  const tasting = settleTasting(state);
  const writeoff = settleWriteoff(state);
  // 附录 F.7 `LaborCost` 行：人工在第 8 步落账；"小豆请假"当日按不在场计 0
  state.LaborCost = laborCostCents(state);
  const netOpsCents = grossCents - writeoff.cents - state.FixedCost - state.LaborCost + tasting.netCents;

  Object.assign(t, {
    ingCostByCat: ing, ingredientCents, additiveCents, cogsCents, grossCents,
    writeoffCents: writeoff.cents, writeoffDetail: writeoff.detail,
    tastingNetCents: tasting.netCents, netOpsCents,
  });

  // 现金滚动（采购现金已在第 3 步扣，此处不重复扣）。附录 B 现金流清单：+ 流水 + 试吃份钱收入
  // − 包装 − 添加剂 − 固定支出 − 人工 − 自动还款；样品成本是库存消耗，不走现金，桥靠库存资产项自动平衡
  state.Cash += t.revenueCents + tasting.incomeCents - t.packingCents - additiveCents
    - state.FixedCost - state.LaborCost;
  const repay = Math.min(state.DebtSupplier, Math.max(state.Cash, 0));
  state.Cash -= repay;
  state.DebtSupplier -= repay;
  t.repaidCents = repay;
  return t;
}

// 正文 3.6 注 / 附录 D.5 试吃运营账：份数 n 在第 5 步定版（0 或 3–6，不掷随机）；
// 样品成本 = n × 当日单碗食材成本 × 0.3，按批次成本从库存扣（固体按 ω/Ω 拆、汤底按 T 折份）；
// 收入 = n × 1 元；转化 = floor(n ÷ 3)，每转化 1 人次日 R +1（第 1 步进存量）。
// 转化单已在第 7c 步并入需求、按正常订单进流水与 COGS，这里只记份钱，不重复计账。
export function settleTasting(state) {
  const t = state.today;
  const n = state.TastingCount || 0;
  const out = { portions: n, incomeCents: n * TASTING.incomeCentsPerPortion, costCents: 0, netCents: 0,
    convert: tastingConvert(n) };
  const sc = t.scenario;
  if (n > 0 && sc) {
    const avg = t.avgCostBefore;
    const omega = {};
    for (const c of SOLID_CATS) omega[c] = CAT[c].share * (sc.catCoef?.[c] ?? 1);
    const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
    const sampleBowls = n * TASTING.bowlSharePerPortion;
    for (const c of SOLID_CATS) {
      const want = roundJin(sampleBowls * sc.avgJin * omega[c] / Omega);
      if (want <= 0) continue;
      takeStock(state, c, want, t.consumed);
      out.costCents += takeFromCostPool(state, c, want * avg[c] * 100);
    }
    const soupWant = roundJin(sampleBowls * sc.T);
    if (soupWant > 0) {
      takeStock(state, 'SP', soupWant, t.consumed);
      out.costCents += takeFromCostPool(state, 'SP', soupWant * avg.SP * 100);
    }
  }
  out.netCents = out.incomeCents - out.costCents;
  state.tasting_pending_R = out.convert;
  Object.assign(t, {
    tastingPortions: out.portions, tastingIncomeCents: out.incomeCents, tastingCostCents: out.costCents,
    tastingNetCents: out.netCents, tastingConvert: out.convert,
  });
  return out;
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
  // 正文 3.12 / 附录 G.2：跳过洗切 → 青菜 / 豆制品菌菇 / 粉面 隔夜报损额外 +20%（相对值）。
  // 青菜当日本就全损，这 20% 只能落在上一步之后还留在柜里的货上——按剩余斤数两成损、账实一致。
  if (CONFIG.prep && washSkipped(state)) {
    for (const c of PREP_STATIONS[0].cats) {
      const rest = c === 'SP' ? state.StockSoup : state.StockSolid[c];
      const extra = roundJin(rest * (WASH_SKIP_WRITEOFF_MUL - 1));
      if (extra <= 0) continue;
      const cents = takeFromCostPool(state, c, extra * avg[c] * 100);
      loss.cents += cents;
      loss.detail.push({ cat: c, qty: extra, cents, skipWash: true });
      state.Batches = state.Batches.reduce((keep, b) => {
        if (b.cat !== c) { keep.push(b); return keep; }
        b.qty = roundJin(b.qty - b.qty * (WASH_SKIP_WRITEOFF_MUL - 1));
        if (b.qty > 0.0005) keep.push(b);
        return keep;
      }, []);
    }
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
  // 附录 C `:451` 的份额两项：主式吃（今日预估竞争份额 ÷ 昨日实际份额）、回退式吃（今日预估份额 ÷ 基准 0.25）。
  // 样段期无竞争（正文 3.14 第 7b `:265`「样段期无竞争，S ≡ 1」）时它俩恒为 1，M1 因此没有落点；竞争层在场就必须回来。
  // 关掉整层一律取 1（不是取算出的比值），已签发的 M1 带不引入浮点漂移。
  const estShare = competitionOn(state) ? previewShare(state, PRICE_TIERS[priceTierId].perJin) : null;
  let estBowls;
  let lowConfidence = false;
  if (yBowls > 0 && ySc && state.Share[0] > 0) {
    // 比值式：昨日售出 × 情境比 × 爬坡比 × 定价系数比 × F 比 × 份额比 × next_day_traffic_mult
    estBowls = yBowls * (scenario.trafficTotal / ySc.trafficTotal)
      * (rampNow(state) / state.YesterdayRamp)
      * (priceCoefFor(state, priceTierId, scenario) / state.PriceCoefYday)
      * (state.F / state.YesterdayF)
      * (estShare === null ? 1 : estShare / state.Share[0])
      * state.next_day_traffic_mult;
  } else {
    // 首日回退式：公开基础销量 × 爬坡 × 情境 × 定价系数 × F ×（口碑代理项）×（预估份额 ÷ 基准）+ 可见熟客到访量 R_v
    // 回签审复 §一.2（实测问题 #3）：口碑代理项由 P÷100 改为与 3.14 第 7 步同式的 0.75 + P×0.005。
    // 原式在 P=20 时给 0.2，低于第 7 步口碑项在任何一天可能的下界 0.75，首日试算因此把需求压到真实的 1/4；
    // 用 P（而不是暗口碑 Rep）保持"试算只用玩家看得见的代理"这条红线不变
    lowConfidence = true;
    estBowls = state.BaseSales * rampNow(state) * scenario.trafficTotal
      * priceCoefFor(state, priceTierId, scenario) * state.F * (0.75 + state.P * 0.005)
      * (estShare === null ? 1 : estShare / COMPETITION.shareBase)
      + Math.round(state.R * 0.5);
  }

  const supply = basketSupply(state, basket, scenario);
  // 附录 C + 3.12：备货可供碗数之外还要过出餐产能这道闸（斤/日 × 备菜连乘 × 小豆在场，折成碗数）
  const cap = capacityJin(state);
  const capBowls = Number.isFinite(cap) ? Math.floor(cap / scenario.avgJin) : Infinity;
  // 试吃转化单按正常订单进当日流水（正文 3.6 注），第 7 步并进需求，试算同口径抬一抬需求侧
  const convertBowls = tastingConvert(state.TastingCount);
  const capped = Math.min(estBowls + convertBowls, supply.bowls, capBowls);
  const bottleneck = capBowls < supply.bowls && capBowls <= estBowls ? 'cap' : supply.bottleneck;
  const perJin = PRICE_TIERS[priceTierId].perJin;
  // 附录 C 显多秤项：预计流水 ×(1 + 0.08 × 自动层占比)。第 3 步还没抽亲手单，玩家看得见的优先层
  // 只有熟客到访量与事件预订，其余一律记自动层 → 装上秤时这是一略偏高的上界（亲手单层通常不到 5% 碗数）
  const priorityBowls = Math.min(capped, Math.round(state.R * 0.5) + state.event_reserve_bowls);
  const autoShare = capped > 0 ? Math.max(0, (capped - priorityBowls) / capped) : 0;
  const scaleMul = state.ScaleShowOn ? 1 + SCALE_DELTA_J_SHARE * autoShare : 1;
  const estRevenueCents = toCents(capped * scenario.avgJin * perJin * scaleMul);

  // 预计 COGS：按品类拆分后的预计售出量 ×（现有库存 + 本篮）混合均价 + 打包 + 掺量
  const blended = blendedAvgWithBasket(state, basket);
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * scenario.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  const estJin = capped * scenario.avgJin;
  let estCogs = 0;
  for (const c of SOLID_CATS) estCogs += (estJin * omega[c] / Omega) * blended[c] * 100;
  estCogs += capped * scenario.T * blended.SP * 100;
  estCogs += Math.round(capped) * PACKING[state.PackingTier] * 100;          // 与结算同口径：元/碗、取整碗数
  estCogs += Math.round(capped) * additiveOf(state).perBowl * 100;           // 正文 3.12：按售出碗数即时计费

  // 附录 C :453：预计经营净额 + 计划试吃账净额。第 3 步早于第 5 步定版，计划值取上一次定版留下的份数
  //（没挂试吃角或未定版过 = 0）；单碗食材成本用本篮加进库存后的混合均价，与结算的批次成本同源
  const tastingN = state.TastingCount || 0;
  const perBowlCostYuan = scenario.avgJin * SOLID_CATS.reduce((s, c) => s + (omega[c] / Omega) * blended[c], 0)
    + scenario.T * blended.SP;
  const tastingCostCents = toCents(tastingN * TASTING.bowlSharePerPortion * perBowlCostYuan);
  const tastingIncomeCents = tastingN * TASTING.incomeCentsPerPortion;
  const tastingNetCents = tastingIncomeCents - tastingCostCents;
  const laborCents = laborCostCents(state);

  const plan = planPayment(state, basket);
  const remainingCredit = Math.max(0, state.CreditCap - state.DebtSupplier - plan.creditUsed);
  return {
    estBowls, supplyBowls: supply.bowls, capped, lowConfidence,
    bottleneck, bottleneckBowls: bottleneck === 'cap' ? capBowls : supply.bottleneckBowls,
    estRevenueCents, estCogsCents: Math.round(estCogs), scaleMul, convertBowls,
    laborCents, tastingNetCents, tastingIncomeCents, tastingCostCents,
    estNetCents: estRevenueCents - Math.round(estCogs) - state.FixedCost - laborCents + tastingNetCents,
    cashAfterCents: state.Cash - plan.cashUsed, creditRemainingCents: remainingCredit,
    plan,
  };
}

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
