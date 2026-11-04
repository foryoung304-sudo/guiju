import { CONFIG, PRICE_TIERS, ENDING, SOLID_CATS, PACKING, ADDITIVE, TASTING, BUYOUT_PRICE_CENTS, RETIRE_NP_CENTS, HEARTBURN_WMAX_JIN, QUIT_VARIANT_NP_CENTS, QUIT_VARIANT_REP } from '../data/constants.js';
import { blankToday, roundJin } from './state.js';
import { makeRng } from './rng.js';
import { buildBasket, commitPurchase, planPayment, ownsTool, cheapUnlockCheck } from './market.js';
import { forecastBasket, settleDay, bridgeCheck } from './ledger.js';
import { runBusiness, priceCoefFor } from './ops.js';
import { applyShadow } from './shadow.js';
import { drawEvent, resolveChoice, resolvePendingReserve, expireShifts } from './events.js';
import { pushRecent } from './recent.js';
import { drawHandOrders, settleWeighing } from './weigh.js';
import { REGULAR_SLOTS } from '../data/customers.js';
import { judgeBlanch, signalTier } from './blanch.js';
import { buildComments } from './comments.js';
import { scenarioOf, forecastLabel } from '../data/scenario.js';
import { additiveUnlocked, computeMBase, prepBudget, prepFits, prepGridUsed } from './production.js';
import { morningRivals, priceWarReprice, tallySuppression } from './competition.js';

// 正文 3.14 第 1 步（晨间结转）+ 明日情境
export function beginDay(state) {
  const rng = makeRng(state);
  if (state.dayStarted) {
    state.Day += 1;
    state.SemesterDay = ((state.Day - 1) % 28) + 1;
  }
  state.dayStarted = true;
  state.risk_100_pending = false;
  // 附录 E evt_s_poach「让他走 → 14 日后回来」/「小豆请假一天」：缺席按第 1 步递减，减到 0 即恢复在场
  if (state.XiaodouAbsentDays > 0) {
    state.XiaodouAbsentDays -= 1;
    // 计数器归零那天人在场，被挖走的 ×0.90 产能惩罚同一天解除（E.9 只写「14 日后回来」，没写第二天的惩罚余量）
    if (state.XiaodouAbsentDays <= 0) state.PoachedAway = false;
  }
  // 正文 3.6 注：试吃转化「每转化 1 人次日 R +1」——当日第 8 步记下，第二天第 1 步进存量
  if (state.tasting_pending_R > 0) {
    state.R += state.tasting_pending_R;
    state.tasting_pending_R = 0;
  }
  state.PriceIndex = Math.round((state.PriceIndex * (state.Day >= 100 ? 1.003 : 1.0)) * 1000) / 1000;
  state.today = blankToday();
  // spec-event-pool-6 的三条「昨日写下、今日成真」在第 1 步结转（与 next_day_traffic_mult 同一时点）：
  // §二.3 明天没粉 / §二.5 拿盆将就都用完即清，§一.1 山寨摊按「存续 N 日」计数、递减写法照抄 PricewarDays
  // （morningRivals 里先写 today 标志再递减 → 置 N 就生效 N 个营业日，两条同轨）。
  if (state.pendingDelist) { state.today.delist = state.pendingDelist; state.pendingDelist = null; }
  if (state.pendingSoupHalf) { state.today.soupHalf = true; state.pendingSoupHalf = false; }
  state.today.copycatActive = state.CopycatDays > 0;
  if (state.CopycatDays > 0) state.CopycatDays -= 1;
  // 正文 3.14 第 1 步「公布明日预报及同行信息」+ 附录 G.3：王老板出事抽取、跟价式、价格战倒计时、第 100 天起的加压。
  // 挂在 blankToday 之后：竞争层要往 today 写「今日是否开打」，写在结转之前会被当日空白覆盖掉
  morningRivals(state, rng);
  state.today.scenario = scenarioOf(state.weatherCycle[state.Day - 1] || 'sunny', state.SemesterDay);
  state.today.priceMods = state.today.scenario.priceMods;
  state.Weather = state.today.scenario.weather.id;
  state.CalendarPhase = state.today.scenario.calendar.id;
  state.ScenarioTotal = state.today.scenario.trafficTotal;
  state.CatCoef = { ...state.today.scenario.catCoef };
  state.T = state.today.scenario.T;
  state.AvgJinPerBowl = state.today.scenario.avgJin;
  const next = scenarioOf(state.weatherCycle[state.Day % 28] || 'sunny', (state.Day % 28) + 1);
  state.today.forecast = forecastLabel(next);
  state.today.forecastScenario = next;
  // 库存核账基准：当日期初库存（第 8 步之后、第 3 步采购之前）
  for (const c of SOLID_CATS) state.today.stockAtOpen[c] = state.StockSolid[c];
  state.today.stockAtOpen.SP = state.StockSoup;
  // 票据窗口：当日槽位在第 3 步落笔前清空（隔夜报损已在上一日第 8 步结算，此处不重复）
  state.ReceiptWindow[(state.Day - 1) % 30] = { withTicket: 0, total: 0 };
  return rng;
}

// 第 2 步：晨间情报（采购前公布，must_fire 优先）
export function morningPreEvent(state, rng) {
  const ev = drawEvent(state, 'morning_pre', rng);
  if (ev) resolveChoice(state, ev, null);
  return ev;
}

// 第 3 步：组篮 → 试算 → 提交（现金 + 赊购不足则整篮不可提交）
export function previewBasket(state, picks, priceTierId = state.PriceTier) {
  const basket = buildBasket(state, picks);
  return { basket, forecast: forecastBasket(state, basket, priceTierId, state.today.scenario) };
}

export function submitBasket(state, picks, rng = makeRng(state)) {
  const basket = buildBasket(state, picks);
  const plan = planPayment(state, basket);
  if (!plan.submittable) return { ok: false, plan };
  commitPurchase(state, plan, rng);
  state.today.committed = true;
  return { ok: true, plan };
}

// 第 4 步：备菜分配（M2 起；附录 F.5「工时预算第 4 步校验，超预算不许提交」）
// prep = 三站档名数组（洗切/腌渍/吊汤，值域 认真/将就/跳过），wakeEarly 占 WAKE_EARLY_GRID 格
export function commitPrep(state, prep, wakeEarly = state.WakeEarly) {
  const used = prepGridUsed(state, prep, wakeEarly);
  const budget = prepBudget(state);
  if (!prepFits(state, prep, wakeEarly)) return { ok: false, used, budget };
  state.Prep = [...prep];
  state.WakeEarly = !!wakeEarly;
  state.WorkGridUsed = used;
  state.today.prepped = true;
  return { ok: true, used, budget };
}

// 第 5 步：营业前定版（正文 3.14 六个开关一次性锁定：①定价 ②打包 ③调味 ④掺量 ⑤试吃份数 ⑥显多秤）
export function lockTradingDay(state, opts = {}) {
  const priceTierId = opts.priceTier || state.PriceTier;
  const packingTier = opts.packingTier || state.PackingTier;
  const flavor = opts.flavor || state.Flavor;
  const askedAdditive = opts.additiveTier === undefined ? state.AdditiveTier : opts.additiveTier;
  if (PACKING[packingTier] === undefined) return { ok: false, reason: 'pack' };   // 塑料袋 0 元也是合法档，别按真值筛掉
  if (ADDITIVE[askedAdditive] === undefined) return { ok: false, reason: 'add' };
  // 调料摊未解锁（摊位 < 二手餐车）时开关根本不出现，引擎按「不掺」收
  const additiveTier = askedAdditive !== 'none' && additiveUnlocked(state) ? askedAdditive : 'none';

  state.PriceTier = priceTierId;
  state.PricePerJin = PRICE_TIERS[priceTierId].perJin;
  state.PriceCoefToday = priceCoefFor(state, priceTierId, state.today.scenario);
  state.F = Math.min(1.10, 1 + 0.05 * (state.Facilities.includes('fac_display') ? 1 : 0)
    + 0.05 * (state.Facilities.includes('fac_cert') ? 1 : 0));
  state.PackingTier = packingTier;
  state.Flavor = { ...flavor };
  state.M_base = computeMBase(state.Flavor, state.today.scenario);
  state.AdditiveTier = additiveTier;
  // ⑤ 试吃份数：附录 F.5 值域「0 或 3–6」，没挂试吃一元角这个开关根本不出现（初值列明写恒 0）
  const askedTasting = opts.tastingCount === undefined ? state.TastingCount : opts.tastingCount;
  state.TastingCount = state.Facilities.includes('fac_taste')
    && Number.isInteger(askedTasting) && askedTasting >= TASTING.min && askedTasting <= TASTING.max
    ? askedTasting : 0;
  // ⑥ 显多秤：秤不在手上（未购 / 已在第 3 步卖回）时按卸下收
  const askedScale = opts.scaleShowOn === undefined ? state.ScaleShowOn : !!opts.scaleShowOn;
  state.ScaleShowOn = askedScale && ownsTool(state, 'JI_SCALE');
  // 附录 G.3 的价格战式用「你当日价」，当日价到本步才存在，故改价挂在定版之后（第 1 步那次只递减倒计时）
  priceWarReprice(state);
  state.today.locked = true;
  return { ok: true, M_base: state.M_base, tastingCount: state.TastingCount, scaleShowOn: state.ScaleShowOn };
}

// 第 6 步：晨间事件（严队长占道）
export function morningEvent(state, rng, choose) {
  const ev = drawEvent(state, 'morning', rng);
  if (ev && choose) resolveChoice(state, ev, choose(ev));
  return ev;
}

// 第 7 步：称重 → 营业结算。orders 由 drawHandOrders 抽好（界面要先把单子亮出来才让玩家过称）
// weigh = { customerId: { 品类: 克数 } }（界面）或 (order) => { 品类: 克数 }（无头模拟）
// blanchBy = { customerId: 熟度读数 }（正文 3.11 烫煮，开关 state.blanchOn 关着一律不传 → 信号档逐字等于过称档）
export function runDay(state, orders, weigh, rng, blanchBy = null) {
  const gramsFor = typeof weigh === 'function'
    ? weigh
    : (o => (weigh && weigh[o.customerId]) || defaultGrams(o));
  const results = orders.map(o => settleWeighing(o, gramsFor(o)));
  state.HandOrders = results;
  const business = runBusiness(state, results, rng);
  // 烫煮挪的是「该单信号」那一格，不动 C/H/Risk、不动流水、不进 Q（正文 :213 与 3.4「烫煮表现不进 Q」）
  const on = !!state.blanchOn;
  for (const r of results) {
    if (r.short) state.today.shortWeighCount += 1;
    else if (r.full) state.today.fullWeighCount += 1;
    if (on) {
      const judged = judgeBlanch(blanchBy ? blanchBy[r.customerId] : undefined);
      if (judged) state.today.blanchCounts[judged.band] += 1;
      const tier = signalTier(r, blanchBy ? blanchBy[r.customerId] : undefined, true);
      if (tier === 0) state.today.signalShortCount += 1;
      else if (tier === 2) state.today.signalFullCount += 1;
    }
  }
  if (!on) {
    state.today.signalShortCount = state.today.shortWeighCount;
    state.today.signalFullCount = state.today.fullWeighCount;
  }
  return business;
}

// 玩家不动手时按模板标准克数出（既不占便宜也不吃亏）
function defaultGrams(order) {
  const out = {};
  for (const l of order.lines) out[l.cat] = l.grams;
  return out;
}

// 第 8–9 步：收摊账目 + 预订兑现 + 暗线（界面先展示这一段，再弹晚间事件）
export function nightSettle(state, rng) {
  settleDay(state);
  // 机制单 `c152b37`：账一落就判绝境闸。撞线当晚翻牌 + 递话（第 12 步 `buildComments` 同夜带出），次日市场低价卡才出现。
  cheapUnlockCheck(state);
  state.today.reserveResult = resolvePendingReserve(state);
  applyShadow(state, {
    shortOrders: state.today.shortWeighCount,
    spillBowls: state.today.spillBowls,
  });
  return state.today.reserveResult;
}

// 第 10 步的抽取单独露出来：界面要先把事件亮出来、等玩家选，再入账
export function eveningDraw(state, rng) {
  return drawEvent(state, 'evening', rng);
}

// 第 10–12 步：选择落地 → 事件账与结局检查 → 留言与存档
export function nightClose(state, rng, ev, actionId) {
  const evening = ev ? { event: ev, choice: resolveChoice(state, ev, actionId) } : null;

  // 第 11 步：事件账净额（晨间已扣不重复）+ NP + 现金结转标记 + 全日唯一一次结局检查
  // 附录 B :442：事件账净额 = 现金收入 − 现金支出 + 非现金资产净变化（销毁记负），销毁一分现金不动、
  // 但库存资产同步减等额 → 桥两端一起动，恒等式不破
  const eventNetCents = state.today.eventCashMorning + state.today.eventCashEvening
    - (state.today.eventAssetLoss || 0);
  state.NP += state.today.netOpsCents + eventNetCents;
  state.today.eventNetCents = eventNetCents;
  // 附录 F.6 `RivalSuppressedDays` 在第 11 步记（份额取第 7b 步存档值，正文 3.13）
  tallySuppression(state);
  // 正文 5.3 weight_shift 的「满 7 天自动过期」：过期未用的修正第 11 步清掉（目标当日已触发则在 resolveChoice 里就地清除）
  expireShifts(state);
  state.BizDays = state.Day;
  state.NegativeCashStreak = state.Cash < 0 ? state.NegativeCashStreak + 1 : 0;
  const ending = checkEndings(state);
  if (ending) state.EndingId = ending;

  // 第 12 步：留言 + 常客推进判定 + 存档字段滚动
  buildComments(state, rng);
  // 附录 F.5 :442 与 G.1 :564 把「常客推进」钉在第 12 步：今天上过单的常客线顾客，RegularStory 那一格 +1。
  // 只推进度、不给奖励、不触发剧情（正文 5.4「不设选项、不给奖励清单」；完整故事弧在首更）
  for (const r of state.HandOrders) {
    const slot = REGULAR_SLOTS.indexOf(r.customerId);
    if (slot >= 0) state.RegularStory[slot] += 1;
  }
  state.CommentLog = state.CommentLog.slice(-30);
  state.DailyReports.push(dailyReport(state));
  // spec-event-pool-6 第 4 / 6 条的「近 3 日」窗口随 DailyReports 同一处滚存（第 12 步）
  pushRecent(state);
  state.PriceCoefYday = state.PriceCoefToday;
  state.YesterdayScenario = state.today.scenario;
  state.YesterdayRamp = state.today.rampCoef;
  state.YesterdayF = state.F;
  // 附录 C 比值式与附录 D.1 组篮默认量的同源依据：昨日售出碗数 / 斤数 / 逐品类售出 / 耗汤份数
  state.YesterdaySoldBowls = state.today.bowls;
  state.YesterdaySoldJin = state.today.J;
  state.YesterdaySoldJinByCat = { ...state.today.soldJin };
  state.YesterdaySoup = state.today.soupUsed;
  // 卖空是玩家看得见的事实（3.1 可见清单 / 3.4 ①类留言），次日组篮才会因此加量
  state.YesterdaySoldOut = state.today.soldOutCats.length > 0 || state.today.soupSoldOut
    || (state.today.handRefused || 0) > 0;
  // 第 7 步 D0 是公开项：卖断货那天玩家看得见门口排了多长的队，次日就照这个数加量
  state.YesterdayD0 = state.today.D0 || 0;
  if (state.RampDays > 0) state.RampDays -= 1;
  state.event_demand_mult = 1.0;
  return { evening, ending };
}

// 无头模拟与回归回路用这一条：三段一次走完，行为与拆分前完全一致
export function closeDay(state, rng, chooseEvening) {
  nightSettle(state, rng);
  const ev = eveningDraw(state, rng);
  const actionId = ev ? (chooseEvening ? chooseEvening(ev) : (ev.actions?.[0]?.id ?? null)) : null;
  return nightClose(state, rng, ev, actionId);
}

// 附录 G.4：被动型结局（#1/#2）每晚第 11 步判一次；主动型（#3/#4/#5/#6）挂在各自的动作当刻，见下面三条
export function checkEndings(state) {
  // §六 #1 的两条被动路径：Risk 到 100（含当日曾到）、卫生大检查 Score < 35（附录 E.6 当晚判，见 inspection.js）
  if (state.risk_100_pending || state.Risk >= 100 || state.today?.inspectionCrash) return ENDING.CRASH;
  if (state.NegativeCashStreak >= 3) return ENDING.BANKRUPT;
  return 0;
}

// 附录 G.4 把四个"执行某动作"型结局各挂在一个动作上，判定只在当刻走一次；
// #1/#2 是被动的，每晚第 11 步判（见 checkEndings）。三个动作型分开成三条式子，
// 是因为正文 §六「判定归属写死」：没做那个动作，就不该拿到那个结局。
// #3/#4 挂在"盘下对面铺子"（付 60,000 = 升"整街双店"那一档，ui-spec 换算表第 16 行写"同值同原则"）这一笔上，
// 且必须在钱出去之前判：判在付钱之后，"现金 ≥ 60,000"就变成要手里同时攥着两份盘店钱，
// 正文 3.5:141 的参考策略①「首个结局应为规矩立住」将不可达。判空即过 = 只升档不给结局（§六 盘店分支补洞）。
export function judgeBuyout(state) {
  if (state.Cash >= BUYOUT_PRICE_CENTS && state.Rep >= 75 && state.H <= 10 && state.L >= 4) return ENDING.RULES;
  if (state.H >= 18 && state.Wmax >= HEARTBURN_WMAX_JIN) return ENDING.HEARTBURN;
  return 0;
}

// #5 金盆洗手：G.4「NP>=30000000(分) & C>=5」，且 C<5 时目标墙上那个入口根本不出现
export function judgeRetire(state) {
  // 正本 G.5 写 NP>=10000000(分)＝10 万元，先前实现少了一位数；定稿门槛 30 万元＝30000000 分
  return (state.C >= 5 && state.NP >= RETIRE_NP_CENTS) ? ENDING.RETIRE : 0;
}

// 「街坊会想你的摊」是 #6 的变体而不是第七个结局（id 仍是 6），门槛 NP ≥ 90,000 元 且 Rep ≥ 60
export function quitVariant(state) {
  return state.NP >= QUIT_VARIANT_NP_CENTS && state.Rep >= QUIT_VARIANT_REP;
}

// §六 只给了这一处分档（变体 vs 普通），没给第二把门槛，所以合成评语只做两支——
// "按当时 Rep/净赚/天数合成"里的天数当事实陈述用，不当阈值用；两句文案属 agent 自撰，待店主审。
export function quitBlurb(state) {
  return quitVariant(state)
    ? '街坊会想你的摊。'
    : `卖了 ${state.Day} 天，摊子收了。`;
}

// 无头跑表的"尝试盘店"沿用合成判定：按序号取小，判空给 #6（正文 §六「同日多条达成按序号取小」）。
// 界面上不许再走这条——那等于没盘店也能凭点一下「把摊子盘出去」拿到结局 #3。
export function closeShop(state) {
  return judgeBuyout(state) || judgeRetire(state) || ENDING.MEDIOCRE;
}

export function dailyReport(state) {
  const t = state.today;
  return {
    day: state.Day, weather: t.scenario?.label, pricePerJin: state.PricePerJin,
    bowls: Math.round(t.bowls), J: roundJin(t.J), revenueCents: t.revenueCents,
    cogsCents: t.cogsCents, grossCents: t.grossCents, writeoffCents: t.writeoffCents,
    fixedCents: state.FixedCost, laborCents: state.LaborCost,
    tastingPortions: t.tastingPortions, tastingIncomeCents: t.tastingIncomeCents,
    tastingCostCents: t.tastingCostCents, tastingNetCents: t.tastingNetCents,
    tastingConvert: t.tastingConvert, deltaJ: t.deltaJ,
    netOpsCents: t.netOpsCents,
    eventCashMorning: t.eventCashMorning, eventCashEvening: t.eventCashEvening,
    eventAssetLossCents: t.eventAssetLoss || 0,
    eventNetCents: t.eventNetCents, cash: state.Cash, debt: state.DebtSupplier,
    // 附录 E 的「结算页多一行」文字与检查当晚的判定留痕（Score 与档位属明账，Risk/Rep 的数值不进面板）
    notes: [...(t.notes || [])], inspection: t.inspection || null,
    // spec-event-pool-6 的三条当日事实留痕（后台字段，不进任何玩家面板）：
    // 「哪一天市场拒收粉面」「哪一天汤被封顶了一半」「哪一天山寨摊还站着」要能被逐日账一眼数出来，
    // 不然验收「六条各自至少 1 次种子实测触发」只能靠翻 EventHistory 猜存续期
    delist: t.delist || null, soupHalf: !!t.soupHalf, copycatActive: !!t.copycatActive,
    comments: t.comments.map(c => c.text),
    soldOut: [...t.soldOutCats], spillBowls: t.spillBowls, shortWeighCount: t.shortWeighCount,
    soldJin: { ...t.soldJin }, soupUsed: t.soupUsed,
    stockAtOpen: { ...t.stockAtOpen }, purchasedJin: { ...t.purchasedJin },
  };
}

// 进货单回放页（正文 3.9 / 3.4）：暗线数值在这一刻才第一次显示
export function replayPage(state) {
  return {
    endingId: state.EndingId, days: state.Day,
    purchases: state.PurchaseLedger, reports: state.DailyReports,
    reveal: {
      Rep: state.Rep, C: state.C, H: state.H, Risk: state.Risk, L: state.L,
      Wmax: roundJin(state.Wmax), ReceiptRate: state.ReceiptRate, NP: state.NP, P: state.P,
    },
    bridge: bridgeCheck(state),
  };
}

export const DAY_COUNT = CONFIG.sampleDays;
