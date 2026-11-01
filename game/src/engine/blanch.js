import { BLANCH, CONFIG } from '../data/constants.js';

// 正文 3.11 烫煮：碗下烫锅、熟度条扫过、绿区捞出 = 最佳（该单信号升一档）；早了夹生、晚了烫老（降一档）；
// 中心 66.5 的 ±3 以内记「最佳+」（该单留言升两档）。v4.6 修订写死：只作用于亲手单的单笔信号，不进 Q。
//
// 「档」的阶梯取的是过称已有的三条判定带（<90% 短斤 / 90–98% 正常 / ≥98% 足称，正文 :211 与附录 H.2）：
// 全案除了这三档没列举过第四个信号档，所以上下都夹在这条阶梯的两端——升两档到不了"比足称更好"，
// 降一档也出不了"比短斤更差"。这条字面读法有一处连带（烫得最佳会把一单短斤的嘀咕洗成正常），已登记回报。

export const SIGNAL_TIERS = ['short', 'normal', 'full'];

// 熟度条 0→100 匀速扫过、全程 4.0 秒：界面按秒表问一次「现在读到多少」，判定式不碰随机
export function blanchValueAt(elapsedSec) {
  const v = (elapsedSec / BLANCH.sweepSec) * 100;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

export function judgeBlanch(value) {
  if (value === undefined || value === null) return null;   // 没下手 = 不烫，信号不动（开关关着时全走这一支）
  if (Math.abs(value - BLANCH.center) <= BLANCH.centerBand) return { band: 'best', label: '最佳+', delta: 2 };
  if (value >= BLANCH.greenLow && value <= BLANCH.greenHigh) return { band: 'green', label: '最佳', delta: 1 };
  if (value < BLANCH.greenLow) return { band: 'under', label: '夹生', delta: -1 };
  return { band: 'over', label: '烫老', delta: -1 };
}

// 过称那一单本身的信号档（3.11 的三条判定带）
export function weighTier(result) {
  return result.short ? 0 : result.full ? 2 : 1;
}

// 该单点最终落在哪一档：烫煮关着时逐字等于过称档，一个数都不动
export function signalTier(result, value, on = CONFIG.blanch) {
  const base = weighTier(result);
  if (!on) return base;
  const judged = judgeBlanch(value);
  const t = base + (judged ? judged.delta : 0);
  return t < 0 ? 0 : t > 2 ? 2 : t;
}
