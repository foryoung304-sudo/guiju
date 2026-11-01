import {
  ADDITIVE, ADDITIVE_TIER_MIN, CLIENT_MIX, CLIENT_PREF, CONFIG, FLAVOR_DIMS, LABOR, PREP_LEVELS, PREP_STATIONS,
  TASTING, TIERS_STALL, WAKE_EARLY_GRID,
} from '../data/constants.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const levelOf = id => PREP_LEVELS.find(l => l.id === id) || PREP_LEVELS[1];

// 正文 3.12：三项 = 洗切 / 腌渍 / 吊汤，与 PREP_STATIONS 同序（state.Prep 存档位名）
export function prepStationLevel(state, i) {
  return levelOf(state.Prep[i]);
}

// 工时预算 = 摊位档 workGrid（三轮车/餐车 4 · 固定摊位/档口 5 · 门面/双店 6）+ 小豆在场 1 格（附录 F.5 `WorkGridUsed` 行）
export function prepBudget(state) {
  return TIERS_STALL[state.Tier - 1].workGrid + (xiaodouPresent(state) ? LABOR.gridBonus : 0);
}

export function prepGridUsed(state, prep = state.Prep, wakeEarly = state.WakeEarly) {
  return prep.map(levelOf).reduce((s, l) => s + l.grid, 0) + (wakeEarly ? WAKE_EARLY_GRID : 0);
}

export function prepFits(state, prep, wakeEarly) {
  return prepGridUsed(state, prep, wakeEarly) <= prepBudget(state);
}

// 出餐产能修正：三项连乘（全认真 1.05³=1.158 / 全跳过 0.90³=0.729）
export function prepCapMul(state) {
  return state.Prep.map(levelOf).reduce((m, l) => m * l.cap, 1);
}

// 正文 3.5 / 附录 E：小豆在场是人工线三条收益（工时 +1 格、产能 ×1.10、日结工资）的共同门。
// 不在场的两种成因都由事件写 `XiaodouAbsentDays`（"小豆请假一天" = 1 日；被挖角"让他走" = 14 日后回来，
// 合同在手则不被挖）；第 1 步递减。人工线整条关着时（M1 构建 / 压测口径）按不在场算，三条一起退场。
export function xiaodouPresent(state) {
  return !!state.laborOn && state.XiaodouAbsentDays <= 0;
}

// 附录 G.2 第 7 步产能式：在场 → 合同 ? ×1.15 : ×1.10（覆盖不叠加）
// 不在场分两种成因：「请假一天」只是没有加成（正文 :137），被挖角「让他走」还要吃 ×0.90 的产能惩罚（附录 E.9）
export function laborCapMul(state) {
  if (!xiaodouPresent(state)) return state.PoachedAway ? LABOR.poachedCapMul : 1.0;
  return state.Facilities.includes('fac_contract') ? LABOR.contractCapMul : LABOR.capMul;
}

// 附录 F.7 `LaborCost` 行：日结 60（三轮车—档口）/ 90（门面—双店），合同后 120 覆盖不分档；不在场 0。
// 勘误批 b 项：evt_s_poach「涨薪留住」在此后每日加 +15 元（= 1500 分），持续到本局结束；
// 加薪跟的是在场工资本身（正文 :137「请假当日不计人工」），人不在场时这一项也一并落空。
export function laborCostCents(state) {
  if (!xiaodouPresent(state)) return 0;
  const base = state.Facilities.includes('fac_contract') ? LABOR.contractPerDay
    : state.Tier >= LABOR.highTierFrom ? LABOR.highTierPerDay : LABOR.perDay;
  return base + (state.WageRaiseCents || 0);
}

export function capacityJin(state) {
  if (!CONFIG.capacityTruncation) return Infinity;
  return state.CapacityBase * prepCapMul(state) * laborCapMul(state);
}

export function washSkipped(state) {
  return state.Prep[PREP_STATIONS.findIndex(s => s.id === 'wash')] === '跳过';
}

// 正文 3.12：添加剂真实入口在调味台，调料摊在「摊位 ≥ 二手餐车」后才解锁
export function additiveOf(state) {
  return ADDITIVE[state.AdditiveTier] || ADDITIVE.none;
}

export function additiveUnlocked(state) {
  return state.Tier >= ADDITIVE_TIER_MIN;
}

// 情境改客群偏好（雨天全体辣 +1 / 考试周全体辣 −1），先钳制 0–5 再算匹配
export function flavoredPrefs(scenario) {
  const spicyMod = (scenario.weather.id === 'rain' ? 1 : 0) + (scenario.calendar.id === 'exam' ? -1 : 0);
  const out = {};
  for (const [group, pref] of Object.entries(CLIENT_PREF)) {
    out[group] = pref.map((v, dim) => (dim === 0 ? clamp(v + spicyMod, 0, 5) : v));
  }
  return out;
}

// M_base = Σ 客群占比 × (1 − 三维距离 ÷ 15)；只经 Q_调味 =（M_base − 0.70）× 20 钳 ±6 进 Q
export function computeMBase(flavor, scenario) {
  const mix = CLIENT_MIX[scenario.calendar.id] || CLIENT_MIX.normal;
  const prefs = flavoredPrefs(scenario);
  const f = FLAVOR_DIMS.map(d => clamp(flavor[d], 0, 5));
  let m = 0;
  for (const [group, share] of Object.entries(mix)) {
    const pref = prefs[group];
    const dist = f.reduce((s, v, i) => s + Math.abs(v - pref[i]), 0);
    m += share * (1 - dist / 15);
  }
  return m;
}

export function qTaste(mBase) {
  return clamp((mBase - 0.70) * 20, -6, 6);
}

// 正文 3.6 注 / 附录 D.5：转化人数 = floor(试吃份数 ÷ 3)，不掷随机。
// 「转化单是正常订单，计入当日流水与 COGS」→ 这份人数在第 7c 步并入当日需求（走自动层，吃库存与汤底与产能），
// 第 8 步的试吃账只管 1 元/份的份钱与样品库存消耗，不再重复计一遍流水。
export function tastingConvert(n) {
  return n >= TASTING.min ? Math.floor(n / TASTING.convertPer) : 0;
}
