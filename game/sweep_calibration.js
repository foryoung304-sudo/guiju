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
import { simulate as simRaw, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { WEATHER } from './src/data/scenario.js';
import { EVENTS } from './src/data/events.js';
import { ENDING, RETIRE_NP_CENTS, COMPETITION, BUYOUT_PRICE_CENTS, HEARTBURN_WMAX_JIN,
  QUIT_VARIANT_NP_CENTS, QUIT_VARIANT_REP } from './src/data/constants.js';

// M1 口径（正文 3.5:141：压力测试带跑在 M1 构建，「人工与产能数值不参与本区间判定」「无竞争（S ≡ 1）」；
// §八 M1 行把「特殊事件、完整事件池」整体划给 M2）：
// 本脚本凡是压到已签发带的线一律关人工、关竞争、关 M2 事件池，M2 在场口径的区间店主还没签
// → 只在文末 H / I / J 三段出证据，不在此套带。
const simulate = (seed, days, strat, closer, opts) =>
  simRaw(seed, days, strat, closer, { labor: false, competition: false, eventScope: 'm1', ...opts });

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
const cumField = (log, key, days) => log.slice(0, days).reduce((s, d) => s + (d[key] || 0), 0);
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

// ── H. M2 在场口径证据（不套带：正文 3.5:141「M2 重跑时另立区间」，区间店主未签发）──
// 只报三件事：人工线开/关对同一条线的位移、位移里有多少是工资、余下的那截到底是什么。
// 这里给的是证据不是验收，A/D/G 段的带仍是 M1 口径（labor:false），两者并存直到店主另立区间。
function sweepH() {
  const fmtCap = c => (c === null ? '未开截断' : +c.toFixed(2));
  console.log(`\n${line(100)}\nH. M2 在场口径证据（人工线开，区间未签 → 只出数不判红绿）\n${line(100)}`);
  for (const strat of Object.values(STRATEGIES)) {
    const rows = SEEDS.map(s => {
      const off = simulate(s, 5, strat, 'headless', { labor: false });
      const on = simulate(s, 5, strat, 'headless', { labor: true });
      return {
        d: cum(on.log, 5) - cum(off.log, 5),
        labor: on.log.slice(0, 5).reduce((a, x) => a + x.labor, 0),
        capOff: off.log[0].cap, capOn: on.log[0].cap,
        peakOff: Math.max(...off.log.map(x => x.bowls)), peakOn: Math.max(...on.log.map(x => x.bowls)),
        buyGap: cumField(on.log, 'bought', 5) - cumField(off.log, 'bought', 5),
        bowlGap: on.log.slice(0, 5).reduce((a, x) => a + x.bowls, 0) - off.log.slice(0, 5).reduce((a, x) => a + x.bowls, 0),
      };
    });
    const deltas = rows.map(r => r.d);
    const dec = deciles(deltas);
    const wage = rows.reduce((a, r) => a + r.labor, 0) / SEEDS.length;
    const midRow = rows[deltas.indexOf(dec.p50)] || rows[0];
    console.log(`  ${strat.name}｜5 日累计位移（在场 − 不在场）：`);
    console.log(`     ${deltas.map(x => f2(x)).join(' / ')}　元｜最小 ${f2(dec.min)} 中位 ${f2(dec.p50)} 最大 ${f2(dec.max)}`
      + `｜工资成本 ${wage.toFixed(2)} 元（60 元/日 × 5）`);
    console.log(`     出餐上限：不在场 ${fmtCap(midRow.capOff)} / 在场 ${fmtCap(midRow.capOn)} 斤，`
      + `而 5 日出餐峰值只到 ${Math.max(midRow.peakOff, midRow.peakOn)} 斤 → ×1.10 从不撞顶，位移里拿不到产能的钱`);
    const rest = dec.p50 + wage;
    console.log(`     位移扣工资后余 ${f2(rest)} 元：这截不是产能，是工资先扣现金 → 篮子被现金额夹住`
      + `（进货差 ${f2(midRow.buyGap)} 元、出餐差 ${midRow.bowlGap} 碗）的二阶效应`
      + `${Math.abs(rest) < 0.005 ? '；这条线现金还没紧到会夹篮子，位移 = 纯工资' : '；越靠近现金下限的一条线，这截越负'}`);
  }
  console.log('  ⚠️ 以上位移需要店主回签 M2 在场区间后才能进验收门；未签之前 A/D/G 段一律按 M1 口径跑。');
}

// ── I. M2 在场口径证据（常驻竞争层开，区间未签 → 只出数不判红绿）──
// 竞争只改需求这一条腿（正文 3.13 红线），但改多大要先量：本段报「S 钳在哪一档、钳几天、位移多少、
// 十日里特殊链走到哪一步」，不给任何带。第四批把 S 从恒 1 变成实算，是 M2 区间里第一个会影响全盘的量。
// 配套的附录 C 份额两项（主式「÷ 昨日实际份额」、回退式「× 今日预估份额 ÷ 0.25」）同批落点：关掉整层时两项恒 ×1（A–G 逐字节一致即为证），
// 所以下面的位移里不含"试算不认竞争 → 首日多买四成、报损 301.77 元"那一块假账。
function sweepI() {
  console.log(`\n${line(100)}\nI. M2 在场口径证据（常驻竞争层开，区间未签 → 只出数不判红绿）\n${line(100)}`);
  for (const strat of Object.values(STRATEGIES)) {
    const rows = SEEDS.map(s => {
      const off = simulate(s, 10, strat);
      const on = simulate(s, 10, strat, 'headless', { competition: true });
      const sSeq = on.log.map(d => d.S);
      const sorted = [...sSeq].sort((a, b) => a - b);
      return {
        d: cum(on.log, 10) - cum(off.log, 10),
        floorDays: sSeq.filter(x => x === COMPETITION.sBand[0]).length,
        head: sSeq[0], tail: sSeq[sSeq.length - 1], mid: sorted[5],
        chain: on.state.EventHistory.filter(id => id.startsWith('evt_s')).join('→') || '特殊链未启动',
        bowls: on.log.reduce((a, x) => a + x.bowls, 0) - off.log.reduce((a, x) => a + x.bowls, 0),
      };
    });
    const dec = deciles(rows.map(r => r.d));
    const mid = rows[rows.map(r => r.d).indexOf(dec.p50)] || rows[0];
    console.log(`  ${strat.name}｜10 日累计位移（竞争在场 − 不在场）：`
      + `${rows.map(r => f2(r.d)).join(' / ')}　元｜最小 ${f2(dec.min)} 中位 ${f2(dec.p50)} 最大 ${f2(dec.max)}`);
    console.log(`     S 轨迹（中位那条种子）：首日 ${mid.head.toFixed(3)} → 中位 ${mid.mid.toFixed(3)} → 末日 ${mid.tail.toFixed(3)}，`
      + `其中 ${mid.floorDays}/10 天钳在下界 ${COMPETITION.sBand[0]}；同期出餐差 ${mid.bowls} 碗`);
    console.log(`     特殊链：${rows.map(r => r.chain).join('　')}`);
  }
  // 本摊 P 是 3.13 的滞后式（开局 20、每日 0.7/0.3 收敛到口碑目标），竞品 P 是常数 55 / 42 / 36 →
  // S 什么时候爬出下界，取决于 P 爬多快；这条 30 日探针量的就是那一个数，顺带看在场口径会不会把线直接压死。
  console.log(`  30 日探针（全正经线 × 五种子，看 S 何时离开下界、在场口径能不能活到 30 天）：`);
  for (const s of SEEDS) {
    const off30 = simulate(s, 30, STRATEGIES.clean, 'headless');
    const on = simulate(s, 30, STRATEGIES.clean, 'headless', { competition: true });
    const esc = on.log.findIndex(d => d.S > COMPETITION.sBand[0] + 1e-9);
    // 30 日跑不满的存档（破产/收尾提前落地）没有 log[29]，探针退到实际最后一天
    const at = esc < 0 ? on.log[on.log.length - 1] : on.log[esc];
    const minCash = Math.min(...on.log.map(d => d.cash));
    const maxWoff = d => Math.max(...d.log.map(x => x.writeoff));
    console.log(`     seed ${s}：${esc < 0 ? `${on.log.length} 日内未离开下界` : `第 ${esc + 1} 日离开下界`}，`
      + `当日 S ${at.S.toFixed(3)}、份额 ${at.share.map(x => x.toFixed(3)).join('/')}、本摊 P ${at.P}、Rep ${at.Rep}`
      + `｜存续 ${on.log.length} 日（不在场 ${off30.log.length}）、最低现金 ${f2(minCash)} 元、结局 ${END_NAME[on.state.EndingId] || '—'}`
      + `｜单日最大报损 ${f2(maxWoff(on))} 元（不在场 ${f2(maxWoff(off30))}）`);
  }
  console.log(`  ⚠️ 回报项（R8 断货日锚）：附录 C:451 的「max（当日试算, 昨日 D0）」按正文吃的是 3.14 第 7a 步的竞争前 D0，`
    + `样段 S ≡ 1 时两者同值、无从分辨；在场口径下这个锚比可达需求高一个 1/S（S 钳 0.6 时高 67%），上表"单日最大报损"就是它的代价。未裁之前按正文照旧实现。`);
  console.log('  ⚠️ 竞争在场口径要店主另立区间才进验收门；本段只说明「S ≡ 1 → S 实算」这一步的盘面代价有多大。');
}

// ── J. M2 事件池在场证据（附录 E 十二条全开，区间未签 → 只出数不判红绿）──
// 第五批把池子从 6 行扩到 12 行：事件会改需求（d0_buff）、改现金（罚款/涨薪）、改库存资产（销毁）、
// 还能当晚直接进结局判定 #1（大检查 Score<35）。基线取「人工 + 竞争都在场、池子仍是 M1 四条」，两边只差事件层。
// 但位移不等于事件层自身的代价：特殊池过门要多掷一次 chance(DRAW_GATE) 与一次 pickWeighted，
// 随机流消耗一变，同日抽到的日常、抽签给的票、Risk 的逐日路径都会错开 → 本段只摆出「撞上检查之后盘面变成什么样」，
// 不当杠杆归因用（真正的归因要把两条线的 rng 流对齐，属另一件事）。
function sweepJ() {
  console.log(`\n${line(100)}\nJ. M2 在场口径证据（事件池十二条全开，区间未签 → 只出数不判红绿）\n${line(100)}`);
  const pool = ['m1', 'full'].map(k => EVENTS.filter(e => (k === 'm1' ? e.ship === 'M1' : true)));
  const byKind = arr => ['坏事', '好事', '中性'].map(k => `${k} ${arr.filter(e => e.kind === k).length}`).join(' / ');
  console.log(`  池子现状：ship='M1' ${pool[0].length} 条（${byKind(pool[0])}）｜全池 ${pool[1].length} 条（${byKind(pool[1])}）`);
  console.log(`  正文 :362 上线必需 = 事件池 ≥18（坏 ≥10 / 好 ≥5 / 中 ≥3）；首更 = ≥30 且逐条数值（正文 :41 列为未定项）`);
  console.log(`  ⊘ 全池 ${pool[1].length} 条距 ≥18 还差 ${18 - pool[1].length} 条，缺的都是附录 E 里没有数据行的条目 —— 不自行发明数值，已回报待店主给数`);

  for (const strat of Object.values(STRATEGIES)) {
    const rows = SEEDS.map(s => {
      const off = simulate(s, 30, strat, 'headless', { labor: true, competition: true });
      const on = simulate(s, 30, strat, 'headless', { labor: true, competition: true, eventScope: 'full' });
      const fired = on.state.EventHistory.filter(id => !off.state.EventHistory.includes(id));
      return {
        d: cum(on.log, 30) - cum(off.log, 30),
        eventNet: cumField(on.log, 'eventNet', 30) - cumField(off.log, 'eventNet', 30),
        destroy: cumField(on.log, 'assetLoss', 30),
        onDays: on.log.length, offDays: off.log.length,
        end: END_NAME[on.state.EndingId] || '—',
        fired: fired.join('→') || '无新增',
      };
    });
    const dec = deciles(rows.map(r => r.d));
    console.log(`  ${strat.name}｜30 日累计位移（事件池在场 − 不在场）：`
      + `${rows.map(r => f2(r.d)).join(' / ')}　元｜最小 ${f2(dec.min)} 中位 ${f2(dec.p50)} 最大 ${f2(dec.max)}`);
    console.log(`     存续（在场/不在场）：${rows.map(r => `${r.onDays}/${r.offDays} 日`).join('　')}`
      + `｜在场结局 ${rows.map(r => r.end).join('/')}`);
    console.log(`     事件账净额差 ${f2(rows.reduce((a, r) => a + r.eventNet, 0))} 元（含 M1 四条与 M2 新增两笔）`
      + `｜销毁库存 ${f2(rows.reduce((a, r) => a + r.destroy, 0))} 元（非现金）`);
    console.log(`     新增触发：${rows.map(r => r.fired).join('　')}`);
  }
  // 时序后果（读法问题，不是数值问题）：E.6 的销毁决策落在第 10 步，而第 9 步的隔夜报损先把 keep:false 的剩货清出柜
  // → tier3 六款 + 强哥货全不在场，检查时点能看见的无票货只剩批发档 BF2/NS2 且要抽到无票那一次
  console.log(`  ⊘ 上表「销毁库存」那一列：第 9 步隔夜报损先清 keep:false 的剩货（附录 D.1：tier3 六款与强哥货全在这一类），`
    + `第 10 步的「销毁全部无票库存」只剩批发档 BF2/NS2 里抽到无票的那点，判定式中那 15 分几乎拿不到（全特价线恒 0）。`
    + `这是步序问题而不是数值问题：要让它咬得动，得把通知挪到第 9 步之前，或店主另签一条口径 —— 未裁之前按正文步序实现，不在代码里替正文发明。`);
  // 事件在场 → 随机流消耗多寡会变（特殊池过门要多掷一次 chance），Risk 的逐日路径也跟着错开：
  // 五颗种子的首检全落在第 8 日、当日 Risk 都在 43 上下（远不到 70）→ 硬触发点亮的是「C>=8」那一条，不是 Risk 那条。
  // 这条线本批不作验收（区间未签），但它把「事件池在场会让别的暗线时也飘」这件事摆明了，故写进回报。
  const probe = SEEDS.map(s => {
    const on = simulate(s, 60, STRATEGIES.cheap, 'headless', { labor: true, competition: true, eventScope: 'full' });
    const inspDay = on.log.findIndex(d => d.insp);
    const at = inspDay < 0 ? null : on.log[inspDay];
    return `seed ${s}：${on.log.length} 日、检查 ${on.state.EventHistory.filter(id => id.startsWith('evt_s_insp')).length} 次`
      + (at ? `（首检第 ${inspDay + 1} 日 Score ${at.insp.score.toFixed(2)} ${at.insp.band}，当日 Risk ${at.Risk} / C ${at.C} → 点亮的是「C>=8」）` : '')
      + `、结局 ${END_NAME[on.state.EndingId] || '—'}`;
  });
  console.log(`  60 日探针（全特价线，池子在场看检查事件真会不会撞上）：`);
  for (const c of probe) console.log(`     ${c}`);
  console.log('  ⚠️ 本段全部数字不进任何验收门：M2 在场区间未签发，且池子还缺 6 条（缺数不缺口，缺的是数）。');
  console.log('  ⚠️ 上面三行的位移不等于「事件层的代价」：特殊池过门要多掷一次随机，随机流一变、同日抽到的日常与抽签给的票都错开。'
    + '　要看事件层本身值多少钱，得把两条线的随机流对齐了再比（另事）。');
}

// ── K. M2 在场口径的六结局可达性（第七批：判定归属写死 + 摊位升级段进界面之后，重问一遍「玩家摸得到几条」）──
// C 段跑在 M1 口径，把 #3/#5 全标 ⊘：设施只解锁 3 件 → L 到不了 4；好事池只 1 条 → C 到不了 5。
// 本段把三层开关（人工/竞争/完整事件池）全开、跑同六条线，只看结局落地与 G.4 四道门的达标情况。
// 区间店主未签 → 只出数不判红绿；且这仍是无头线口径，界面那三个主动入口的时序（判在付钱之前）另由回归 §14 钉。
function sweepK() {
  console.log(`\n${line(100)}\nK. M2 在场口径的六结局可达性（人工 + 竞争 + 完整事件池全开，区间未签 → 只出数不判红绿）\n${line(100)}`);
  const M2 = { labor: true, competition: true, eventScope: 'full' };
  const invest = { buyFacilities: true, upgrade: true, buyout: true };
  const six = [
    ...Object.values(REF_STRATEGIES),
    ...Object.values(STRATEGIES).map(s => ({ ...s, ...invest })),
  ];
  const landed = {};
  // 门槛逐栏照附录 G.4 原式列出来（含判空即过的差项），不在此段替引擎判 —— 判定归属由回归 §14 钉
  const gate = (label, items) => {
    const bad = items.filter(it => !it[1]);
    return `${label}${bad.length ? `✗（差 ${bad.map(it => `${it[0]}=${it[2]}`).join('、')}）` : '✓'}`;
  };
  const tag = r => { const l = r.log.at(-1); return l.ending ? `#${l.ending}` : '未触发'; };
  console.log(`  附录 G.4 四道门：#3 现金≥60,000 & Rep≥75 & H≤10 & L≥4｜#4 H≥18 & Wmax≥210 斤｜#5 C≥5 & NP≥300,000 元｜#6 变体 NP≥90,000 元 & Rep≥60`);
  console.log(`  每行左 = C 段同口径的 M1 结果（人工/竞争/事件池全关），右 = 本段的 M2 在场结果；门后的数是 M2 那一次的末态。`);
  console.log(`  四道门只列未达标那一栏的读数（括号里没提的栏目 = 该栏已达标），判空即过要差在哪一眼就能读。\n`);
  for (const strat of six) {
    const opts = { buy: 'appc', additive: strat.key === 'ref3' ? 'more' : 'none' };
    console.log(`  ${strat.name.padEnd(26, '　')}｜120 日内：`);
    for (const seed of SEEDS.slice(0, 3)) {
      const m1 = simulate(seed, 120, strat, 'headless', opts);
      const m2 = simulate(seed, 120, strat, 'headless', { ...M2, ...opts });
      const st = m2.state, last = m2.log.at(-1);
      if (last.ending) landed[last.ending] = (landed[last.ending] || 0) + 1;
      const gates = [
        gate('#3', [['L≥4', st.L >= 4, st.L], ['现金≥60,000', st.Cash >= BUYOUT_PRICE_CENTS, +(st.Cash / 100).toFixed(0)],
          ['Rep≥75', last.Rep >= 75, last.Rep], ['H≤10', last.H <= 10, last.H]]),
        gate('#4', [['H≥18', last.H >= 18, last.H], ['Wmax≥210', st.Wmax >= HEARTBURN_WMAX_JIN, +st.Wmax.toFixed(1)]]),
        gate('#5', [['C≥5', last.C >= 5, last.C], ['NP≥300,000', last.NP >= RETIRE_NP_CENTS / 100, +last.NP.toFixed(0)]]),
        gate('#6变体', [['NP≥90,000', last.NP >= QUIT_VARIANT_NP_CENTS / 100, +last.NP.toFixed(0)],
          ['Rep≥60', last.Rep >= QUIT_VARIANT_REP, last.Rep]]),
      ].join(' ');
      console.log(`      ${seed}：M1 ${tag(m1)}@${m1.log.at(-1).day} → M2 ${tag(m2)}@${last.day}｜${gates}`);
    }
  }
  const order = [ENDING.CRASH, ENDING.BANKRUPT, ENDING.RULES, ENDING.HEARTBURN, ENDING.RETIRE, ENDING.MEDIOCRE];
  console.log(`\n  本段落地的结局：${order.filter(id => landed[id]).map(id => `#${id} ${END_NAME[id]} ×${landed[id]}`).join('　') || '无'}`);
  console.log(`  未落地：${order.filter(id => !landed[id]).map(id => `#${id} ${END_NAME[id]}`).join('　') || '无'}`
    + `｜无头线按「判空即过、只升档」永不选 #6（玩家不会为拿平庸收摊提前离场），故 #6 只可能从界面「不干了」进来。`);
  console.log('  ⚠️ 本段不进验收门：M2 在场区间未签发；且这里判的是无头线的合成式 closeShop，界面那三个入口各自只判自己那道门（正文 §六 判定归属写死），两者不同轨。');
}

console.log(`M1 定稿 §七.2 回签证据表｜验收带 ${BAND} 元｜种子 ${SEEDS.join('/')}`);
sweepA();
sweepB();
sweepC();
sweepD();
sweepE();
sweepF();
sweepG();
sweepH();
sweepI();
sweepJ();
sweepK();
