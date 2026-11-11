// 事件选择落地后当场那一行（施工单 guiju-playtest-fixbatch-20261110 丙8）。
// 三条护栏照呈现层那几块派生模块的老规矩：
// ① 只读**公开**效果（resolveChoice 真正入账的那一份 open），hidden / effect_hidden 一个字不许进这一层；
// ② 不写回状态、不新增计数器、不碰判定与随机流，纯呈现派生；
// ③ 系数不进界面（裁定 f6a8ebf §三.4「全界面零系数」）——乘数一律翻成词句，钱数与碗数照实报。
//    施工单丙8 举例里写的「次日客流 ×X.XX」与这条已签红线相撞，已由 2026-11-11 裁定 8 结案：
//    举例是 Orange 的笔误，已签红线胜过举例，反馈行人话版定版、乘数原值永不进界面，此项关闭不再议。
import { CAT } from '../data/constants.js';
import { depositCents } from '../engine/events.js';

const yuan = c => (c / 100).toFixed(2);
const money = c => `${c > 0 ? '+' : '−'}${yuan(Math.abs(c))} 元`;
const more = (m, yes, no) => (m > 1 ? yes : no);

// 与 events.js:177-178 同一支读法：玩家点下的选项不可用时引擎按没选走，auto_branch 命中第一条即该档，
// 两者都没有才吃事件本体的 open。这里照抄那一句的选择结果，不另立一套判定（回归有针钉这两处同形）。
export function resolvedOpenOps(ev, res) {
  const set = res.action || res.branch;
  return (set ? set.open : ev.open) || [];
}

// ops → 人话片段数组（顺序 = ops 顺序，一项一格）。空数组 = 这一选没有公开效果，屏上不出这一行。
// destroyCents 由调用方在**落地之前**取（销毁之后库存就没了，成本算不出来）；只有 destroyUnticketed 那一格用它。
export function choiceNote(state, ops, timing, destroyCents = 0) {
  const day = timing === 'morning' ? '今儿' : '明儿';
  const out = [];
  for (const op of ops || []) {
    if (op.cash) out.push(`现金 ${money(op.cash)}`);
    // E.5 定金：直接问引擎那一支（events.js depositCents），界面不自己算账
    if (op.deposit) out.push(`定金到账 ${yuan(depositCents(state, op.deposit))} 元`);
    // 「明日预定 N 碗」是施工单丙8 的逐字验收锚（evt_d_031 / evt_d_043），这一格不改口语词
    if (op.reserveBowls !== undefined) out.push(`${timing === 'morning' ? '今日' : '明日'}预定 ${op.reserveBowls} 碗`);
    if (op.nextDayTrafficMult !== undefined) out.push(`明儿来的人${more(op.nextDayTrafficMult, '多些', '少些')}`);
    if (op.eventDemandMult !== undefined) out.push(`${day}要出的碗数${more(op.eventDemandMult, '多些', '少些')}`);
    if (op.d0Buff) out.push(`往后 ${op.d0Buff.days} 天来的人${more(op.d0Buff.mult, '多些', '少些')}`);
    if (op.priceMultToday) out.push(`今儿${op.priceMultToday.cats.map(c => CAT[c].name).join('、')}进货价${more(op.priceMultToday.mult, '贵了些', '便宜了些')}`);
    if (op.pricewarDays !== undefined) out.push(`对面跟着降价，连着 ${op.pricewarDays} 天`);
    if (op.rFrozenDays !== undefined) out.push(`老主顾这 ${op.rFrozenDays} 天不再添人`);
    if (op.wageRaise) out.push(`小豆工钱每天多 ${yuan(op.wageRaise)} 元`);
    if (op.xiaodouAbsentDays !== undefined) out.push(`小豆${op.poached ? '被挖走，' : ''}${op.xiaodouAbsentDays} 天不来帮厨`);
    if (op.copycatDays !== undefined) out.push(`山寨摊子连着摆 ${op.copycatDays} 天`);
    if (op.delistNextDay) out.push(`明儿${CAT[op.delistNextDay].name}全档下架，柜里的照卖`);
    if (op.soupHalfNext) out.push('明儿汤底只能出一半的碗');
    if (op.destroyUnticketed) out.push(`无票的货销毁，按成本记 ${yuan(destroyCents)} 元（不动现金）`);
    // forcedComment / dayNote 不进这一行：那两格本来就是结算页的留言位与明账文字（events.js:135-138），
    // 在这里再念一遍就是同一句话两处口径。其余 op 一律「有哪项列哪项」，不留静默格子。
  }
  return out;
}