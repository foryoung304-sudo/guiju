// M3 数值门（正文 §八 `:357/:363` 的「全结局触发」+ 店主 2026-11-01 点名的三议题）
// node m3_reference.js [seeds=5] [days=120]
// 口径：完整版构建 = labor:true、competition:true、eventScope:'full'（人工/竞争/M2 事件池全在场）。
// 本脚本只测量、只回报，不改任何已签数值；烫煮线不在跑表里出段（sim.js 无熟度取值口径，第八批已登记）。
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { evalCondition } from './src/engine/dsl.js';
import { ENDING, RETIRE_NP_CENTS, HEARTBURN_WMAX_JIN, FACILITIES, BUYOUT_PRICE_CENTS } from './src/data/constants.js';

const SEEDS = [20261031, 7979, 12345, 4242, 90210];
const FULL = { buy: 'appc', labor: true, competition: true, eventScope: 'full' };
const END_NAME = { 0: '—', [ENDING.CRASH]: '翻车', [ENDING.BANKRUPT]: '破产', [ENDING.RULES]: '规矩立住',
  [ENDING.HEARTBURN]: '烧心大王', [ENDING.RETIRE]: '金盆洗手', [ENDING.MEDIOCRE]: '平庸收摊' };
const H_NEED = 18, L_NEED = 4;
const PRICES = ['qinmin', 'standard', 'signature'];
const SRC_NAME = { 1: '正经料', 2: '平价料', 3: '特价料' };
const PRICE_NAME = { qinmin: '亲民', standard: '标准', signature: '招牌' };

const f2 = x => (x >= 0 ? '+' : '') + x.toFixed(2);
const line = (w = 100) => '─'.repeat(w);
const run = (seed, strat, opt = {}) => simulate(seed, 120, strat, 'headless', { ...FULL, ...opt });

// 第一次满足某条件的日子（log 逐日读，读不到给 null）
const firstDay = (log, pred) => { const d = log.find(pred); return d ? d.day : null; };
const wmax = log => Math.max(...log.map(d => d.J));

// 末态读数：盘店四条结局的门槛项一次看全
function why(log) {
  const last = log.at(-1);
  return [`L ${last.L}`, `H ${last.H}`, `Wmax ${wmax(log).toFixed(3)}斤`, `C ${last.C}`,
    `NP ${f2(last.NP)}`, `Rep ${last.Rep}`, `Risk ${last.Risk}`].join('｜');
}

// 翻车（#1）的两条被动路径在逐日 log 上读不全：log 的 Risk 是当晚第 11 步之后（可能被检查清档）的值，
// 而 day.js:260 认 risk_100_pending「当日曾到」⇒ 死因改从末夜 state 直接读，不靠 log 反推
function deathCause(r) {
  const s = r.state;
  if (s.EndingId !== ENDING.CRASH) return '';
  if (s.risk_100_pending) return '｜死因 Risk 当日曾到 100（log 末值是被检查清档后的读数）';
  if (s.today?.inspectionCrash) return '｜死因 卫生大检查 Score<35';
  return '｜死因 未从末夜 state 读出（要查实现）';
}

function report(name, r, extra = '') {
  const log = r.log, last = log.at(-1);
  const crash = firstDay(log, d => d.Risk >= 100);
  const inspCrash = firstDay(log, d => d.insp && d.insp.band === 'crash');
  const riskPeak = Math.max(...log.map(d => d.Risk));
  const negRun = (() => {                       // 破产的实际成因：现金连负 3 天
    let run3 = 0;
    for (const d of log) { run3 = d.cash < 0 ? run3 + 1 : 0; if (run3 >= 3) return d.day; }
    return null;
  })();
  const hDay = firstDay(log, d => d.H >= H_NEED);
  const wDay = firstDay(log, d => d.J >= HEARTBURN_WMAX_JIN);
  const lDay = firstDay(log, d => d.L >= L_NEED);
  const facs = r.invests.filter(i => i.kind === 'facility');
  const stalls = r.invests.filter(i => i.kind === 'stall');
  console.log(`  ${name.padEnd(30, '　')}｜首结局 ${END_NAME[last.ending] || '未触发'} @ 第 ${last.day} 天` +
    `｜末态 ${why(log)}`);
  console.log(`      达标日：L≥${L_NEED} ${lDay ?? '未达'}｜H≥${H_NEED} ${hDay ?? '未达'}｜单日 J≥${HEARTBURN_WMAX_JIN}斤 ${wDay ?? '未达'}（峰值 ${wmax(log).toFixed(3)}）` +
    `｜Risk≥100 ${crash ?? '未破'}（账面峰值 ${riskPeak}）｜检查翻车 ${inspCrash ?? '无'}｜现金连负 3 天 ${negRun ?? '无'}${deathCause(r)}`);
  console.log(`      设施腿：${facs.length ? facs.map(i => `${i.to}@第${i.day}天(${i.price / 100}元)`).join(' ') : '一件没买'}` +
    `｜换档：${stalls.length ? stalls.map(i => `→${i.to}档@第${i.day}天`).join(' ') : '未换档'}｜末档 ${last.tier}${extra}`);
  return { name, ending: last.ending, day: last.day, lDay, hDay, wDay, crash, inspCrash, negRun, last, r };
}

console.log(`${line(100)}\nM3 数值门：完整版构建（人工 + 竞争 + M2 全事件池）120 天｜种子 ${SEEDS.join('/')}\n${line(100)}`);
console.log(`  盘店结局门槛（照正本读，不改）：#3 规矩立住 = 现金≥${BUYOUT_PRICE_CENTS / 100}元 & Rep≥75 & H≤10 & L≥${L_NEED}`);
console.log(`  #4 烧心大王 = H≥${H_NEED} & Wmax≥${HEARTBURN_WMAX_JIN}斤｜#5 金盆洗手 = NP≥${RETIRE_NP_CENTS / 100}元 & C≥5`);
console.log(`  无头线的 3/4/5 走 closeShop 合成式（序号取小），界面走 judgeBuyout，两轨不同（第七批已登记）`);

console.log(`\n【议题三】策略① 的首结局是不是「规矩立住」`);
for (const s of SEEDS.slice(0, 3)) report(`参考① 种子 ${s}`, run(s, REF_STRATEGIES.ref1, { additive: 'none' }));

console.log(`\n【参考②③ 同种子】`);
for (const s of SEEDS.slice(0, 3)) report(`参考② 种子 ${s}`, run(s, REF_STRATEGIES.ref2, { additive: 'none' }));
for (const s of SEEDS.slice(0, 3)) report(`参考③ 种子 ${s}`, run(s, REF_STRATEGIES.ref3, { additive: 'more' }));

console.log(`\n【议题一】烧心大王 #4 够不够得着：往 H 与 Wmax 冲的探针线（同三种子）`);
const hbProbes = [
  { label: '③ 全特价 + 多掺', strat: REF_STRATEGIES.ref3, opt: { additive: 'more' } },
  { label: '③ + 显多秤', strat: REF_STRATEGIES.ref3, opt: { additive: 'more', scale: true } },
  { label: '① + 显多秤（干净线靠秤）', strat: REF_STRATEGIES.ref1, opt: { additive: 'none', scale: true } },
  { label: '② + 显多秤 + 少掺', strat: REF_STRATEGIES.ref2, opt: { additive: 'less', scale: true } },
  { label: '③ + 试吃 10 份', strat: REF_STRATEGIES.ref3, opt: { additive: 'more', tasting: 10 } },
  { label: '平价 + 短斤 0.85 + 少掺', strat: { ...STRATEGIES.clean, tier: 2, price: 'standard', weigh: 0.85, buyFacilities: true, upgrade: true }, opt: { additive: 'less' } },
  { label: '正经 + 短斤 0.85（压 Risk 慢）', strat: { ...REF_STRATEGIES.ref1, weigh: 0.85 }, opt: { additive: 'none' } },
  { label: '极端 cheap 不带投资腿', strat: STRATEGIES.cheap, opt: { additive: 'more' } },
];
for (const p of hbProbes) for (const s of SEEDS.slice(0, 3)) report(`${p.label} 种子 ${s}`, run(s, p.strat, p.opt));

console.log(`\n【议题二】L 只靠设施的最坏路径：不买设施 vs 买设施，同一批种子`);
console.log(`  设施阶梯（附录 D.3，便宜到贵；每件 +1 L）：` +
  Object.values(FACILITIES).sort((a, b) => a.price - b.price)
    .map(f => `${f.id} ${f.price / 100}元 需[${f.unlock}]`).join('｜'));
const lProbes = [
  { label: '① 无投资腿（L 只能靠名场面）', strat: { ...REF_STRATEGIES.ref1, buyFacilities: false, upgrade: false, buyout: false }, opt: { additive: 'none' } },
  { label: '① 只买设施不换档不盘店', strat: { ...REF_STRATEGIES.ref1, upgrade: false, buyout: false }, opt: { additive: 'none' } },
  { label: '② 无投资腿', strat: { ...REF_STRATEGIES.ref2, buyFacilities: false, upgrade: false, buyout: false }, opt: { additive: 'none' } },
];
for (const p of lProbes) for (const s of SEEDS.slice(0, 3)) report(`${p.label} 种子 ${s}`, run(s, p.strat, p.opt));

// 最坏路径的瓶颈到底是「解锁条件没响」还是「钱不够」：末态现金 + 未买件数按两档分开数。
// 1.3 是 investPhase 的 `strategy.upgradeAt ?? 1.3` 兜底值（本探针不设 upgradeAt，所以取 1.3）
function facBlock(r) {
  const st = r.state, cushion = 1.3;
  const locked = [], poor = [];
  for (const f of Object.values(FACILITIES)) {
    if (st.Facilities.includes(f.id)) continue;
    (evalCondition(f.unlock, st) ? poor : locked).push(`${f.id}${evalCondition(f.unlock, st) ? `（要 ${f.price * cushion / 100} 元现金）` : ''}`);
  }
  return `｜末态现金 ${f2(st.Cash / 100)} 元｜未买件数 ${locked.length + poor.length}：` +
    `条件没响 ${locked.length ? locked.join(',') : '无'}｜条件响了但按 ×1.3 买不起 ${poor.length ? poor.join(',') : '无'}`;
}
console.log(`\n  「① 只买设施不换档不盘店」三场的置办面板末态（bought 之外每件按 D.3 的 unlock 现判）：`);
for (const s of SEEDS.slice(0, 3)) {
  const r = run(s, lProbes[1].strat, lProbes[1].opt);
  console.log(`    种子 ${String(s).padEnd(8)}：已买 ${r.state.Facilities.join(',') || '无'}${facBlock(r)}`);
}

console.log(`\n【六结局可达性总表】上面所有线 + 极端三线 × 五种子里，每个结局有没有落地过一次`);
const seen = {};
const allLines = [];
for (const [k, strat] of Object.entries(REF_STRATEGIES)) {
  for (const s of SEEDS) allLines.push([`${k}`, run(s, strat, { additive: k === 'ref3' ? 'more' : 'none' })]);
}
for (const p of hbProbes) for (const s of SEEDS) allLines.push([p.label, run(s, p.strat, p.opt)]);
for (const p of lProbes) for (const s of SEEDS) allLines.push([p.label, run(s, p.strat, p.opt)]);
for (const k of Object.keys(STRATEGIES)) for (const s of SEEDS) allLines.push([k, run(s, { ...STRATEGIES[k], buyFacilities: true, upgrade: true, buyout: true }, { additive: 'more' })]);
for (const [name, r] of allLines) {
  const e = r.log.at(-1).ending;
  if (!e) continue;
  (seen[e] ||= []).push(`${name}@第${r.log.at(-1).day}天`);
}
for (const id of [1, 2, 3, 4, 5, 6]) {
  const hits = seen[id] || [];
  console.log(`  ${hits.length ? '✓' : '⊘'} #${id} ${END_NAME[id].padEnd(6, '　')}落地 ${hits.length} 次` +
    `${hits.length ? `｜最早 ${hits.slice(0, 3).join(' ')}` : '（本批探针线里一次都没出现）'}`);
}
console.log(`\n  探针线合计 ${allLines.length} 场（120 天上限）。⊘ 不记红：可能是范围缺口（内容没接）也可能是门槛真的够不着，读上面各段的达标日自己判。`);

// ── 追加段：把上面 ⊘ 与早死两条问到底 ────────────────────────────
console.log(`\n${line(100)}\n【A】参考① 五种子逐场（议题三：首结局是不是「规矩立住」）\n${line(100)}`);
const ref1All = SEEDS.map(s => [s, run(s, REF_STRATEGIES.ref1, { additive: 'none' })]);
for (const [s, r] of ref1All) report(`① 种子 ${s}`, r);

console.log(`\n【B】① 早死线的死因逐日（破产那两场的第 1–16 天；netOps = 经营净额、ev = 事件账净额）`);
for (const [s, r] of ref1All) {
  if (r.log.at(-1).ending !== ENDING.BANKRUPT) continue;
  console.log(`  种子 ${s}（破产 @ 第 ${r.log.at(-1).day} 天）：`);
  for (const d of r.log.slice(0, 16)) {
    console.log(`    第 ${String(d.day).padStart(3)} 天 ${d.weather.padEnd(6, ' ')} 档${d.tier} 进 ${f2(d.bought).padStart(9)} 流水 ${f2(d.revenue).padStart(9)}` +
      ` 净额 ${f2(d.netOps).padStart(9)} 事件 ${f2(d.eventNet).padStart(8)} 现金 ${f2(d.cash).padStart(10)} 欠款 ${f2(d.debt).padStart(8)}` +
      `｜事件 ${d.morning ?? '—'}/${d.evening ?? '—'}`);
  }
  const evSum = r.log.reduce((a, d) => a + d.eventNet, 0);
  const worst = [...r.log].sort((a, b) => a.eventNet - b.eventNet)[0];
  const stallsB = r.invests.filter(i => i.kind === 'stall');
  console.log(`    换档账：${stallsB.length ? stallsB.map(i => `第 ${i.day} 天 ${i.to - 1}→${i.to} 档花 ${i.price / 100} 元；时点现金 ${f2(i.cashAt / 100)} → 剩 ${f2(i.cashAfter / 100)}（不变式要 ≥${f2(i.price * 1.3 / 100)}，${i.cashAt >= i.price * 1.3 ? '成立' : '破了'}）`).join('；') : '未换档'}`);
  console.log(`    事件账累计 ${f2(evSum)} 元｜单日最狠一笔 ${f2(worst.eventNet)}（第 ${worst.day} 天 ${worst.evening ?? worst.morning ?? '—'}）` +
    `｜缩量 ${r.log.filter(d => d.shortBuy).length} 天｜空篮 ${r.log.filter(d => d.starved).length} 天`);
}

console.log(`\n【C】让步维度（店主点名的「两条让步线」）：同一线 yieldAll 开/关 × 三种子`);
for (const key of ['ref1', 'ref2', 'ref3']) {
  for (const yieldAll of [true, false]) {
    for (const s of SEEDS.slice(0, 3)) {
      const strat = { ...REF_STRATEGIES[key], yieldAll };
      report(`${key} 让步=${yieldAll ? '全让' : '硬顶'} 种子 ${s}`, run(s, strat, { additive: key === 'ref3' ? 'more' : 'none' }));
    }
  }
}

console.log(`\n【D】#4 与 #5 的抢跑结构（H 单调累加、C 会被 Q≥85 抵扣 0.5/日 ⇒ 脏线先撞 #4；序号取小 ⇒ #5 被吃）`);
const grid = [];
for (const tier of [1, 2, 3]) for (const price of PRICES) for (const weigh of [1.0, 0.97, 0.92, 0.85]) {
  for (const s of SEEDS.slice(0, 2)) {
    const strat = { key: 'g', name: '', tier, price, weigh, yieldAll: true, buyFacilities: true, upgrade: true, buyout: true };
    const r = run(s, strat, { additive: weigh < 1 ? 'less' : 'none' });
    const log = r.log, last = log.at(-1);
    const hDay = firstDay(log, d => d.H >= H_NEED && d.J >= HEARTBURN_WMAX_JIN);      // #4 同日两条件
    const cDay = firstDay(log, d => d.C >= 5 && d.NP >= RETIRE_NP_CENTS / 100);       // #5 同日两条件
    const facsBy = log.find(d => d.L >= L_NEED);
    const facCountAtL = facsBy ? r.invests.filter(i => i.kind === 'facility' && i.day <= facsBy.day).length : null;
    grid.push({ tag: `${SRC_NAME[tier]}/${PRICE_NAME[price]}/短斤${(1 - weigh).toFixed(2)}/${s}`,
      ending: last.ending, day: last.day, hDay, cDay, lDay: facsBy?.day ?? null,
      fac: facCountAtL, story: facsBy ? facsBy.L - facCountAtL : null, wmax: wmax(log), last, log });
  }
}
for (const g of grid) {
  console.log(`  ${g.tag.padEnd(34, ' ')}｜首结局 ${END_NAME[g.ending] || '未触发'} @${g.day}天` +
    `｜#4 同日达标 ${g.hDay ?? 'never'}｜#5 同日达标 ${g.cDay ?? 'never'}` +
    `｜L≥${L_NEED} @${g.lDay ?? 'never'}（设施 ${g.fac ?? '—'} 件 + 名场面 ${g.story ?? '—'} 笔）｜Wmax ${g.wmax.toFixed(1)}斤 末态 C ${g.last.C} H ${g.last.H}`);
}
const byEnd = {};
for (const g of grid) (byEnd[`${g.ending || '未触发'}`] ||= []).push(g.tag);
console.log(`\n  网格 ${grid.length} 场的结局分布：` +
  Object.entries(byEnd).map(([e, t]) => `${END_NAME[e] || e} ${t.length} 场`).join('｜'));
console.log(`  #5 同日达标过的场：${(grid.filter(g => g.cDay).map(g => `${g.tag}@${g.cDay}天→实得 ${END_NAME[g.ending] || '无'}`)).join('｜') || '无（一场都没有）'}`);
console.log(`  #6 口径提醒：跑表按附录 G.4「判空即过」刻意不吃 #6（sim.js 的 investPhase 里 e !== ENDING.MEDIOCRE 才落），`);
console.log(`  所以 #6 的 ⊘ 是跑表口径、不是不可达——界面那颗「不干了」恒可点。变体那句（Rep≥60 且 NP≥90,000）的门槛日在下面逐场给。`);
for (const [s, r] of ref1All) {
  const v = firstDay(r.log, d => d.Rep >= 60 && d.NP >= 90000);
  console.log(`    ① 种子 ${s}：#6 变体门槛（Rep≥60 且 NP≥90,000）最早 @ 第 ${v ?? '120 天未达'} 天`);
}

console.log(`\n【E】给 #5 一次专门的机会：把 #4 的另一条腿（Wmax≥210 斤）断掉，看金盆洗手够不够得着`);
console.log(`  做法 = 摊位不换档（一直停在档1 或档2，单日出菜斤数天花板本来就低于 210，#4 的另一条腿断掉），货源按正经/平价，脏只靠短斤（C/H += 0.2/单），NP 要攒到 300,000 元。`);
const five = [];
for (const tier of [1, 2]) for (const weigh of [0.92, 0.85]) for (const price of ['signature', 'standard']) {
  for (const s of SEEDS.slice(0, 2)) {
    const strat = { key: 'f5', name: '', tier, price, weigh, yieldAll: true,
      buyFacilities: true, upgrade: false, buyout: true };
    const r = run(s, strat, { additive: 'none' });
    const log = r.log, last = log.at(-1);
    const cDay = firstDay(log, d => d.C >= 5);
    five.push({ tag: `${SRC_NAME[tier]}/${PRICE_NAME[price]}/短斤${(1 - weigh).toFixed(2)}/${s}`, ending: last.ending,
      day: last.day, cDay, npDay: firstDay(log, d => d.NP >= 300000), wmax: wmax(log), last });
  }
}
for (const g of five) {
  console.log(`  ${g.tag.padEnd(32, ' ')}｜首结局 ${END_NAME[g.ending] || '未触发'} @${g.day}天` +
    `｜C≥5 @${g.cDay ?? 'never'}｜NP≥300,000 @${g.npDay ?? 'never'}（末态 NP ${f2(g.last.NP)}）` +
    `｜Wmax ${g.wmax.toFixed(1)}斤${g.wmax >= HEARTBURN_WMAX_JIN ? ' ← 还是过了 210，#4 那条腿断不掉' : ''}｜末态 C ${g.last.C} H ${g.last.H} Rep ${g.last.Rep}`);
}
console.log(`  这一组里 #5 落地场次：${five.filter(g => g.ending === ENDING.RETIRE).length}／${five.length}`);

// 界面轨判定：七批已把 #3/#4/#5 拆到三个动作门上（judgeBuyout / judgeRetire / quitVariant），
// 无头线的 closeShop 仍是"序号取小"的合成式 ⇒ #5 被 #4 吃掉是**跑表口径**，不是界面口径。
// 本段逐日只判各结局自己的门槛式（附录 G.4），看门有没有开过，不看谁先按。
console.log(`\n【F】界面轨：逐日判各结局自己的门槛式（不套序号取小），看六道门各开过几次`);
const gates = lines => {
  const open = { 3: null, 4: null, 5: null, 6: null };
  let wm = 0;
  for (const d of lines.log) {
    wm = Math.max(wm, d.J);
    if (!open[3] && d.cash >= BUYOUT_PRICE_CENTS / 100 && d.Rep >= 75 && d.H <= 10 && d.L >= L_NEED) open[3] = d.day;
    if (!open[4] && d.H >= H_NEED && wm >= HEARTBURN_WMAX_JIN) open[4] = d.day;
    if (!open[5] && d.C >= 5 && d.NP >= RETIRE_NP_CENTS / 100) open[5] = d.day;
    if (!open[6] && d.Rep >= 60 && d.NP >= 90000) open[6] = d.day;
  }
  return open;
};
const fLines = [];
for (const tier of [1, 2, 3]) for (const price of PRICES) for (const weigh of [1.0, 0.85]) for (const s of SEEDS.slice(0, 2)) {
  fLines.push({ tag: `${SRC_NAME[tier]}/${PRICE_NAME[price]}/短斤${(1 - weigh).toFixed(2)}/${s}`,
    r: run(s, { key: 'x', name: '', tier, price, weigh, yieldAll: true, buyFacilities: true, upgrade: true, buyout: true },
      { additive: weigh < 1 ? 'less' : 'none' }) });
}
for (const tier of [1, 2]) for (const price of ['signature', 'standard']) for (const weigh of [0.92, 0.85]) for (const s of SEEDS.slice(0, 2)) {
  fLines.push({ tag: `${SRC_NAME[tier]}/${PRICE_NAME[price]}/短斤${(1 - weigh).toFixed(2)}/${s}(不换档)`,
    r: run(s, { key: 'x', name: '', tier, price, weigh, yieldAll: true, buyFacilities: true, upgrade: false, buyout: true },
      { additive: 'none' }) });
}
const openCount = { 3: 0, 4: 0, 5: 0, 6: 0 };
for (const f of fLines) {
  if (!f.r) continue;
  const o = gates(f.r);
  for (const k of [3, 4, 5, 6]) if (o[k]) openCount[k]++;
  if (o[5] || o[4]) console.log(`  ${f.tag.padEnd(32, ' ')}｜#3 门开 @${o[3] ?? '—'}｜#4 门开 @${o[4] ?? '—'}｜#5 门开 @${o[5] ?? '—'}｜#6 变体门开 @${o[6] ?? '—'}｜实得 ${END_NAME[f.r.log.at(-1).ending] || '未触发'}@${f.r.log.at(-1).day}`);
}
const n = fLines.filter(f => f.r).length;
console.log(`\n  界面轨门槛式开过门的场次（共 ${n} 场）：#3 ${openCount[3]} 场｜#4 ${openCount[4]} 场｜#5 ${openCount[5]} 场｜#6 变体 ${openCount[6]} 场`);
console.log(`  读法：门开过 = 玩家在那个动作门上那一刻满足条件；#5 若只被跑表的序号取小吃掉，那是跑表口径问题（第七批已登记两轨不同）。`);
// #5 离门槛到底差多远：两件事各测一个极值（C≥5 期间的最大 NP、NP 最大时的 C），全量取最好的那场
let bestNP = -Infinity, bestNPTag = '', bestC = -Infinity, bestCTag = '', bestBoth = -Infinity, bestBothTag = '';
const allProbe = [];
for (const tier of [1, 2, 3]) for (const price of PRICES) for (const weigh of [1.0, 0.85]) for (const up of [true, false]) {
  for (const s of SEEDS.slice(0, 3)) {
    allProbe.push({ tag: `${SRC_NAME[tier]}/${PRICE_NAME[price]}/短斤${(1 - weigh).toFixed(2)}/${up ? '换档' : '不换'}/${s}`,
      log: run(s, { key: 'x', name: '', tier, price, weigh, yieldAll: true, buyFacilities: true, upgrade: up, buyout: true },
        { additive: weigh < 1 ? 'less' : 'none' }).log });
  }
}
for (const p of allProbe) {
  const dirty = p.log.filter(d => d.C >= 5);
  if (dirty.length) {
    const mx = dirty.reduce((a, d) => (d.NP > a.NP ? d : a));
    if (mx.NP > bestNP) { bestNP = mx.NP; bestNPTag = `${p.tag} @第${mx.day}天（C ${mx.C}）`; }
    const mb = dirty.reduce((a, d) => (d.C > a.C ? d : a));
    if (mb.C > bestC) { bestC = mb.C; bestCTag = `${p.tag} @第${mb.day}天（NP ${f2(mb.NP)}）`; }
  }
  const rich = p.log.filter(d => d.NP >= 300000);
  if (rich.length) {
    const mc = rich.reduce((a, d) => (d.C > a.C ? d : a));
    if (mc.C > bestBoth) { bestBoth = mc.C; bestBothTag = `${p.tag} @第${mc.day}天`; }
  }
}
console.log(`\n  #5 距离实测（探针 ${allProbe.length} 场，含换档/不换档两条规模）：`);
console.log(`    C≥5 期间见过的最大 NP = ${f2(bestNP)} 元（${bestNPTag || '无'}）｜门槛 300,000 元 → 差 ${f2(300000 - bestNP)} 元`);
console.log(`    NP≥300,000 期间见过的最大 C = ${bestBoth === -Infinity ? '（没有任何一场 NP 到过 30 万）' : bestBoth}（${bestBothTag}）｜门槛 C≥5`);
console.log(`    全场最大 C = ${bestC}（${bestCTag}）`);

console.log(`\n【G】长线外推（结局触发制「没有最后一天」）：脏线不换档一直卖，NP 到底能不能爬到 30 万`);
for (const [tag, strat, opt] of [
  ['平价料/招牌/短斤0.15/不换', { key: 'g', name: '', tier: 2, price: 'signature', weigh: 0.85, yieldAll: true, buyFacilities: true, upgrade: false, buyout: true }, { additive: 'less' }],
  ['平价料/标准/短斤0.15/不换', { key: 'g', name: '', tier: 2, price: 'standard', weigh: 0.85, yieldAll: true, buyFacilities: true, upgrade: false, buyout: true }, { additive: 'less' }],
]) {
  for (const s of SEEDS.slice(0, 2)) {
    const r = simulate(s, 300, strat, 'headless', { ...FULL, ...opt });
    const at = n => r.log[Math.min(n, r.log.length) - 1];
    const gate5 = firstDay(r.log, d => d.C >= 5 && d.NP >= 300000);
    console.log(`  ${tag} 种子 ${s}｜跑到第 ${r.log.at(-1).day} 天（结局 ${END_NAME[r.log.at(-1).ending] || '未触发'}）` +
      `｜NP：120 天 ${f2(at(120).NP)} → 180 天 ${f2(at(180).NP)} → 240 天 ${f2(at(240).NP)} → 300 天 ${f2(at(300).NP)}` +
      `｜#5 门开 @${gate5 ?? '300 天内不开'}｜第 100 天后 Risk ${at(100).Risk}→${at(300).Risk}、现金 ${f2(at(100).cash)}→${f2(at(300).cash)}`);
  }
}

console.log(`\n【H】正文 :142 / :358 的 M3 验收项逐条判定（完整版，5 种子 × 三条参考线；· = 成立，✗ = 不成立）`);
const gate3 = {};
for (const key of ['ref1', 'ref2', 'ref3']) {
  gate3[key] = SEEDS.map(s => [s, run(s, REF_STRATEGIES[key], { additive: key === 'ref3' ? 'more' : 'none' })]);
}
for (const key of ['ref1', 'ref2', 'ref3']) {
  console.log(`  ${REF_STRATEGIES[key].name}`);
  for (const [s, r] of gate3[key]) {
    const log = r.log, last = log.at(-1);
    const first14 = log.slice(0, 14).reduce((a, d) => a + d.netOps, 0);
    const stalls = r.invests.filter(i => i.kind === 'stall');
    const turn = stalls.length ? stalls[0].cashAfter / 100 : null;
    const risk70 = firstDay(log, d => d.Risk >= 70);
    const verdict = [];
    if (key === 'ref1') {
      verdict.push(`${first14 > 0 ? '·' : '✗'} 前 14 天经营净额为正（${f2(first14)}）`);
      verdict.push(`${turn === null ? '✗' : (turn >= 300 ? '·' : '✗')} 首次升级后周转 ≥300（${turn === null ? '从未升级' : f2(turn)}）`);
      verdict.push(`${last.ending === ENDING.RULES ? '·' : '✗'} 首结局 = 规矩立住（实得 ${END_NAME[last.ending] || '未触发'}@${last.day}）`);
    } else if (key === 'ref2') {
      const ref1Same = gate3.ref1.find(x => x[0] === s)[1].log.at(-1);
      verdict.push(`${!ref1Same.ending ? '⊘' : (last.day > ref1Same.day ? '·' : '✗')} 首结局晚于策略①（① ${ref1Same.ending ? `第${ref1Same.day}天` : '120 天无结局'}／② ${last.ending ? `第${last.day}天` : '120 天无结局'}）`);
      verdict.push(`${last.ending ? '·' : '✗'} 120 天内触发结局（末态 NP ${f2(last.NP)}、L ${last.L}、Rep ${last.Rep}、C ${last.C}）`);
    } else {
      const riskNote = risk70 ?? `跑到第 ${log.length} 天就收线（末态 Risk ${last.Risk}），40 天窗口没走完`;
      verdict.push(`${risk70 !== null && risk70 <= 40 ? '·' : '✗'} Risk 第 40 天内破 70（${riskNote}）`);
      verdict.push(`${[ENDING.CRASH, ENDING.RETIRE, ENDING.HEARTBURN].includes(last.ending) ? '·' : '✗'} 首结局落在翻车/金盆洗手/烧心大王（实得 ${END_NAME[last.ending] || '未触发'}@${last.day}）`);
    }
    console.log(`    种子 ${String(s).padEnd(8)}：${verdict.join('　')}`);
  }
}
console.log(`  正文 :358 还有一条独立验收：六条策略线（参考 3 + 极端 3）逐条在 120 天内触发至少一个结局（极端三线按总表口径带投资腿 + 多掺）`);
const investLegs = { buyFacilities: true, upgrade: true, buyout: true };
const sixLines = [
  ...['ref1', 'ref2', 'ref3'].map(k => [REF_STRATEGIES[k].name, REF_STRATEGIES[k], k === 'ref3' ? 'more' : 'none']),
  ...Object.values(STRATEGIES).map(s => [`${s.name}（极端线 + 投资腿）`, { ...s, ...investLegs }, 'more']),
];
for (const [name, strat, add] of sixLines) {
  const ends = SEEDS.map(s => { const l = run(s, strat, { additive: add }).log.at(-1);
    return { day: l.day, txt: `${s} ${END_NAME[l.ending] || '未触发'}@${l.day}`, hit: !!l.ending }; });
  const n = ends.filter(e => !e.hit).length;
  console.log(`    · ${name.padEnd(24, '　')}｜${ends.map(e => e.txt).join('　')}` +
    `　→ ${n ? `✗ ${n}/5 种子 120 天跑满不给结局（末态见上：L / C / NP 哪项没够）` : '· 5/5 触发'}`);
}
console.log(`  读法：⊘ = scope-blocked（对照线本身没给结局，无法比先后），沿用 §十四 的口径，不记红。`);

console.log(`\n【I】:142 的「③ Risk 40 天内破 70」为什么在完整版读不到：同一条 ③ 线，事件池两口径对照（人工/竞争照旧在场）`);
for (const scope of ['m1', 'full']) {
  for (const s of SEEDS) {
    const r = run(s, REF_STRATEGIES.ref3, { additive: 'more', eventScope: scope });
    const log = r.log, last = log.at(-1);
    console.log(`    eventScope=${scope.padEnd(4)} 种子 ${String(s).padEnd(8)}｜Risk≥40 ${firstDay(log, d => d.Risk >= 40) ?? '未达'}` +
      `｜Risk≥70 ${firstDay(log, d => d.Risk >= 70) ?? '未达'}｜C≥8（E.6 :224 的硬触发半边） ${firstDay(log, d => d.C >= 8) ?? '未达'}` +
      `｜大检查 Score<35 ${firstDay(log, d => d.insp && d.insp.band === 'crash') ?? '无'}` +
      `（收线那晚 Score ${last.insp ? last.insp.score : '—'}，式 = 覆盖率×60 + 设施分 + 销毁比例×15 − Risk×0.3）` +
      `｜首结局 ${END_NAME[last.ending] || '未触发'}@${last.day}（末态 Risk ${last.Risk} C ${last.C} H ${last.H}）`);
  }
}
console.log(`    注：两口径差的不止 E.6 一条——eventScope='m1' 把整个 M2 事件池都挡在抽取之前（inScope 过滤发生在掷随机之前），`);
console.log(`    所以这一栏是「M1 池 vs 全池」的对照，不是「只把大检查摘掉」的严格单因子对照；要严格单因子得动 events.js 的 condition，本批不动代码。`);

// 正文 :363 要求 M3 证的 L≥4 是「只靠 5 件设施 + 回流全档 + 宣传队」那条走法；
// 而 evt_s_flag（毕业季锦旗，E.7）按 :363 的两刀属首更——它也在 L 的加成里，所以要逐场把 L 拆到来源，
// 再看摘掉锦旗后还剩几点。全引擎只有四处写 L：置办 +1（market.js:155）与三条事件的 L+1（evt_s_return / evt_s_promo / evt_s_flag）
console.log(`\n【J】L 的来源核账：正文 :363「L≥4 只靠 5 件设施 + 回流全档 + 宣传队」在 D 网格里成不成立（锦旗同条按两刀属首更，测时摘掉）`);
const L_EVENTS = { evt_s_return: '回流', evt_s_promo: '宣传队', evt_s_flag: '锦旗' };
const lCells = grid.filter(g => g.lDay !== null);
let flagDep = 0;
for (const g of lCells) {
  const upto = g.log.filter(d => d.day <= g.lDay);
  const cnt = { 回流: 0, 宣传队: 0, 锦旗: 0 };
  for (const d of upto) {
    const key = L_EVENTS[d.evening] || L_EVENTS[d.morning] || L_EVENTS[d.pre];
    if (key) cnt[key] += 1;
  }
  g.lParts = { fac: g.fac, ...cnt };
  g.lNoFlag = g.fac + cnt['回流'] + cnt['宣传队'];
  if (g.lNoFlag < L_NEED) flagDep += 1;
  console.log(`    ${g.tag.padEnd(34, ' ')}｜L≥4 @${g.lDay}｜设施 ${g.fac} 件 + 回流 ${cnt['回流']} + 宣传队 ${cnt['宣传队']} + 锦旗 ${cnt['锦旗']}` +
    `（=末态读 ${g.log.find(d => d.day === g.lDay).L}）｜摘锦旗后 L=${g.lNoFlag} ${g.lNoFlag >= L_NEED ? '≥4 仍成立' : `<4 依赖锦旗`}`);
}
console.log(`  ${lCells.length} 场到过 L≥4：其中 ${lCells.length - flagDep} 场摘掉锦旗仍 ≥4，${flagDep} 场依赖锦旗（:363 把锦旗划在首更，那这条 L≥4 的走法就要按摘掉后的读数判）`);
console.log(`  不换档那条线的设施上限实测（见议题二末三场）：档1 只有 fac_prepay（要 evt_d_001）与 fac_sign（BizDays>=45）两件会上架，`);
console.log(`  fac_taste 要 Tier>=2、fac_display 要 evt_d_021（condition 'Day>=10 & Tier>=2'）、fac_cert 要 seen_routine_inspection（evt_s_insp2 的 condition 'Risk>=40'）、`);
console.log(`  fac_contract 要 evt_s_poach（'Tier>=固定摊位 & EVT?evt_s_pricewar'）⇒ 档1 不换档时 L 的设施腿封顶 2 件，:363 那条走通不了。`);






