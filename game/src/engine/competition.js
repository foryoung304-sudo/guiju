// 正文 3.13 常驻竞争 + 附录 G.3（第 1 步）+ 3.14 第 7b（吸引力与 S）。
// 竞争只许通过价格、排队、传闻影响客流（3.13 红线）：本模块只写价签、P、份额与 S，不写台词、不改库存与账。
import { COMPETITION, RIVAL_INDIRECT } from '../data/constants.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 口径开关：state.competitionOn 由 CONFIG.competition 起，harness 可对已签发带关掉整层（与人工线 laborOn 同构）
export function competitionOn(state) {
  return !!state.competitionOn;
}

export function rivalPriceCoef(price) {
  return clamp(COMPETITION.priceBase / price, COMPETITION.gBand[0], COMPETITION.gBand[1]);
}

// 分流系数（正文 3.13：只作用于两家间接竞品；本摊与王老板恒 1.0）
export function divertCoef(id, weatherId) {
  const r = RIVAL_INDIRECT.find(x => x.id === id);
  return r ? r.divert[weatherId] ?? 1.0 : 1.0;
}

// 附录 G.3 第 1 步：王老板出事抽取（`rival` 子流，每日 4%）、跟价式两分支、价格战三日倒计时、第 100 天起的每周加压。
// 跟价式基准是「你昨日每斤价」——第 1 步时点存档里的 PricePerJin 正是上一日定版、街上还看着的那张价签。
export function morningRivals(state, rng) {
  if (!competitionOn(state)) return null;
  const C = COMPETITION;
  // 出事当周 P 降到 30、五天后回 55（正文 3.13；附录 G.3 的一行式没写五天，此处以正文与 F.6 为准）。
  // 抽取每天都做一次，缺席期抽中的结果作废——不让子流消耗次数随状态改变，同存档复现才只依赖种子。
  const miss = rng.chance(C.rivalMissPct, 'rival');
  if (state.rivalLowUntilDay > 0) {
    if (state.Day > state.rivalLowUntilDay) { state.rivalLowUntilDay = 0; state.RivalP = C.rivalP; } else state.RivalP = C.rivalPLow;
  } else if (miss) {
    state.RivalP = C.rivalPLow;
    state.rivalLowUntilDay = state.Day + C.rivalLowDays;
  }

  const pNew = clamp(state.PricePerJin * C.followCoef, C.followBand[0], C.followBand[1]);
  if (pNew < state.RivalPrice) state.RivalPrice = pNew;          // 你降价他三天内跟降
  // else 保持不变：你涨价他挂"还是老价钱"的牌子（3.13 两分支判定式写死）

  state.today.pricewarActive = state.PricewarDays > 0;
  if (state.PricewarDays > 0) state.PricewarDays -= 1;            // 附录 F.6：PricewarDays 第 1 步递减

  if (state.Day >= C.boostFromDay && (state.Day - C.boostFromDay) % C.boostEveryDays === 0) {
    // F.6 初值是 0，0 × 1.03 永远是 0，所以第一周直接落 1.03 而不是乘上去
    state.RivalAttrBoostWeeks = state.RivalAttrBoostWeeks > 0
      ? state.RivalAttrBoostWeeks * C.boostWeekMul : C.boostWeekMul;
  }
  return { RivalPrice: state.RivalPrice, RivalP: state.RivalP, pricewarActive: state.today.pricewarActive };
}

// 价格战三日内的改价用「你当日价」，而当日价要到第 5 步才定版，故这一段挂在定版之后（第 1 步那次只是将价签留在昨日内）。
export function priceWarReprice(state) {
  if (!competitionOn(state) || !state.today.pricewarActive) return null;
  const C = COMPETITION;
  state.RivalPrice = clamp(state.PricePerJin * C.warCoef, C.warBand[0], C.warBand[1]);
  return state.RivalPrice;
}

// 3.14 第 7b：A_i = P_i × G_i × 排队惯性_i × 分流系数_i；S =（本摊份额 ÷ 基准 0.25）钳 [0.6, 1.4]。
// 排队惯性吃昨日份额，故先取惯性再覆写 Share（Share 存的是"供次日排队惯性"的实际值，F.6 :438-439）。
// 吸引力式抽成 attractions()：第 7b 步落账用，附录 C 试算的「今日预估份额」共用同一条式子（全案不许出现两套吸引力）。
function attractions(state, selfPrice) {
  const weatherId = state.today.scenario.weather.id;
  const prices = [selfPrice, state.RivalPrice, ...RIVAL_INDIRECT.map(r => r.price)];
  const ps = [state.P, state.RivalP, ...RIVAL_INDIRECT.map(r => r.p)];
  const diverts = [1.0, 1.0, ...RIVAL_INDIRECT.map(r => divertCoef(r.id, weatherId))];
  const boost = [1.0, state.RivalAttrBoostWeeks > 0 ? state.RivalAttrBoostWeeks : 1.0, 1.0, 1.0];
  return ps.map((p, i) => p * rivalPriceCoef(prices[i]) * state.QueueInertia[i] * diverts[i] * boost[i]);
}

function shareOf(A) {
  const sum = A.reduce((s, x) => s + x, 0);
  return sum > 0 ? A.map(x => x / sum) : null;
}

// 附录 C 试算项「今日预估份额」：第 3 步手上只有今晨公布的价签 + 玩家此刻正选的定价档，
// 因此这一版不掷随机、不写回 Share/QueueInertia（落账是第 7b 步的动作）。
export function previewShare(state, selfPrice) {
  const share = shareOf(attractions(state, selfPrice));
  return share ? share[0] : COMPETITION.shareBase;
}

export function sharesAndS(state) {
  const C = COMPETITION;
  const A = attractions(state, state.PricePerJin);
  const share = shareOf(A) ?? state.Share.map(() => C.shareBase);
  const S = clamp((share[0] / C.shareBase), C.sBand[0], C.sBand[1]);
  // 附录 G.1：系数不取整——S、份额、惯性一律留原值，界面显示时再格式化
  state.QueueInertia = share.map(x => clamp(x / C.shareBase, C.inertiaBand[0], C.inertiaBand[1]));
  state.Share = share;
  return { S, A, share };
}

// 附录 F.6 `RivalSuppressedDays`（第 11 步）：你份额 ≥0.30 且王老板份额 ≤0.20 → +1，否则复位 0
export function tallySuppression(state) {
  if (!competitionOn(state)) { state.RivalSuppressedDays = 0; return state.RivalSuppressedDays; }
  const C = COMPETITION;
  const [self, rival] = state.Share;
  state.RivalSuppressedDays = self >= C.suppressSelfShare && rival <= C.suppressRivalShare
    ? state.RivalSuppressedDays + 1 : 0;
  return state.RivalSuppressedDays;
}

// 3.13「每天清晨玩家能看见三家的价签与昨日排队长度」：P 属传闻层不进面板（3.1 豁免条），这里只给公开的两项。
// 「份额 → 排队」的三档文案正文没给式子：分档点复用 5.3 已签的两个份额阈值（0.30 / 0.20），不新造数、不乘任何账，
// 纯呈现层；这三档词要不要、以及是否直接显示份额百分数，已登记待店主一句话。
export function streetBoard(state) {
  const shares = state.Share;
  const queueWord = s => (s >= 0.30 ? '排得长' : s >= 0.20 ? '有几个人' : '没什么人');
  return [
    { name: '王老板麻辣烫', price: state.RivalPrice, queue: queueWord(shares[1]) },
    ...RIVAL_INDIRECT.map((r, i) => ({ name: r.name, price: r.price, queue: queueWord(shares[2 + i]) })),
  ];
}
