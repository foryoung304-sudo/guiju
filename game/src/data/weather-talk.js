// 出摊页天气卡的「人话」词句表与组句规则（工单 `task-morning-trim-20261104` ＋ 裁定汇总 `f6a8ebf` §三）。
// 数字红线照风向工单：乘数、系数永不进界面，只给结论——本表把 `scenarioOf` 的现成系数翻成话，
// 派生只在渲染时算，不落盘、不新增状态字段、不改任何系数。
//
// 表序 = 工单「组句规则」的优先级：身份句（假期 / 考试周 / 开业）> 客流 > 品类，总数 ≤2 句，多的舍掉。
// 裁定 §三.1 之后，汤底不再是表里单独的一格：`T ≥ 1.4` 这个信号改**骑在品类句里顶替负片段**
//（雨天念作「粉面卖得俏，汤底走得快。」）。原来它排在末位、两格永远轮不到，等于整条规则空转（登记见 delta §七十四）。
// 裁定 §三.2 的另一改：假期身份句在场时压掉泛化客流句——「学校空了大半」本身就说尽了人少，
// 那一格留给品类。考试周不压（它的客流是高不是低，两句不冗余）。
// 「{品类}」位取现成 `CAT[c].name`（丸子、鲜肉、青菜、豆制品与菌菇、粉面），不另起一套名字。
import { CAT, SOLID_CATS } from './constants.js';

// 假期与汤底两道判据抽成常数：身份句与「压掉客流句」必须用同一个数，各写一份就会哪天飘一个。
const EPS = 1e-9;   // 两道判据与 catDeviation 共用这把尺（浮点毛刺的来龙去脉在 catDeviation 上方）
const HOLIDAY_TRAFFIC = 0.65;   // 正文 3.10 假期客流 0.6 × 天气 ≤1.0 ⇒ 恒成立
const SOUP_T = 1.4;             // 附录 D.4 雨天的汤底系数，也是工单词句表点名的那个阈值
export const isHoliday = sc => sc.trafficTotal <= HOLIDAY_TRAFFIC + EPS;
export const isSoup = sc => sc.T >= SOUP_T - EPS;

export const WEATHER_TALK = [
  { kind: '身份', hit: isHoliday, say: () => '放假了，学校空了大半。' },
  { kind: '身份', hit: sc => sc.avgJin <= 0.85, say: () => '考试周，学生吃得少些，备料悠着点。' },
  // 爬坡带照现行 RAMP_TABLE（`market.js:230`：RampDays 3/2/1 = 换档后头三天 ×0.4/×0.6/×0.8，第 4 天起 1.0）
  // ⇒ 这句只在 `RampDays > 0` 那三天出现；升档当刻 RampDays 重新置 3，所以新档形态的头三天也会再说一遍。
  { kind: '身份', hit: (sc, state) => state.RampDays > 0, say: () => '开业头几天，还没人知道你。' },
  { kind: '客流', hit: sc => sc.trafficTotal >= 1.15, say: () => '今儿人多。' },
  { kind: '客流', hit: sc => sc.trafficTotal <= 0.9, say: () => '今儿人少些。' },
  // 品类这一格是「一正一负拼一行」；汤底信号在场时，负的那半换成汤底片段（`catLine`）。
  { kind: '品类', hit: sc => !!(catDeviation(sc).hi || catDeviation(sc).lo || isSoup(sc)), say: null },
];

// 品类系数取「偏离 1 最大的一正一负」（阈值照工单：≥1.2 算俏、≤0.8 算剩）。
// EPS 不是凑数：0.8 与 1.2 在二进制里都是近似值，`0.8 - 1` 得 -0.19999999999999996、`1.2 - 1` 得 0.19999999999999996，
// 直接和 0.2 比会把雨天青菜、高温青菜这两条**正好卡在阈值上**的信号判成没达标（瘦身批第一版就这么漏掉了整句）。
// 同值并列按 `SOLID_CATS` 的声明顺序取第一个——裁定 §三.2 之后假期这一格真的会走到界面，
// 所以「五档同值只点名丸子」这条不再是纸面口径，登记在 delta §七十六。
export function catDeviation(sc) {
  let hi = null, lo = null;
  for (const c of SOLID_CATS) {
    const d = sc.catCoef[c] - 1;
    if (d >= 0.2 - EPS && (hi === null || d > hi.d)) hi = { cat: c, d };
    if (d <= -0.2 + EPS && (lo === null || d < lo.d)) lo = { cat: c, d };
  }
  return { hi, lo };
}

// 品类那一格：正片段在前，负片段在后；汤底在场时顶替负片段（`f6a8ebf` §三.1）。
// 没有正片段时汤底独占这一格——雨天假期就是这种形状（五档全 0.8，只有负号，负号被汤底顶掉）。
export function catLine(sc) {
  const { hi, lo } = catDeviation(sc);
  const name = c => CAT[c].name;
  if (hi && isSoup(sc)) return `${name(hi.cat)}卖得俏，汤底走得快。`;
  if (hi && lo) return `${name(hi.cat)}卖得俏，${name(lo.cat)}容易剩。`;
  if (hi) return `${name(hi.cat)}卖得俏。`;
  if (isSoup(sc)) return '汤底走得快。';
  if (lo) return `${name(lo.cat)}容易剩。`;
  return null;
}

// 出摊页真正拿到的两句（0～2 句）：先按表序取满两格，多的舍掉；假期在场时泛化客流句不占格。
export function weatherTalk(sc, state) {
  const holiday = isHoliday(sc);
  const picked = WEATHER_TALK
    .filter(row => row.hit(sc, state))
    .filter(row => !(holiday && row.kind === '客流'))
    .slice(0, 2);
  return picked.map(row => (row.kind === '品类' ? catLine(sc) : row.say())).filter(Boolean);
}
