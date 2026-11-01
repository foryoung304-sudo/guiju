// M1 回归回路（红/绿命令）：node test_regression.js [种子]
// 断言 = 三条极端玩法压力测试 + 逐日账目可核 + 同种子复现 + 事件覆盖 + 红线静态扫描
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, STRATEGIES } from './src/sim.js';
import { bridgeCheck } from './src/engine/ledger.js';
import { newGame, roundJin, loadGame, STORAGE_KEY } from './src/engine/state.js';
import { effectivePrice, buildBasket, planPayment } from './src/engine/market.js';
import { ALL_CATS, CAT, SOLID_CATS, PRICE_TIERS, PACKING, CONFIG, SAVE_VERSION } from './src/data/constants.js';
import { SKU_BY_ID } from './src/data/skus.js';
import { scenarioOf, WEATHER } from './src/data/scenario.js';
import { evalCondition } from './src/engine/dsl.js';
import { EVENTS } from './src/data/events.js';
import { beginDay, morningPreEvent, submitBasket, lockTradingDay, morningEvent, runDay, nightSettle, eveningDraw, nightClose } from './src/engine/day.js';
import { drawHandOrders, handOrderCount } from './src/engine/weigh.js';
import { applyHidden } from './src/engine/events.js';
import { applyShadow } from './src/engine/shadow.js';
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
    lockTradingDay(s, 'qinmin');
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
