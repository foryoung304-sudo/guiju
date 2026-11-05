// 修订单 `task-cheap-unlock-revision-20261105`（`2e1e113`）第 1 步「首周探针」的复跑件。
// 它不接 `market.js` 那道闸，也不改任何在数代码：只把逐日经营净额摊开，量「撞线日落在哪一天、那一天是不是普通经营日」。
// 口径沿用裁定一（`sim.js:47` 只买玩家看得见的那面货架）；`full` = 有人工 + 有竞争 + 全事件池，`m1` = M1 构建口径。
// 用法：node probe-cheap-unlock.js [累计线(元)] [单日线(元)]     ｜  加 --sweep 改跑单日线扫档
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { EVENTS } from './src/data/events.js';

const KIND = Object.fromEntries(EVENTS.map(e => [e.id, e.kind]));
const SEEDS = [20261031, 7979, 12345, 4242, 90210];
const LINES = [...Object.entries(REF_STRATEGIES), ...Object.entries(STRATEGIES)];
const STEADY = new Set(['mid', 'cheap', 'ref3']);
const DAYS = 60, WEEK = 7;
const SWEEP = process.argv.includes('--sweep');
const CUM = Number(process.argv[2] ?? -120), DAILY = Number(process.argv[3] ?? -60);
const OPTS = {
  full: { labor: true, competition: true, eventScope: 'full' },
  m1: { labor: false, competition: false, eventScope: 'm1' }
};

// 「普通日」＝当日一张事件卡都没有、且有流水、事件账不为负——单上那句「无事件砸盘的正常经营日」按最严读法落地
function isOrdinaryDay(d) {
  const ids = [d.pre, d.morning, d.evening].filter(Boolean);
  return d.revenue > 0 && ids.length === 0 && (d.eventNet || 0) >= 0;
}
const tag = (d) => {
  if (d.revenue === 0) return '零流水';
  const ids = [d.pre, d.morning, d.evening].filter(Boolean);
  if (ids.some(i => KIND[i] === '坏事') || (d.eventNet || 0) < 0) return '事件砸盘';
  return ids.length ? '有卡未砸' : '普通日';
};

const runs = [];
for (const scope of ['full', 'm1']) {
  for (const [line, strat] of LINES) for (const seed of SEEDS) {
    const log = simulate(seed, DAYS, strat, 'headless', OPTS[scope]).log;
    let cum = 0, cumHit = null, minCum = Infinity;
    const hits = [];
    for (const d of log) {
      cum += d.netOps;
      if (cumHit === null && cum <= CUM) cumHit = d.day;
      minCum = Math.min(minCum, cum);
      if (d.netOps <= DAILY) hits.push({ ...d, scope, line, seed, cls: tag(d), ordinary: isOrdinaryDay(d), fixed: d.gross - d.writeoff - (d.labor || 0) - (d.tasting || 0) - d.netOps });
    }
    runs.push({ scope, line, seed, cumHit, minCum, hits, days: log });
  }
}

if (SWEEP) {
  console.log(`单日线扫档｜60 局（${LINES.length} 线 × ${SEEDS.length} 种子 × 2 口径）｜「普通日」＝当日零事件卡且有流水`);
  console.log('单日线 | 60天普通日命中天数 | 首周命中天数 | 命中局数/60 | 稳线(mid/cheap/ref3)命中局数 | 稳线首周命中局数');
  for (const t of [-60, -80, -100, -120, -150, -200, -260]) {
    let all = 0, wk = 0, rs = new Set(), sr = new Set(), sw = new Set();
    for (const r of runs) {
      const hs = r.days.filter(d => d.netOps <= t && isOrdinaryDay(d));
      if (!hs.length) continue;
      rs.add(`${r.scope}｜${r.line}｜${r.seed}`);
      all += hs.length;
      const w = hs.filter(h => h.day <= WEEK);
      wk += w.length;
      if (STEADY.has(r.line)) { sr.add(`${r.scope}｜${r.line}｜${r.seed}`); if (w.length) sw.add(`${r.scope}｜${r.line}｜${r.seed}`); }
    }
    console.log(`≤ ${t} 元 | ${all} | ${wk} | ${rs.size}/${runs.length} | ${sr.size} | ${sw.size}`);
  }
  process.exit(0);
}

for (const scope of ['full', 'm1']) {
  console.log(`\n===== 口径 ${scope}｜累计 ≤ ${CUM} 元 或 单日 ≤ ${DAILY} 元｜前 ${DAYS} 天（首周单列 D1–D${WEEK}）`);
  console.log('线｜种子 | 累计首撞 | 最低累计 | 首周单日命中(普通/砸盘/有卡未砸/零流水) | 60天同项');
  for (const r of runs.filter(x => x.scope === scope)) {
    const t = hs => {
      const c = { 普通日: 0, 事件砸盘: 0, 有卡未砸: 0, 零流水: 0 };
      hs.forEach(h => c[h.cls]++);
      return `${hs.length}(${c.普通日}/${c.事件砸盘}/${c.有卡未砸}/${c.零流水})`;
    };
    console.log(`${r.line}｜s${r.seed} | ${r.cumHit === null ? 'never' : 'D' + r.cumHit} | ${r.minCum.toFixed(1)} | 周 ${t(r.hits.filter(h => h.day <= WEEK))} | 全 ${t(r.hits)} | ` +
      r.hits.map(h => `D${h.day}:${h.cls}`).join(' '));
  }
}

const allHits = runs.flatMap(r => r.hits), weekHits = allHits.filter(h => h.day <= WEEK);
const tally = hs => { const c = {}; hs.forEach(h => { c[h.cls] = (c[h.cls] || 0) + 1; }); return Object.entries(c).map(([k, v]) => `${k} ${v}`).join('｜'); };
console.log(`\n===== 汇总（${runs.length} 局）`);
console.log(`首周 D1–D${WEEK}：单日 ≤ ${DAILY} 共 ${weekHits.length} 天 —— ${tally(weekHits)}`);
console.log(`${DAYS} 天全窗：共 ${allHits.length} 天 —— ${tally(allHits)}`);
const ordinary = allHits.filter(h => h.ordinary), ordWeek = ordinary.filter(h => h.day <= WEEK);
const key = h => `${h.scope}｜${h.line}｜${h.seed}`;
console.log(`最严「普通日」：${DAYS} 天 ${ordinary.length} 天，分布 ${new Set(ordinary.map(key)).size}/${runs.length} 局；首周 ${ordWeek.length} 天，分布 ${new Set(ordWeek.map(key)).size}/${runs.length} 局`);
console.log(`D1 命中 ${allHits.filter(h => h.day === 1).length} 天｜D2 命中 ${allHits.filter(h => h.day === 2).length} 天`);
console.log('\n—— 普通日命中逐条（净额＝毛利−报损−固定−人工+试吃）——');
for (const r of runs) for (const h of r.hits) if (h.ordinary) console.log(`${r.scope}｜${r.line} s${r.seed} D${h.day} 净额 ${h.netOps.toFixed(1)}＝毛利 ${h.gross.toFixed(1)}−报损 ${h.writeoff.toFixed(1)}−固定 ${h.fixed.toFixed(0)}−人工 ${(h.labor || 0).toFixed(0)}｜流水 ${h.revenue.toFixed(1)} 售出 ${h.bowls} 碗｜现金 ${h.cash.toFixed(0)}`);
