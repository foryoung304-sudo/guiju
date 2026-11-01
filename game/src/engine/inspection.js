import { INSPECTION, ALL_CATS } from '../data/constants.js';
import { SKU_BY_ID } from '../data/skus.js';
import { roundJin, takeFromCostPool } from './state.js';
import { recomputeStock } from './market.js';
import { receiptRate } from './shadow.js';

// 附录 E.6 / E.9 两条检查事件的共用判定（正文 :315 / :316 为权威）。
// 流程写死（正文 v4.8）：通知 → 玩家销毁决策 → 公式判定，全在同一晚，不掷随机。

// 无票库存：SP1 自家后厨汤底两边都不进（正文 :91 / 附录 D.1 的 receipt='excluded'），既不算无票也不算有票
function isTicketless(b) {
  const sku = SKU_BY_ID[b.sku];
  return sku.receipt !== 'excluded' && b.hasReceipt === 0;
}

// 附录 B 的库存资产值 = CostPool，所以销毁「按成本记」的计价口径与 COGS / 隔夜报损同源：
// 该品类池值 ×（无票斤数 ÷ 该品类在柜斤数）。不许按批次原值扣——批次按 FIFO 记、池子按当日加权均价出，
// 两者天然有差额，照批次原值扣会在现金桥上漏出等额的假差。
function ticketlessSplit(state) {
  const byCat = {};
  let cents = 0;
  for (const c of ALL_CATS) {
    const list = state.Batches.filter(b => b.cat === c && b.qty > 0);
    const total = list.reduce((s, b) => s + b.qty, 0);
    if (total <= 0) continue;
    const noTicket = list.filter(isTicketless).reduce((s, b) => s + b.qty, 0);
    if (noTicket <= 0) continue;
    const v = Math.round((state.CostPool[c] || 0) * noTicket / total);
    byCat[c] = { qty: roundJin(noTicket), cents: v };
    cents += v;
  }
  return { cents, byCat };
}

export function ticketlessCostCents(state) {
  return ticketlessSplit(state).cents;
}

// 销毁全部无票库存：扣实物 + 扣等额池值 + 记当日事件账的资产项（现金一分不动，正文 3.14 第 11 步）。
// 销毁比例 = 本次销毁的无票库存成本 ÷ 检查时点无票库存总成本；E.6 只给「全销毁 / 不销毁」两个按钮，
// 有票可销即 1，柜里没有无票货按原文取 0。
export function destroyTicketless(state) {
  const split = ticketlessSplit(state);
  if (Object.keys(split.byCat).length === 0) { state.today.eventDestroyedRatio = 0; return split.cents; }
  for (const c of Object.keys(split.byCat)) {
    takeFromCostPool(state, c, split.byCat[c].cents);
    state.Batches = state.Batches.filter(b => !(b.cat === c && isTicketless(b)));
  }
  recomputeStock(state);
  state.today.eventAssetLoss = (state.today.eventAssetLoss || 0) + split.cents;
  state.today.eventDestroyedRatio = 1;
  return split.cents;
}

// Score = 票据覆盖率 × 60 + 设施分（证件墙 25 / 用料展示柜 10，可加总）+ 销毁比例 × 15 − Risk × 0.3
// 覆盖率 = 近 30 天带票采购额 ÷ 近 30 天采购额（正文 :91，无采购取 1.0）；第 9 步刚写过 state.ReceiptRate，
// 这里现算同一式而不读缓存，免得两个时点哪天飘开
export function inspectionScore(state, destroyedRatio = 0) {
  const fac = Object.entries(INSPECTION.facScore)
    .reduce((s, [id, v]) => s + (state.Facilities.includes(id) ? v : 0), 0);
  return receiptRate(state) * 60 + fac + destroyedRatio * 15 - state.Risk * 0.3;
}

function note(state, text) {
  if (!state.today.notes.includes(text)) state.today.notes.push(text);
}

// Risk 清至某值 = 只降不升；分量作假池是 Risk 的子池，跟着一起钳（裁定 9a959bd §二）
function clearRiskTo(state, v) {
  if (state.Risk > v) state.Risk = v;
  state.RiskShort = Math.min(state.RiskShort, state.Risk);
}

function repDelta(state, d) {
  state.Rep = Math.max(0, Math.min(100, state.Rep + d));
}

// 附录 E 表前 :127 的 buff 字段约定：「持续 N 日的 D0 修正」一律 `d0_buff_mult` 新值乘入、`d0_buff_days` 取最大
function applyBuff(state, buff) {
  state.d0_buff_mult *= buff.mult;
  state.d0_buff_days = Math.max(state.d0_buff_days, buff.days);
}

// 大检查（E.6）：≥55 通过 / 35–55 整改 / <35 直接进结局判定 #1（翻车）
export function judgeBigInspection(state) {
  const score = inspectionScore(state, state.today.eventDestroyedRatio || 0);
  const out = { id: 'evt_s_insp', score: Math.round(score * 1000) / 1000, band: '',
    destroyedCents: state.today.eventAssetLoss || 0 };
  state.today.inspection = out;

  if (score >= INSPECTION.passAt) {
    out.band = 'pass';
    clearRiskTo(state, INSPECTION.riskAfterPass);
    note(state, '检查合格，严队长的记录本合上了。');
    return out;
  }

  if (score >= INSPECTION.rectifyAt) {
    out.band = 'rectify';
    if (state.Cash >= INSPECTION.rectifyFineCents) {
      state.Cash -= INSPECTION.rectifyFineCents;
      state.today.eventCashEvening -= INSPECTION.rectifyFineCents;
      applyBuff(state, INSPECTION.rectifyBuff);
      note(state, '检查整改：罚款 200 当场开单，明天客人少些。');
    } else if (INSPECTION.shortCashMode === 'buff') {
      applyBuff(state, INSPECTION.shortCashBuff);
      note(state, '检查整改：罚款没凑齐，记在明天的客人头上。');
    } else {
      // 'greyout' = §〇.1 第 8 条不签的走法（现金不足时整改档不落钱、也不给 buff，只落 Risk 与 Rep）
      note(state, '检查整改：限期整改。');
    }
    clearRiskTo(state, INSPECTION.riskAfterRectify);
    repDelta(state, INSPECTION.rectifyRep);
    return out;
  }

  out.band = 'crash';
  note(state, '检查不合格：封条贴上摊名了。');
  state.today.inspectionCrash = true;      // §六 #1 / 附录 G.4：Score < 35 当晚直接判翻车（第 11 步统一检查）
  return out;
}

// 例行检查（小，E.9）：同式、门槛 ≥40；未过 → 罚款 100（勘误批 a 项），现金不足改次日 D0 ×0.8 持续 2 日、不扣负。
// 首次触发即写 seen_routine_inspection → fac_cert（2,700 元）在置办面板上架
export function judgeRoutineInspection(state) {
  const score = inspectionScore(state, 0);
  const out = { id: 'evt_s_insp2', score: Math.round(score * 1000) / 1000, band: '', destroyedCents: 0 };
  state.today.inspection = out;

  if (score >= INSPECTION.routinePassAt) {
    out.band = 'pass';
    note(state, '抽查过了，票据夹里没挑出错。');
  } else {
    out.band = 'fine';
    if (state.Cash >= INSPECTION.routineFineCents) {
      state.Cash -= INSPECTION.routineFineCents;
      state.today.eventCashEvening -= INSPECTION.routineFineCents;
      note(state, '抽查未过：罚款 100 当场入账。');
    } else {
      applyBuff(state, INSPECTION.routineShortCashBuff);
      note(state, '抽查未过、罚款没凑齐：严队长摆摆手，明天客人少些。');
    }
    repDelta(state, INSPECTION.routineRep);
  }
  state.seen_routine_inspection = true;
  return out;
}

// 只读探针（回归与模拟核对用，不改账）
export function inspectionPreview(state) {
  return { score: inspectionScore(state, 0), ticketlessCents: ticketlessCostCents(state),
    rate: receiptRate(state) };
}
