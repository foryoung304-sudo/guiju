import { CAT, SOLID_CATS, PRICE_TIERS, TIERS_STALL, FACILITIES, ENDING } from './data/constants.js';
import { SKU_BY_ID } from './data/skus.js';
import { newGame } from './engine/state.js';
import { makeRng } from './engine/rng.js';
import { drawHandOrders } from './engine/weigh.js';
import { rampCoef, upgradeStall, buyFacility } from './engine/market.js';
import { evalCondition } from './engine/dsl.js';
import { previewBasket } from './engine/day.js';
import {
  beginDay, morningPreEvent, submitBasket, commitPrep, lockTradingDay, morningEvent, runDay, closeDay,
  nightSettle, eveningDraw, nightClose, closeShop,
} from './engine/day.js';

// 正文 3.5 / M1 简报验收第 ⑦ 项的三条极端玩法。
// 让步维度正文只给①写死"事件全让步"，②③ 无此口径 → 三条线一律按"让步"走（与本带历史结果同口径），
// 不让步只在 72 组合扫描里作为一个维度枚举，不改这三条基线。
export const STRATEGIES = {
  clean: { key: 'clean', name: '全正经 + 亲民 + 事件全让步', tier: 1, price: 'qinmin', weigh: 1.0, yieldAll: true },
  mid: { key: 'mid', name: '全平价 + 亲民', tier: 2, price: 'qinmin', weigh: 1.0, yieldAll: true },
  cheap: { key: 'cheap', name: '全特价 + 标准', tier: 3, price: 'standard', weigh: 1.0, yieldAll: true },
};

// 正文 3.5 三条参考策略（M3 跑表口径）：① 全正经+标准价 ② 全平价+亲民价 ③ 全特价+添加剂+亲民价。
// 投资腿（买设施 + 换档 + 主动盘店）按玩家会做的事开：设施每件 +1 L，不买就摸不到结局 #3「规矩立住」。
// ③ 的添加剂档不在策略里写死，由 simulate 的 opts.additive 传（M1 构建按 CONFIG 恒不掺，跑 M3 才开）。
export const REF_STRATEGIES = {
  ref1: { key: 'ref1', name: '参考① 全正经 + 标准价', tier: 1, price: 'standard', weigh: 1.0, yieldAll: true,
    buyFacilities: true, upgrade: true, buyout: true },
  ref2: { key: 'ref2', name: '参考② 全平价 + 亲民价', tier: 2, price: 'qinmin', weigh: 1.0, yieldAll: true,
    buyFacilities: true, upgrade: true, buyout: true },
  ref3: { key: 'ref3', name: '参考③ 全特价 + 添加剂 + 亲民价', tier: 3, price: 'qinmin', weigh: 1.0, yieldAll: true,
    buyFacilities: true, upgrade: true, buyout: true },
};

const round3 = x => Math.round(x * 1000) / 1000;

// 组篮：按附录 C 的预计碗数，用第 7 步的品类拆分比例（ω/Ω）摊到六品类
// ——玩家真实的动作是"照试算买"，不是照昨天的售出量抄（D.1 的默认值只是界面初值，卖断货的那天必须手动加）
function picksFor(state, tier, bowls) {
  const sc = state.today.scenario;
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * sc.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  const picks = SOLID_CATS.map(c => ({ sku: SKU_BY_ID[c + tier], qty: round3(bowls * sc.avgJin * omega[c] / Omega) }));
  picks.push({ sku: SKU_BY_ID['SP' + tier], qty: round3(bowls * sc.T) });
  return picks;
}

// 进货口径两条，跑表必须写死用的是哪一条，否则同一个验收带能被口径差拖出几百元：
//   appc（默认，玩家看得见的数）= 附录 C 试算碗数：首日回退式 + 次日起比值式，不含玩家看不见的当日事件修正
//   d0（需求侧上限）= 3.14 第 7 步 D0 公开项，等于假设玩家每天预知今日客流
// opts.buyMult > 1 = 乱买（照需求再上浮一成买），只用来验破产路径是否仍可达（审复 §四 加验项）
// 卖断货加量（审复 §二.1 证伪项）：附录 C 比值式的锚是"昨日售出碗数"，而昨日售出被昨日篮子封顶，
// 一条从不加量的线会被自己拖成 22→2 碗的单调下坡（3.4 明写卖空是玩家看得见的事实、次日组篮因此加量）。
// 玩家看得见的那个数是第 7 步 D0 公开项，所以断货日把目标抬到 max(试算, 昨日 D0)，不动任何数值、只补玩家动作
function demandTarget(state, strategy, policy) {
  if (policy === 'd0') {
    const sc = state.today.scenario;
    return state.BaseSales * rampCoef(state) * sc.trafficTotal
      * PRICE_TIERS[strategy.price].coef * state.F * (0.75 + state.P * 0.005);
  }
  // 试算的需求侧与篮子无关（篮子只影响可供上限），空篮取 estBowls
  const appc = previewBasket(state, [], strategy.price).forecast.estBowls;
  if (state.YesterdaySoldOut) return Math.max(appc, state.YesterdayD0 || appc);
  return appc;
}

// 玩家会做的取舍（正文 3.2「买好料没周转」）：碗数从需求估计往下退，退到现金 + 熟人赊购额度
// 付得起的那一篮（3.14 赊购细则：汤底与非熟人货只收现金；引擎付不齐是整篮驳回、不自动减量，
// 减量是玩家的动作，所以这条模拟线自己从上限往下找第一篮能提交的）。篮子金额随碗数单调，二分找。
function chooseBasket(state, strategy, target) {
  const hi = Math.max(0, Math.floor(target));
  const fits = bowls => bowls <= 0 ? true
    : previewBasket(state, picksFor(state, strategy.tier, bowls), strategy.price).forecast.plan.submittable;
  if (fits(hi)) return { picks: picksFor(state, strategy.tier, hi), forecast: previewBasket(state, picksFor(state, strategy.tier, hi), strategy.price).forecast };
  let lo = 0, top = hi;
  while (lo + 1 < top) {
    const mid = (lo + top) >> 1;
    if (fits(mid)) lo = mid; else top = mid;
  }
  const picks = picksFor(state, strategy.tier, lo);
  const { forecast } = previewBasket(state, picks, strategy.price);
  return lo > 0 ? { picks, forecast } : { picks: [], forecast };
}

function chooseFor(ev, strategy) {
  if (!ev.actions || !ev.actions.length) return null;
  const yieldAll = strategy.yieldAll ?? (ev.id === 'evt_d_001' ? !strategy.settleNow : true);
  switch (ev.id) {
    case 'evt_d_001': return yieldAll ? 'record' : 'settle_now';
    case 'evt_d_002': return yieldAll ? 'rectify' : 'fine';   // 让步 = 免费整改（当日客流 ×0.6）；不让步 = 掏罚款
    case 'evt_d_031': return 'accept';                        // 好事两条线都接
    default: return ev.actions[0].id;
  }
}

// 打烊两种走法：无头线一步 closeDay；界面线拆三步（第 8–9 / 第 10 抽 / 第 10–12 落），
// 拆三步时抽到的那张事件必须亲手传给 nightClose——传丢了账面上看不出来，晚间事件就白抽
const CLOSER = {
  headless: (state, rng, choose) => closeDay(state, rng, choose),
  ui: (state, rng, choose) => {
    nightSettle(state, rng);
    const ev = eveningDraw(state, rng);
    return nightClose(state, rng, ev, ev ? choose(ev) : null);
  },
};

// M3 跑表口径（正文第八节 / 定稿 §七.2）：升级不变式 = 升级时点现金 ≥ 下一级价 ×1.3；
// 设施按同一倍数、由便宜到贵买（正文 3.4：每件 +1 L，L 是盘店结局的门槛，跑表不买设施就永远摸不到结局 #3）；
// 解锁条件走 FACILITIES.unlock 的 DSL 原文，M1 事件表里抽不到的那几张（evt_d_021 / 员工合同）自然永远锁着
// 盘店只在真能给出结局 #3/#4/#5 时才按（判空即过 = 只升档，玩家不会为拿"平庸收摊"而提前离场）
function investPhase(state, strategy, invests) {
  const cushion = strategy.upgradeAt ?? 1.3;
  if (strategy.buyFacilities) {
    const shop = Object.values(FACILITIES).sort((a, b) => a.price - b.price);
    for (const fac of shop) {
      if (state.Facilities.includes(fac.id) || !evalCondition(fac.unlock, state)) continue;
      if (state.Cash < fac.price * cushion) break;
      const cashBefore = state.Cash;
      buyFacility(state, fac.id);
      invests.push({ day: state.Day, kind: 'facility', to: fac.id, price: fac.price, cashAt: cashBefore, cashAfter: state.Cash });
    }
  }
  const next = TIERS_STALL[state.Tier - 1].upgradePrice;
  if (strategy.upgrade && next && state.Cash >= next * cushion) {
    const cashBefore = state.Cash;
    upgradeStall(state);
    invests.push({ day: state.Day, kind: 'stall', to: state.Tier, price: next, cashAt: cashBefore, cashAfter: state.Cash });
  }
  // 盘店（附录 G.4：3/4/5 在动作当刻判一次；判空即过 = 只升档不给结局，所以拿到"平庸收摊"就不盘）
  if (strategy.buyout) {
    const e = closeShop(state);
    if (e !== ENDING.MEDIOCRE) state.EndingId = e;
  }
}

export function simulate(seed, days, strategy, closer = 'headless', opts = {}) {
  const state = newGame(seed);
  if (opts.weather) for (let i = 0; i < state.weatherCycle.length; i++) state.weatherCycle[i] = opts.weather;
  // M3 参考策略③ 的添加剂档（M1 构建按 CONFIG 恒不掺；跑 M3 口径时按 3.12 数值开档）
  if (opts.additive) state.AdditiveTier = opts.additive;
  // 产能探针（回归 §9 用）：不改数值口径，只把 3.12 的档位斤数临时压小，验第 7g 步截断顺序
  if (opts.capacity) state.CapacityBase = opts.capacity;
  // 人工线口径开关：正文 3.5:141 的压力测试带跑在 M1 构建（无小豆人工），「人工与产能数值不参与本区间判定」，
  // M2 重跑要另立区间（店主尚未签发）→ 凡是对已签发带的断言一律传 labor:false 复现 M1 口径。
  if (opts.labor !== undefined) state.laborOn = !!opts.labor;
  // 竞争层口径开关：同一条理由（3.5:141 的 M1 构建「无竞争（S ≡ 1）」）——已签发带一律传 competition:false，
  // M2 在场带店主还没签，只在 sweep 证据段出数。关掉时整层不抽 `rival` 子流，随机流与 M1 完全同轨。
  if (opts.competition !== undefined) state.competitionOn = !!opts.competition;
  // 试吃 / 显多秤探针（回归 §10 用）：直接给到"已置办"的前置，只验开与关的账面差别，不模拟攒钱买的过程
  if (opts.tasting) { state.Facilities.push('fac_taste'); state.TastingCount = opts.tasting; }
  if (opts.scale) { state.Tools.push('JI_SCALE'); state.ScaleShowOn = true; }
  const buy = opts.buy ?? 'appc';
  const log = [];
  const invests = [];
  for (let d = 0; d < days; d++) {
    const rng = makeRng(state);
    beginDay(state);
    const pre = morningPreEvent(state, rng);

    if (strategy.upgrade || strategy.buyFacilities || strategy.buyout) investPhase(state, strategy, invests);
    const target = demandTarget(state, strategy, buy) * (opts.buyMult ?? 1);
    const { picks, forecast } = chooseBasket(state, strategy, target);
    const submit = submitBasket(state, picks, rng);

    // 生产链前段（3.12）：策略不写死备菜/调味时沿用存档默认（三项将就 + 默认方子 3/2/3 + 普通餐盒），
    // 这样 M1 三条参考线只被「新增机制」推动，不被模拟器的替玩家决定推动
    if (strategy.prep) commitPrep(state, strategy.prep, strategy.wakeEarly ?? false);
    lockTradingDay(state, {
      priceTier: strategy.price,
      packingTier: strategy.packing,
      flavor: strategy.flavor,
    });
    const morning = morningEvent(state, rng, ev => chooseFor(ev, strategy));
    const orders = drawHandOrders(state, rng);
    const weigh = order => Object.fromEntries(
      order.lines.map(l => [l.cat, Math.round(l.grams * strategy.weigh)]));
    runDay(state, orders, weigh, rng);
    const close = CLOSER[closer](state, rng, ev => chooseFor(ev, strategy));

    // 卡点判据比的是整篮固体斤数与目标斤数（原式拿 MB 单行去比全品类斤数，几乎天天误报 shortBuy）
    const solidJin = picks.filter(p => p.sku.cat !== 'SP').reduce((s, p) => s + p.qty, 0);
    log.push({
      day: state.Day, weather: state.today.scenario.label,
      pre: pre?.id, morning: morning?.id, evening: close.evening?.event?.id,
      bought: submit.plan ? submit.plan.total / 100 : 0,
      est: forecast ? +forecast.estBowls.toFixed(2) : 0,
      bowls: Math.round(state.today.bowls), J: state.today.J, Q: state.today.Q,
      M_base: +state.M_base.toFixed(3),
      cap: state.today.capJin ?? null, deferred: state.today.deferredBowls || 0, regLost: state.today.regLost || 0,
      // 3.13 第四批：竞争系数 S、四摊份额、王老板价签与 P、压制计数（关掉竞争层时恒 S=1 / 份额 0.25）
      // 本摊 P 一起落表：S 什么时候离开下界，取决于 3.13 滞后式的 P 爬多快，探针要能在 log 上直接读它
      S: state.today.S, share: state.today.share, rivalPrice: state.RivalPrice, rivalP: state.RivalP, P: state.P,
      suppress: state.RivalSuppressedDays, boost: state.RivalAttrBoostWeeks,
      revenue: state.today.revenueCents / 100, cogs: state.today.cogsCents / 100,
      gross: state.today.grossCents / 100, writeoff: state.today.writeoffCents / 100,
      netOps: state.today.netOpsCents / 100, eventNet: state.today.eventNetCents / 100,
      // 3.12 生产链前段第三批：显多秤虚增斤数 ΔJ / 当日工资 / 试吃净额（三项都是"当日账面上多出来"的数）
      deltaJ: state.today.deltaJ || 0, labor: state.LaborCost / 100,
      tasting: (state.today.tastingIncomeCents || 0) / 100 - (state.today.tastingCostCents || 0) / 100,
      cash: state.Cash / 100, debt: state.DebtSupplier / 100, NP: state.NP / 100,
      Rep: +state.Rep.toFixed(2), Risk: +state.Risk.toFixed(2),
      C: +state.C.toFixed(2), H: +state.H.toFixed(2), R: state.R, L: state.L,
      tier: state.Tier, invest: state.NetInvestSpent / 100,
      target: Math.floor(target),
      // 卡点两档：short = 想按试算买但被迫减量；starved = 连一碗的篮都付不齐（汤底只收现金最容易撞）
      shortBuy: Math.floor(target) >= 1 && picks.length > 0 && solidJin < round3(target * state.today.scenario.avgJin * 0.999),
      starved: Math.floor(target) >= 1 && picks.length === 0,
      comments: state.today.comments.map(c => `${c.kind}:${c.text}`),
      ending: state.EndingId,
    });
    if (state.EndingId) break;
  }
  return { state, log, invests };
}
