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
    // 附录 E.9 evt_s_poach：涨薪留住的加薪（分/日，持续到本局结束）与被挖走成因（区别于「请假一天」的产能惩罚开关）
    WageRaiseCents: 0, PoachedAway: false,
    eventScope: CONFIG.eventScope,
    // 正文 3.11 烫煮：§八 排期收口「开关式实现（在建时默认关闭）」——关着时一格不渲染、一个随机不掷，与 laborOn / competitionOn 同一套口径开关
    blanchOn: CONFIG.blanch,

    EventHistory: [], Cooldowns: {}, WeightShifts: {}, PricewarDays: 0,
    // M2 第八批（spec-event-pool-6）：山寨摊存续日 / 次日下架品类 / 次日用汤减半 / 近 3 日信号窗口
    CopycatDays: 0, pendingDelist: null, pendingSoupHalf: false, Recent3: [],
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
    // 机制单 `c152b37`：累计经营净额（Σ 每日 netOpsCents，第 8 步落账那一格累加）与低价档的永久解锁位。
    // NP 是「经营净额 + 事件账净额」两笔的和（附录 B），不是这一格——单上点名要的是账本现成的经营净额口径。
    NetOpsCents: 0, cheapUnlocked: false,
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
    // spec-event-pool-6 的三条「当日事实」：山寨摊还在不在（第 7b 步读它做惯性封顶）、
    // 今日哪一档被下架（市场层 skuAvailable 读）、汤底是否只用一半封顶（第 7c-2 步读）。
    // 三者都由昨日事件写在 state 上、今日第 1 步结转成真，与 pricewarActive 同一条走法。
    copycatActive: false, delist: null, soupHalf: false,
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
    // 正文 3.14 第 11 步 / 附录 B :442：库存销毁按成本记「非现金资产损失」，走事件账、不改现金，
    // 但同步减少库存资产值 → 第 11 步的事件账净额 = 晨间 + 晚间现金 − 本项
    eventAssetLoss: 0,
    // 附录 E.6 的销毁比例（只有「全销毁 / 不销毁」两个按钮 → 0 或 1），Score 式第 15 分项的输入
    eventDestroyedRatio: 0,
    // 检查两行（E.6/E.9）的当晚判定留痕：{ id, score, band, destroyedCents }，只在结算页与逐日账出文字，不露暗线数值
    inspection: null,
    inspectionCrash: false,
    // 附录 E 的「结算页多一行」类明账文字（今日已立账 / 检查合格…），按正文 3.7「疼的数字要列明」进面板
    notes: [],
    comments: [],
    // 附录 E.8/E.7/E.10 的「① 类强制留言」：事件写的固定文案，不掷随机、第 12 步排在概率类信号之前
    forcedComments: [],
    shortWeighCount: 0,
    fullWeighCount: 0,
    // 正文 3.11 烫煮（开关式实现、默认关）：过称档经烫煮挪档之后的当日信号计数，第 12 步留言第③层读这一对；
    // 关着的时候 signal* 逐字等于 short/fullWeighCount，而 C/H/Risk 始终只读过称原档（applyShadow 不变）
    signalShortCount: 0,
    signalFullCount: 0,
    blanchCounts: { under: 0, green: 0, best: 0, over: 0 },
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
  // M2 第五批（附录 E 余六行）新带的字段：旧档按「没被挖过、没检查过」补初值，不动任何已签数值
  if (typeof parsed.WageRaiseCents !== 'number' || !Number.isFinite(parsed.WageRaiseCents)) parsed.WageRaiseCents = 0;
  if (typeof parsed.PoachedAway !== 'boolean') parsed.PoachedAway = false;
  // M2 第六批（烫煮开关 + 常客最低实现）新带的字段：旧档按「没烫过、今天还没下过锅」补初值，不动任何已签数值
  if (typeof parsed.blanchOn !== 'boolean') parsed.blanchOn = CONFIG.blanch;
  if (!Array.isArray(parsed.RegularStory) || parsed.RegularStory.length !== 4) parsed.RegularStory = [0, 0, 0, 0];
  if (typeof parsed.today?.signalShortCount !== 'number')
    parsed.today = { ...(parsed.today || {}), signalShortCount: parsed.today?.shortWeighCount || 0 };
  if (typeof parsed.today?.signalFullCount !== 'number')
    parsed.today = { ...(parsed.today || {}), signalFullCount: parsed.today?.fullWeighCount || 0 };
  if (!parsed.today?.blanchCounts)
    parsed.today = { ...(parsed.today || {}), blanchCounts: { under: 0, green: 0, best: 0, over: 0 } };
  if (parsed.eventScope !== 'm1' && parsed.eventScope !== 'full') parsed.eventScope = CONFIG.eventScope;
  if (!Array.isArray(parsed.today?.notes)) parsed.today = { ...(parsed.today || {}), notes: [] };
  // M2 第八批（事件池补六条）新带的字段：旧档按「没被山寨过、今天没断货、近三日用空窗」补初值，不动任何已签数值。
  // 注意这里只补「缺键」，不补 today.scenario —— 当日情境残缺属裁定 63a2ec8 ⑫ 的脏档兜底，只在晨间屏那一处、
  // 按「当日尚未 beginDay」路由回引擎入口处理，不在读档里凭空造一份情境。
  if (typeof parsed.CopycatDays !== 'number' || !Number.isFinite(parsed.CopycatDays)) parsed.CopycatDays = 0;
  if (!ALL_CATS.includes(parsed.pendingDelist)) parsed.pendingDelist = null;
  if (typeof parsed.pendingSoupHalf !== 'boolean') parsed.pendingSoupHalf = false;
  if (!Array.isArray(parsed.Recent3)) parsed.Recent3 = [];
  if (typeof parsed.today?.copycatActive !== 'boolean')
    parsed.today = { ...(parsed.today || {}), copycatActive: false, delist: null, soupHalf: false };
  // 机制单 `c152b37`（低价档亏损解锁）新带的两个字段。`NetOpsCents` 这一格**能 exact 重建**——每日账本行里就存着
  // `netOpsCents`（§二 压力测试那条「NP = Σ(经营净额 + 事件账净额)」的针证得过它逐日可加），所以旧档按已发生过的账补齐，
  // 不像 RiskShort 那样只能「不溯及既往补 0」。`cheapUnlocked` 一律补 false：**不在这里替玩家把门打开**，
  // 因为单上红线是「不许静默上架」——旧档就算已经亏过 180，也要等下一晚第 8 步那道判定自然撞线，递话那条留言才会在场。
  if (typeof parsed.NetOpsCents !== 'number' || !Number.isFinite(parsed.NetOpsCents))
    parsed.NetOpsCents = Array.isArray(parsed.DailyReports)
      ? parsed.DailyReports.reduce((s, r) => s + (r?.netOpsCents || 0), 0) : 0;
  if (typeof parsed.cheapUnlocked !== 'boolean') parsed.cheapUnlocked = false;
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
