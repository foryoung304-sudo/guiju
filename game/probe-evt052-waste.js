// 裁定汇总 `f6a8ebf` §一（evt_d_052 按丙落地）的标定探针：`node probe-evt052-waste.js`。
// 单上把「昨日损耗偏高」的阈值点名交给 Yellow 按日报数据定（回声包第 18 行括注），所以这一档是自定数，登记进 delta §七十六。
// 事实源 = 已结算的 DailyReports 最后一格的 writeoffCents（第 12 步滚存；第 10 步晚间抽时那一格正是昨日），一格都不新存。
// 这里摊的是「昨日报损」在各线上的分布，以及几个候选阈值下 052 的入池率——它带 cooldown 3、weight 18，
// 判据太松就成了每三天一次的常客，太紧就永远抽不到（同批的 053 已经演示过「跑表测不到」是什么下场）。
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';

const SEEDS = [20261031, 7979, 12345, 4242, 90210];
const LINES = [...Object.entries(REF_STRATEGIES), ...Object.entries(STRATEGIES)];
const OPTS = {
  full: { labor: true, competition: true, eventScope: 'full' },
  m1: { labor: false, competition: false, eventScope: 'm1' },
};
const DAYS = 60;

const rows = [];
for (const scope of ['full', 'm1']) for (const [line, strat] of LINES) for (const seed of SEEDS) {
  const log = simulate(seed, DAYS, strat, 'headless', OPTS[scope]).log;
  // 「昨日报损」= 第 d 天傍晚看到的上一日那格；d=1 没有昨日，按 false 计（不参与分布）
  for (let i = 1; i < log.length; i++) rows.push({ scope, line, seed, day: log[i].day, waste: log[i - 1].writeoff, revenue: log[i].revenue });
}
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const waste = rows.map(r => r.waste);
console.log(`样本 ${rows.length} 格（${LINES.length} 线 × ${SEEDS.length} 种子 × 2 口径 × ${DAYS} 天，去掉每日第一格）`);
console.log(`昨日报损（元）最小 ${pct(waste, 0).toFixed(2)}｜p25 ${pct(waste, .25).toFixed(2)}｜中位 ${pct(waste, .5).toFixed(2)}｜p75 ${pct(waste, .75).toFixed(2)}｜p85 ${pct(waste, .85).toFixed(2)}｜p90 ${pct(waste, .9).toFixed(2)}｜p99 ${pct(waste, .99).toFixed(2)}｜最大 ${pct(waste, .999).toFixed(2)}`);
console.log(`零报损占比 ${(waste.filter(w => w === 0).length / waste.length * 100).toFixed(1)}%`);

for (const scope of ['full', 'm1']) {
  const sub = rows.filter(r => r.scope === scope).map(r => r.waste);
  console.log(`  ${scope}：中位 ${pct(sub, .5).toFixed(2)}｜p75 ${pct(sub, .75).toFixed(2)}｜p90 ${pct(sub, .9).toFixed(2)}`);
}
console.log('\n候选阈值 → 判据为真的格子占比（入池资格，不等于触发；还要过 cooldown 3 / weight 18 / 随机门）');
for (const t of [5, 10, 15, 20, 30, 40, 60, 80]) {
  const all = rows.filter(r => r.waste >= t).length / rows.length;
  const steady = rows.filter(r => r.waste >= t && (r.line === 'mid' || r.line === 'ref3')).length / rows.filter(r => r.line === 'mid' || r.line === 'ref3').length;
  console.log(`昨日报损 ≥ ${t} 元：全体 ${(all * 100).toFixed(1)}%｜稳线(mid/ref3) ${(steady * 100).toFixed(1)}%`);
}
