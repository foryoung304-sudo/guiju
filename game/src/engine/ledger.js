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

  // 机制单 `c152b37` 的闸门口径：累计经营净额 = Σ 每日 netOpsCents。升档/买设施/盘店走投资账，
  // 事件净走第 11 步的 NP，两笔都不进这一格——单上「升档花钱不算亏，不许误触」在代码里就是这一行只加 netOpsCents。
  state.NetOpsCents = (state.NetOpsCents || 0) + netOpsCents;

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
  // 销毁无票库存不改现金、只减库存资产，但它按附录 B :442 进事件账净额 → 第 11 步过账前的窗口里同样要补这一项
  const pendingCents = t.eventNetCents !== undefined ? 0
    : (t.netOpsCents || 0) + (t.eventCashMorning || 0) + (t.eventCashEvening || 0) - (t.eventAssetLoss || 0);
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
  // 首日回退式：公开基础销量 × 爬坡 × 情境 × 定价系数 × F ×（口碑代理项）×（预估份额 ÷ 基准）+ 可见熟客到访量 R_v
  // 回签审复 §一.2（实测问题 #3）：口碑代理项由 P÷100 改为与 3.14 第 7 步同式的 0.75 + P×0.005。
  // 原式在 P=20 时给 0.2，低于第 7 步口碑项在任何一天可能的下界 0.75，首日试算因此把需求压到真实的 1/4；
  // 用 P（而不是暗口碑 Rep）保持"试算只用玩家看得见的代理"这条红线不变
  const baseEst = state.BaseSales * rampNow(state) * scenario.trafficTotal
    * priceCoefFor(state, priceTierId, scenario) * state.F * (0.75 + state.P * 0.005)
    * (estShare === null ? 1 : estShare / COMPETITION.shareBase)
    + Math.round(state.R * 0.5);
  let estBowls;
  let lowConfidence = false;
  let floorApplied = false;
  let displayEstBowls;
  let soldOutLift = 1;

  if (yBowls > 0 && ySc && state.Share[0] > 0) {
    // 比值式：昨日售出 × 情境比 × 爬坡比 × 定价系数比 × F 比 × 份额比 × next_day_traffic_mult
    const ratioEst = yBowls * (scenario.trafficTotal / ySc.trafficTotal)
      * (rampNow(state) / state.YesterdayRamp)
      * (priceCoefFor(state, priceTierId, scenario) / state.PriceCoefYday)
      * (state.F / state.YesterdayF)
      * (estShare === null ? 1 : estShare / state.Share[0])
      * state.next_day_traffic_mult;
    estBowls = ratioEst;
    // 裁定（2026-11-09 Orange 案 1）：显示层地板＋灾难门。
    // ratioEst < 0.25 * baseEst 判定死锚生效，显示值抬到 0.6 * baseEst；门外显示值 = 比值式原值，无提示。
    // 标准 estBowls 保持纯比值不碰，供 sim、回归针、两带读，保证两带 diff 0。
    const disaster = ratioEst < 0.25 * baseEst;
    floorApplied = disaster;
    // 追加 5（补条 2026-11-11，Orange 签收时下达）：卖断日托底，与 sim.js:71 同构。
    // 昨日卖断时「昨日实卖」是被昨日篮子封顶的数，拿它当锚会自我复制成单调下坡（sim 的买货政策因此改用昨日 D0 托底）。
    // 显示层同构落法：锚抬到 max(昨日实卖, 昨日需求侧 D0)，再走上面那六项比值折算到今日 —— 即单上「昨日需求侧口径折算值」。
    // 只抬显示值：ratioEst / estBowls 逐字不动，两带读不到这一支。灾难门与托底同时命中时取两者较高的一支。
    soldOutLift = state.YesterdaySoldOut && (state.YesterdayD0 || 0) > yBowls
      ? state.YesterdayD0 / yBowls : 1;
    displayEstBowls = Math.max(disaster ? 0.6 * baseEst : ratioEst, ratioEst * soldOutLift);
  } else {
    lowConfidence = true;
    estBowls = baseEst;
    displayEstBowls = baseEst;
  }

  // 提振显示单（2026-11-13）：d0_buff 只进显示层，标准侧逐字不动；
  // 乘在地板/托底取舍之后，灾难门判定仍用未乘原值；只乘估算分量、不乘预定（与结算同构）
  const buffToday = state.d0_buff_mult || 1;
  const buffDelta = (yBowls > 0 && ySc && state.Share[0] > 0)
    ? buffToday / (state.YesterdayD0Buff || 1) : buffToday;
  displayEstBowls *= buffDelta;

  const supply = basketSupply(state, basket, scenario);
  // 附录 C + 3.12：备货可供碗数之外还要过出餐产能这道闸（斤/日 × 备菜连乘 × 小豆在场，折成碗数）
  const cap = capacityJin(state);
  const capBowls = Number.isFinite(cap) ? Math.floor(cap / scenario.avgJin) : Infinity;
  // 试吃转化单按正常订单进当日流水（正文 3.6 注），第 7 步并进需求，试算同口径抬一抬需求侧
  const convertBowls = tastingConvert(state.TastingCount);
  const perJin = PRICE_TIERS[priceTierId].perJin;
  const blended = blendedAvgWithBasket(state, basket);
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * scenario.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  const tastingN = state.TastingCount || 0;
  const perBowlCostYuan = scenario.avgJin * SOLID_CATS.reduce((s, c) => s + (omega[c] / Omega) * blended[c], 0)
    + scenario.T * blended.SP;
  const tastingCostCents = toCents(tastingN * TASTING.bowlSharePerPortion * perBowlCostYuan);
  const tastingIncomeCents = tastingN * TASTING.incomeCentsPerPortion;
  const tastingNetCents = tastingIncomeCents - tastingCostCents;
  const laborCents = laborCostCents(state);
  const plan = planPayment(state, basket);
  const remainingCredit = Math.max(0, state.CreditCap - state.DebtSupplier - plan.creditUsed);

  function evalMetrics(demand, sup = supply, demandMul = 1) {
    const capped = Math.min((demand + convertBowls) * demandMul, sup.bowls, capBowls);
    const bottleneck = capBowls < sup.bowls && capBowls <= demand ? 'cap' : sup.bottleneck;
    const priorityBowls = Math.min(capped, Math.round(state.R * 0.5) + state.event_reserve_bowls);
    const autoShare = capped > 0 ? Math.max(0, (capped - priorityBowls) / capped) : 0;
    const scaleMul = state.ScaleShowOn ? 1 + SCALE_DELTA_J_SHARE * autoShare : 1;
    const estRevenueCents = toCents(capped * scenario.avgJin * perJin * scaleMul);
    const estJin = capped * scenario.avgJin;
    let estCogs = 0;
    for (const c of SOLID_CATS) estCogs += (estJin * omega[c] / Omega) * blended[c] * 100;
    estCogs += capped * scenario.T * blended.SP * 100;
    estCogs += Math.round(capped) * PACKING[state.PackingTier] * 100;          // 与结算同口径：元/碗、取整碗数
    estCogs += Math.round(capped) * additiveOf(state).perBowl * 100;           // 正文 3.12：按售出碗数即时计费
    const estCogsCents = Math.round(estCogs);
    const estNetCents = estRevenueCents - estCogsCents - state.FixedCost - laborCents + tastingNetCents;
    return {
      capped,
      bottleneck,
      bottleneckBowls: bottleneck === 'cap' ? capBowls : sup.bottleneckBowls,
      estRevenueCents,
      estCogsCents,
      scaleMul,
      estNetCents,
    };
  }

  const standard = evalMetrics(estBowls);
  // 乙5（试玩缺陷整批 2026-11-10）：净额试算校准＋预定计入。三条都只落在显示层——
  // standard 与下面顶层返回逐字不动（案1 同一条护栏：sim 与两带读 estBowls / plan，不读 display）。
  // ① 预定碗数进当日需求：结算 ops.js:49 的 D_pre 吃 event_reserve_bowls 与熟客顺延 reg_reserved_bowls，
  //    原先试算只把 event_reserve_bowls 用在优先层切分上、没加进需求 ⇒ 背着单备货却看不见。
  // ② 拿盆将就次日汤底上限减半：结算 ops.js:57 乘在汤底那一格上限上，原先 basketSupply 没乘 ⇒ 试算多报一倍碗数。
  // ③ 隔夜报损：结算 ledger.js:35 的 netOpsCents 减 writeoff.cents，原先试算整项没有 ⇒ 净额虚高。
  const reserveBowls = state.event_reserve_bowls + state.reg_reserved_bowls;
  // 补条（guiju-playtest-fixbatch-addendum-20261110 §1-2，Orange 2026-11-10 晚定案）：采购前已知悉的事件乘数进试算显示。
  // 结算 ops.js:50 逐字是 `const D = D_pre * state.event_demand_mult;`——乘在**整个** D_pre 上（含预定与试吃转化），
  // 所以这里同位同层：evalMetrics 的 demandMul 吃它，display.estBowls 也吃它。标准侧恒传 1，estBowls 逐值不动。
  // 范围只到「玩家此刻看得见」的那一份：morning_pre 在第 2 步当场入账（day.js:70-74），采购前就公示了；
  // timing='morning' 的两条（evt_d_002 rectify 0.6 / evt_d_051 serve_first 1.15）在第 6 步才落地，采购后才抽到 ⇒ 不进。
  const eventMult = state.event_demand_mult;
  const displayDemand = displayEstBowls + reserveBowls;
  const displaySupply = basketSupply(state, basket, scenario, state.today.soupHalf ? 0.5 : 1);
  const disp = evalMetrics(displayDemand, displaySupply, eventMult);
  const estWriteoffCents = writeoffEstimate(state, basket, disp.capped, scenario, blended, omega, Omega);
  // 补条 §3 分解公示行要的各因子：与上面比值式那六项逐字同源（只读派生，不参与任何标准字段）。
  // 界面拿它翻人话、并在估算低于昨日时点名拉低项——引擎不出文案，只出数。
  const parts = {
    ratioForm: yBowls > 0 && !!ySc && state.Share[0] > 0,
    yBowls,
    traffic: ySc ? scenario.trafficTotal / ySc.trafficTotal : 1,
    ramp: state.YesterdayRamp ? rampNow(state) / state.YesterdayRamp : 1,
    price: state.PriceCoefYday ? priceCoefFor(state, priceTierId, scenario) / state.PriceCoefYday : 1,
    f: state.YesterdayF ? state.F / state.YesterdayF : 1,
    share: estShare === null ? 1 : (state.Share[0] > 0 ? estShare / state.Share[0] : 1),
    nextDay: state.next_day_traffic_mult,
    buff: buffDelta,
    // 文案修补单（2026-11-14）：buff 一格选词要看今值/昨值，不只 delta 符号；两枚只读派生，数值不参与任何标准字段
    buffToday,
    buffYday: (yBowls > 0 && ySc && state.Share[0] > 0) ? (state.YesterdayD0Buff || 1) : 1,
    event: eventMult,
    reserve: reserveBowls,
    floorApplied,
    soldOutLift,
    yD0: state.YesterdayD0 || 0,
  };
  const display = {
    estBowls: displayDemand * eventMult,
    supplyBowls: displaySupply.bowls,
    capped: disp.capped,
    lowConfidence: floorApplied ? false : lowConfidence,
    floorApplied,
    bottleneck: disp.bottleneck,
    bottleneckBowls: disp.bottleneckBowls,
    estRevenueCents: disp.estRevenueCents,
    estCogsCents: disp.estCogsCents,
    scaleMul: disp.scaleMul,
    convertBowls,
    laborCents,
    tastingNetCents,
    tastingIncomeCents,
    tastingCostCents,
    reserveBowls,
    eventMult,
    parts,
    soupHalf: !!state.today.soupHalf,
    estWriteoffCents,
    estNetCents: disp.estNetCents - estWriteoffCents,
    cashAfterCents: state.Cash - plan.cashUsed,
    creditRemainingCents: remainingCredit,
    plan,
  };

  return {
    estBowls, supplyBowls: supply.bowls, capped: standard.capped, lowConfidence, floorApplied,
    displayEstBowls, display,
    bottleneck: standard.bottleneck, bottleneckBowls: standard.bottleneckBowls,
    estRevenueCents: standard.estRevenueCents, estCogsCents: standard.estCogsCents, scaleMul: standard.scaleMul, convertBowls,
    laborCents, tastingNetCents, tastingIncomeCents, tastingCostCents,
    estNetCents: standard.estNetCents,
    cashAfterCents: state.Cash - plan.cashUsed, creditRemainingCents: remainingCredit,
    plan,
  };
}

function rampNow(state) {
  return { 3: 0.4, 2: 0.6, 1: 0.8 }[state.RampDays] ?? 1.0;
}

// 备货可供碗数：把本篮加进库存后，按第 7 步的品类拆分与汤底封顶模拟最多能出多少碗
// 预检应修⑥：同时报出「卡在哪个品类」——试算只给一个总数，新手看不出是汤底拖住了还是主料不够
function basketSupply(state, basket, scenario, soupMul = 1) {
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
  if (scenario.T > 0 && have.SP / scenario.T * soupMul < bowls) { bowls = have.SP / scenario.T * soupMul; bottleneck = 'SP'; }
  const n = Number.isFinite(bowls) && bowls > 0 ? Math.floor(bowls) : 0;
  return { bowls: n, bottleneck, bottleneckBowls: n };
}

// 乙5：隔夜报损的试算估计。结算那一支（settleWriteoff）按「收摊时柜里还剩的全损货 × 当日批次均价」逐笔取成本池，
// 试算时点还没卖、也还没选备菜档，所以只能估：剩货 = 本篮加库存 − 预计售出，全损货 = 汤底全部 + 非 keep 档的批次与篮子行，
// 报损量取两者的小值（剩货里最多有多少是当日全损的货），价用 blendedAvgWithBasket 那一枚 projected 当日均价。
// 洗切跳过那 +20% 不在这里估：备菜是第 4 步才选的，试算在第 3 步之前，界面另出一句提醒（差额逐项登记在回报里）。
function writeoffEstimate(state, basket, capped, sc, blended, omega, Omega) {
  const have = { SP: state.StockSoup };
  const due = { SP: state.StockSoup };
  for (const c of SOLID_CATS) { have[c] = state.StockSolid[c]; due[c] = 0; }
  for (const b of state.Batches) {
    if (b.cat !== 'SP' && !SKU_BY_ID[b.sku].keep) due[b.cat] += b.qty;
  }
  for (const l of basket) {
    const sku = SKU_BY_ID[l.sku];
    have[sku.cat] += l.qty;
    if (sku.cat === 'SP') due.SP += l.qty;
    else if (!sku.keep) due[sku.cat] += l.qty;
  }
  const estJin = capped * sc.avgJin;
  let cents = 0;
  for (const c of SOLID_CATS) {
    const left = Math.max(0, have[c] - estJin * omega[c] / Omega);
    cents += Math.min(left, due[c]) * blended[c] * 100;
  }
  cents += Math.min(Math.max(0, have.SP - capped * sc.T), due.SP) * blended.SP * 100;
  return Math.round(cents);
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
