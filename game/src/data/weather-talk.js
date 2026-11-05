// 出摊页天气卡的「人话」词句表与组句规则（工单 `task-morning-trim-20261104`，店主 2026-11-04 点选）。
// 数字红线照风向工单：乘数、系数永不进界面，只给结论——本表把 `scenarioOf` 的现成系数翻成话，
// 派生只在渲染时算，不落盘、不新增状态字段、不改任何系数。
//
// 表序 = 工单「组句规则」的优先级：身份句（假期 / 考试周 / 开业）> 客流 > 品类 > 汤底，总数 ≤2 句，多的舍掉。
// 这条顺序不是随手排的：工单自己给的示例（雨天 + 平稳期 ⇒「今儿人少些。粉面卖得俏，青菜容易剩。」）
// 只有在这个排法下才拼得出来——汤底若排在品类前面，那一屏的第二句会变成汤底句，与示例逐字对不上。
// 「{品类}」位取现成 `CAT[c].name`（丸子、鲜肉、青菜、豆制品与菌菇、粉面），不另起一套名字。
import { CAT, SOLID_CATS } from './constants.js';

export const WEATHER_TALK = [
  { kind: '身份', hit: sc => sc.trafficTotal <= 0.65, say: () => '放假了，学校空了大半。' },
  { kind: '身份', hit: sc => sc.avgJin <= 0.85, say: () => '考试周，学生吃得少些，备料悠着点。' },
  // 爬坡带照现行 RAMP_TABLE（`market.js:230`：RampDays 3/2/1 = 换档后头三天 ×0.4/×0.6/×0.8，第 4 天起 1.0）
  // ⇒ 这句只在 `RampDays > 0` 那三天出现；升档当刻 RampDays 重新置 3，所以新档形态的头三天也会再说一遍。
  { kind: '身份', hit: (sc, state) => state.RampDays > 0, say: () => '开业头几天，还没人知道你。' },
  { kind: '客流', hit: sc => sc.trafficTotal >= 1.15, say: () => '今儿人多。' },
  { kind: '客流', hit: sc => sc.trafficTotal <= 0.9, say: () => '今儿人少些。' },
  { kind: '品类', hit: sc => { const d = catDeviation(sc); return !!(d.hi || d.lo); }, say: null },
  { kind: '汤底', hit: sc => sc.T >= 1.4, say: () => '汤底走得快，多备两份。' },
];

// 品类系数取「偏离 1 最大的一正一负」（阈值照工单：≥1.2 算俏、≤0.8 算剩）。
// EPS 不是凑数：0.8 与 1.2 在二进制里都是近似值，`0.8 - 1` 得 -0.19999999999999996、`1.2 - 1` 得 0.19999999999999996，
// 直接和 0.2 比会把雨天青菜、高温青菜这两条**正好卡在阈值上**的信号判成没达标（本批第一版就这么漏掉了整句）。
// 同值并列按 `SOLID_CATS` 的声明顺序取第一个——这是自定口径，登记在 delta §七十四（假期五档同值时只会点名丸子）。
const EPS = 1e-9;
export function catDeviation(sc) {
  let hi = null, lo = null;
  for (const c of SOLID_CATS) {
    const d = sc.catCoef[c] - 1;
    if (d >= 0.2 - EPS && (hi === null || d > hi.d)) hi = { cat: c, d };
    if (d <= -0.2 + EPS && (lo === null || d < lo.d)) lo = { cat: c, d };
  }
  return { hi, lo };
}

// 品类那句 = 一正一负拼一行（工单示例里「粉面卖得俏，青菜容易剩。」是一句、不是两句）。
// 汤底句挤进这两格时舍掉负的那半（工单组句规则最后一句）。
function catLine(sc, soupShown) {
  const { hi, lo } = catDeviation(sc);
  const neg = soupShown ? null : lo;
  if (hi && neg) return `${CAT[hi.cat].name}卖得俏，${CAT[neg.cat].name}容易剩。`;
  if (hi) return `${CAT[hi.cat].name}卖得俏。`;
  if (neg) return `${CAT[neg.cat].name}容易剩。`;
  return null;
}

// 出摊页真正拿到的两句（0～2 句）：先按表序取满两格，再回头看汤底句在不在里面，定了才拼品类那句。
export function weatherTalk(sc, state) {
  const picked = WEATHER_TALK.filter(row => row.hit(sc, state)).slice(0, 2);
  const soupShown = picked.some(row => row.kind === '汤底');
  return picked.map(row => (row.kind === '品类' ? catLine(sc, soupShown) : row.say())).filter(Boolean);
}
