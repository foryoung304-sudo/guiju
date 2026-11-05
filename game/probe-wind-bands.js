// 工单 `task-wind-panel-20261104` 验收段要求的标定探针：四行源字段的真实分布，用来定两道阈值并回报。
// 只看数，不写状态：全部读数从 `simulate()` 的已结算 log / state 里取，与渲染层无关。
// 用法：node probe-wind-bands.js
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { newGame } from './src/engine/state.js';
import { readVar } from './src/engine/dsl.js';

const SEEDS = [20261031, 7979, 12345, 4242, 90210];
const LINES = [...Object.entries(REF_STRATEGIES).map(([k, v]) => ['ref:' + k, v]), ...Object.entries(STRATEGIES).map(([k, v]) => ['ext:' + k, v])];
const OPTS = {
  full: { labor: true, competition: true, eventScope: 'full' },
  m1: { labor: false, competition: false, eventScope: 'm1' }
};
const DAYS = 120;
// 常客合计不在逐日 log 里：用「同一种子跑到第 N 天是同一串前缀」这条确定性，在 checkpoint 上取 state
const CHECKPOINTS = [1, 3, 7, 14, 30, 60, 120];

// 候选阈值（元/分/分值同原字段量纲：Rep 与 Risk 是 0–100 的现成值，AvgQ3 是品质均值，常客是四槽进度合计）
// 出品下界 45 不另估：那是 `evt_d_complaint` 权重条件里的 `MinQ3<45`（events.js:385），事件池已经拿 45 当「成色飘」的尺子，同一把尺子两处用。
// （blogger 的 65 是「探店」高线，拿来当日间及格线会把新档第一天直接读成忧。）
// 开局 state.Q = 50 这个常量必须落在中档，否则新档第一屏就宣布「有点飘」是假警报。
const T = { rep: [35, 60], q3: [45, 78], reg: [3, 9], risk: [20, 40] };
const bandOf = (v, [lo, hi]) => (v < lo ? 0 : v < hi ? 1 : 2);

const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const fmt = xs => `min ${q(xs, 0).toFixed(1)}｜p10 ${q(xs, .1).toFixed(1)}｜中位 ${q(xs, .5).toFixed(1)}｜p90 ${q(xs, .9).toFixed(1)}｜max ${q(xs, 1).toFixed(1)}`;

const pool = { ref: { rep: [], q3: [], risk: [], reg: [] }, ext: { rep: [], q3: [], risk: [], reg: [] } };
const seen = {};
for (const scope of ['full', 'm1']) {
  for (const [label, strat] of LINES) {
    const grp = label.startsWith('ref:') ? 'ref' : 'ext';
    for (const seed of SEEDS) {
      const log = simulate(seed, DAYS, strat, 'headless', OPTS[scope]).log;
      const avg3 = log.map((d, i) => log.slice(Math.max(0, i - 2), i + 1).reduce((s, x) => s + x.Q, 0) / Math.min(3, i + 1));
      const key = `${scope}｜${label}`;
      seen[key] = { rep: new Set(), q3: new Set(), reg: new Set(), risk: new Set(), days: { rep: [0, 0, 0], q3: [0, 0, 0], risk: [0, 0, 0] } };
      log.forEach((d, i) => {
        const vals = { rep: d.Rep, risk: d.Risk, q3: avg3[i] };
        for (const f of ['rep', 'risk', 'q3']) {
          pool[grp][f].push(vals[f]);
          const b = bandOf(vals[f], T[f]);
          seen[key][f].add(b); seen[key].days[f][b]++;
        }
      });
      for (const n of CHECKPOINTS) {
        const v = simulate(seed, n, strat, 'headless', OPTS[scope]).state.RegularStory.reduce((a, b) => a + b, 0);
        pool[grp].reg.push(v); seen[key].reg.add(bandOf(v, T.reg));
      }
    }
  }
}

console.log(`阈值候选：口碑 ${T.rep}｜出品 ${T.q3}｜熟客 ${T.reg}｜风声 ${T.risk}（三档＝ <lo ｜ lo..hi-1 ｜ >=hi）`);
for (const [g, name] of [['ref', '参考①②③＝正常打法'], ['ext', '极端三线']]) {
  console.log(`\n【${name}】Rep ${fmt(pool[g].rep)}\n  AvgQ3 ${fmt(pool[g].q3)}\n  Risk ${fmt(pool[g].risk)}\n  常客合计 ${fmt(pool[g].reg)}`);
}
console.log('\n逐线三档可达性（缺档＝死档；括号是各档天数）');
for (const [k, v] of Object.entries(seen)) {
  const miss = ['rep', 'q3', 'reg', 'risk'].filter(f => v[f].size < 3).map(f => ({ rep: '口碑', q3: '出品', reg: '熟客', risk: '风声' })[f] + [...v[f]].sort().join(''));
  console.log(`  ${k}: ${miss.length ? '⚠ 只有 ' + miss.join(' / ') : '四行三档全见'}  风声天数[${v.days.risk}] 口碑[${v.days.rep}] 出品[${v.days.q3}]`);
}

// 开局那一屏（新档未结算）：四行必须都落在「什么都没发生」的那一档，不许一上来就报忧
const g = newGame(SEEDS[0]);
const open = { 口碑: bandOf(g.Rep, T.rep), 出品: bandOf(readVar('AvgQ3', g), T.q3), 熟客: bandOf(g.RegularStory.reduce((a, b) => a + b, 0), T.reg), 风声: bandOf(g.Risk, T.risk) };
console.log(`\n开局四行档位（0＝第一档）：${Object.entries(open).map(([k, v]) => `${k}${v}`).join(' ')}｜源值 Rep ${g.Rep} AvgQ3 ${readVar('AvgQ3', g)} 常客 ${g.RegularStory} Risk ${g.Risk}`);

