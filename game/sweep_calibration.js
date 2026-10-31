// 定稿 §七.2 + 回签审复 §七 回签证据表：node sweep_calibration.js
// A. 压力测试①（门 = 本体格 5 种子全落带；72 组合降为诊断）　B. M3 三策略　C. 六条线 120 天结局
// D. 破产路径诊断 + R8 停滞线观察　E. 节奏对账　F. 坏事事件后置归因　G. 回签审复 §七 七项清单逐项
// 口径登记（正文 §〇.2 空缺，回签审复已签复的部分标注在下列各行）：
//   · "72 组合" 原文未定义维度，本轮 = 天气 4 × 定价 3 × 货源 3 × 让步 2（审复 §二：作为诊断口径保留并注明定义）
//   · 进货口径两条都跑：appc = 附录 C 试算碗数（玩家看得见的数）／d0 = 3.14 第 7 步 D0 公开项
//     审复 §一.2 签了 (c) 附录 C 首日回退式修正后，两口径应收敛到 50 元内 → 差值逐种子报告
//   · "卡点" 原文未定义，本轮 = 当日(经营净额+事件账净额)为负 或 篮子被强制减量/买不到
//   · "大正反馈" 全量口径自 M2 事件池齐备后生效（审复 §五）；M1 替代验收 = evt_d_031 第 4–6 天保底
//   · 三审复 R7：③÷① 周毛利比只取两线共同存活日，重叠 <5 天的周标 ⊘；R8：无投资腿诚实线不作破产验收，
//     改登记为停滞线观察，破产验收的唯一口径是审复 §四 双验（G 段第 3 项）
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { WEATHER } from './src/data/scenario.js';
import { EVENTS } from './src/data/events.js';
import { ENDING, RETIRE_NP_CENTS } from './src/data/constants.js';

const BAND = [-450, 360];
const SEEDS = [20261031, 7979, 12345, 4242, 90210];
const END_NAME = { 0: '—', [ENDING.CRASH]: '翻车', [ENDING.BANKRUPT]: '破产', [ENDING.RULES]: '规矩立住',
  [ENDING.HEARTBURN]: '烧心大王', [ENDING.RETIRE]: '金盆洗手', [ENDING.MEDIOCRE]: '平庸收摊' };
const PRICES = ['qinmin', 'standard', 'signature'];
const PRICE_NAME = { qinmin: '亲民', standard: '标准', signature: '招牌' };
const TIERS = [1, 2, 3];
const TIER_NAME = { 1: '正经', 2: '平价', 3: '特价' };
const YIELDS = [true, false];
const POLICIES = ['appc', 'd0'];

const f2 = x => (x >= 0 ? '+' : '') + x.toFixed(2);
const cum = (log, days) => log.slice(0, days).reduce((s, d) => s + d.netOps + d.eventNet, 0);
const deciles = arr => {
  const a = [...arr].sort((x, y) => x - y);
  const at = p => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { min: a[0], p10: at(0.1), p50: at(0.5), p90: at(0.9), max: a[a.length - 1] };
};
const line = (w = 100) => '─'.repeat(w);

// ── A. 压力测试① 72 组合 × 5 种子 ─────────────────────────────────
function sweepA() {
  for (const policy of POLICIES) {
    const all = [];
    const cells = [];
    for (const w of Object.keys(WEATHER)) {
      for (const price of PRICES) {
        for (const tier of TIERS) {
          for (const yieldAll of YIELDS) {
            const strat = { key: 's', name: '', tier, price, weigh: 1.0, yieldAll };
            const vals = SEEDS.map(s => cum(simulate(s, 5, strat, 'headless', { buy: policy, weather: w }).log, 5));
            const outOfBand = vals.filter(v => v < BAND[0] || v > BAND[1]);
            cells.push({ w, price, tier, yieldAll, vals, pass: outOfBand.length === 0 });
            all.push(...vals);
          }
        }
      }
    }
    const d = deciles(all);
    const passCells = cells.filter(c => c.pass).length;
    const outOfBandAll = cells.flatMap(c => c.vals.filter(v => v < BAND[0] || v > BAND[1]));
    console.log(`\n${line(100)}\nA. 压力测试① 72 组合 × 5 种子 = ${all.length} 个 5 日累计样本【诊断，不作全局门｜审复 §二】｜进货口径 = ${policy}｜带 ${BAND}\n${line(100)}`);
    console.log(`  全样本 min ${f2(d.min)}｜p10 ${f2(d.p10)}｜中位 ${f2(d.p50)}｜p90 ${f2(d.p90)}｜max ${f2(d.max)}`);
    console.log(`  五种子全落带的格子：${passCells}/72；越带样本 ${outOfBandAll.length}/${all.length}`);
    const canon = cells.find(c => c.w === 'sunny' && c.price === 'qinmin' && c.tier === 1 && c.yieldAll);
    console.log(`  ①本体格（晴 + 亲民 + 正经 + 全让步）5 种子：${canon.vals.map(f2).join(' / ')}` +
      `　【门（审复 §二）：${canon.pass ? '全落带 成立' : '有种子越带 不成立'}】`);
    const byPrice = {}; const byTier = {}; const byW = {}; const byY = { true: [], false: [] };
    for (const c of cells) {
      (byPrice[c.price] ||= []).push(...c.vals);
      (byTier[c.tier] ||= []).push(...c.vals);
      (byW[c.w] ||= []).push(...c.vals);
      byY[String(c.yieldAll)].push(...c.vals);
    }
    const row = (t, o) => console.log(`  ${t}｜${o}`);
    row('按定价', PRICES.map(p => `${PRICE_NAME[p]} 中位 ${f2(deciles(byPrice[p]).p50)}`).join('　'));
    row('按货源', TIERS.map(t => `${TIER_NAME[t]} 中位 ${f2(deciles(byTier[t]).p50)}`).join('　'));
    row('按天气', Object.keys(WEATHER).map(w => `${WEATHER[w].name} 中位 ${f2(deciles(byW[w]).p50)}`).join('　'));
    row('按让步', `让步 ${f2(deciles(byY.true).p50)}　不让步 ${f2(deciles(byY.false).p50)}（中位）`);
    const fails = cells.filter(c => !c.pass);
    const groups = {};
    for (const c of fails) {
      const k = `${WEATHER[c.w].name}｜${PRICE_NAME[c.price]}｜${TIER_NAME[c.tier]}｜${c.yieldAll ? '让步' : '不让步'}`;
      (groups[k] ||= []).push(...c.vals.filter(v => v < BAND[0] || v > BAND[1]));
    }
    const below = Object.values(groups).flat().filter(v => v < BAND[0]).length;
    const above = Object.values(groups).flat().filter(v => v > BAND[1]).length;
    console.log(`  越带方向：低于下界 ${below} 个 / 高于上界 ${above} 个`);
    for (const [k, v] of Object.entries(groups)) {
      console.log(`    ✗ ${k}：${v.map(f2).join(' / ')}`);
    }
  }
}

// ── B. M3 三策略口径复核 ──────────────────────────────────────────
// 修订记录 R7：③÷① 比值只统计两线**共同存活日**——一条已终局的残周与另一条已升档的线相比是口径错误。
// 重叠 <5 天的周不计值，标 ⊘ 不记红。逐周结论存进 refWeekRatios，供 G 段引用（不在那里重复模拟）。
const refWeekRatios = [];
function weekCommonGross(logA, logB, week) {
  const win = log => log.slice(week * 7, week * 7 + 7);
  const n = Math.min(win(logA).length, win(logB).length);
  if (n < 1) return null;
  const avg = log => win(log).slice(0, n).reduce((s, d) => s + d.gross, 0) / n;
  return { a: avg(logA), b: avg(logB), n };
}

function sweepB() {
  console.log(`\n${line(100)}\nB. M3 三策略口径复核（跑到首个结局或 120 天；种子 ${SEEDS.slice(0, 3).join('/')}）\n${line(100)}`);
  const runs = {};
  for (const [key, strat] of Object.entries(REF_STRATEGIES)) {
    runs[key] = SEEDS.slice(0, 3).map(seed => ({ seed,
      run: simulate(seed, 120, strat, 'headless', { buy: 'appc', additive: key === 'ref3' ? 'more' : 'none' }) }));
  }
  for (const [key, strat] of Object.entries(REF_STRATEGIES)) {
    console.log(`\n  ${strat.name}`);
    for (const { seed, run } of runs[key]) {
      const first = run.log[run.log.length - 1];
      const stalls = run.invests.filter(i => i.kind === 'stall');
      const first14 = run.log.slice(0, 14).reduce((s, d) => s + d.netOps, 0);
      const risk70 = run.log.find(d => d.Risk >= 70);
      const invariant = stalls.every(i => i.cashAt >= i.price * 1.3);
      console.log(`    种子 ${seed}：首结局 ${END_NAME[first.ending] || first.ending} @ 第 ${first.day} 天（末态 档${first.tier} 现金 ${f2(first.cash)} NP ${f2(first.NP)} Rep ${first.Rep} Risk ${first.Risk} C ${first.C} H ${first.H}）`);
      console.log(`      换档：${stalls.length ? stalls.map(i => `→${i.to}档@第${i.day}天花 ${i.price / 100}（时点现金 ${f2(i.cashAt / 100)}，不变式${i.cashAt >= i.price * 1.3 ? '成立' : '破了'}，升级后剩 ${f2(i.cashAfter / 100)}）`).join('；') : '从未换档'}`);
      console.log(`      设施：${run.invests.filter(i => i.kind === 'facility').map(i => i.to).join(',') || '无'}｜前 14 天经营净额 = ${f2(first14)}`);
      console.log(`      Risk 破 70：${risk70 ? `第 ${risk70.day} 天（${risk70.Risk}）` : '120 天内未破'}；首次升级后周转 ≥300：${stalls.length ? (stalls[0].cashAfter >= 30000 ? '是（' + f2(stalls[0].cashAfter / 100) + '）' : '否（' + f2(stalls[0].cashAfter / 100) + '）') : '无升级'}`);
      // 审复 §二.1：证伪跑要报「首次现金告急日」——告急 = 现金转负；另报被购买力缩量/空篮的日数
      const tight = run.log.find(d => d.cash < 0);
      const cut = run.log.filter(d => d.shortBuy).length;
      const starve = run.log.find(d => d.starved);
      // 缩量日按档位分布：低档（额度 600/1500）还是高档（R6 抬到 2500+）撞额度，决定六档阶梯到底作不作功
      const byTier = {};
      for (const d of run.log) if (d.shortBuy) byTier[d.tier] = (byTier[d.tier] || 0) + 1;
      console.log(`      首次现金告急（转负）：${tight ? `第 ${tight.day} 天（${f2(tight.cash)}）` : '全程未转负'}｜被购买力缩量 ${cut}/${run.log.length} 天｜首个空篮日：${starve ? `第 ${starve.day} 天` : '无'}｜缩量按档位：${Object.entries(byTier).map(([t, n]) => `${t}档 ${n}天`).join(' ') || '无'}`);
      if (!invariant) console.log(`      ✗ 升级不变式破了`);
    }
  }
  console.log(`\n  策略③÷① 周均毛利比（R7：各周取三种子的**共同存活日**均值再相除，重叠 <5 天不计值）`);
  for (let wk = 0; wk < 8; wk++) {
    const pairs = runs.ref1.map(({ run }, i) =>
      weekCommonGross(run.log, runs.ref3[i].run.log, wk)).filter(Boolean);
    const ok = pairs.filter(p => p.n >= 5);
    const nMax = pairs.length ? Math.max(...pairs.map(p => p.n)) : 0;
    if (!ok.length) {
      refWeekRatios.push(`第 ${wk + 1} 周 ⊘（共同存活 ${nMax} 天 <5）`);
      console.log(`    第 ${wk + 1} 周：⊘ 共同存活 ${nMax} 天 <5（R7 不计值，不记红）`);
      continue;
    }
    const mean = f => ok.reduce((s, p) => s + f(p), 0) / ok.length;
    const a = mean(p => p.a), b = mean(p => p.b);
    refWeekRatios.push(`第 ${wk + 1} 周 ${(b / a).toFixed(2)}`);
    console.log(`    第 ${wk + 1} 周：① ${f2(a)}　③ ${f2(b)}　比值 ${(b / a).toFixed(2)}` +
      `（验收带 1.3–1.9｜共同存活 ${ok.map(p => p.n).join('/')} 天 × ${ok.length} 种子）`);
  }
  console.log(`\n  策略② 首结局是否晚于策略①（审复 §三：① 在 M1 无盘店出口 → 该条 scope-blocked，不记红）：`);
  for (let i = 0; i < 3; i++) {
    const d1 = runs.ref1[i].run.log.at(-1), d2 = runs.ref2[i].run.log.at(-1);
    const verdict = !d1.ending ? '⊘ scope-blocked（① 未触发结局，L>=4 的盘店门槛在 M1 不可达）'
      : d2.day > d1.day ? '晚于（成立）' : '不晚于（不成立）';
    console.log(`    种子 ${runs.ref1[i].seed}：① ${d1.ending ? `第 ${d1.day} 天 ${END_NAME[d1.ending]}` : '120 天内无结局'}　② 第 ${d2.day} 天 ${END_NAME[d2.ending]}　${verdict}`);
  }
  return runs;
}

// ── C. 六条策略线 120 天内必达结局 ────────────────────────────────
function sweepC() {
  const invest = { buyFacilities: true, upgrade: true, buyout: true };
  const six = [
    ...Object.values(REF_STRATEGIES),
    ...Object.values(STRATEGIES).map(s => ({ ...s, ...invest })),
  ];
  console.log(`\n${line(100)}\nC. 六条策略线（参考 3 + 极端 3，带投资腿）120 天内必达结局｜种子 ${SEEDS.slice(0, 3).join('/')}\n${line(100)}`);
  console.log(`  标记口径（审复 §三 / 二审复 §二.1）：⊘ = scope-blocked（M1 内容给不出 L>=4 与 C>=5：`);
  console.log(`  设施只解锁 3 件、好事池只 1 条，「规矩立住」「金盆洗手」两条盘店线验收顺延 M2/M3，不计红）；✗ = 真不过线。\n`);
  for (const strat of six) {
    const out = SEEDS.slice(0, 3).map(seed => {
      const run = simulate(seed, 120, strat, 'headless', { buy: 'appc', additive: strat.key === 'ref3' ? 'more' : 'none' });
      const last = run.log.at(-1);
      return { txt: `${seed}：${last.ending ? END_NAME[last.ending] : '未触发'}@${last.day}天`, last };
    });
    const noEnd = out.some(o => o.txt.includes('未触发'));
    // 不过线的原因要能从末态读出来：L>=4（盘店「规矩立住」）与 C>=5（金盆洗手）都是 M1 内容给不出的字段
    // → 范围缺口 ⊘；若这两项都够却没给结局，才是实现没接上 → ✗
    const gaps = out.filter(o => !o.last.ending).map(o => o.last);
    const onlyScope = gaps.length > 0 && gaps.every(l => l.L < 4 || l.C < 5);
    const why = gaps.length ? `　← ${onlyScope ? 'scope-blocked' : '未达门槛但没给结局（要查实现）'}：` +
      `盘店要 L>=4（末态 L ${gaps[0].L}，M1 只解锁 3 件设施）／金盆洗手要 C>=5（末态 C ${gaps[0].C}` +
      `，M1 好事池只 1 条）／NP ${gaps[0].NP >= RETIRE_NP_CENTS / 100 ? '已达标' : '未达标'}` : '';
    console.log(`  ${noEnd ? (onlyScope ? '⊘' : '✗') : '·'} ${strat.name.padEnd(26, '　')}｜` +
      `${out.map(o => o.txt).join('　')}${noEnd ? why : ''}`);
  }
}

// ── D. 破产路径诊断 + R8 停滞线观察 ───────────────────────────────
function sweepD() {
  console.log(`\n${line(100)}\nD. 破产路径诊断（初始现金 600 + 新毛利）｜验收唯一口径 = 审复 §四 双验，见 G 段第 3 项\n${line(100)}`);
  console.log(`  修订记录 R8：本段不记红。前四例是诊断（哪几种死法仍走得通）；末例自验收摘除，`);
  console.log(`  登记为**停滞线观察**——无投资腿的诚实线 30 天存活、不增长，正是「不投资 = 不平庸收摊出口」的合格信号。\n`);
  const cases = [
    ['历史 D4 路径：正经+亲民+全让步+按 D0 满买（多买→报损→现金见底）',
      { tier: 1, price: 'qinmin', weigh: 1.0, yieldAll: true }, { buy: 'd0', weather: 'rain' }],
    ['同上，自然天气循环', { tier: 1, price: 'qinmin', weigh: 1.0, yieldAll: true }, { buy: 'd0' }],
    ['招牌价 + 正经 + 不让步（需求端自杀）', { tier: 1, price: 'signature', weigh: 1.0, yieldAll: false }, { buy: 'appc' }],
    ['招牌价 + 特价料 + 全让步（先好后烂）', { tier: 3, price: 'signature', weigh: 1.0, yieldAll: true }, { buy: 'd0' }],
    ['停滞线观察（R8 摘除验收）：压测① 本体，无投资腿', { ...STRATEGIES.clean }, { buy: 'appc' }, true],
  ];
  for (const [name, strat, opts, observe] of cases) {
    const out = SEEDS.map(seed => {
      const run = simulate(seed, 30, strat, 'headless', opts);
      const last = run.log.at(-1);
      const bankrupt = run.log.find(d => d.ending === ENDING.BANKRUPT);
      return { seed, day: bankrupt ? bankrupt.day : null, last, run };
    });
    const hits = out.filter(o => o.day);
    console.log(`  ${observe ? '○' : hits.length ? '✓' : '·'} ${name}`);
    console.log(`      破产：${out.map(o => `${o.seed}:${o.day ? '第' + o.day + '天' : '未破（末现金 ' + f2(o.last.cash) + '）'}`).join('　')}`);
    const minCash = Math.min(...out.flatMap(o => o.run.log.map(d => d.cash)));
    console.log(`      30 天内最低现金 ${f2(minCash)}；首结局 ${out.map(o => `${END_NAME[o.last.ending] || '—'}@${o.last.day}`).join('　')}`);
    if (observe) console.log(`      生长性：档位 ${out.map(o => `${o.seed}:1→${o.last.tier}档`).join('　')}｜` +
      `碗数 ${out.map(o => `${o.run.log[0].bowls}→${o.last.bowls}`).join('　')}（不投资 = 不长，判为合格信号）`);
  }
}

// ── E. §四两条节奏对账 ────────────────────────────────────────────
function sweepE() {
  console.log(`\n${line(100)}\nE. §四 两条节奏口径对账（压测① 本体：正经+亲民+全让步，逐日）\n${line(100)}`);
  for (const policy of POLICIES) {
    console.log(`  ── 进货口径 ${policy} ──`);
    const choke = [];
    for (const seed of SEEDS) {
      const run = simulate(seed, 10, { ...STRATEGIES.clean }, 'headless', { buy: policy });
      const firstBad = run.log.findIndex(d => d.netOps + d.eventNet < 0 || d.shortBuy || d.starved);
      choke.push(firstBad < 0 ? null : run.log[firstBad].day);
      console.log(`    种子 ${seed}：逐日净额 ${run.log.map(d => `${d.day}:${f2(d.netOps + d.eventNet)}${d.starved ? '★买空' : d.shortBuy ? '↓减量' : ''}`).join(' ')}`);
      console.log(`      事件 ${run.log.map(d => [d.pre, d.morning, d.evening].filter(Boolean).join('+') || '-').join(' | ')}`);
      console.log(`      好事（社团聚餐订金）落在：${run.log.filter(d => d.evening === 'evt_d_031' || d.pre === 'evt_d_031' || d.morning === 'evt_d_031').map(d => '第' + d.day + '天').join('、') || '7 天内未抽到'}`);
    }
    const early = choke.filter(d => d !== null && d < 3);
    console.log(`    首个卡点：${choke.map(d => d ?? '无').join(' / ')}｜${early.length ? `✗ 早于第 3 天 ${early.length} 个种子` : '· 不早于第 3 天（口径见文件头登记）'}`);
  }
  console.log(`\n  大正反馈清单口径：M1 事件表只有四条，好事一条（evt_d_031，Day>=4 + 冷却 7 天）→ 7 天内最多 1 次订金；`);
  console.log(`  "锦旗类荣誉"在 M1 无对应事件/设施（fac_sign 解锁 BizDays>=45，且只进终局演出）→ 剩余 2 次只能由"单日净额显著为正"贡献，阈值未定，见上表逐日净额。`);
}

// ── F. ① 本体越带的杠杆归因（只在内存里改事件条件做对照，不落盘、不改数据文件）──
function sweepF() {
  const variants = [
    ['现状（定稿 §一+§二+§三+§四.1 全部生效后）', {}],
    ['把 evt_d_011 的随机窗口也后置到 Day>=7（§四.1 只挪了保底，随机仍从第 3 天可抽）', { evt_d_011: 'Day>=7' }],
    ['把 evt_d_002 严队长占道后置到 Day>=3（惯例③：负面机制第 3 天后解锁）', { evt_d_002: 'Tier>=1 & Day>=3' }],
    ['把 evt_d_001 赵大妈记账后置到 Day>=3', { evt_d_001: '!HAS?fac_prepay & Day>=3' }],
    ['三条坏事事件全部后置到 Day>=3', { evt_d_011: 'Day>=7', evt_d_002: 'Tier>=1 & Day>=3', evt_d_001: '!HAS?fac_prepay & Day>=3' }],
  ];
  const orig = Object.fromEntries(EVENTS.map(e => [e.id, e.condition]));
  console.log(`\n${line(100)}\nF. 压力测试① 本体越带归因（晴 + 亲民 + 正经 + 全让步，5 种子 × 5 日累计，口径 appc）\n${line(100)}`);
  for (const [name, patch] of variants) {
    for (const [id, cond] of Object.entries(patch)) EVENTS.find(e => e.id === id).condition = cond;
    for (const policy of POLICIES) {
      const vals = SEEDS.map(s => cum(simulate(s, 5, { ...STRATEGIES.clean }, 'headless', { buy: policy }).log, 5));
      const d = deciles(vals);
      const inBand = vals.filter(v => v >= BAND[0] && v <= BAND[1]).length;
      console.log(`  ${name}【${policy}】\n      ${vals.map(f2).join(' / ')}　落带 ${inBand}/5（中位 ${f2(d.p50)}，带 ${BAND}）`);
    }
    for (const e of EVENTS) e.condition = orig[e.id];
  }
  const probe = simulate(SEEDS[0], 5, { ...STRATEGIES.clean }, 'headless', { buy: 'appc' });
  console.log(`\n  逐日成本/售价对照（种子 ${SEEDS[0]}，appc）：`);
  for (const d of probe.log) {
    console.log(`    第 ${d.day} 天 售出 ${d.J.toFixed(2)} 斤 流水 ${f2(d.revenue)} COGS ${d.cogs.toFixed(2)} 报损 ${d.writeoff.toFixed(2)} 净额 ${f2(d.netOps)} 事件 ${f2(d.eventNet)} 事件 ${[d.pre, d.morning, d.evening].filter(Boolean).join('+') || '—'}`);
  }
}

// ── G. 回签审复 §七 七项清单逐项 ──────────────────────────────────
const BAD_IDS = EVENTS.filter(e => e.kind === '坏事').map(e => e.id);
const GOOD_IDS = EVENTS.filter(e => e.kind === '好事').map(e => e.id);

function sweepG() {
  console.log(`\n${line(100)}\nG. 回签审复 §七 本轮回签清单逐项（1–7）\n${line(100)}`);

  // 1. 修正后试算口径下 5 种子全落带 + appc/d0 差值（目标 ≤50 元）
  const nat = {};
  for (const policy of POLICIES) {
    nat[policy] = SEEDS.map(s => cum(simulate(s, 5, { ...STRATEGIES.clean }, 'headless', { buy: policy }).log, 5));
  }
  const inBand = nat.appc.filter(v => v >= BAND[0] && v <= BAND[1]).length;
  const diffs = SEEDS.map((s, i) => Math.abs(nat.appc[i] - nat.d0[i]));
  console.log(`  1. 压测① 本体（自然天气循环，同 test_regression 断言）｜修正后试算口径：`);
  console.log(`     appc ${nat.appc.map(f2).join(' / ')}　落带 ${inBand}/5`);
  console.log(`     d0  ${nat.d0.map(f2).join(' / ')}`);
  console.log(`     两口径差值（审复 §一.2 目标 ≤50 元）：${diffs.map(d => d.toFixed(2)).join(' / ')}　最大 ${Math.max(...diffs).toFixed(2)}`);

  // 2. 72 组合诊断分布（见 A 段）
  console.log(`  2. 72 组合（天气4×定价3×货源3×让步2）诊断分布见 A 段，按审复 §二 不作全局门。`);

  // 3. 线① 理性打法 15 天内不破产 + 乱买破产路径仍可达
  const rational = SEEDS.map(s => {
    const r = simulate(s, 15, { ...STRATEGIES.clean }, 'headless', { buy: 'appc' });
    const b = r.log.find(d => d.ending === ENDING.BANKRUPT);
    return `${s}：${b ? '破产@' + b.day : '未破产（末现金 ' + f2(r.log.at(-1).cash) + '）'}`;
  });
  const reckless = SEEDS.map(s => {
    const r = simulate(s, 30, { ...STRATEGIES.clean }, 'headless', { buy: 'd0', buyMult: 1.6 });
    const b = r.log.find(d => d.ending === ENDING.BANKRUPT);
    return `${s}：${b ? '破产@' + b.day : '未破产（末现金 ' + f2(r.log.at(-1).cash) + '）'}`;
  });
  const rOK = rational.every(o => o.includes('未破产'));
  const kOK = reckless.filter(o => o.includes('破产')).length;
  console.log(`  3. 破产双验｜理性打法 15 天内不破产：${rOK ? '✓' : '✗'} ${rational.join('　')}`);
  console.log(`     乱买（按 D0 再上浮 60% 进货）破产仍可达：${kOK}/5 ${reckless.join('　')}`);

  // 4. 首个坏事事件日逐种子（要求 ≥3）
  const firstBad = SEEDS.map(s => {
    const r = simulate(s, 10, { ...STRATEGIES.clean }, 'headless', { buy: 'appc' });
    for (const d of r.log) if ([d.pre, d.morning, d.evening].some(id => BAD_IDS.includes(id))) return `${s}:第${d.day}天`;
    return `${s}:10 天内无坏事`;
  });
  console.log(`  4. 首个坏事事件日：${firstBad.join('　')}`);

  // 5. evt_d_031 第 4–6 天保底
  const good = SEEDS.map(s => {
    const r = simulate(s, 8, { ...STRATEGIES.clean }, 'headless', { buy: 'appc' });
    const hit = r.log.filter(d => [d.pre, d.morning, d.evening].some(id => GOOD_IDS.includes(id)));
    return `${s}:${hit.length ? hit.map(d => '第' + d.day + '天').join(',') : '未触发'}`;
  });
  console.log(`  5. evt_d_031 好事保底（第 4–6 天必触发）：${good.join('　')}`);

  // 6. ③÷① 周均毛利比（R7 口径，数值直接取 B 段已跑的结果，不在这里重复模拟）
  console.log(`  6. ③÷① 周均毛利比（M3 三策略带投资腿，appc，R7 共同存活日口径）：${refWeekRatios.slice(0, 2).join('　')}`);
  console.log(`  7. scope-blocked 标注：B 段末「② 晚于 ①」三种子全 ⊘；C 段四条干净线（参考①②、全正经+亲民、全平价+亲民）`);
  console.log(`     120 天内无结局，原因均为盘店要 L>=4 / 金盆洗手要 C>=5（M1 内容给不出），打 ⊘ 不记红。`);
}

console.log(`M1 定稿 §七.2 回签证据表｜验收带 ${BAND} 元｜种子 ${SEEDS.join('/')}`);
sweepA();
sweepB();
sweepC();
sweepD();
sweepE();
sweepF();
sweepG();
