import { CONFIG, PRICE_TIERS, ENDING, SOLID_CATS, PACKING, ADDITIVE, BUYOUT_PRICE_CENTS, RETIRE_NP_CENTS, HEARTBURN_WMAX_JIN } from '../data/constants.js';
import { blankToday, roundJin } from './state.js';
import { makeRng } from './rng.js';
import { buildBasket, commitPurchase, planPayment } from './market.js';
import { forecastBasket, settleDay, bridgeCheck } from './ledger.js';
import { runBusiness, priceCoefFor } from './ops.js';
import { applyShadow } from './shadow.js';
import { drawEvent, resolveChoice, resolvePendingReserve } from './events.js';
import { drawHandOrders, settleWeighing } from './weigh.js';
import { buildComments } from './comments.js';
import { scenarioOf, forecastLabel } from '../data/scenario.js';
import { additiveUnlocked, computeMBase, prepBudget, prepFits, prepGridUsed } from './production.js';

// 正文 3.14 第 1 步（晨间结转）+ 明日情境
export function beginDay(state) {
  const rng = makeRng(state);
  if (state.dayStarted) {
    state.Day += 1;
    state.SemesterDay = ((state.Day - 1) % 28) + 1;
  }
  state.dayStarted = true;
  state.risk_100_pending = false;
  if (state.R_frozen_days > 0) state.R_frozen_days -= 1;
  state.PriceIndex = Math.round((state.PriceIndex * (state.Day >= 100 ? 1.003 : 1.0)) * 1000) / 1000;

  state.today = blankToday();
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

// 第 5 步：营业前定版（六开关一次性锁定；⑤ 试吃、⑥ 显多秤尚无生效落点，本批只登记不做假开关）
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
  state.today.locked = true;
  return { ok: true, M_base: state.M_base };
}

// 第 6 步：晨间事件（严队长占道）
export function morningEvent(state, rng, choose) {
  const ev = drawEvent(state, 'morning', rng);
  if (ev && choose) resolveChoice(state, ev, choose(ev));
  return ev;
}

// 第 7 步：称重 → 营业结算。orders 由 drawHandOrders 抽好（界面要先把单子亮出来才让玩家过称）
// weigh = { customerId: { 品类: 克数 } }（界面）或 (order) => { 品类: 克数 }（无头模拟）
export function runDay(state, orders, weigh, rng) {
  const gramsFor = typeof weigh === 'function'
    ? weigh
    : (o => (weigh && weigh[o.customerId]) || defaultGrams(o));
  const results = orders.map(o => settleWeighing(o, gramsFor(o)));
  state.HandOrders = results;
  const business = runBusiness(state, results, rng);
  for (const r of results) {
    if (r.short) state.today.shortWeighCount += 1;
    else if (r.full) state.today.fullWeighCount += 1;
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
  const eventNetCents = state.today.eventCashMorning + state.today.eventCashEvening;
  state.NP += state.today.netOpsCents + eventNetCents;
  state.today.eventNetCents = eventNetCents;
  state.BizDays = state.Day;
  state.NegativeCashStreak = state.Cash < 0 ? state.NegativeCashStreak + 1 : 0;
  const ending = checkEndings(state);
  if (ending) state.EndingId = ending;

  // 第 12 步：留言 + 存档字段滚动
  buildComments(state, rng);
  state.CommentLog = state.CommentLog.slice(-30);
  state.DailyReports.push(dailyReport(state));
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

// 附录 G.4：结局判定只在第 11 步走一次；3/4/5 由玩家主动盘店当刻判（见 closeShop）
export function checkEndings(state) {
  if (state.risk_100_pending || state.Risk >= 100) return ENDING.CRASH;
  if (state.NegativeCashStreak >= 3) return ENDING.BANKRUPT;
  return 0;
}

// 玩家主动「把摊子盘出去」：当日只判一次，序号取最小；判空即过（只升档，不给结局）
export function closeShop(state) {
  if (state.Cash >= BUYOUT_PRICE_CENTS && state.Rep >= 75 && state.H <= 10 && state.L >= 4) return ENDING.RULES;
  if (state.H >= 18 && state.Wmax >= HEARTBURN_WMAX_JIN) return ENDING.HEARTBURN;
  // 正本 G.5 写 NP>=10000000(分)＝10 万元，先前实现少了一位数；定稿门槛 30 万元＝30000000 分
  if (state.C >= 5 && state.NP >= RETIRE_NP_CENTS) return ENDING.RETIRE;
  return ENDING.MEDIOCRE;
}

export function dailyReport(state) {
  const t = state.today;
  return {
    day: state.Day, weather: t.scenario?.label, pricePerJin: state.PricePerJin,
    bowls: Math.round(t.bowls), J: roundJin(t.J), revenueCents: t.revenueCents,
    cogsCents: t.cogsCents, grossCents: t.grossCents, writeoffCents: t.writeoffCents,
    fixedCents: state.FixedCost, netOpsCents: t.netOpsCents,
    eventCashMorning: t.eventCashMorning, eventCashEvening: t.eventCashEvening,
    eventNetCents: t.eventNetCents, cash: state.Cash, debt: state.DebtSupplier,
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
