import {
  ADDITIVE, ADDITIVE_TIER_MIN, CLIENT_MIX, CLIENT_PREF, CONFIG, FLAVOR_DIMS, PREP_LEVELS, PREP_STATIONS,
  TIERS_STALL, WAKE_EARLY_GRID,
} from '../data/constants.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const levelOf = id => PREP_LEVELS.find(l => l.id === id) || PREP_LEVELS[1];

// 正文 3.12：三项 = 洗切 / 腌渍 / 吊汤，与 PREP_STATIONS 同序（state.Prep 存档位名）
export function prepStationLevel(state, i) {
  return levelOf(state.Prep[i]);
}

// 工时预算 = 摊位档 workGrid（三轮车/餐车 4 · 固定摊位/档口 5 · 门面/双店 6）；
// 小豆在场 +1 格随人工线一起接（CONFIG.labor 未开）
export function prepBudget(state) {
  return TIERS_STALL[state.Tier - 1].workGrid;
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

export function capacityJin(state) {
  if (!CONFIG.capacityTruncation) return Infinity;
  return state.CapacityBase * prepCapMul(state);
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
