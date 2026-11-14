// 试算说明行（补条 guiju-playtest-fixbatch-addendum-20261110 §3，Orange 2026-11-10 晚定案）。
// 单上原话：「试算面板必须有一行说明，把今日估算的来路拆给玩家看，不许只给一个总数。格式钉死为一条链：
//   昨日实卖 X 碗 → 情境变化（写人话：考试周结束客流回落 / 雨天 / 平日无变化）→ 事件加成（有则写，如「食堂检修 +25%」；
//   含预定则写「含预定 N 碗」）→ 今日约 N 碗」
// 判例（店主 2026-11-10 晚原话）：「明明昨天卖的好好的还有利润，结果第二天客流还少了」——
// 昨日若是特殊日，今日回落是真的，但面板一个字不解释，玩家只觉得被惩罚。所以**估算比昨日低时必须点名拉低项**，
// 拉低项就是情境比时照实写，不许沉默。
//
// 三条护栏照呈现层那几块派生模块的老规矩：
// ① 只读引擎已经算好的公开派生量（ledger.js 的 display.parts），不在界面另立一套估算式；
// ② 不写回状态、不新增计数器、不碰判定与随机流，纯呈现派生、可在 Node 里直接 import 上针；
// ③ 乘数原值不进界面（裁定 f6a8ebf §三.4「全界面零系数」＋ 2026-11-11 裁定 8「乘数原值永不进界面」）——
//    情境/爬坡/定价/份额那几项一律翻成词句。事件加成那一格按补条 §3 钉死的举例出**百分比增减**（「+25%」），
//    不是乘数原值（1.25 永不进界面）；这一处读法已登记进 delta §一百零七 卡点请 Orange 确认。
import { CAT } from '../data/constants.js';

// 校历段切换的人话（from>to）。表里没有的组合走兜底句，不留静默格子。
const CAL_TALK = {
  'school>normal': '开学周过了，客流回落',
  'school>exam': '开学周过了，进考试周',
  'school>holiday': '开学周过了就放假，客流回落',
  'normal>school': '开学了，客流回来',
  'normal>exam': '进考试周，客流涨一些',
  'normal>holiday': '放假了，客流回落',
  'exam>school': '考试周结束，开学了',
  'exam>normal': '考试周结束，客流回落',
  'exam>holiday': '考试周结束就放假，客流大落',
  'holiday>school': '假期结束开学，客流回来',
  'holiday>normal': '假期结束，客流回来',
  'holiday>exam': '假期结束，进考试周',
};

// 天气段切换的人话。晴与阴的客流系数本来就一样，照实说「客流不变」，不许让玩家以为天气动了生意。
const WX_TALK = {
  'sunny>cloudy': '晴转阴，客流不变',
  'cloudy>sunny': '阴转晴，客流不变',
  'sunny>rain': '今儿雨天',
  'cloudy>rain': '今儿雨天',
  'heat>rain': '高温转雨天',
  'rain>sunny': '雨停了',
  'rain>cloudy': '雨停了',
  'rain>heat': '雨停了，今儿高温',
  'sunny>heat': '今儿高温',
  'cloudy>heat': '今儿高温',
  'heat>sunny': '高温过了',
  'heat>cloudy': '高温过了',
};

// 情境变化那一格：校历句 + 天气句，两段都没动就是单上举例的「平日无变化」。
export function scenarioTalk(sc, ySc) {
  if (!sc || !ySc) return '';
  const bits = [];
  if (sc.calendar.id !== ySc.calendar.id) {
    bits.push(CAL_TALK[`${ySc.calendar.id}>${sc.calendar.id}`] ?? `${ySc.calendar.name}过了，今儿${sc.calendar.name}`);
  }
  if (sc.weather.id !== ySc.weather.id) {
    bits.push(WX_TALK[`${ySc.weather.id}>${sc.weather.id}`] ?? `天气从${ySc.weather.name}转${sc.weather.name}`);
  }
  return bits.length ? bits.join('，') : '平日无变化';
}

// 拉低项的人话名。traffic 那一格不重念情境句——上一格已经照实写明了（「考试周结束，客流回落」），
// 这里再抄一遍就是同一句话两处口径；点名点到那一格即可，单上要求的「不许沉默」由上一格＋这一指认共同满足。
const PULL_TALK = {
  traffic: '上面那条情境变化',
  ramp: '开业那股热劲退了',
  price: '价签比昨天高',
  f: '摊上的家伙什',
  share: '对面摊子抢了客',
  nextDay: '昨天那件事的余波',
  buff: '提振的劲儿过了',
  event: '今儿这件事压了客流',
};
const PULL_ORDER = ['traffic', 'ramp', 'price', 'f', 'share', 'nextDay', 'buff', 'event'];
const NEAR_ONE = 0.999;   // 浮点尾巴不算拉低（净化口径同 §复现单：只清尾巴，不改判定）

function pullers(p) {
  return PULL_ORDER.filter(k => p[k] < NEAR_ONE).map(k => PULL_TALK[k]);
}

// 一条链，纯文本（HTML 由调用方包）。f = forecast.display，sc/ySc = 今日/昨日情境，evTitle = 采购前公示那条事件的短名。
export function forecastChain(f, sc, ySc, evTitle) {
  const p = f.parts;
  const need = Math.round(f.estBowls);
  const segs = [];
  const ratioForm = !!(p && p.ratioForm);
  if (ratioForm) {
    const y = Math.round(p.yBowls);
    // 追加 5 的卖断托底抬了锚，链上必须说出来，否则「昨日实卖 X → 今日约 N」两头对不上玩家自己会算的账
    segs.push(p.soldOutLift > 1
      ? `昨日实卖 ${y} 碗（卖断了，按昨日客流 ${Math.round(p.yD0)} 碗托底）`
      : `昨日实卖 ${y} 碗`);
    segs.push(scenarioTalk(sc, ySc));
  } else {
    segs.push('头一天没有昨日实卖，客流侧按开业基础量估');
  }
  const bonus = [];
  if (f.eventMult && f.eventMult !== 1) {
    const pct = Math.round((f.eventMult - 1) * 100);
    bonus.push(`${evTitle || '今儿这件事'} ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`);
  }
  if (p && p.buff > 1) bonus.push('提振的劲儿还在');
  if (f.reserveBowls > 0) bonus.push(`含预定 ${f.reserveBowls} 碗`);
  if (bonus.length) segs.push(bonus.join('，'));
  if (ratioForm && need < Math.round(p.yBowls)) {
    const pull = pullers(p);
    if (pull.length) segs.push(`拉低的是${pull.join('、')}`);
  }
  segs.push(`今日约 ${need} 碗`);
  return segs.filter(Boolean).join(' → ');
}

// 裁定 10（2026-11-11）：次日生效的惩罚必须双公示——事件当场那一行已由 choice-note.js 出（公开效果含次日项），
// 这里是第二处：次日试算说明行再带一句，不许玩家第二天开局才发现被砍。
// 只念**惩罚**那一侧（补条范围是「被砍」，增益不在本条要求内）；天数不报——各计数器递减时点不同
// （PricewarDays/CopycatDays/XiaodouAbsentDays 第 1 步减、R_frozen_days 第 9 步减、d0_buff_days 第 7 步减），
// 在采购时点报「还剩 N 天」会各差一天，当场那一行已经报过准确天数，这里只说今儿仍在生效。
export function nextDayNotes(state) {
  const t = state.today;
  const out = [];
  if (t.soupHalf) out.push('昨晚拿盆将就了：今儿汤底只能出一半的碗，上面「这一篮只够出」已经按减半算。');
  if (t.delist) out.push(`昨天那件事的余波：今儿${CAT[t.delist].name}全档下架，柜里的照卖。`);
  if (state.next_day_traffic_mult < 1) out.push('昨天那件事的余波：今儿来的人少些，上面「按今天客流要」已经算进去了。');
  if (state.d0_buff_days > 0 && state.d0_buff_mult < 1) out.push('这几天来的人都少些（前儿那件事的余波），上面「按今天客流要」已经算进去了。');
  if (t.pricewarActive) out.push('对面跟着降价，今儿还在降。');
  if (state.R_frozen_days > 0) out.push('老主顾这几天不再添人。');
  if (state.XiaodouAbsentDays > 0) out.push('小豆今儿不来帮厨。');
  if (t.copycatActive) out.push('山寨摊子今儿还在对面摆着。');
  return out;
}