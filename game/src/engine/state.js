import { SAVE_VERSION, MIGRATABLE_SAVE_VERSIONS, SUBSTREAMS, TIERS_STALL, CONFIG, ALL_CATS, SOLID_CATS, PRICE_TIERS, START_CASH_CENTS, START_CREDIT_CAP_CENTS, TOOLS, COMPETITION } from '../data/constants.js';
import { buildWeatherCycle } from '../data/scenario.js';
import { makeRng } from './rng.js';

// 附录 G.1：账目存整数分（先 round 到两位小数再 ×100）；斤数 3 位小数；份数/碗数/人数整数；系数不取整
export const toCents = yuan => Math.round(Math.round(yuan * 100) / 100 * 100);
export const roundJin = x => Math.round(x * 1000) / 1000;
export const centsToYuan = c => c / 100;

// 附录 F + 正文 3.4 新档初始状态表
export function newGame(seed) {
  const state = {
    saveVersion: SAVE_VERSION,
    seed: seed >>> 0,
    streamCounter: Object.fromEntries(SUBSTREAMS.map(s => [`${s}:0`, 0])),

    Day: 1, SemesterDay: 1, BizDays: 1,

    Weather: 'sunny', CalendarPhase: 'school', ScenarioTotal: 1.0,
    CatCoef: Object.fromEntries(SOLID_CATS.map(c => [c, 1.0])),
    T: 1.0, AvgJinPerBowl: 1.0, PriceIndex: 1.0, MarketStock: {},

    Cash: START_CASH_CENTS, DebtSupplier: 0, DebtAd: 0, CreditCap: START_CREDIT_CAP_CENTS,
    Batches: [], StockSolid: Object.fromEntries(SOLID_CATS.map(c => [c, 0])), StockSoup: 0,
    CostPool: Object.fromEntries(ALL_CATS.map(c => [c, 0])),
    NegativeCashStreak: 0,

    Rep: 20, Q: 50, R: 0, R_v: 0, C: 0, H: 0, Risk: 0, RiskShort: 0, risk_100_pending: false,
    L: 0, Wmax: 0, ReceiptRate: 1.0, ReceiptWindow: Array.from({ length: 30 }, () => ({ withTicket: 0, total: 0 })), P: 20,

    PriceTier: 'standard', PricePerJin: PRICE_TIERS.standard.perJin, PriceCoefToday: 1.0, PriceCoefYday: 1.0,
    PackingTier: CONFIG.packingTier, Flavor: { spicy: 3, numbing: 2, umami: 3 }, M_base: 0.867,
    AdditiveTier: CONFIG.additiveTier, TastingCount: 0, ScaleShowOn: false,
    Prep: ['将就', '将就', '将就'], WorkGridUsed: 0, WakeEarly: false,
    Facilities: [], CapacityBase: TIERS_STALL[0].capacity, F: 1.0,
    Tools: [], XiaodouAbsentDays: 0, tasting_pending_R: 0, laborOn: CONFIG.labor,

    EventHistory: [], Cooldowns: {}, WeightShifts: {}, PricewarDays: 0,
    seen_routine_inspection: false, dayStarted: false, pendingReserve: null,
    pinchHintUsed: false,
    d0_buff_mult: 1.0, d0_buff_days: 0, next_day_traffic_mult: 1.0, event_demand_mult: 1.0,
    event_reserve_bowls: 0, reg_reserved_bowls: 0, R_frozen_days: 0,
    RivalPrice: 22.8, RivalP: 55, RivalSuppressedDays: 0, Share: [0.25, 0.25, 0.25, 0.25], QueueInertia: [1, 1, 1, 1],
    // rivalLowUntilDay：正文 3.13「出事当周 P 降到 30、五天后回 55」的到期日；附录 F.6 只列了 RivalP 的切换结果、没列这个计数器，已登记待并
    RivalAttrBoostWeeks: 0, rivalLowUntilDay: 0, competitionOn: CONFIG.competition,
    HandOrders: [], RegularStory: [0, 0, 0, 0],
    YesterdaySoldBowls: 0, YesterdaySoldJin: 0, YesterdayScenario: null, YesterdayRamp: 1.0, YesterdayF: 1.0,
    YesterdaySoldJinByCat: Object.fromEntries(SOLID_CATS.map(c => [c, 0])), YesterdaySoup: 0,
    YesterdaySoldOut: false, YesterdayD0: 0,
    CommentLog: [], PurchaseLedger: [], DailyReports: [],

    NP: 0, NetInvestSpent: 0, AdBonusTotal: 0,
    Tier: 1, tierName: TIERS_STALL[0].name, RampDays: 3, EndingId: 0,
    BaseSales: TIERS_STALL[0].baseSales, FixedCost: TIERS_STALL[0].fixedCost, LaborCost: 0,

    // 样段运行时量（非存档语义，但同存档复现需要一致，故一并持久化）
    weatherCycle: [],
    today: blankToday(),
  };
  const rng = makeRng(state);
  state.weatherCycle = buildWeatherCycle((stream, k) => rng.pinned(stream, 0, k), CONFIG.sampleDays);
  return state;
}

export function blankToday() {
  return {
    scenario: null,
    // 竞争层当日三项：S（第 7b 步实际值，只进回放与后台）、四摊份额、价格战当日是否生效
    S: 1, share: null, pricewarActive: false,
    priceMods: [],
    priceMultToday: {},
    purchases: [],
    committed: false,
    prepped: false,
    locked: false,
    handOrders: [],
    soldJin: Object.fromEntries(ALL_CATS.map(c => [c, 0])),
    soldBowls: 0,
    stockAtOpen: Object.fromEntries(ALL_CATS.map(c => [c, 0])),
    purchasedJin: Object.fromEntries(ALL_CATS.map(c => [c, 0])),
    jRevenue: 0,
    eventCashMorning: 0,
    eventCashEvening: 0,
    eventAssetLoss: 0,
    comments: [],
    // 附录 E.8/E.7/E.10 的「① 类强制留言」：事件写的固定文案，不掷随机、第 12 步排在概率类信号之前
    forcedComments: [],
    shortWeighCount: 0,
    fullWeighCount: 0,
    portionGrudge: false,
    spillBowls: 0,
    takeawayBowls: 0,
    reserveAccepted: false,
    reserveDelivered: false,
    reservePartial: false,
    soldOutCats: [],
    soupSoldOut: false,
    writeoffCents: 0,
    deltaJ: 0,
    tastingPortions: 0,
    tastingIncomeCents: 0,
    tastingCostCents: 0,
    tastingConvert: 0,
    forecast: null,
    pendingHidden: [],
    forecastScenario: null,
  };
}

export const STORAGE_KEY = 'guiju-m1-save';

export function saveGame(state) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadGame() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  // 正文 3.4 / 附录 F.1：saveVersion 不符即拒绝读档；裁定 9a959bd §一 允许迁移名单内的旧档带入
  if (parsed.saveVersion !== SAVE_VERSION && !MIGRATABLE_SAVE_VERSIONS.includes(parsed.saveVersion)) return null;
  // feedback-hint-persistence-20261031：教学提示标志只认存档本体；缺字段/脏值按「从未捏过」补齐
  if (typeof parsed.pinchHintUsed !== 'boolean') parsed.pinchHintUsed = false;
  // 第 11 条豁免（签复 b48ec8e）带来的分量作假池；缺字段按裁定 9a959bd §一「不溯及既往」补 0
  if (typeof parsed.RiskShort !== 'number' || !Number.isFinite(parsed.RiskShort)) parsed.RiskShort = 0;
  // M2 第三批（设施全量 / 人工线 / 显多秤 / 试吃）新带的四个字段：旧档一律按「从未有过」补，不改任何已签数值
  if (!Array.isArray(parsed.Tools)) parsed.Tools = [];
  if (typeof parsed.XiaodouAbsentDays !== 'number' || !Number.isFinite(parsed.XiaodouAbsentDays)) parsed.XiaodouAbsentDays = 0;
  if (typeof parsed.tasting_pending_R !== 'number' || !Number.isFinite(parsed.tasting_pending_R)) parsed.tasting_pending_R = 0;
  if (typeof parsed.laborOn !== 'boolean') parsed.laborOn = CONFIG.labor;
  // M2 第四批（常驻竞争层）新带的字段：旧档按「这条街还没打过价」补初值，不动任何已签数值
  if (typeof parsed.competitionOn !== 'boolean') parsed.competitionOn = CONFIG.competition;
  if (typeof parsed.RivalPrice !== 'number') parsed.RivalPrice = COMPETITION.rivalStartPrice;
  if (typeof parsed.RivalP !== 'number') parsed.RivalP = COMPETITION.rivalP;
  for (const k of ['PricewarDays', 'RivalSuppressedDays', 'RivalAttrBoostWeeks', 'rivalLowUntilDay'])
    if (typeof parsed[k] !== 'number' || !Number.isFinite(parsed[k])) parsed[k] = 0;
  if (!Array.isArray(parsed.Share) || parsed.Share.length !== 4) parsed.Share = [0.25, 0.25, 0.25, 0.25];
  if (!Array.isArray(parsed.QueueInertia) || parsed.QueueInertia.length !== 4) parsed.QueueInertia = [1, 1, 1, 1];
  if (!Array.isArray(parsed.today?.forcedComments)) parsed.today = { ...(parsed.today || {}), forcedComments: [] };
  parsed.saveVersion = SAVE_VERSION;
  return parsed;
}

export function clearSave() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function stallConfig(state) {
  return TIERS_STALL[state.Tier - 1];
}

// 附录 B 口径：库存金额按当日加权均价进出（costPool 与批次实物数量同源），现金桥才能逐日精确对上
export function addToCostPool(state, cat, cents) {
  state.CostPool[cat] = (state.CostPool[cat] || 0) + cents;
}

export function takeFromCostPool(state, cat, cents) {
  const before = state.CostPool[cat] || 0;
  const used = Math.max(0, Math.min(before, Math.round(cents)));
  state.CostPool[cat] = before - used;
  return used;
}
