// 裁定汇总 `f6a8ebf` §四（低价门槛 v2）第 1 步「先探针挑档」的复跑件：`node probe-cheap-unlock-v2.js`。
// 它不改任何在数代码，只把逐日「相对量」摊开——v2 的单日支口径 = **毛利 − 报损 + 试吃**（`ledger.js:35` 里去掉固定支出与人工那两项），
// 语义钉死为「今天买卖做砸了」而不是「今天倒霉」：固定支出与档位、人工脱钩，事件账本来就不进毛利/报损，不许往里掺。
// 通过线照裁定原文三条：① D3–D7 全线全种子普通日 0 命中；② 买卖砸穿日（报损压过毛利）仍可达；③ 稳线 mid/ref3 首周全日 0 命中。
// 「普通日」＝当日一张事件卡都没有、且有流水、事件账不为负（沿用 v1 探针的最严读法，两版口径要对得上）。
// 检查时点：解锁检查自 D3 晚起才跑 ⇒ 本探针的命中一律从 D3 起算（D1–D2 结构上不可能触发，不再靠阈值运气）。
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { EVENTS } from './src/data/events.js';

const KIND = Object.fromEntries(EVENTS.map(e => [e.id, e.kind]));
const SEEDS = [20261031, 7979, 12345, 4242, 90210];
const LINES = [...Object.entries(REF_STRATEGIES), ...Object.entries(STRATEGIES)];
const STEADY = new Set(['mid', 'ref3']);   // 裁定点名的两条稳线；cheap 是便宜线本身，不在「不许误触」之列
const THRESHOLDS = [0, -20, -40];          // 裁定给定的三档，挑通过者中最接近 0 的一档
const CUM = -120, DAYS = 60, WEEK = 7, FIRST_CHECK = 3;
const OPTS = {
  full: { labor: true, competition: true, eventScope: 'full' },
  m1: { labor: false, competition: false, eventScope: 'm1' },
};

const isOrdinaryDay = d => {
  const ids = [d.pre, d.morning, d.evening].filter(Boolean);
  return d.revenue > 0 && ids.length === 0 && (d.eventNet || 0) >= 0;
};
// 相对量：毛利 − 报损 + 试吃（试吃那格 sim 日志给的是份钱减样品成本的净额）
const relOf = d => d.gross - d.writeoff + (d.tasting || 0);
const isCrashDay = d => d.writeoff > d.gross;   // 「买卖砸穿」＝报损压过毛利

const runs = [];
for (const scope of ['full', 'm1']) {
  for (const [line, strat] of LINES) for (const seed of SEEDS) {
    const log = simulate(seed, DAYS, strat, 'headless', OPTS[scope]).log;
    let cum = 0, cumHit = null, minCum = Infinity;
    for (const d of log) {
      cum += d.netOps;
      if (cumHit === null && cum <= CUM) cumHit = d.day;
      minCum = Math.min(minCum, cum);
      d.rel = relOf(d);
    }
    runs.push({ scope, line, seed, cumHit, minCum, days: log });
    console.error(`· ${scope}｜${line} s${seed} 累计首撞（≤${CUM}）${cumHit === null ? ' never' : ' D' + cumHit}｜最低累计 ${minCum.toFixed(1)} 元`);
  }
}
const key = r => `${r.scope}｜${r.line}｜s${r.seed}`;
const tally = rows => `${rows.length} 天｜分布 ${new Set(rows.map(key)).size}/${runs.length} 局`;

console.log(`\n===== 单日支（相对量）三档挑档｜${runs.length} 局（${LINES.length} 线 × ${SEEDS.length} 种子 × 2 口径）× ${DAYS} 天`);
console.log('档 | ①D3–D7普通日 | ②砸穿日命中(D3起,60天) | ③稳线首周全日(D3–D7) | 稳线全窗 | 60天全窗普通日 | 判');
const verdicts = [];
for (const t of THRESHOLDS) {
  const ordWeek = [], crashAll = [], steadyWeek = [], steadyAll = [], ordAll = [];
  for (const r of runs) for (const d of r.days) {
    if (d.day < FIRST_CHECK) continue;
    const hit = d.rel <= t;
    if (!hit) continue;
    if (isCrashDay(d)) crashAll.push({ ...r, d });
    if (d.day <= WEEK && isOrdinaryDay(d)) ordWeek.push({ ...r, d });
    if (isOrdinaryDay(d)) ordAll.push({ ...r, d });
    if (STEADY.has(r.line)) { if (d.day <= WEEK) steadyWeek.push({ ...r, d }); steadyAll.push({ ...r, d }); }
  }
  // 砸穿日「可达」= 全体 60 天里至少存在一个报损压过毛利的日子，且其中至少一个在这档触发
  const crashExists = runs.reduce((s, r) => s + r.days.filter(d => d.day >= FIRST_CHECK && isCrashDay(d)).length, 0);
  const pass = ordWeek.length === 0 && steadyWeek.length === 0 && crashExists > 0 && crashAll.length > 0;
  verdicts.push({ t, pass, ordWeek: ordWeek.length, steadyWeek: steadyWeek.length, crash: crashAll.length, crashExists });
  console.log(`≤ ${t} 元 | ${tally(ordWeek)} | 存 ${crashExists} 触 ${crashAll.length} | ${tally(steadyWeek)} | ${tally(steadyAll)} | ${tally(ordAll)} | ${pass ? '通过' : '不过'}`);
}

const passing = verdicts.filter(v => v.pass).sort((a, b) => Math.abs(a.t) - Math.abs(b.t));
console.log(`\n判语：通过档 ${passing.map(v => v.t).join(' / ') || '（无）'}｜取最接近 0 的一档 = ${passing.length ? passing[0].t : '不落地（三档全不过 ⇒ 只落累计支）'} 元`);

console.log('\n===== 稳线（mid/ref3）D3–D7 相对量 ≤ −40 逐条——③ 的否证，也是「三档全不过」的那几个日子');
for (const r of runs) for (const d of r.days) {
  if (!STEADY.has(r.line) || d.day < FIRST_CHECK || d.day > WEEK || d.rel > -40) continue;
  const ids = [d.pre, d.morning, d.evening].filter(Boolean);
  console.log(`${key(r)} D${d.day} 相对量 ${d.rel.toFixed(1)}＝毛利 ${d.gross.toFixed(1)}−报损 ${d.writeoff.toFixed(1)}+试吃 ${(d.tasting || 0).toFixed(1)}`
    + `｜净额 ${d.netOps.toFixed(1)}｜流水 ${d.revenue.toFixed(1)} 售出 ${d.bowls} 碗｜卡 ${ids.join('+') || '无'}｜事件账 ${(d.eventNet || 0).toFixed(1)}｜砸穿 ${isCrashDay(d) ? '是' : '否'}`);
}

// 观察表（不是候选档）：裁定点名只有 {0, −20, −40} 三档可挑，这里只把更深档的三条判据摊开，给她下一次定档用；本批一个数也不落。
console.log('\n===== 观察：更深的单日档会不会同时过 ①②③（不在裁定三档内，仅摊数据）');
console.log('档 | ①D3–D7普通日 | ②砸穿触发 | ③稳线首周 | 稳线全窗 | 最深砸穿(全体) | 稳线最深');
for (const t of [-40, -60, -100, -150, -200, -250, -300]) {
  let ord = 0, crash = 0, steadyW = 0, steadyAll = 0;
  for (const r of runs) for (const d of r.days) {
    if (d.day < FIRST_CHECK || d.rel > t) continue;
    if (isCrashDay(d)) crash++;
    if (isOrdinaryDay(d)) { if (d.day <= WEEK) ord++; }
    if (STEADY.has(r.line)) { steadyAll++; if (d.day <= WEEK) steadyW++; }
  }
  const deepest = Math.min(...runs.flatMap(r => r.days.filter(d => d.day >= FIRST_CHECK && isCrashDay(d)).map(d => d.rel)));
  const steadyMin = Math.min(...runs.filter(r => STEADY.has(r.line)).flatMap(r => r.days.filter(d => d.day >= FIRST_CHECK).map(d => d.rel)));
  console.log(`≤ ${t} 元 | ${ord} | ${crash} | ${steadyW} | ${steadyAll} | ${deepest.toFixed(1)} | ${steadyMin.toFixed(1)}`);
}

console.log(`\n===== 累计支 ≤ ${CUM} 元 撞线日分布（r15 build，D3 起检）`);
for (const scope of ['full', 'm1']) {
  console.log(`—— 口径 ${scope}`);
  for (const r of runs.filter(x => x.scope === scope)) {
    const first3 = r.days.filter(d => d.rel <= THRESHOLDS[0] && d.day >= FIRST_CHECK);
    console.log(`${r.line}｜s${r.seed} | 累计首撞 ${r.cumHit === null ? 'never' : 'D' + r.cumHit} | 最低累计 ${r.minCum.toFixed(1)} | 相对量≤0 首撞 ${first3.length ? 'D' + first3[0].day : 'never'} 共 ${first3.length} 天`);
  }
}

console.log('\n===== 相对量≤0 的普通日逐条（这些是「买卖没砸穿却触发」的候选，必须为空）');
for (const r of runs) for (const d of r.days) {
  if (d.day >= FIRST_CHECK && d.day <= WEEK && d.rel <= 0 && isOrdinaryDay(d)) {
    console.log(`${key(r)} D${d.day} 相对量 ${d.rel.toFixed(1)}＝毛利 ${d.gross.toFixed(1)}−报损 ${d.writeoff.toFixed(1)}+试吃 ${(d.tasting || 0).toFixed(1)}｜净额 ${d.netOps.toFixed(1)}｜流水 ${d.revenue.toFixed(1)} 售出 ${d.bowls} 碗`);
  }
}
console.log('\n===== 稳线（mid/ref3）D3–D7 逐日相对量最小值');
for (const r of runs.filter(x => STEADY.has(x.line))) {
  const w = r.days.filter(d => d.day >= FIRST_CHECK && d.day <= WEEK);
  const mn = w.reduce((m, d) => (d.rel < m.d ? { d: d.rel, day: d.day } : m), { d: Infinity, day: 0 });
  console.log(`${key(r)} 最小 ${mn.d.toFixed(1)} 元 @D${mn.day}`);
}
