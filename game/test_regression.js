// M1 回归回路（红/绿命令）：node test_regression.js [种子]
// 断言 = 三条极端玩法压力测试 + 逐日账目可核 + 同种子复现 + 事件覆盖 + 红线静态扫描
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, STRATEGIES } from './src/sim.js';
import { bridgeCheck, settleDay, settleWriteoff } from './src/engine/ledger.js';
import { newGame, roundJin, loadGame, STORAGE_KEY } from './src/engine/state.js';
import { effectivePrice, buildBasket, planPayment, recomputeStock } from './src/engine/market.js';
import { ALL_CATS, CAT, SOLID_CATS, PRICE_TIERS, PACKING, PACKING_SPILL, CONFIG, SAVE_VERSION,
  ADDITIVE, PREP_LEVELS } from './src/data/constants.js';
import { SKU_BY_ID } from './src/data/skus.js';
import { scenarioOf, WEATHER } from './src/data/scenario.js';
import { evalCondition } from './src/engine/dsl.js';
import { EVENTS } from './src/data/events.js';
import { beginDay, morningPreEvent, submitBasket, previewBasket, commitPrep, lockTradingDay, morningEvent, runDay, nightSettle, eveningDraw, nightClose } from './src/engine/day.js';
import { additiveOf, additiveUnlocked, capacityJin, computeMBase, prepBudget, prepGridUsed, qTaste, washSkipped } from './src/engine/production.js';
import { drawHandOrders, handOrderCount } from './src/engine/weigh.js';
import { applyHidden } from './src/engine/events.js';
import { applyShadow, computeQ } from './src/engine/shadow.js';
import { makeRng } from './src/engine/rng.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = Number(process.argv[2] ?? 20261031);
const failures = [];
const notes = [];

function check(name, cond, detail) {
  if (cond) notes.push(`  PASS  ${name}${detail ? '  ' + detail : ''}`);
  else failures.push(`${name}${detail ? '  →  ' + detail : ''}`);
}

const NEAR = (a, b, eps = 1) => Math.abs(a - b) <= eps;

// ── 1. 三条极端玩法 ───────────────────────────────────────────────
const runs = {};
for (const [key, strategy] of Object.entries(STRATEGIES)) runs[key] = simulate(SEED, 10, strategy);

function npSum(run, days) {
  return run.log.slice(0, days).reduce((s, d) => s + d.netOps + d.eventNet, 0);
}

const clean5 = npSum(runs.clean, 5);
const mid5 = npSum(runs.mid, 5);
const cheap5 = npSum(runs.cheap, 5);
// 定稿 §一：验收带随量纲一并放大三倍 [−150, +120] → [−450, +360]；进货口径 = sim.js 默认 appc（附录 C 试算碗数）
check('压力测试① 全正经+亲民+全让步 5 日累计 ∈ [−450, +360]',
  clean5 >= -450 && clean5 <= 360, `= ${clean5.toFixed(2)} 元${clean5 < -450 ? '（见下方单斤毛利证据）' : ''}`);
check('压力测试② 全平价+亲民 5 日累计为正', mid5 > 0, `= ${mid5.toFixed(2)} 元`);
check('压力测试② 全平价线低于全特价线', mid5 < cheap5, `平价 ${mid5.toFixed(2)} < 特价 ${cheap5.toFixed(2)}`);
check('压力测试② 全平价线 Rep 5 天不降',
  runs.mid.log[4].Rep >= runs.mid.log[0].Rep - 0.001 && runs.mid.log[4].Rep >= 20,
  `Day1 ${runs.mid.log[0].Rep} → Day5 ${runs.mid.log[4].Rep}`);
check('压力测试③ 全特价+标准 累计最高',
  cheap5 >= clean5 && cheap5 >= mid5, `特价 ${cheap5.toFixed(2)} / 平价 ${mid5.toFixed(2)} / 正经 ${clean5.toFixed(2)}`);
check('压力测试③ 全特价线 Risk 增量 > 0',
  runs.cheap.log[4].Risk > runs.cheap.log[0].Risk, `Day1 ${runs.cheap.log[0].Risk} → Day5 ${runs.cheap.log[4].Risk}`);
const cheapAmbiguous = runs.cheap.log.some(d => d.comments.some(c => c.startsWith('quality:')));
check('压力测试③ 全特价线暧昧品质留言 ≥ 1 条', cheapAmbiguous);

// ── 2. 逐日账目可核（任取一天都能对上）───────────────────────────
for (const [key, run] of Object.entries(runs)) {
  const { state, log } = run;
  log.forEach((d, i) => {
    const rep = state.DailyReports[i];
    if (!rep) { check(`账目可核 ${key} Day${d.day} 有结算页`, false, '缺 DailyReport'); return; }
    const gross = rep.revenueCents - rep.cogsCents;
    check(`账目可核 ${key} Day${d.day} 毛利 = 流水 − COGS`, gross === rep.grossCents,
      `${gross} vs ${rep.grossCents}`);
    const net = rep.grossCents - rep.writeoffCents - rep.fixedCents;
    check(`账目可核 ${key} Day${d.day} 经营净额 = 毛利 − 报损 − 固定支出`, net === rep.netOpsCents,
      `${net} vs ${rep.netOpsCents}`);
    const evNet = rep.eventCashMorning + rep.eventCashEvening;
    check(`账目可核 ${key} Day${d.day} 事件账净额分列`, evNet === rep.eventNetCents,
      `${evNet} vs ${rep.eventNetCents}`);
  });
  const np = state.DailyReports.reduce((s, r) => s + r.netOpsCents + r.eventNetCents, 0);
  check(`账目可核 ${key} NP = Σ(经营净额 + 事件账净额)`, np === state.NP, `${np} vs ${state.NP}`);
  const b = bridgeCheck(state);
  check(`现金桥 ${key} 对平`, b.ok, `现金 ${b.cash / 100} 桥 ${b.bridge / 100} 差 ${b.diff / 100}`);
  // 进货单逐笔：现金 + 赊购 = 该笔金额；当日合计 = 篮子总额
  const byDay = {};
  for (const p of state.PurchaseLedger) {
    if (p.cash + p.credit !== p.cost) { check(`进货单可核 ${key} 第 ${p.day} 天拆分`, false, `${p.sku} ${p.cash}+${p.credit}≠${p.cost}`); break; }
    byDay[p.day] = (byDay[p.day] || 0) + p.cost;
  }
  check(`进货单可核 ${key} 逐笔拆分现金/赊购`, Object.keys(byDay).length > 0, `${Object.keys(byDay).length} 天有采购记录`);
  // 库存 = 前日 + 买入 − 售出 − 报损（固体逐品类）
  check(`库存可核 ${key} 售出量不超过买入量`,
    Object.entries(state.StockSolid).every(([, v]) => v >= 0), JSON.stringify(state.StockSolid));
}

// ── 3. 同种子复现 ────────────────────────────────────────────────
const again = simulate(SEED, 10, STRATEGIES.cheap);
const same = JSON.stringify(again.state.DailyReports) === JSON.stringify(runs.cheap.state.DailyReports)
  && JSON.stringify(again.state.streamCounter) === JSON.stringify(runs.cheap.state.streamCounter);
check('同种子复现（暗线 + 账目 + 子流计数全一致）', same);
const otherSeed = simulate(SEED + 1, 10, STRATEGIES.cheap);
check('换种子结果不同（子流确实在用种子）',
  JSON.stringify(otherSeed.log.map(l => l.Rep)) !== JSON.stringify(runs.cheap.log.map(l => l.Rep)));

// 界面把打烊拆成 nightSettle / eveningDraw / nightClose 三步（要停在晚间事件上等玩家点），
// 无头线一步 closeDay。两条线必须逐字段一样：这一步拆错过一次，抽到的晚间事件没传进 nightClose，
// 账面照样平、事件却永远不落地——界面玩家看到的账和跑表账就此分家
for (const key of ['clean', 'mid', 'cheap']) {
  const split = simulate(SEED, 10, STRATEGIES[key], 'ui');
  check(`界面拆步打烊与无头 closeDay 同源 ${key}`,
    JSON.stringify(split.state) === JSON.stringify(runs[key].state),
    `晚间事件落地：无头 ${runs[key].state.EventHistory.join(',')}｜界面 ${split.state.EventHistory.join(',')}`);
}

// ── 3b. 3.14 第 3 步支付细则：先扣现金、熟人货走赊购、付不齐整篮驳回、负余额不锁死进货 ──
{
  const s = newGame(SEED);
  const basket = list => buildBasket(s, list);
  s.Cash = 0; s.DebtSupplier = 0;
  check('支付细则 空篮在任何现金状态下都能提交',
    planPayment(s, basket([])).submittable === true);
  s.Cash = -5000;
  check('支付细则 现金为负时空篮仍可提交（负余额是欠着，不是买不动）',
    planPayment(s, basket([])).submittable === true, `现金 ${s.Cash}`);
  const creditOnly = basket([{ sku: 'MB1', qty: 2 }]);
  const p1 = planPayment(s, creditOnly);
  check('支付细则 现金为负时熟人正经货仍走赊购',
    p1.submittable && p1.creditUsed === p1.total && p1.cashUsed === 0,
    `合计 ${p1.total} 走赊 ${p1.creditUsed} 现付 ${p1.cashUsed}`);
  const p2 = planPayment(s, basket([{ sku: 'MB2', qty: 2 }]));   // 批发市场：只收现金
  check('支付细则 现金为负时只收现金的货整篮驳回', p2.submittable === false, `缺口 ${p2.shortfallCents}`);
  s.Cash = 10000; s.CreditCap = 0;
  const p3 = planPayment(s, basket([{ sku: 'MB1', qty: 20 }]));
  check('支付细则 额度归零且现钱不够时整篮驳回（不自动减量）',
    p3.submittable === false && p3.shortfallCents > 0, `合计 ${p3.total} 现钱 100.00 缺口 ${p3.shortfallCents}`);
}

// ── 3c. 附录 A 条件 DSL 的设施/事件探针：挂过牌就不该再被同一件事追着 ──
{
  const s = newGame(SEED);
  s.Day = 8;
  check('DSL 探针 HAS? 未持有为假、持有为真',
    evalCondition('HAS?fac_prepay', s) === false
    && evalCondition('HAS?fac_prepay', { ...s, Facilities: ['fac_prepay'] }) === true);
  check('DSL 探针 EVT? 照 EventHistory',
    evalCondition('EVT?evt_d_001', { ...s, EventHistory: [] }) === false
    && evalCondition('EVT?evt_d_001', { ...s, EventHistory: ['evt_d_001'] }) === true);
  const pre = EVENTS.find(e => e.id === 'evt_d_001');
  const ownedState = { ...s, Facilities: ['fac_prepay'], Day: 9 };
  check('先钱后货牌挂上后 evt_d_001 不再符合条件',
    evalCondition(pre.condition, ownedState) === false
    && evalCondition(pre.condition, { ...s, Facilities: [], Day: 9 }) === true,
    pre.condition);
}

// ── 3d. 预检必修①：第 8–11 步之间（现金已扣、当日净额还没过账）桥也不许有差 ──
// 预检 seed 36832 的「桥差 −75」就是这一段：固定支出在第 8 步扣了现金，NP 到第 11 步才记，
// 玩家在结算屏点开进货单看到的是当日净额的假桥差。桥的右端补 pending 之后，两个时点都要平。
{
  const s = newGame(SEED);
  let midOk = 0, endOk = 0, packedOk = 0, days = 0, negDay = null;
  for (let i = 0; i < 12; i++) {
    const r = beginDay(s);
    morningPreEvent(s, r);
    submitBasket(s, [{ sku: 'MB1', qty: 2 }, { sku: 'SP1', qty: 2 }], r);
    lockTradingDay(s, { priceTier: 'qinmin' });
    morningEvent(s, r, () => null);
    const orders = drawHandOrders(s, r);
    runDay(s, orders, o => Object.fromEntries(o.lines.map(l => [l.cat, l.grams])), r);
    if (s.today.packingCents === Math.round(s.today.bowls) * 30) packedOk += 1;
    nightSettle(s, r);
    const mid = bridgeCheck(s);
    if (mid.ok) midOk += 1;
    if (s.Cash < 0 && negDay === null) negDay = { day: s.Day, netOps: s.today.netOpsCents, fixed: s.FixedCost, cash: s.Cash };
    const ev = eveningDraw(s, r);
    nightClose(s, r, ev, null);
    if (bridgeCheck(s).ok) endOk += 1;
    days += 1;
    if (s.EndingId) break;
  }
  check('桥 第 8 步（现金已扣、当日未过账）逐日平', midOk === days, `${midOk}/${days} 天平`);
  check('桥 第 11 步（当日过账后）逐日平且待过账归零', endOk === days, `${endOk}/${days} 天平`);
  check('餐盒费按碗计（0.30 元 × 取整碗数）', packedOk === days, `${packedOk}/${days} 天等于 round(碗)×0.30`);
  check('现金为负的日子，固定支出照样进当日经营净额（不静默钳制）',
    negDay !== null && negDay.netOps <= -negDay.fixed,
    negDay ? `第 ${negDay.day} 天现金 ${negDay.cash / 100}，经营净额 ${negDay.netOps / 100}（固定支出 ${negDay.fixed / 100}）` : '12 天没走到负现金');
}

// ── 4. 事件覆盖：10 天内四条至少触发三条，菜价上涨必在 4–6 天触发 ──
const fired = new Set();
for (const run of Object.values(runs)) {
  for (const d of run.log) for (const id of [d.pre, d.morning, d.evening]) if (id) fired.add(`${d.day}:${id}`);
}
const priceUpDays = runs.clean.log.filter(d => d.pre === 'evt_d_011').map(d => d.day);
// 定稿 §四.1：保底窗口 4–6 → 7–9；condition 仍是 Day>=3，所以第 3 天起自然抽到也算触发
check('事件③ 菜价上涨最晚第 9 天触发一次（定稿 §四.1 新窗口）', priceUpDays.some(d => d <= 9), `触发日 ${priceUpDays}`);
const distinct = new Set([...fired].map(s => s.split(':')[1]));
check('事件覆盖：四条里至少触发三条', distinct.size >= 3, `触发 ${[...distinct]}`);

// ── 5. 红线静态扫描（呈现层与数据表不许出现道德标签/品质数字/劝善文案）──
const banned = [
  '要不要用便宜料', '黑心老板', '缺德', '道德', '良心值', '好感度', '品质：', '品质分',
];
// 红线管的是玩家看得见的话，不管注释里对规则的转述：只扫字符串字面量与模板串文本
function literals(txt) {
  let s = txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m;
  while ((m = re.exec(s))) out.push(m[2]);
  return out;
}
const srcDir = join(HERE, 'src');
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
})(srcDir);
const hits = [];
for (const f of files) {
  const strings = literals(readFileSync(f, 'utf8'));
  for (const b of banned) {
    const at = strings.findIndex(x => x.includes(b));
    if (at >= 0) hits.push(`${f.split('\\').pop()}:${b}«${strings[at].slice(0, 24)}»`);
  }
}
check('红线静态扫描零命中', hits.length === 0, hits.join(' / '));

// ── 6. 汤底封顶与缺货：库存为 0 时不许出现负库存或凭空流水 ──
for (const [key, run] of Object.entries(runs)) {
  const bad = run.log.some(d => d.J < 0 || !Number.isFinite(d.revenue) || d.revenue < 0);
  check(`数值健康 ${key}（J/流水非负且有限）`, !bad);
}
// 凭空流水（卖掉了从来没进过门的货）——逐品类 + 汤底都按"期初 + 本篮买入"封顶
for (const [key, run] of Object.entries(runs)) {
  const ghost = [];
  run.state.DailyReports.forEach(rep => {
    for (const c of ALL_CATS) {
      const avail = roundJin((rep.stockAtOpen[c] || 0) + (rep.purchasedJin[c] || 0));
      const moved = roundJin(c === 'SP' ? rep.soupUsed : (rep.soldJin[c] || 0));
      if (moved > avail + 0.001) ghost.push(`${key} Day${rep.day} ${c} 售出 ${moved} > 可用 ${avail}`);
    }
  });
  check(`凭空流水 ${key}（售出斤数 ≤ 期初库存 + 本篮买入）`, ghost.length === 0, ghost.join(' / '));
}

// ── 7. M2 R5：短斤 Risk 时点（§〇.1 第 11 条签「豁免」，签复 b48ec8e）───────────
// 正本 3.4：3 单/日全短斤 = +1.5 Risk/日 → 约 27 天到 Risk 40（例行检查入池）、约 47 天到 Risk 70（大检查硬触发）。
// 短斤项进受保护池、Rep ≥60 的 −2/日 只吃其余来源；两件事各自守住：斜率不变 + 抵扣没坏。
const SHORT_LINE = { tier: 1, price: 'standard', weigh: 0.85, yieldAll: true,
  buyFacilities: false, upgrade: false, buyout: false };
for (const seed of [SEED, 7979, 36832]) {
  const { log } = simulate(seed, 50, SHORT_LINE);
  const rep60 = log.findIndex(d => d.Rep >= 60);
  const slope = [...new Set(log
    .map((d, i) => (i > 1 && log[i - 1].Rep >= 60 ? +(d.Risk - log[i - 1].Risk).toFixed(2) : null))
    .filter(v => v !== null))];
  check(`R5 短斤线 Rep ≥60 之后斜率仍为 +1.5/日 seed ${seed}`,
    slope.length === 1 && slope[0] === 1.5, `Rep 首破 60 = 第 ${rep60 + 1} 天，此后增量 = ${slope.join('/')}`);
  const at40 = log.find(d => d.Risk >= 40)?.day;
  const at70 = log.find(d => d.Risk >= 70)?.day;
  check(`R5 短斤线 Risk 40 / 70 与正本 3.4 锚点一致 seed ${seed}`,
    at40 === 27 && at70 === 47, `到 40 = 第 ${at40} 天（锚 27）、到 70 = 第 ${at70} 天（锚 47）`);
  check(`R5 受保护池不超过 Risk 本体 seed ${seed}`,
    log.every(d => d.Risk >= 0 && d.Risk <= 100));
}
// 亲手单档数（定稿 3.11：M2 起 3 单/日，固定摊位档起 4 单/日）——R5 锚点的前置
{
  const s1 = newGame(SEED);
  const s3 = newGame(SEED); s3.Tier = 3;
  check('R5 前置：亲手单 M2 起 3 单/日、固定摊位档起 4 单/日',
    handOrderCount(s1) === 3 && handOrderCount(s3) === 4,
    `三轮车 ${handOrderCount(s1)} 单 / 固定摊位 ${handOrderCount(s3)} 单`);
  check('R5 前置：同日抽到的亲手单不重复', (() => {
    const orders = drawHandOrders(s3, makeRng(s3));
    return orders.length === 4 && new Set(orders.map(o => o.customerId)).size === 4;
  })(), `抽到 ${drawHandOrders(s3, makeRng(s3)).length} 单`);
}
// 抵扣没坏：同一条线，非短斤来源照样被 −2/日 拉下来；短斤来源一动不动
{
  const probe = short => {
    const s = newGame(SEED);
    s.Rep = 70; s.RiskShort = short; s.Risk = 10;
    s.today.J = 10; s.today.consumed = [{ qty: 10, batch: { cat: 'MB', q: 95 } }];   // Q=95 → 黑心 0
    applyShadow(s, { shortOrders: 0, spillBowls: 0 });
    return +s.Risk.toFixed(2);
  };
  check('R5 对照：非短斤来源照吃 Rep ≥60 的 −2/日', probe(0) === 8, `Risk 10（保护池 0）→ ${probe(0)}`);
  check('R5 对照：短斤积累的部分不受抵扣（保护池原样留着）', probe(10) === 10, `Risk 10（全是保护池）→ ${probe(10)}`);
}
// 裁定 9a959bd §二：执法清算（大检查通过清至 30 / 整改清至 40）穿得过保护池，
// 顺序 = 先扣可抵扣池、不足再扣保护池。检查类事件 M2 接线前先把这条顺序钉住。
{
  const clear = (short, total, to) => {
    const s = newGame(SEED);
    s.RiskShort = short; s.Risk = total;
    applyHidden(s, { Risk: to - total });
    return { risk: +s.Risk.toFixed(2), prot: +s.RiskShort.toFixed(2), deductible: +(s.Risk - s.RiskShort).toFixed(2) };
  };
  const enough = clear(10, 25, 15);   // 可抵扣池 15 吃 10 → 剩 5，保护池一动不动
  check('R5 清算顺序：可抵扣池够扣时保护池原样留着',
    enough.risk === 15 && enough.prot === 10 && enough.deductible === 5,
    `25→${enough.risk}，保护池 ${enough.prot}，可抵扣 ${enough.deductible}`);
  const through = clear(40, 45, 30);   // 可抵扣池 5 扣光，差额 10 穿到保护池 → 40−10 = 30
  check('R5 清算顺序：可抵扣池不足时差额穿保护池（案底消得最慢）',
    through.risk === 30 && through.prot === 30 && through.deductible === 0,
    `45→${through.risk}，保护池 40→${through.prot}，可抵扣 5→${through.deductible}`);
  const toZero = clear(20, 20, 0);     // 全保护池被清零也不许留负数/残值
  check('R5 清算边界：保护池整池清零后两池都归零',
    toZero.risk === 0 && toZero.prot === 0, `20→${toZero.risk}，保护池 ${toZero.prot}`);
}

// ── 8. 存档迁移（裁定 9a959bd §一：升版不作废旧档，RiskShort 补 0、其余字段照旧带入）──
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const old = newGame(SEED);
  old.saveVersion = 'v4.9.2-cal.1';
  delete old.RiskShort;
  Object.assign(old, { Day: 6, Rep: 41.5, Cash: 12345, Risk: 22.5 });
  store.set(STORAGE_KEY, JSON.stringify(old));
  const m = loadGame();
  check('迁移：cal.1 旧档不作废，RiskShort 按「不溯及既往」补 0',
    !!m && m.RiskShort === 0, `载入 ${m ? '成功' : '失败'}，RiskShort = ${m?.RiskShort}`);
  check('迁移：其余字段照旧带入（Day / Rep / Cash / Risk）',
    !!m && m.Day === 6 && m.Rep === 41.5 && m.Cash === 12345 && m.Risk === 22.5,
    m ? `Day ${m.Day} / Rep ${m.Rep} / Cash ${m.Cash} / Risk ${m.Risk}` : '档被拒');
  check('迁移：载入后版本号升到当前 ' + SAVE_VERSION, m?.saveVersion === SAVE_VERSION, `实际 ${m?.saveVersion}`);
  store.set(STORAGE_KEY, JSON.stringify({ ...old, saveVersion: 'v4.9.1-cal.3' }));
  check('迁移：名单外的版本照旧拒绝读档（附录 F.1 原口径）', loadGame() === null);
  delete globalThis.localStorage;
}

// ── 9. M2 生产链前段（正文 3.12 / 3.14 第 4–5 步与第 7g 步）─────────────
// 备菜工时与产能、调味 M_base、添加剂解锁与计费、打包三档、早起免涨价、跳过洗切报损。
{
  const FL = a => ({ spicy: a[0], numbing: a[1], umami: a[2] });
  const round3 = x => Math.round(x * 1000) / 1000;
  // 正文 3.12 的六行情境表（v4.9.1 穷举 216 组，M3 唯一对照表）——一行都不许靠手感过
  const FLAVOR_ROWS = [
    { name: '基准 55·15·15·15', sc: scenarioOf('sunny', 10), pts: [[[3, 2, 3], 0.867], [[4, 3, 3], 0.900], [[0, 5, 0], 0.380]], best: 0.900 },
    { name: '雨天（全体辣 +1）', sc: scenarioOf('rain', 10), pts: [[[3, 2, 3], 0.820], [[4, 3, 3], 0.893], [[0, 5, 0], 0.313]], best: 0.900 },
    { name: '考试周 70·10·10·10（辣 −1）', sc: scenarioOf('sunny', 20), pts: [[[3, 2, 3], 0.893], [[4, 3, 3], 0.867], [[0, 5, 0], 0.453]], best: 0.933 },
    { name: '考试周 + 雨天（相抵）', sc: scenarioOf('rain', 20), pts: [[[3, 2, 3], 0.867], [[4, 3, 3], 0.933], [[0, 5, 0], 0.387]], best: 0.933 },
    { name: '假期 25·15·35·25', sc: scenarioOf('sunny', 25), pts: [[[3, 2, 3], 0.873], [[4, 3, 3], 0.840], [[0, 5, 0], 0.360]], best: 0.873 },
    { name: '开学·社团 65·10·10·15', sc: scenarioOf('sunny', 3), pts: [[[3, 2, 3], 0.870], [[4, 3, 3], 0.930], [[0, 5, 0], 0.390]], best: 0.930 },
  ];
  for (const r of FLAVOR_ROWS) {
    const bad = r.pts.filter(([f, want]) => round3(computeMBase(FL(f), r.sc)) !== want);
    check(`调味 M_base 锚 · ${r.name}`, bad.length === 0,
      bad.map(([f, want]) => `${f.join('/')} 得 ${round3(computeMBase(FL(f), r.sc))}（锚 ${want}）`).join('，') || r.pts.map(([f, w]) => `${f.join('/')}=${w}`).join(' '));
    let top = -1;
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) {
      top = Math.max(top, computeMBase(FL([a, b, c]), r.sc));
    }
    check(`调味全域最优方（216 组穷举）· ${r.name}`, round3(top) === r.best, `最优 ${round3(top)}（表 ${r.best}）`);
  }
  check('调味 Q_调味 =（M_base − 0.70）× 20，先钳 ±6 再进 Q',
    Math.abs(qTaste(0.900) - 4) < 1e-9 && qTaste(0.380) === -6 && Math.abs(qTaste(0.867) - 3.34) < 1e-9,
    `0.900→${qTaste(0.900).toFixed(2)} / 0.380→${qTaste(0.380)}（原值 −6.4 钳住）`);
  // 定版时按当日情境重算 M_base（情境改客群，配方没改也要跟着动）
  {
    const s = newGame(SEED);
    beginDay(s);   // 开学·社团活动周：4/3/3 = 0.930
    lockTradingDay(s, { priceTier: 'standard', flavor: FL([4, 3, 3]) });
    const school = round3(s.M_base);
    s.today.scenario = scenarioOf('rain', 10);   // 切到雨天·平稳期：同一方子 0.893
    lockTradingDay(s, { priceTier: 'standard', flavor: FL([4, 3, 3]) });
    check('第 5 步定版按当日情境重算 M_base（配方不动，客群与辣偏好一改就跟着动）',
      school === 0.930 && round3(s.M_base) === 0.893, `开学周 ${school} → 雨天 ${round3(s.M_base)}`);
  }
}
{
  // 第 4 步：工时预算 = 摊位档 workGrid，超预算不许提交（附录 F.5）
  const t1 = newGame(SEED), t3 = newGame(SEED), t5 = newGame(SEED);
  t3.Tier = 3; t5.Tier = 5;
  check('备菜工时预算按摊位档 4 / 5 / 6（小豆 +1 随人工线）',
    prepBudget(t1) === 4 && prepBudget(t3) === 5 && prepBudget(t5) === 6,
    `三轮车 ${prepBudget(t1)} / 固定摊位 ${prepBudget(t3)} / 门面 ${prepBudget(t5)}`);
  const over = commitPrep(t1, ['认真', '认真', '认真'], false);
  check('备菜超预算不许提交，档位原样不动',
    over.ok === false && t1.Prep.join('/') === '将就/将就/将就' && t1.WorkGridUsed === 0,
    `${over.used} 格 > ${over.budget} 格`);
  const fits = commitPrep(t3, ['认真', '认真', '跳过'], true);
  check('早起占 1 格：认真 2 + 认真 2 + 跳过 0 + 早起 1 = 5 格正好放得下',
    fits.ok === true && fits.used === 5 && t3.WakeEarly === true && t3.today.prepped === true, `用 ${fits.used}/${fits.budget}`);
  const tight = commitPrep(t3, ['认真', '认真', '将就'], true);
  check('早起挤掉一格后同一套就超预算（要人手还是要早起）',
    tight.ok === false && tight.used === 6, `${tight.used} 格 > ${tight.budget}`);
  check('预算用的档位表与正本一致（认真 2 / 将就 1 / 跳过 0）',
    PREP_LEVELS.map(l => l.grid).join('/') === '2/1/0', PREP_LEVELS.map(l => `${l.id}${l.grid}`).join(' '));
}
{
  // 第 7g 步：产能上限 = 档位斤数 × 三项备菜连乘；截断顺序 = 亲手全额 → 熟客顺延 → 只缩自动层
  const s = newGame(SEED);
  s.Prep = ['认真', '认真', '认真'];
  check('全认真产能 = 130 × 1.05³ = 150.5 斤', Math.abs(capacityJin(s) - 130 * 1.157625) < 0.01, `${capacityJin(s).toFixed(2)} 斤`);
  s.Prep = ['跳过', '跳过', '跳过'];
  check('全跳过产能 = 130 × 0.90³ = 94.8 斤', Math.abs(capacityJin(s) - 130 * 0.729) < 0.01, `${capacityJin(s).toFixed(2)} 斤`);

  const BIG = [{ sku: 'MB1', qty: 60 }, { sku: 'MT1', qty: 60 }, { sku: 'VG1', qty: 60 },
    { sku: 'BF1', qty: 60 }, { sku: 'NS1', qty: 60 }, { sku: 'SP1', qty: 300 }];
  const starved = (cap, days) => {
    const st = newGame(SEED);
    st.CapacityBase = cap; st.R = 30; st.Cash = 4000000;
    const out = [];
    for (let i = 0; i < days; i++) {
      const r = makeRng(st);
      beginDay(st);
      submitBasket(st, BIG.map(l => ({ sku: SKU_BY_ID[l.sku], qty: l.qty })), r);
      lockTradingDay(st, { priceTier: 'standard' });
      const orders = drawHandOrders(st, r);
      const handJin = orders.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.grams, 0), 0) / 1000;
      runDay(st, orders, o => Object.fromEntries(o.lines.map(l => [l.cat, l.grams])), r);
      nightSettle(st, r);
      out.push({ t: st.today, R: st.R, carry: st.reg_reserved_bowls, handJin });
    }
    return out;
  };
  const d1 = starved(10, 1)[0], d2 = starved(10, 2)[1];
  check('产能封顶当日总出餐（含亲手单），账面上不出现超产',
    d1.t.J <= 10.001 && d1.t.capJin === 10 && d1.t.bowls * d1.t.scenario.avgJin <= 10.05,
    `J ${d1.t.J.toFixed(2)} / 上限 ${d1.t.capJin}`);
  check('截断顺序第一档：亲手单全额出（不许被产能砍）',
    (d1.t.handRefused || 0) === 0 && d1.handJin < 10, `亲手 ${d1.handJin.toFixed(2)} 斤全出`);
  check('截断顺序第二档：熟客超出只顺延、当日不罚（不成交不罚）',
    d1.t.deferredBowls > 0 && !d1.t.regLost && d1.carry > 0,
    `顺延 ${d1.t.deferredBowls} 碗、留柜 ${d1.carry} 碗、R ${d1.R}`);
  check('连两日没吃上才走人：第二日按昨日留柜数扣 R',
    d2.t.regLost > 0 && d2.t.regLost <= d1.carry + 3,
    `昨日留柜 ${d1.carry} → 今日再延 ${d2.t.deferredBowls}，走了 ${d2.t.regLost} 位，R ${d1.R}→${d2.R}`);
  check('汤底按缩放后的实际总碗数 ×T 扣（不扣需求侧）',
    Math.abs(d1.t.soupUsed - d1.t.bowls * d1.t.scenario.T) < 0.05,
    `${d1.t.bowls.toFixed(2)} 碗 × T ${d1.t.scenario.T} = 耗汤 ${d1.t.soupUsed.toFixed(2)} 份`);
  // 不封顶（样段 M1 口径）时熟客一碗都不该顺延，产能线只在该截断的日子动刀
  const free = starved(100000, 1)[0];
  check('产能没撞顶时不许凭空造出顺延', free.t.deferredBowls === 0 && free.t.regLost === undefined, `J ${free.t.J.toFixed(2)} 斤`);
  // 第 3 步试算也要看得见这道闸：撞顶时卡点报 'cap'，界面据此换一句话（买再多菜也不解这道题）
  {
    const fProbe = cap => {
      const st = newGame(SEED);
      st.CapacityBase = cap; st.Cash = 4000000;
      beginDay(st);
      const picks = BIG.map(l => ({ sku: SKU_BY_ID[l.sku], qty: l.qty }));
      return previewBasket(st, picks, 'standard').forecast;
    };
    const hit = fProbe(8), miss = fProbe(100000);
    check('试算撞顶时卡点 = cap（顶格碗数进 bottleneckBowls，供得出货也不算缺货）',
      hit.bottleneck === 'cap' && hit.bottleneckBowls === hit.capped && hit.capped < hit.supplyBowls,
      `上限 ${hit.bottleneckBowls} 碗 / 这一篮能出 ${Math.round(hit.supplyBowls)} 碗`);
    check('没撞顶时试算仍报品类卡点（不把产能话术错安在缺货上）',
      miss.bottleneck !== 'cap' && ALL_CATS.includes(miss.bottleneck), `卡点 ${miss.bottleneck}`);
  }
}
{
  // 跳过洗切：青菜 / 豆制品菌菇 / 粉面 隔夜报损额外 +20%（相对值，落在本该留到次日的货上）
  const washProbe = skip => {
    const s = newGame(SEED);
    s.Prep = skip ? ['跳过', '将就', '将就'] : ['将就', '将就', '将就'];
    s.today.avgCostBefore = { MB: 24, MT: 22, VG: 6, BF: 10, NS: 5, SP: 1.2 };
    s.Batches = [{ sku: 'BF1', cat: 'BF', qty: 10, costPerUnit: 10 }, { sku: 'NS1', cat: 'NS', qty: 10, costPerUnit: 5 },
      { sku: 'MT3', cat: 'MT', qty: 4, costPerUnit: 9.5 }];
    for (const c of ['BF', 'NS', 'MT']) s.CostPool[c] = 1000000;
    recomputeStock(s);
    const loss = settleWriteoff(s);
    return { yuan: loss.cents / 100, skip: loss.detail.filter(d => d.skipWash).map(d => `${d.cat}:${d.qty}`).join(' '), left: `${s.StockSolid.BF}/${s.StockSolid.NS}` };
  };
  const keep = washProbe(false), harm = washProbe(true);
  check('跳过洗切只加在能过夜的品类上（豆制品 + 粉面 各两成）',
    harm.skip === 'BF:2 NS:2' && keep.skip === '' && harm.left === '8/8',
    `多报损 ${(harm.yuan - keep.yuan).toFixed(2)} 元，剩货 ${harm.left}`);
  check('跳过洗切不动鲜肉丸子（腌渍站另算）',
    Math.abs(harm.yuan - keep.yuan - 30) < 0.01 && harm.skip.split(' ').length === 2,
    `全额报损 ${keep.yuan} → ${harm.yuan} 元`);
}
{
  // 添加剂：解锁门（调料摊 = 摊位 ≥ 二手餐车）+ 按第 7h 步未取整碗数计费
  const gated = newGame(SEED);
  beginDay(gated);
  const r = lockTradingDay(gated, { additiveTier: 'more' });
  check('三轮车档不出现添加剂开关，引擎按不掺收', r.ok === true && gated.AdditiveTier === 'none', `档位 ${gated.AdditiveTier}`);
  const un = newGame(SEED);
  beginDay(un); un.Tier = 2;
  lockTradingDay(un, { additiveTier: 'less' });
  check('摊位 ≥ 二手餐车后少掺才落档', additiveUnlocked(un) === true && un.AdditiveTier === 'less', `档位 ${un.AdditiveTier}`);
  const bill = newGame(SEED);
  beginDay(bill); bill.Tier = 2; bill.AdditiveTier = 'less';
  Object.assign(bill.today, {
    avgCostBefore: { MB: 24, MT: 22, VG: 6, BF: 10, NS: 5, SP: 1.2 },
    soldJin: { MB: 0, MT: 0, VG: 0, BF: 0, NS: 0, SP: 0 }, soupUsed: 0,
    bowls: 12.345, packingCents: 0, revenueCents: 0,
  });
  settleDay(bill);
  check('掺量按未取整碗数计费（少掺 0.1 元/碗 → 12.345 碗收 1.23 元）',
    bill.today.additiveCents === 123 && additiveOf(bill).perBowl === 0.1, `${bill.today.additiveCents} 分`);
  check('三档掺量的数值与附录 D.2 一致',
    [['none', 0, -0, 0], ['less', 0.1, -4, 2], ['more', 0.2, -8, 3]].every(([id, per, q, risk]) => {
      const a = ADDITIVE[id]; return a.perBowl === per && a.q === q && a.risk === risk;
    }), Object.keys(ADDITIVE).map(k => `${k}:${ADDITIVE[k].perBowl}/${ADDITIVE[k].q}/${ADDITIVE[k].risk}`).join(' '));
  check('未知打包 / 添加剂档驳回定版（不许静默按 0 元）',
    lockTradingDay(newGame(SEED), { packingTier: 'gold' }).ok === false
    && lockTradingDay(newGame(SEED), { additiveTier: 'ADD1' }).ok === false);
}
{
  // 打包三档：定版生效 + 同抽序下漏洒单调（袋 ≥ 普通 ≥ 保温）
  const s = newGame(SEED);
  beginDay(s);
  lockTradingDay(s, { priceTier: 'standard', packingTier: 'thermal' });
  check('第 5 步②：打包档当日生效（0.60 元/碗、漏洒 0.5%）',
    s.PackingTier === 'thermal' && PACKING.thermal === 0.6 && PACKING_SPILL.thermal === 0.005, `${s.PackingTier}`);
  const spillOf = tier => {
    const st = newGame(SEED);
    st.Cash = 4000000;
    const r = makeRng(st);
    beginDay(st);
    const sub = submitBasket(st, [{ sku: SKU_BY_ID.MB1, qty: 40 }, { sku: SKU_BY_ID.MT1, qty: 40 }, { sku: SKU_BY_ID.VG1, qty: 40 },
      { sku: SKU_BY_ID.BF1, qty: 40 }, { sku: SKU_BY_ID.NS1, qty: 40 }, { sku: SKU_BY_ID.SP1, qty: 200 }], r);
    lockTradingDay(st, { priceTier: 'standard', packingTier: tier });
    const orders = drawHandOrders(st, r);
    runDay(st, orders, o => Object.fromEntries(o.lines.map(l => [l.cat, l.grams])), r);
    return { ok: sub.ok, spill: st.today.spillBowls, take: st.today.takeawayBowls, bowls: Math.round(st.today.bowls), cents: st.today.packingCents };
  };
  const bag = spillOf('bag'), mid = spillOf('normal'), hot = spillOf('thermal');
  check('打包探针本身成立（篮付得开、有外带碗可抽）',
    bag.ok && bag.bowls > 0 && bag.take > 0, `${bag.bowls} 碗 / 外带 ${bag.take} 碗`);
  check('同种子同抽序下漏洒随打包档单调（袋 ≥ 普通 ≥ 保温）',
    bag.spill >= mid.spill && mid.spill >= hot.spill, `袋 ${bag.spill} / 普通 ${mid.spill} / 保温 ${hot.spill} 碗`);
  check('餐盒费按所选档 ×取整碗数', bag.cents === 0 && mid.cents === bag.bowls * 30 && hot.cents === bag.bowls * 60,
    `${bag.bowls} 碗：袋 ${bag.cents} / 普通 ${mid.cents} / 保温 ${hot.cents} 分`);
}
{
  // 早起换的实惠：只免 3.10 当日 30% 晨采涨价，其余供应端联动照旧
  const s = newGame(SEED);
  s.today.scenario = scenarioOf('rain', 10);
  s.today.priceMods = s.today.scenario.priceMods;
  s.WakeEarly = false;
  const rainVg1 = effectivePrice(s, SKU_BY_ID.VG1);
  const rainVg2 = effectivePrice(s, SKU_BY_ID.VG2);
  s.WakeEarly = true;
  const waived = effectivePrice(s, SKU_BY_ID.VG1);
  check('早起免当日 30% 晨采涨价（只命中菜农直供 / 老李那一档）',
    Math.abs(rainVg1 - waived * 1.3) < 0.02 && effectivePrice(s, SKU_BY_ID.VG2) === rainVg2,
    `VG1 ${rainVg1} → ${waived} 元，VG2 ${rainVg2} 元不动`);
  const s2 = newGame(SEED);
  s2.today.scenario = scenarioOf('sunny', 3);
  s2.today.priceMods = s2.today.scenario.priceMods;
  s2.WakeEarly = true;
  check('开学周全线小涨不在早起豁免口径内',
    Math.abs(effectivePrice(s2, SKU_BY_ID.VG1) - 6 * s2.PriceIndex * 1.1) < 0.02,
    `${effectivePrice(s2, SKU_BY_ID.VG1)} 元`);
}
{
  // 备菜品质修正只进当日 Q（3.4 表：认真 +10 / 将就 0 / 跳过 −8）
  const qOf = level => {
    const s = newGame(SEED);
    s.Prep = [level, '将就', '将就'];
    beginDay(s);
    s.today.J = 10;
    s.today.consumed = [{ qty: 10, batch: { cat: 'VG', q: 70 } }];
    return computeQ(s).Q;
  };
  check('洗切认真 / 将就 / 跳过 = Q +10 / 0 / −8（同原料同调味）',
    qOf('认真') - qOf('将就') === 10 && qOf('将就') - qOf('跳过') === 8,
    `认真 ${qOf('认真')} / 将就 ${qOf('将就')} / 跳过 ${qOf('跳过')}`);
  check('跳过洗切的品类判定跟 PREP_STATIONS 走（洗切站 = 青菜）', washSkipped({ Prep: ['跳过', '将就', '将就'] }) === true
    && washSkipped({ Prep: ['将就', '跳过', '将就'] }) === false);
  check('第 4 步与第 5 步的先后不锁定也不串档：未备菜的日子照旧用昨日档位（引擎默认将就）',
    newGame(SEED).Prep.join('/') === '将就/将就/将就' && prepGridUsed(newGame(SEED)) === 3,
    `开局 ${newGame(SEED).Prep.join('/')} · ${prepGridUsed(newGame(SEED))} 格`);
}

// ── 输出 ─────────────────────────────────────────────────────────
// ① 落区间外时给算术证据：正文 3.10 学期循环第 1–5 天必为开学·社团活动周，
// 而开学周是"全线 ×1.1 + 品类系数偏肉（MB1.3/MT1.2）"；附录 D.5 的 2.5 元/碗 锚点按固定品类占比算，不含这两项。
function bowlMarginYuan(tier, priceTierId, weatherId, semesterDay) {
  const probe = newGame(SEED);
  probe.today.scenario = scenarioOf(weatherId, semesterDay);
  probe.today.priceMods = probe.today.scenario.priceMods;
  probe.today.priceMultToday = {};
  const sc = probe.today.scenario;
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * sc.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  const perBowlJin = sc.avgJin * SOLID_CATS.reduce((s, c) => s + (omega[c] / Omega) * effectivePrice(probe, SKU_BY_ID[c + tier]), 0)
    + sc.T * effectivePrice(probe, SKU_BY_ID['SP' + tier]);
  return { cost: perBowlJin, rev: sc.avgJin * PRICE_TIERS[priceTierId].perJin,
    margin: sc.avgJin * PRICE_TIERS[priceTierId].perJin - perBowlJin - PACKING[CONFIG.packingTier] };
}
if (!(clean5 >= -450 && clean5 <= 360)) {
  console.log('\n【压力测试① 单斤毛利证据】三轮车固定支出 75 元/日（定稿 §一）；保本斤数 = 75 ÷ 单斤毛利');
  for (const w of ['sunny', 'rain']) {
    const m = bowlMarginYuan(1, 'qinmin', w, 1);
    const p = bowlMarginYuan(1, 'qinmin', w, 10);
    console.log(`  ${WEATHER[w].name}｜开学周：流水 ${m.rev.toFixed(2)} − 食材 ${m.cost.toFixed(2)} − 包装 0.30 = ${m.margin.toFixed(2)} 元/斤` +
      `（保本 ${m.margin > 0 ? (75 / m.margin).toFixed(0) : '∞'} 斤/日）   ` +
      `${WEATHER[w].name}｜平稳期：${p.margin.toFixed(2)} 元/斤（保本 ${p.margin > 0 ? (75 / p.margin).toFixed(0) : '∞'} 斤/日）`);
  }
  console.log('  开学周正经篮单斤进货成本（含全线 ×1.1）≈ 16.83 元 → 首日 600 现金 + 600 额度 = 1200 元最多买 71 斤；保本需 73 斤。');
}
console.log(`种子 ${SEED}｜进货口径 appc（附录 C 试算碗数；另一口径 d0 = 3.14 第 7 步 D0 公开项，见 sweep_calibration.js A 段）`);
for (const [key, run] of Object.entries(runs)) {
  console.log(`\n【${STRATEGIES[key].name}】逐日（元）`);
  console.log(' 天 气   碗  斤   Q    流水   COGS  报损  净额  事件账  现金   欠款  NP    Rep  Risk  C    H    R');
  for (const d of run.log) {
    console.log(`${String(d.day).padStart(2)} ${d.weather.padEnd(4)} ${String(d.bowls).padStart(3)}` +
      ` ${d.J.toFixed(2).padStart(6)} ${String(Math.round(d.Q)).padStart(4)}` +
      ` ${d.revenue.toFixed(1).padStart(7)} ${d.cogs.toFixed(1).padStart(6)} ${d.writeoff.toFixed(1).padStart(6)}` +
      ` ${d.netOps.toFixed(1).padStart(7)} ${d.eventNet.toFixed(1).padStart(7)}` +
      ` ${d.cash.toFixed(1).padStart(8)} ${d.debt.toFixed(1).padStart(6)} ${d.NP.toFixed(1).padStart(7)}` +
      ` ${d.Rep.toFixed(1).padStart(5)} ${d.Risk.toFixed(1).padStart(5)} ${d.C.toFixed(1).padStart(4)} ${d.H.toFixed(1).padStart(4)} ${String(d.R).padStart(3)}`);
  }
  console.log(`  5 日累计（经营净额 + 事件账净额）= ${npSum(run, 5).toFixed(2)} 元；10 日 = ${npSum(run, 10).toFixed(2)} 元`);
}
console.log('\n' + notes.join('\n'));
if (failures.length) {
  console.log(`\n✗ FAIL ${failures.length} 项：`);
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('\n✓ ALL PASS');
