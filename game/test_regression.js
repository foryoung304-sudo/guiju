// M1 回归回路（红/绿命令）：node test_regression.js [种子]
// 断言 = 三条极端玩法压力测试 + 逐日账目可核 + 同种子复现 + 事件覆盖 + 红线静态扫描
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { bridgeCheck, settleDay, settleWriteoff, settleTasting } from './src/engine/ledger.js';
import { newGame, roundJin, loadGame, STORAGE_KEY } from './src/engine/state.js';
import { effectivePrice, buildBasket, planPayment, recomputeStock, buyTool, sellBackTool, ownsTool, upgradeStall, isFacilityUnlocked, skuAvailable } from './src/engine/market.js';
import { ALL_CATS, CAT, SOLID_CATS, PRICE_TIERS, PACKING, PACKING_SPILL, CONFIG, SAVE_VERSION,
  ADDITIVE, PREP_LEVELS, LABOR, TASTING, TOOLS, SCALE_DELTA_J_SHARE, SCALE_C_PER_JIN, SCALE_RISK_PER_JIN,
  COMPETITION, INSPECTION, FACILITIES, ENDING, BLANCH, TIERS_STALL, SUBSTREAMS,
  BUYOUT_PRICE_CENTS, RETIRE_NP_CENTS, HEARTBURN_WMAX_JIN, QUIT_VARIANT_NP_CENTS, QUIT_VARIANT_REP } from './src/data/constants.js';
import { SKU_BY_ID } from './src/data/skus.js';
import { scenarioOf, WEATHER } from './src/data/scenario.js';
import { evalCondition } from './src/engine/dsl.js';
import { EVENTS, EVENT_BY_ID } from './src/data/events.js';
import { windowOf, pushRecent, todaySignal } from './src/engine/recent.js';
import { beginDay, morningPreEvent, submitBasket, previewBasket, commitPrep, lockTradingDay, morningEvent, runDay, nightSettle, eveningDraw, nightClose, checkEndings,
  judgeBuyout, judgeRetire, quitVariant, quitBlurb, closeShop } from './src/engine/day.js';
import { additiveOf, additiveUnlocked, capacityJin, computeMBase, prepBudget, prepGridUsed, qTaste, washSkipped,
  xiaodouPresent, laborCapMul, laborCostCents, tastingConvert } from './src/engine/production.js';
import { drawHandOrders, handOrderCount } from './src/engine/weigh.js';
import { applyHidden, resolveChoice, weightOf, drawEvent, isActionAvailable, isActionAffordable } from './src/engine/events.js';
import { inspectionScore, ticketlessCostCents, destroyTicketless, judgeBigInspection, judgeRoutineInspection } from './src/engine/inspection.js';
import { blanchValueAt, judgeBlanch, signalTier } from './src/engine/blanch.js';
import { REGULAR_LINES, regularLine, REGULAR_SLOTS } from './src/data/customers.js';
import { buildComments } from './src/engine/comments.js';
import { COMMENT_POOLS } from './src/data/comments.js';
import { morningRivals, priceWarReprice, sharesAndS, tallySuppression, rivalPriceCoef, previewShare } from './src/engine/competition.js';
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
// M1 口径：正文 3.5:141 明写压力测试带跑在 M1 构建（无小豆人工、无竞争，S ≡ 1），「人工与产能数值不参与本区间判定」。
// M2 开人工线 / 竞争层 / 完整事件池后本段一律传 labor:false + competition:false + eventScope:'m1' 复现签发时的口径
// （§八 M1 行把「特殊事件、完整事件池」整体划给 M2，eventScope:'m1' 只挡 ship='M2' 的数据行，不改任何数值）；
// M2 在场口径的另立区间店主还没给，只作证据不套带。
const M1 = { labor: false, competition: false, eventScope: 'm1' };
const runs = {};
for (const [key, strategy] of Object.entries(STRATEGIES)) runs[key] = simulate(SEED, 10, strategy, 'headless', M1);

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
const again = simulate(SEED, 10, STRATEGIES.cheap, 'headless', M1);
const same = JSON.stringify(again.state.DailyReports) === JSON.stringify(runs.cheap.state.DailyReports)
  && JSON.stringify(again.state.streamCounter) === JSON.stringify(runs.cheap.state.streamCounter);
check('同种子复现（暗线 + 账目 + 子流计数全一致）', same);
const otherSeed = simulate(SEED + 1, 10, STRATEGIES.cheap, 'headless', M1);
check('换种子结果不同（子流确实在用种子）',
  JSON.stringify(otherSeed.log.map(l => l.Rep)) !== JSON.stringify(runs.cheap.log.map(l => l.Rep)));

// 界面把打烊拆成 nightSettle / eveningDraw / nightClose 三步（要停在晚间事件上等玩家点），
// 无头线一步 closeDay。两条线必须逐字段一样：这一步拆错过一次，抽到的晚间事件没传进 nightClose，
// 账面照样平、事件却永远不落地——界面玩家看到的账和跑表账就此分家
for (const key of ['clean', 'mid', 'cheap']) {
  const split = simulate(SEED, 10, STRATEGIES[key], 'ui', M1);
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
// M2 第四批接竞争层后本段再钉一条 competition:false：27/47 是「街上没有分流（S ≡ 1）」时签的锚点，与 labor 同一条理由。
const SHORT_LINE = { tier: 1, price: 'standard', weigh: 0.85, yieldAll: true,
  buyFacilities: false, upgrade: false, buyout: false };
for (const seed of [SEED, 7979, 36832]) {
  const { log } = simulate(seed, 50, SHORT_LINE, 'headless', { competition: false, eventScope: 'm1' });
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
  // 人工线开线后小豆在场会 +1 格，所以这一段先把 laborOn 关掉量"光摊位档"的基数，
  // 在场加成单独一条断言（正文 3.5 / §10），否则同一张摊位表会被在场状态来回推着走
  const t1 = newGame(SEED), t3 = newGame(SEED), t5 = newGame(SEED);
  t3.Tier = 3; t5.Tier = 5;
  for (const t of [t1, t3, t5]) t.laborOn = false;
  check('备菜工时预算按摊位档 4 / 5 / 6（本段关人工，在场 +1 格另见 §10）',
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
  // 本段关人工：130 × 1.05³ 的锚是"只有备菜三项"的口径，人工 ×1.10 单列一条（§10）
  const s = newGame(SEED);
  s.laborOn = false;
  s.Prep = ['认真', '认真', '认真'];
  check('全认真产能 = 130 × 1.05³ = 150.5 斤', Math.abs(capacityJin(s) - 130 * 1.157625) < 0.01, `${capacityJin(s).toFixed(2)} 斤`);
  s.Prep = ['跳过', '跳过', '跳过'];
  check('全跳过产能 = 130 × 0.90³ = 94.8 斤', Math.abs(capacityJin(s) - 130 * 0.729) < 0.01, `${capacityJin(s).toFixed(2)} 斤`);

  const BIG = [{ sku: 'MB1', qty: 60 }, { sku: 'MT1', qty: 60 }, { sku: 'VG1', qty: 60 },
    { sku: 'BF1', qty: 60 }, { sku: 'NS1', qty: 60 }, { sku: 'SP1', qty: 300 }];
  const starved = (cap, days) => {
    const st = newGame(SEED);
    st.CapacityBase = cap; st.R = 30; st.Cash = 4000000; st.laborOn = false;
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

// ── 10. M2 第三批：人工线 / 显多秤 / 试吃一元角（正文 3.5、3.6 注、3.12 / 附录 D.3、D.5、F.7）──
{
  // 附录 F.7 `LaborCost` 行：在场日结 6000（三轮车—档口）/ 9000（门面—双店）/ 正式合同后 12000
  const wageAt = (tier, contract) => {
    const s = newGame(SEED);
    s.Tier = tier;
    if (contract) s.Facilities.push('fac_contract');
    return laborCostCents(s);
  };
  check('人工三档：Tier 1–4 日结 60 元、Tier 5–6 90 元、正式合同 120 元（附录 F.7 LaborCost 行 + D.3 合同行）',
    wageAt(1) === LABOR.perDay && wageAt(4) === LABOR.perDay && wageAt(5) === LABOR.highTierPerDay
    && wageAt(6) === LABOR.highTierPerDay && wageAt(1, true) === LABOR.contractPerDay
    && wageAt(6, true) === LABOR.contractPerDay,
    `${wageAt(1) / 100} / ${wageAt(5) / 100} / ${wageAt(6, true) / 100} 元`);
  // 退场开关：正文 3.5:141 的压力测试带跑在 M1 构建（无小豆人工），M1 口径全靠这一条把三项效果一次性摘掉
  const noXiaodou = newGame(SEED);
  noXiaodou.laborOn = false;
  check('laborOn=false 一次性摘掉整条人工线（工资 0 + 产能不加成 + 工时不加格）= M1 口径',
    xiaodouPresent(noXiaodou) === false && laborCostCents(noXiaodou) === 0
    && laborCapMul(noXiaodou) === 1 && prepBudget(noXiaodou) === 4,
    `三轮车 ${prepBudget(noXiaodou)} 格、工资 ${laborCostCents(noXiaodou)} 分`);
  const absent = newGame(SEED);
  absent.XiaodouAbsentDays = 1;
  check('在场三效果同起同落：请假 / 被挖角当日工资 0、×1.10 与 +1 格同时消失',
    xiaodouPresent(absent) === false && laborCostCents(absent) === 0 && laborCapMul(absent) === 1
    && prepBudget(absent) === prepBudget(noXiaodou), `${prepBudget(absent)} 格 / ×${laborCapMul(absent)}`);
  const on = newGame(SEED), contract = newGame(SEED);
  contract.Facilities.push('fac_contract');
  check('在场产能 ×1.10、工时 +1 格；正式合同 ×1.15 覆盖不叠加（正文 3.5 / 附录 F.5 WorkGridUsed 行）',
    laborCapMul(on) === LABOR.capMul && laborCapMul(contract) === LABOR.contractCapMul
    && LABOR.contractCapMul > LABOR.capMul && prepBudget(on) === 5,
    `×${laborCapMul(on)} → 合同 ×${laborCapMul(contract)}；工时 4 → ${prepBudget(on)}`);
  beginDay(absent);
  check('缺席天数在第 1 步递减，期满自动回场（不等事件再判一次）',
    absent.XiaodouAbsentDays === 0 && xiaodouPresent(absent) === true, `递减后 ${absent.XiaodouAbsentDays} 日`);

  // 钱：工资既扣现金又进经营净额，逐日恒等式与桥都要平
  const laborOn5 = simulate(SEED, 5, STRATEGIES.clean, 'headless', { ...M1, labor: true });
  const reps = laborOn5.state.DailyReports;
  const idOK = reps.every(r => r.grossCents - r.writeoffCents - r.fixedCents - r.laborCents
    + r.tastingNetCents === r.netOpsCents);
  check('在场日经营净额 = 毛利 − 报损 − 固定 − 人工 + 试吃净额（逐日核 5 天）',
    idOK && reps.every(r => r.laborCents === LABOR.perDay),
    `5 日工资合计 ${reps.reduce((s, r) => s + r.laborCents, 0) / 100} 元`);
  const lb = bridgeCheck(laborOn5.state);
  check('在场 5 日现金桥对平（工资走现金这条腿没漏）', lb.ok, `差 ${lb.diff / 100} 元`);
  check('NP 含人工：Σ(经营净额 + 事件账净额) = NP',
    reps.reduce((s, r) => s + r.netOpsCents + r.eventNetCents, 0) === laborOn5.state.NP,
    `NP ${laborOn5.state.NP / 100} 元`);
  check('关人工的同一 5 日 = M1 已签口径（位移全部来自第三批，不动带）',
    npSum(simulate(SEED, 5, STRATEGIES.clean, 'headless', M1), 5) === clean5
    && laborOn5.log.every(d => d.labor === 60), `M1 ${clean5.toFixed(2)} 元 vs 在场 ${npSum(laborOn5, 5).toFixed(2)} 元`);
}
{
  // 附录 D.3 显多秤：杂货摊器具（780 买 / 390 卖回、固定摊位后上架），与设施同一条支付口径但不计 L
  const g = newGame(SEED);
  g.Cash = 2000000;
  g.Tier = 2;
  check('显多秤 Tier 2 买不到（unlock 原文「Tier >= 固定摊位」，DSL 词法器不认汉字，按档位序号落 3）',
    buyTool(g, 'JI_SCALE') === false && ownsTool(g, 'JI_SCALE') === false);
  g.Tier = 3;
  g.Cash = TOOLS.JI_SCALE.price - 1;
  check('显多秤现金不足整笔驳回（与进货同口径，不自动减量、不许赊）', buyTool(g, 'JI_SCALE') === false);
  g.Cash = 2000000;
  const cash0 = g.Cash, inv0 = g.NetInvestSpent, fac0 = g.Facilities.length, L0 = g.L;
  check('显多秤 780 元即时扣现金并单列净投资（正文 3.14 第 3 步）',
    buyTool(g, 'JI_SCALE') === true && g.Cash === cash0 - TOOLS.JI_SCALE.price
    && g.NetInvestSpent === inv0 + TOOLS.JI_SCALE.price, `净投资 ${g.NetInvestSpent / 100} 元`);
  check('器具不进 Facilities、不 +L（附录 E evt_s_promo 实现约束第 2 条明写显多秤不计 L）',
    g.Facilities.length === fac0 && g.L === L0, `设施 ${g.Facilities.length} 件 / L ${g.L}`);
  g.ScaleShowOn = true;
  const cash1 = g.Cash;
  check('卖回半价 390 元、净投资回冲、当日开关随之落回卸下档',
    sellBackTool(g, 'JI_SCALE') === true && g.Cash === cash1 + TOOLS.JI_SCALE.sellBack
    && g.NetInvestSpent === inv0 + TOOLS.JI_SCALE.price - TOOLS.JI_SCALE.sellBack
    && ownsTool(g, 'JI_SCALE') === false && g.ScaleShowOn === false,
    `回冲后净投资 ${g.NetInvestSpent / 100} 元`);
  check('手上没有的秤不许卖回（不凭空回收半价）', sellBackTool(g, 'JI_SCALE') === false);

  // 双轨计费：实际出餐 J 不动，只有计费斤数抬起来；暗线代价按裁定 9a959bd §三 进分量作假池
  const off = simulate(SEED, 1, STRATEGIES.mid, 'headless', M1);
  const scaled = simulate(SEED, 1, STRATEGIES.mid, 'headless', { ...M1, scale: true });
  const a = off.state.today, c = scaled.state.today;
  check('装秤只改计费不改出菜：J 一致、ΔJ = 自动层 ×0.08、计费斤数 = J + ΔJ',
    a.J === c.J && a.deltaJ === 0 && c.deltaJ === roundJin(c.autoJin * SCALE_DELTA_J_SHARE)
    && c.J_bill === roundJin(c.J + c.deltaJ),
    `J ${a.J} 斤｜自动层 ${c.autoJin} 斤 → ΔJ ${c.deltaJ}｜计费 ${c.J_bill} 斤`);
  check('ΔJ 计流水不计 COGS（附录 B :445：多出来的斤数没真给货）',
    c.revenueCents > a.revenueCents && c.cogsCents === a.cogsCents,
    `流水 ${a.revenueCents / 100} → ${c.revenueCents / 100} 元，COGS ${a.cogsCents / 100} 元不变`);
  const dR = scaled.state.Risk - off.state.Risk, dC = scaled.state.C - off.state.C;
  check('ΔJ 的暗线代价整段落进分量作假池：Risk +ΔJ×0.3、C/H +ΔJ×0.05（裁定 9a959bd §三）',
    scaled.state.today.deltaJ > 0 && NEAR(dR, c.deltaJ * SCALE_RISK_PER_JIN, 0.01)
    && NEAR(scaled.state.RiskShort - off.state.RiskShort, c.deltaJ * SCALE_RISK_PER_JIN, 0.01)
    && NEAR(dC, c.deltaJ * SCALE_C_PER_JIN, 0.01),
    `ΔJ ${c.deltaJ} 斤 → Risk +${dR.toFixed(2)}（作假池累计 ${scaled.state.RiskShort.toFixed(2)}）、C/H +${dC.toFixed(2)}`);
  // ΔJ 只进流水这一条腿：三日连续装秤，桥与 NP 仍要逐日对平（跑表线自然开局款，不手工注入现金）
  const scaled3 = simulate(SEED, 3, STRATEGIES.mid, 'headless', { ...M1, scale: true });
  const sb = bridgeCheck(scaled3.state);
  check('装秤三日账仍平：ΔJ 进流水、桥与 NP 逐日对得上（不虚增成本也不虚增现金）',
    sb.ok && scaled3.state.DailyReports.reduce((x, r) => x + r.netOpsCents + r.eventNetCents, 0) === scaled3.state.NP
    && scaled3.log.every(d => d.deltaJ > 0),
    `逐日 ΔJ ${scaled3.log.map(d => d.deltaJ).join('/')} 斤，桥差 ${sb.diff / 100} 元`);
}
{
  // 附录 D.5 / 正文 3.6 注 试吃一元角：份数玩家定（0 或 3–6，不掷随机）、转化 floor(n/3)、次日进 R
  const g = newGame(SEED);
  beginDay(g);   // 定版要按当日情境重算 M_base，没 beginDay 的裸状态进不了第 5 步
  check('没挂试吃一元角时这个开关根本不出现（定版一律 0，附录 F.5 初值列明写恒 0）',
    lockTradingDay(g, { tastingCount: 5 }).tastingCount === 0 && g.TastingCount === 0);
  g.Facilities.push('fac_taste');
  const pick = n => lockTradingDay(g, { tastingCount: n }).tastingCount;
  check('份数越界驳回：1 / 2 / 7 / 小数 / 字符串 / null 一律 0，3–6 原样保留',
    [1, 2, 7, 0.5, '3', null, undefined].every(v => pick(v) === 0)
    && [3, 4, 5, 6].every(n => pick(n) === n),
    `3–6 → ${[3, 4, 5, 6].map(pick).join('/')}`);
  check('转化 = floor(n ÷ 3)：3、4、5 → 1 人次，6 → 2 人次',
    [3, 4, 5].every(n => tastingConvert(n) === 1) && tastingConvert(6) === 2 && tastingConvert(0) === 0);

  const runOne = tastingN => {
    const s = newGame(SEED);
    s.Cash = 4000000;
    s.laborOn = false;
    if (tastingN) { s.Facilities.push('fac_taste'); s.TastingCount = tastingN; }
    const r = makeRng(s);
    beginDay(s);
    submitBasket(s, [{ sku: 'MB1', qty: 40 }, { sku: 'MT1', qty: 40 }, { sku: 'VG1', qty: 40 },
      { sku: 'BF1', qty: 40 }, { sku: 'NS1', qty: 40 }, { sku: 'SP1', qty: 200 }], r);
    lockTradingDay(s, { priceTier: 'standard' });
    const orders = drawHandOrders(s, r);
    runDay(s, orders, o => Object.fromEntries(o.lines.map(l => [l.cat, l.grams])), r);
    return { s, r, D: s.today.D, consumed: s.today.consumed.reduce((x, y) => x + y.qty, 0),
      stock: Object.values(s.StockSolid).reduce((x, y) => x + y, 0) + s.StockSoup, R: s.R };
  };
  const bare = runOne(0), sampled = runOne(3);
  check('转化单并入当日需求（D 多出 floor(n/3) 碗），不是只写在注解里',
    Math.abs(sampled.D - bare.D - tastingConvert(3)) < 1e-9,
    `不试吃 D ${bare.D.toFixed(2)} → 3 份 D ${sampled.D.toFixed(2)} 碗`);
  nightSettle(sampled.s, sampled.r);
  const t = sampled.s.today;
  check('份钱 n × 1 元进收入、样品成本 = n × 单碗食材成本 × 0.3 按批次成本从库存扣',
    t.tastingPortions === 3 && t.tastingIncomeCents === 3 * TASTING.incomeCentsPerPortion
    && t.tastingCostCents > 0 && t.tastingNetCents === t.tastingIncomeCents - t.tastingCostCents
    && t.tastingConvert === 1,
    `3 份收 ${t.tastingIncomeCents / 100} 元、样品成本 ${t.tastingCostCents / 100} 元、净额 ${t.tastingNetCents / 100} 元`);
  check('样品计入当日耗用（批次质量参与 Q）并压低库存——不是记一笔费用了事',
    t.consumed.reduce((x, y) => x + y.qty, 0) > sampled.consumed
    && Object.values(sampled.s.StockSolid).reduce((x, y) => x + y, 0) + sampled.s.StockSoup < sampled.stock,
    `耗用 ${sampled.consumed.toFixed(2)} → ${t.consumed.reduce((x, y) => x + y.qty, 0).toFixed(2)} 斤`);
  // 桥用正常跑表线核：上面 runOne 是手工注入现金的探针，桥右端按开局款起算，探针自己必差
  const tastingRun = simulate(SEED, 2, STRATEGIES.mid, 'headless', { ...M1, tasting: 3 });
  check('试吃两日现金桥对平：份钱进现金、样品成本由库存资产项吸收（附录 B :441）',
    bridgeCheck(tastingRun.state).ok && tastingRun.log.every(d => d.tasting < 0),
    `逐日试吃净额 ${tastingRun.log.map(d => d.tasting.toFixed(2)).join('/')} 元，桥差 ${(bridgeCheck(tastingRun.state).diff / 100).toFixed(2)} 元`);
  const R0 = sampled.s.R;
  beginDay(sampled.s);
  check('转化人次次日进熟客存量 R（第 1 步过账，不记在当日）',
    sampled.s.R === R0 + tastingConvert(3) && sampled.s.tasting_pending_R === 0,
    `R ${R0} → ${sampled.s.R}（pending 已清）`);
  check('没开试吃时 pending 与份数都是 0（不给自己留一个隐形的 +1 R）',
    bare.s.TastingCount === 0 && bare.s.tasting_pending_R === 0);
}

// ── 11. M2 第四批：常驻竞争层（正文 3.13 / 3.14 第 7b / 附录 G.3、G.5、E.8、E.9）──────
{
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const war = EVENTS.find(e => e.id === 'evt_s_pricewar');
  const ret = EVENTS.find(e => e.id === 'evt_s_return');

  // 口径关：已签发的 M1 带（正文 3.5:141「无竞争（S ≡ 1）」）——整层不许碰账，也不许多抽一次随机
  const off = simulate(SEED, 10, STRATEGIES.mid, 'headless', M1);
  const rivalDraws = Object.keys(off.state.streamCounter).filter(k => k.startsWith('rival:') && k !== 'rival:0').length;
  check('关竞争层 = M1 已签口径：S 恒 1、四摊份额与排队惯性停在 F.6 初值、王老板价签/P 一动不动',
    off.log.every(d => d.S === 1 && d.share === null && d.rivalPrice === COMPETITION.rivalStartPrice
      && d.rivalP === COMPETITION.rivalP && d.suppress === 0 && d.boost === 0)
    && off.state.Share.every(x => x === COMPETITION.shareBase)
    && off.state.QueueInertia.every(x => x === 1),
    `十日 S ${[...new Set(off.log.map(d => d.S))].join('/')}，份额 ${off.state.Share.join('/')}`);
  check('关竞争层不抽 rival 子流（同存档复现只依赖种子，不依赖"这层开没开过"）', rivalDraws === 0,
    `rival 子流按日计数键 ${rivalDraws} 个（建档预置的 rival:0 不算抽取）`);
  check('关竞争层时特殊池恒空：E.9 的入场式 RivalSuppressedDays 被第 11 步归零，价格战进不来',
    off.log.every(d => !d.evening || !d.evening.startsWith('evt_s')),
    `十日晚间事件 ${off.log.map(d => d.evening || '—').join('/')}`);

  // 在场口径：竞争只改需求这一条腿，账目口径一律不动
  const on = simulate(SEED, 10, STRATEGIES.mid, 'headless', { labor: false, competition: true, eventScope: 'm1' });
  const onBridge = bridgeCheck(on.state);
  check('在场竞争层：十日现金桥与 NP 逐日对平（竞争不改账，只改需求）',
    onBridge.ok && on.state.DailyReports.reduce((s, r) => s + r.netOpsCents + r.eventNetCents, 0) === on.state.NP,
    `桥差 ${onBridge.diff / 100} 元，NP ${on.state.NP / 100} 元`);
  check('在场：S 落在钳制带 [0.6, 1.4] 内、四摊份额每日和为 1（G.1 `:473` 只 clamp、总口径 `:6`「系数不取整」→ 原值直接验）',
    on.log.every(d => d.S >= COMPETITION.sBand[0] && d.S <= COMPETITION.sBand[1] && d.share
      && Math.abs(d.share.reduce((s, x) => s + x, 0) - 1) < 1e-9)
    && on.log.some(d => d.S !== 1),
    `十日 S ${on.log.map(d => d.S.toFixed(3)).join('/')}`);
  check('在场：排队惯性按 F.6 式 = clamp(昨日份额 ÷ 0.25, 0.85, 1.15) 逐位成立',
    on.state.Share.every((x, i) => on.state.QueueInertia[i] === clamp(x / COMPETITION.shareBase,
      COMPETITION.inertiaBand[0], COMPETITION.inertiaBand[1])),
    `份额 ${on.state.Share.map(x => x.toFixed(4)).join('/')} → 惯性 ${on.state.QueueInertia.map(x => x.toFixed(4)).join('/')}`);
  check('在场十日同种子逐字复现（竞争层的随机全在命名子流里）',
    JSON.stringify(simulate(SEED, 10, STRATEGIES.mid, 'headless', { labor: false, competition: true, eventScope: 'm1' }).log)
    === JSON.stringify(on.log));

  // 附录 C 的份额两项（正文 :451 主式「今日预估份额 ÷ 昨日实际份额」、回退式「× 今日预估份额 ÷ 0.25」）：
  // 样段里它们恒为 1 所以从没落过点，竞争层一开就不再是 1 —— 关掉整层时必须逐位回到 1，已签的 M1 带才不动
  const offState = newGame(SEED);
  offState.competitionOn = false;
  beginDay(offState);
  const estOff = previewBasket(offState, [], 'qinmin').forecast.estBowls;
  const onState = newGame(SEED);
  onState.competitionOn = true;
  beginDay(onState);
  // beginDay 那一次 rival 抽取是竞争层第 1 步自己的账，不能算在试算头上：只验「两次预览之后计数与状态一字未动」
  const drawBefore = Object.entries(onState.streamCounter).filter(([k]) => k.startsWith('rival:')).map(([k, v]) => `${k}=${v}`).join(',');
  const estOn = previewBasket(onState, [], 'qinmin').forecast.estBowls;
  const ps = previewShare(onState, PRICE_TIERS.qinmin.perJin);
  const drawAfter = Object.entries(onState.streamCounter).filter(([k]) => k.startsWith('rival:')).map(([k, v]) => `${k}=${v}`).join(',');
  check('首日回退式的份额项：关层恒 ×1、开层按（预估份额 ÷ 基准 0.25）缩，且预估份额 < 基准 → 试算必然变小',
    estOff > estOn && Math.abs(estOn - (estOff - Math.round(onState.R * 0.5)) * (ps / COMPETITION.shareBase)
      - Math.round(onState.R * 0.5)) < 1e-12,
    `回退式 ${estOff.toFixed(2)} 碗 → 在场 ${estOn.toFixed(2)} 碗（预估份额 ${ps.toFixed(4)} ÷ 0.25 = ${(ps / COMPETITION.shareBase).toFixed(4)}，熟客 R_v 不乘份额）`);
  check('试算的预估份额不掷随机、不落账：两次预览之后 rival 子流计数与 Share／排队惯性一字未动',
    drawBefore === drawAfter && onState.Share.every(x => x === COMPETITION.shareBase)
    && onState.QueueInertia.every(x => x === 1),
    `子流计数 ${drawBefore} → ${drawAfter}，份额 ${onState.Share.join('/')}，惯性 ${onState.QueueInertia.join('/')}`);
  const samePrice = previewShare(onState, onState.PricePerJin);
  const s7b = sharesAndS(onState);
  check('预估份额与第 7b 步同一条吸引力式（同一价签算出来必须一模一样，全案不许出现两套 A_i）',
    samePrice === s7b.share[0],
    `试算侧 ${samePrice.toFixed(6)} ／ 第 7b 步 ${s7b.share[0].toFixed(6)}`);
  const ratio = newGame(SEED);
  ratio.competitionOn = true;
  beginDay(ratio);
  ratio.YesterdaySoldBowls = 40;
  ratio.YesterdayScenario = ratio.today.scenario;   // 情境比取 1，只剩份额比在动
  const estRatioBase = previewBasket(ratio, [], 'qinmin').forecast.estBowls;
  ratio.Share = [0.5, 0.2, 0.2, 0.1];
  const estRatioHalf = previewBasket(ratio, [], 'qinmin').forecast.estBowls;
  check('比值式的份额项吃「÷ 昨日实际份额」：昨日份额从 0.25 抬到 0.5，试算按同比例腰斩（与今日预估无关）',
    Math.abs(estRatioHalf - estRatioBase * (COMPETITION.shareBase / 0.5)) < 1e-12,
    `${estRatioBase.toFixed(2)} 碗 → ${estRatioHalf.toFixed(2)} 碗`);
  check('份额为 0 的存档不炸：正文写「昨日份额为 0 时改用回退式」，比值式的分母要有这道闸',
    (() => { ratio.Share = [0, 1 / 3, 1 / 3, 1 / 3]; ratio.YesterdaySoldBowls = 40;
      const f = previewBasket(ratio, [], 'qinmin').forecast;
      return f.lowConfidence === true && Number.isFinite(f.estBowls); })(),
    `回退式给 ${previewBasket(ratio, [], 'qinmin').forecast.estBowls.toFixed(2)} 碗并标低置信度`);
  const onClean = simulate(SEED, 10, STRATEGIES.clean, 'headless', { labor: false, competition: true, eventScope: 'm1' });
  const offClean = simulate(SEED, 10, STRATEGIES.clean, 'headless', M1);
  check('接线这两项要解决的问题：在场首日不再按「无竞争的需求」进货，第一天的报损与不在场逐分相等（差额登记在 delta §二十四.4）',
    onClean.log[0].writeoff === offClean.log[0].writeoff && onClean.log[0].bought < offClean.log[0].bought,
    `首日进货 ${offClean.log[0].bought.toFixed(1)} → ${onClean.log[0].bought.toFixed(1)} 元，报损 ${offClean.log[0].writeoff} ／ ${onClean.log[0].writeoff} 元`);

  // G 式与钳制带（附录 G.3 :583 的算式，v4.9.2 R9 基准价 26.8）
  check('G_i = clamp(26.8 ÷ 价, 0.70, 1.30)：基准价取 1.0，两家间接竞品双双撞到上限 1.30',
    rivalPriceCoef(COMPETITION.priceBase) === 1.0
    && rivalPriceCoef(18.8) === COMPETITION.gBand[1] && rivalPriceCoef(15.8) === COMPETITION.gBand[1]
    && rivalPriceCoef(40) === COMPETITION.gBand[0],
    `18.8 → ${rivalPriceCoef(18.8)}（原式 1.426）、15.8 → ${rivalPriceCoef(15.8)}（原式 1.696）、40 → ${rivalPriceCoef(40)}（原式 0.67）`);

  const p = newGame(SEED);
  p.competitionOn = true;
  beginDay(p);
  p.today.scenario = scenarioOf('sunny', 10);       // 只取天气，避开开学周的情境修正干扰分流算式
  p.QueueInertia = [1, 1, 1, 1];
  const sunny = sharesAndS(p);
  check('晴天四摊吸引力：炸串 62.8 > 凉皮 46.8（P 42/36 拉开，正文 §〇.1 第 9 条）',
    Math.abs(sunny.A[2] - 42 * 1.30 * 1.15) < 1e-9 && Math.abs(sunny.A[3] - 36 * 1.30) < 1e-9,
    `A = ${sunny.A.map(x => x.toFixed(2)).join(' / ')}`);
  p.today.scenario = scenarioOf('heat', 10);
  p.QueueInertia = [1, 1, 1, 1];
  const heat = sharesAndS(p);
  check('高温天分流换手：凉皮 60.8 > 炸串 54.6（凉皮 ×1.3 / 炸串回到 1.0）',
    Math.abs(heat.A[3] - 36 * 1.30 * 1.30) < 1e-9 && Math.abs(heat.A[2] - 42 * 1.30) < 1e-9,
    `A = ${heat.A.map(x => x.toFixed(2)).join(' / ')}`);
  const rain = scenarioOf('rain', 10);
  p.today.scenario = rain;
  p.QueueInertia = [1, 1, 1, 1];
  check('雨天炸串分流 ×0.8（正文 3.13 四值表），凉皮不受天气影响仍 1.0',
    rain.weather.id === 'rain' && Math.abs(sharesAndS(p).A[2] - 42 * 1.30 * 0.8) < 1e-9);

  // 第 1 步：跟价式两分支 + 出事切换 + 每周加压
  const f = newGame(SEED);
  f.competitionOn = true;
  f.Day = 5; f.PricePerJin = PRICE_TIERS.qinmin.perJin;
  morningRivals(f, makeRng(f));
  check('跟价式：你降到亲民 19.2 → 他 clamp(19.2×0.92, 19.2, 28.9) 落在下界 19.2（"三天内跟降"）',
    f.RivalPrice === clamp(PRICE_TIERS.qinmin.perJin * COMPETITION.followCoef,
      COMPETITION.followBand[0], COMPETITION.followBand[1]) && f.RivalPrice === COMPETITION.followBand[0],
    `价签 ${COMPETITION.rivalStartPrice} → ${f.RivalPrice}`);
  const before = f.RivalPrice;
  f.Day += 1; f.PricePerJin = PRICE_TIERS.signature.perJin;
  morningRivals(f, makeRng(f));
  check('涨价他不跟：价签原样挂着（正文 3.13 两分支的第二支，"还是老价钱"）', f.RivalPrice === before,
    `你挂 ${PRICE_TIERS.signature.perJin}，他仍 ${f.RivalPrice}`);

  const g2 = newGame(SEED);
  g2.competitionOn = true;
  beginDay(g2);
  g2.RivalP = COMPETITION.rivalPLow;
  g2.rivalLowUntilDay = g2.Day + COMPETITION.rivalLowDays;
  const pSeq = [];
  for (let i = 0; i < 6; i++) { beginDay(g2); pSeq.push(g2.RivalP); }
  check('出事当周 P=30、五天后回 55（正文 3.13；rival 子流每日 4% 抽中才进这段）',
    pSeq.slice(0, COMPETITION.rivalLowDays).every(x => x === COMPETITION.rivalPLow)
    && pSeq[COMPETITION.rivalLowDays] === COMPETITION.rivalP, `六日 P ${pSeq.join('/')}`);

  const g3 = newGame(SEED);
  g3.competitionOn = true;
  const boostSeq = [];
  for (const day of [99, 100, 103, 107]) {
    g3.Day = day;
    morningRivals(g3, makeRng(g3));
    boostSeq.push(+g3.RivalAttrBoostWeeks.toFixed(6));
  }
  check('第 100 天起每周 ×1.03 加压防死局，中间那周不动（附录 F.6 RivalAttrBoostWeeks 行：Day>=100 的第 1 步）',
    boostSeq[0] === 0 && boostSeq[1] === COMPETITION.boostWeekMul
    && boostSeq[2] === COMPETITION.boostWeekMul
    && g3.RivalAttrBoostWeeks === COMPETITION.boostWeekMul * COMPETITION.boostWeekMul,
    `99/100/103/107 天加压 ${boostSeq.join(' → ')}`);
  check('F.6 初值是 0，所以第一周必须落 1.03 而不是 0×1.03（照式子乘会永远乘不出加压）',
    newGame(SEED).RivalAttrBoostWeeks === 0 && g3.RivalAttrBoostWeeks > 1);
  const p100 = newGame(SEED);
  p100.competitionOn = true;
  p100.Day = 100;
  morningRivals(p100, makeRng(p100));
  p100.today.scenario = scenarioOf('sunny', 10);
  p100.QueueInertia = [1, 1, 1, 1];
  const boosted = sharesAndS(p100).A;
  check('加压只抬王老板的吸引力，两家间接竞品照常数 P 不动（正文 §〇.1 第 9 条：它们不吃 RivalAttrBoostWeeks）',
    p100.RivalAttrBoostWeeks === COMPETITION.boostWeekMul
    && Math.abs(boosted[1] - 55 * rivalPriceCoef(p100.RivalPrice) * COMPETITION.boostWeekMul) < 1e-9
    && Math.abs(boosted[2] - 42 * 1.30 * 1.15) < 1e-9 && Math.abs(boosted[3] - 36 * 1.30) < 1e-9,
    `加压后 A = ${boosted.map(x => x.toFixed(2)).join(' / ')}`);

  // 压制计数（第 11 步）与价格战三日倒计时
  const s1 = newGame(SEED);
  s1.competitionOn = true;
  s1.Share = [0.31, 0.19, 0.30, 0.20];
  tallySuppression(s1);
  const s2 = newGame(SEED);
  s2.competitionOn = true;
  s2.RivalSuppressedDays = 4;
  s2.Share = [0.29, 0.19, 0.30, 0.22];
  tallySuppression(s2);
  check('压制计数：你 ≥0.30 且他 ≤0.20 → +1，任一不满足即复位 0（附录 F.6 第 11 步行）',
    s1.RivalSuppressedDays === 1 && s2.RivalSuppressedDays === 0,
    `达标 ${s1.RivalSuppressedDays}／差一条 ${s2.RivalSuppressedDays}`);

  const w = newGame(SEED);
  w.competitionOn = true;
  w.Rep = COMPETITION.warRepGate; w.RivalSuppressedDays = 5;
  const okIn = evalCondition(war.condition, w);
  w.RivalSuppressedDays = 4;
  const noIn = evalCondition(war.condition, w);
  w.RivalSuppressedDays = 5; w.Rep = COMPETITION.warRepGate - 1;
  const noRep = evalCondition(war.condition, w);
  check('价格战入池式照 E.9 原文：RivalSuppressedDays>=5 & Rep>=40，两条各差一点都不进',
    okIn === true && noIn === false && noRep === false, `达标 ${okIn}／压制差一天 ${noIn}／口碑差一点 ${noRep}`);

  const war2 = newGame(SEED);
  war2.competitionOn = true;
  beginDay(war2);
  war2.Rep = 60; war2.RivalSuppressedDays = 6;
  resolveChoice(war2, war, 'hold');
  check('价格战结算：写 PricewarDays=3，同时把 evt_s_return 权重拉满 100（E.9 两行原文）',
    war2.PricewarDays === 3 && war2.WeightShifts.evt_s_return?.weight === 100
    && weightOf(war2, ret) === 100, `倒计时 ${war2.PricewarDays} 日，回流权重 ${weightOf(war2, ret)}`);
  const warSeq = [];
  for (let i = 0; i < 4; i++) {
    beginDay(war2);
    lockTradingDay(war2, { priceTier: 'standard' });
    warSeq.push(`${war2.today.pricewarActive ? '打' : '停'}/${war2.PricewarDays}/${war2.RivalPrice.toFixed(3)}`);
  }
  const warPrice = +(PRICE_TIERS.standard.perJin * COMPETITION.warCoef).toFixed(3);
  check('三日内他挂「你当日价 ×0.78」、第四日停（G.3 :577 的式子挂在定版之后，因为要用"当日价"）',
    warSeq[0] === `打/2/${warPrice}` && warSeq[1] === `打/1/${warPrice}`
    && warSeq[2] === `打/0/${warPrice}` && warSeq[3] === `停/0/${warPrice}`,
    `四日「是否开打 / 剩余倒计时 / 他的价签」= ${warSeq.join(' → ')}`);
  check('第三日末回流条件成立：PricewarDays 归零那一晚才抽得到（E.8 condition 第三项）',
    war2.PricewarDays === 0 && evalCondition(ret.condition, war2) === true
    && war2.EventHistory.includes('evt_s_pricewar'));

  // 回流三档（正文 3.4 名场面表 / E.8）
  const at = rep => {
    const s = newGame(SEED);
    s.competitionOn = true;
    beginDay(s);
    s.Rep = rep;
    s.WeightShifts.evt_s_return = { weight: 100, expireDay: s.Day + 7 };   // 模拟价格战第三日末的拉满
    const r = resolveChoice(s, ret, null);
    return { s, branch: r.branch, action: r.action };
  };
  const full = at(50), weak = at(30), lost = at(29);
  check('回流全档 Rep≥50：D0 ×1.20 持续 5 日、R +15、L +1、小刘发帖进 ① 类强制留言',
    full.s.d0_buff_mult === 1.2 && full.s.d0_buff_days === 5 && full.s.R === 15 && full.s.L === 1
    && full.s.today.forcedComments.length === 1, `R ${full.s.R}／L ${full.s.L}／留言 ${full.s.today.forcedComments[0]}`);
  check('弱档 30≤Rep<50：×0.95 持续 3 日、R +3、L 不加（正文 3.4「L 不加」写在表里，不是漏配）',
    weak.s.d0_buff_mult === 0.95 && weak.s.d0_buff_days === 3 && weak.s.R === 3 && weak.s.L === 0);
  check('输档 Rep<30：熟客存量 R 一律不动，改为 ×0.85 持续 7 日 + R 增长冻结 7 日（正文 3.4 保底承诺优先）',
    lost.s.R === 0 && lost.s.d0_buff_mult === 0.85 && lost.s.d0_buff_days === 7 && lost.s.R_frozen_days === 7,
    `R ${lost.s.R}、冻结 ${lost.s.R_frozen_days} 日`);
  check('三档都是"按 Rep 自动分版"：actions 为空、玩家不做选择也照样落账（resolveChoice 走 auto_branch）',
    full.action === null && weak.action === null && lost.action === null
    && full.branch.cond === 'Rep>=50' && weak.branch.cond === 'Rep>=30' && lost.branch.cond === 'true',
    `Rep 50/30/29 命中档：${full.branch.cond} ／ ${weak.branch.cond} ／ ${lost.branch.cond}`);
  check('触发后自身权重复位 0、冷却按「每次价格战重新武装一次」落 0 日（E.8 末两行）',
    [full, weak, lost].every(x => x.s.WeightShifts.evt_s_return === undefined
      && weightOf(x.s, ret) === 0 && x.s.Cooldowns.evt_s_return === x.s.Day));

  // 冻结式的先判后减（附录 F.6 R_frozen_days 行：第 9 步递减）
  const fr = newGame(SEED);
  fr.R_frozen_days = 7;
  fr.today.J = 10;
  fr.today.consumed = [{ qty: 10, batch: { cat: 'MB', q: 95 } }];   // Q=95 ≥70，本该 +3
  applyShadow(fr, { shortOrders: 0, spillBowls: 0 });
  check('冻结期内第 9 步跳过 Q≥70 的 +3，且先判后减（当日仍算冻结日，7 日才吃满）',
    fr.R === 0 && fr.R_frozen_days === 6, `R ${fr.R} 未涨，冻结余 ${fr.R_frozen_days} 日`);
  const fr2 = newGame(SEED);
  fr2.R_frozen_days = 1;
  fr2.today.J = 10;
  fr2.today.consumed = [{ qty: 10, batch: { cat: 'MB', q: 95 } }];
  applyShadow(fr2, { shortOrders: 0, spillBowls: 0 });
  const lastFrozenDay = fr2.R;
  applyShadow(fr2, { shortOrders: 0, spillBowls: 0 });
  check('冻结到期自动解除，不必任何事件再判一次：最后一天仍冻结，次日 +3 就回来',
    lastFrozenDay === 0 && fr2.R_frozen_days === 0 && fr2.R === 3,
    `冻结末日 R ${lastFrozenDay} → 次日 R ${fr2.R}（上限 ${Math.floor(fr2.BaseSales * 0.6)}）`);

  // 强制留言排第一且不占概率类名额（正文 3.4 ①类优先级）
  const cmt = simulate(SEED, 10, STRATEGIES.mid, 'headless', { labor: false, competition: true, eventScope: 'm1' });
  const forcedDay = cmt.log.find(d => d.evening === 'evt_s_return');
  check('事件写的固定文案进的是 ① 类强制信号（正文 3.4 优先级第一档，不掷随机选材）',
    forcedDay === undefined || forcedDay.comments.some(c => c.startsWith('forced:')),
    forcedDay ? `${forcedDay.evening} 当日留言 ${forcedDay.comments.join(' ｜ ')}` : '本种子 10 日内未打到回流（条件链由上面的探针覆盖）');

  // 价格战钳制带上界 28.9（勘误批 c：26.8 → 28.9）——本档价梯度不可达，只做钳制式探针
  const wb = newGame(SEED);
  wb.competitionOn = true;
  wb.today.pricewarActive = true;
  wb.PricePerJin = 40;
  priceWarReprice(wb);
  const wb2 = newGame(SEED);
  wb2.competitionOn = true;
  wb2.today.pricewarActive = true;
  wb2.PricePerJin = 19.2;
  priceWarReprice(wb2);
  check('价格战式钳制带照已签勘误 c 落 [17.0, 28.9]：下界在亲民价 19.2×0.78=14.976 处真咬，上界只在合成价 40 处才够得着',
    wb2.RivalPrice === COMPETITION.warBand[0] && wb.RivalPrice === COMPETITION.warBand[1],
    `19.2 → ${wb2.RivalPrice}（钳下界）、40 → ${wb.RivalPrice}（钳上界；三档定价最高 32.2×0.78=25.116，够不到上界）`);
}

// ── 12. M2 第五批：附录 E 余六行 + 检查判定式（正文 :315–:317 / 附录 E.4、E.6、E.7、E.9、E.10）──
{
  const row = id => EVENTS.find(e => e.id === id);
  const REP0 = newGame(SEED).Rep;          // 口碑初值从 newGame 读，断言不写死（正文 3.4 的初值由定稿文档给）
  const INSP = row('evt_s_insp'), ROUT = row('evt_s_insp2'), POACH = row('evt_s_poach'),
    PROMO = row('evt_s_promo'), FLAG = row('evt_s_flag'), LEDGER = row('evt_d_021');

  // 1) 六条数据行照附录原文逐字段（数值只有已签勘误的 100 / −1,800 / +15，其余一字不动）
  check('E.6 大检查行 = special/evening/坏事/weight 100/硬触发/condition「Risk>=70 | C>=8」/冷却 30',
    INSP.pool === 'special' && INSP.timing === 'evening' && INSP.kind === '坏事' && INSP.weight === 100
    && INSP.hard === true && INSP.condition === 'Risk>=70 | C>=8' && INSP.cooldown === 30
    && INSP.scoreCheck === 'big' && INSP.actions.map(a => a.label).join('/') === '销毁全部无票库存/不销毁',
    `实际 ${INSP.pool}/${INSP.timing}/${INSP.kind}/${INSP.weight}/${INSP.condition}/${INSP.cooldown}`);
  check('E.9 例行检查行 = 软触发 weight 8、condition「Risk>=40」、冷却 12、两分支同账',
    ROUT.weight === 8 && ROUT.hard === undefined && ROUT.condition === 'Risk>=40' && ROUT.cooldown === 12
    && ROUT.scoreCheck === 'routine' && JSON.stringify(ROUT.actions[0].open) === JSON.stringify(ROUT.actions[1].open),
    `weight ${ROUT.weight} / condition ${ROUT.condition} / cooldown ${ROUT.cooldown}`);
  check('E.9 挖角行三个数按已签勘误 b 落：现金 −1,800 元、每日 +15 元、让他走缺席 14 日',
    POACH.condition === 'Tier>=3 & EVT?evt_s_pricewar' && POACH.cooldown === 999
    && POACH.actions[0].open.some(o => o.cash === -180000) && POACH.actions[0].open.some(o => o.wageRaise === LABOR.raisePerDay)
    && POACH.actions[2].open.some(o => o.xiaodouAbsentDays === 14 && o.poached === true)
    && POACH.actions[2].hidden.some(h => h.Rep === -2),
    `加薪 ${POACH.actions[0].open.map(o => JSON.stringify(o)).join('+')}、让他走 ${JSON.stringify(POACH.actions[2].open)}`);
  check('E.10 宣传队行 = 好事、weight 10、condition 走 readVar 别名 FacilityCount、无分支纯演出',
    PROMO.kind === '好事' && PROMO.weight === 10 && PROMO.condition === 'Rep>=60 & FacilityCount>=2 & !EVT?evt_s_promo'
    && PROMO.actions.length === 0 && PROMO.open.some(o => o.d0Buff && o.d0Buff.mult === 1.15 && o.d0Buff.days === 4)
    && PROMO.effect_hidden.map(h => Object.keys(h)[0]).join('/') === 'Rep/R/L',
    `暗线 ${JSON.stringify(PROMO.effect_hidden)}`);
  check('E.7 锦旗行 = 硬触发一次性、窗口 SemesterDay 24–28 且 Rep>=55',
    FLAG.hard === true && FLAG.cooldown === 999 && FLAG.weight === 100
    && FLAG.condition === 'SemesterDay>=24 & SemesterDay<=28 & Rep>=55 & !EVT?evt_s_flag'
    && FLAG.effect_hidden.some(h => h.Rep === 5) && FLAG.effect_hidden.some(h => h.L === 1));
  check('E.4 立账行 = 中性、Day>=10 & Tier>=2、两分支的明账与暗账逐字一样（原文「两分支相同」）',
    LEDGER.kind === '中性' && LEDGER.condition === 'Day>=10 & Tier>=2' && LEDGER.pool === 'daily'
    && JSON.stringify(LEDGER.actions[0].open) === JSON.stringify(LEDGER.actions[1].open)
    && JSON.stringify(LEDGER.actions[0].hidden) === JSON.stringify(LEDGER.actions[1].hidden),
    `两分支 ${JSON.stringify(LEDGER.actions.map(a => a.hidden))}`);

  // 2) 口径关：正文 §八 M1 行把「特殊事件、完整事件池」整体划给 M2 → 已签发带只放行 ship='M1'
  {
    const s = newGame(SEED);
    s.Risk = 80;                                   // 大检查的硬触发条件成立
    s.eventScope = 'm1';
    const off = drawEvent(s, 'evening', makeRng(s));
    s.eventScope = 'full';
    const on = drawEvent(s, 'evening', makeRng(s));
    check('eventScope= m1 挡住 M2 特殊行（Risk 80 也抽不到大检查）；= full 时硬触发不走概率门',
      (!off || off.ship === 'M1') && on.id === 'evt_s_insp',
      `关 → ${off ? off.id : '无'}｜开 → ${on.id}`);
    const m2Rows = EVENTS.filter(e => e.ship !== 'M1');
    check('池子按 ship 分档：M1 四条 + M2 十四条 = 十八条（spec-event-pool-6 落完，正文 :362 的「上线必需 ≥18」达标；坏/好/中计数见 §15）',
      EVENTS.length === 18 && m2Rows.length === 14 && EVENTS.every(e => e.ship === 'M1' || e.ship === 'M2'),
      `M1 ${EVENTS.length - m2Rows.length} / M2 ${m2Rows.length}`);
  }

  // 3) 判定式（正文 :316）：Score = 覆盖率×60 + 设施分（25/10，可加总）+ 销毁比例×15 − Risk×0.3
  {
    const s = newGame(SEED);                      // 无采购 → 覆盖率按正文 :91 取 1.0
    const cases = [
      { fac: [], ratio: 0, risk: 20, want: 60 - 6 },
      { fac: ['fac_cert'], ratio: 0, risk: 20, want: 60 + 25 - 6 },
      { fac: ['fac_cert', 'fac_display'], ratio: 0, risk: 20, want: 60 + 35 - 6 },
      { fac: ['fac_display'], ratio: 1, risk: 20, want: 60 + 10 + 15 - 6 },
      { fac: ['fac_cert', 'fac_display'], ratio: 1, risk: 100, want: 60 + 35 + 15 - 30 },
    ];
    const got = cases.map(c => { s.Facilities = c.fac; s.Risk = c.risk; return inspectionScore(s, c.ratio) - c.want; });
    check('Score 逐项对得上（设施分可加总、销毁比例给满 15、Risk 权重 0.3、覆盖率无采购取 1.0）',
      got.every(d => Math.abs(d) < 1e-9), cases.map((c, i) => `${c.want}→${(c.want + got[i]).toFixed(2)}`).join(' '));
    s.Facilities = [];
    check('显多秤不算设施分：FacilityCount 别名读的是 Facilities 元素个数（附录 E.10 约束 2、F.5）',
      evalCondition('FacilityCount>=1', s) === false
        && (s.Tools.push('JI_SCALE'), evalCondition('FacilityCount>=1', s)) === false
        && (s.Facilities.push('fac_display'), evalCondition('FacilityCount>=1', s)) === true);
    s.Facilities = []; s.Tools = [];
    check('三档门槛照正文 :316：≥55 通过 / 35–55 整改 / <35 翻车；例行检查同式门槛 ≥40',
      INSPECTION.passAt === 55 && INSPECTION.rectifyAt === 35 && INSPECTION.routinePassAt === 40
      && INSPECTION.rectifyFineCents === 20000 && INSPECTION.routineFineCents === 10000
      && INSPECTION.facScore.fac_cert === 25 && INSPECTION.facScore.fac_display === 10,
      `整改罚 ${INSPECTION.rectifyFineCents / 100} 元、例行罚 ${INSPECTION.routineFineCents / 100} 元（勘误批 a 项 50→100）`);
  }

  // 4) 无票库存的计价与销毁（附录 E.6「按成本记」+ 附录 B :442 的资产项）
  {
    const stocked = () => {
      const s = newGame(SEED);
      s.Batches = [
        { cat: 'MB', sku: 'MB1', tier: 1, qty: 5, unit: '斤', q: 95, costPerUnit: 24, hasReceipt: 1, day: 1 },
        { cat: 'MB', sku: 'MB3', tier: 3, qty: 5, unit: '斤', q: 55, costPerUnit: 24, hasReceipt: 0, day: 1 },
        { cat: 'SP', sku: 'SP1', tier: 1, qty: 10, unit: '份', q: 95, costPerUnit: 1.2, hasReceipt: 0, day: 1 },
      ];
      s.CostPool = { ...s.CostPool, MB: 24000, SP: 1200 };
      recomputeStock(s);
      return s;
    };
    const a = stocked();
    check('无票计价走库存资产值（CostPool × 无票斤数 ÷ 在柜斤数），SP1 自家汤底两头都不进（正文 :91 / 附录 D.1）',
      ticketlessCostCents(a) === 12000 && a.StockSolid.MB === 10 && a.StockSoup === 10,
      `柜里 MB 10 斤（票 5 无票 5）池值 240 元 → 无票 120 元；汤底 ${a.StockSoup} 份不计`);
    const b = stocked();
    const cashBefore = b.Cash;
    const ratio = inspectionScore(b, 0);
    destroyTicketless(b);
    check('销毁 = 扣实物 + 扣等额池值 + 现金一分不动，且销毁比例进判定式（+15 分）',
      b.Cash === cashBefore && b.today.eventAssetLoss === 12000 && b.StockSolid.MB === 5
      && b.Batches.filter(x => x.cat === 'MB').length === 1 && b.today.eventDestroyedRatio === 1
      && Math.abs(inspectionScore(b, 1) - (ratio + 15)) < 1e-9,
      `库存 10→${b.StockSolid.MB} 斤、池值 240→${(b.CostPool.MB / 100).toFixed(2)} 元、现金 ${b.Cash / 100} 元不变`);
    const empty = newGame(SEED);
    destroyTicketless(empty);
    check('柜里没有无票货：销毁比例按原文取 0（不是 1），资产项 0',
      empty.today.eventDestroyedRatio === 0 && empty.today.eventAssetLoss === 0);
  }

  // 5) 大检查三档（含 Risk 清至、d0_buff 乘入、现金不足兜底、结局 #1）
  {
    const judged = (risk, cash, fac = []) => {
      const s = newGame(SEED);
      s.Risk = risk; s.Cash = cash; s.Facilities = fac;
      return { s, j: judgeBigInspection(s) };
    }
    const p = judged(50, 100000, ['fac_cert', 'fac_display']);   // 60 + 35 − 15 = 80 → 通过档
    check('Score ≥55 → 通过：Risk 清至 30、现金与 d0_buff 一动不动、结算页一句「检查合格」',
      p.j.band === 'pass' && p.s.Risk === INSPECTION.riskAfterPass && p.s.Cash === 100000
      && p.s.d0_buff_mult === 1.0 && p.s.d0_buff_days === 0 && p.s.Rep === REP0
      && p.s.today.notes.some(x => x.includes('检查合格')),
      `Score ${p.j.score.toFixed(1)}｜Risk ${p.s.Risk}｜备注 ${p.s.today.notes.join('/')}`);
    const r = judged(70, 100000);                    // 60 − 21 = 39 → 整改档
    check('35 ≤ Score < 55 → 整改：事件账现金 −200、次日 D0 ×0.6 持续 1 日、Risk 清至 40、Rep −2',
      r.j.band === 'rectify' && r.s.Cash === 80000 && r.s.today.eventCashEvening === -20000
      && r.s.d0_buff_mult === INSPECTION.rectifyBuff.mult && r.s.d0_buff_days === 1
      && r.s.Risk === INSPECTION.riskAfterRectify && r.s.Rep === REP0 + INSPECTION.rectifyRep,
      `Score ${r.j.score.toFixed(1)}｜现金 ${r.s.Cash / 100}｜buff ${r.s.d0_buff_mult}/${r.s.d0_buff_days} 日｜Risk ${r.s.Risk}｜Rep ${r.s.Rep}`);
    const sc = judged(70, 10000);                    // 现金 100 < 200 → §〇.1 第 8 条默认走法
    check('整改档现金不足（§〇.1 第 8 条默认签法）：不扣负，改 D0 ×0.7 持续 2 日（开关 INSPECTION.shortCashMode 一处可翻）',
      INSPECTION.shortCashMode === 'buff' && sc.s.Cash === 10000 && sc.s.today.eventCashEvening === 0
      && sc.s.d0_buff_mult === 0.7 && sc.s.d0_buff_days === 2 && sc.s.Risk === 40,
      `mode ${INSPECTION.shortCashMode}｜现金 ${sc.s.Cash / 100}｜buff ${sc.s.d0_buff_mult}/${sc.s.d0_buff_days} 日`);
    const c = judged(90, 100000);                    // 60 − 27 = 33 → <35，且 Risk 本身没到 100
    check('Score < 35 → 当晚进结局判定 #1（附录 G.4 第 1 行的第三条入口：Risk 90 时只有这一条能判翻车）',
      c.j.band === 'crash' && c.s.Risk === 90 && c.s.today.inspectionCrash === true
      && checkEndings(c.s) === ENDING.CRASH,
      `Score ${c.j.score.toFixed(1)}｜Risk ${c.s.Risk} → 结局 ${checkEndings(c.s)}`);
    const low = judged(20, 100000, ['fac_cert', 'fac_display']);   // 89 → 通过，但 Risk 20 已低于「清至 30」
    low.s.RiskShort = 20;
    check('「Risk 清至」= 只降不升：Risk 低于目标值时原样留着，受保护池跟着钳（裁定 9a959bd §二）',
      low.j.band === 'pass' && low.s.Risk === 20 && low.s.RiskShort === 20,
      `Risk 20 → ${low.s.Risk}（目标 30）`);
    const stack = judged(70, 100000);
    stack.s.d0_buff_mult = 1.15; stack.s.d0_buff_days = 4;
    judgeBigInspection(stack.s);
    check('检查 buff 与既有 d0_buff 按附录 E 表前 :127 合并：新值乘入、天数取最大（不是覆盖）',
      Math.abs(stack.s.d0_buff_mult - 1.15 * 0.6) < 1e-9 && stack.s.d0_buff_days === 4,
      `×1.15/4 日 + ×0.6/1 日 → ${stack.s.d0_buff_mult.toFixed(4)}/${stack.s.d0_buff_days} 日`);
  }

  // 6) 例行检查（门槛 40）与 fac_cert 上架
  {
    const s = newGame(SEED);
    s.Risk = 70; s.Cash = 50000; s.Rep = REP0;
    const j = judgeRoutineInspection(s);
    check('例行检查：同式门槛 40、未过罚款 100 元（勘误批 a 项）、Rep −1、首次触发写 seen_routine_inspection',
      j.band === 'fine' && s.Cash === 40000 && s.today.eventCashEvening === -10000
      && s.Rep === REP0 - 1 && s.seen_routine_inspection === true,
      `Score ${j.score.toFixed(1)}（门槛 ${INSPECTION.routinePassAt}）→ 现金 ${s.Cash / 100}、Rep ${s.Rep}`);
    check('seen_routine_inspection 放行 fac_cert（附录 D.3 的 unlock 原文，2,700 元）',
      evalCondition(FACILITIES.fac_cert.unlock, s) === true && FACILITIES.fac_cert.price === 270000,
      `${FACILITIES.fac_cert.unlock} → ${evalCondition(FACILITIES.fac_cert.unlock, s)}（价 ${FACILITIES.fac_cert.price / 100} 元）`);
    const t = newGame(SEED);
    t.Risk = 70; t.Cash = 5000;
    judgeRoutineInspection(t);
    check('例行检查现金不足：按原文走 D0 ×0.8 持续 2 日、不扣负',
      t.Cash === 5000 && t.today.eventCashEvening === 0
      && t.d0_buff_mult === INSPECTION.routineShortCashBuff.mult && t.d0_buff_days === 2,
      `现金 ${t.Cash / 100}｜buff ${t.d0_buff_mult}/${t.d0_buff_days} 日`);
    const ok = newGame(SEED);
    ok.Risk = 40;                                    // 60 − 12 = 48 ≥ 40
    const oj = judgeRoutineInspection(ok);
    check('例行检查过了：不罚、Rep 不动，但仍写 seen_routine_inspection（fac_cert 的上架条件是「见过」不是「没过」）',
      oj.band === 'pass' && ok.Cash === newGame(SEED).Cash && ok.Rep === REP0 && ok.seen_routine_inspection === true,
      `Score ${oj.score.toFixed(1)}`);
  }

  // 7) 挖角三分支 + 人工线的两条新读数（涨薪累加 / 被挖走的产能惩罚）
  {
    const s = newGame(SEED);
    s.laborOn = true; s.Tier = 3; s.EventHistory.push('evt_s_pricewar'); s.PricewarDays = 0;
    check('挖角入池条件 = Tier>=3 & EVT?evt_s_pricewar（正文 :362 之后才有的第二波压力）',
      evalCondition(POACH.condition, s) === true && evalCondition(POACH.condition, newGame(SEED)) === false);
    const raise = newGame(SEED);
    raise.laborOn = true; raise.Cash = 200000;
    resolveChoice(raise, POACH, 'raise');
    check('涨薪留住：当场 −1,800 元 + 此后每日工钱 +15 元（laborCostCents 读出 60+15）',
      raise.Cash === 20000 && raise.WageRaiseCents === LABOR.raisePerDay
      && laborCostCents(raise) === LABOR.perDay + LABOR.raisePerDay
      && raise.today.eventCashEvening === -180000,
      `现金 ${raise.Cash / 100}｜日结 ${laborCostCents(raise) / 100} 元`);
    const acc = newGame(SEED);
    acc.laborOn = true; acc.Cash = 500000;
    acc.WageRaiseCents = LABOR.raisePerDay;          // 假想已有一笔加薪在场，再看第二次写入
    resolveChoice(acc, POACH, 'raise');
    check('加薪 op 是累加不是覆盖（两笔 15 元/日 → 日结 60 + 30）',
      acc.WageRaiseCents === 3000 && laborCostCents(acc) === LABOR.perDay + 3000,
      `WageRaiseCents ${acc.WageRaiseCents}｜日结 ${laborCostCents(acc) / 100}`);
    const gone = newGame(SEED);
    gone.laborOn = true; gone.Tier = 3; gone.Cash = 1000;
    const base = { cap: capacityJin(gone), grid: prepBudget(gone) };
    resolveChoice(gone, POACH, 'let_go');
    check('让他走：缺席 14 日 + 产能 ×0.90 + 工时那一格随在场一起消失 + Rep −2',
      gone.XiaodouAbsentDays === 14 && gone.PoachedAway === true && gone.Rep === REP0 - 2
      && laborCapMul(gone) === LABOR.poachedCapMul
      && prepBudget(gone) === base.grid - LABOR.gridBonus
      && Math.abs(capacityJin(gone) - base.cap * LABOR.poachedCapMul / LABOR.capMul) < 1e-9
      && laborCostCents(gone) === 0,
      `产能 ${base.cap.toFixed(2)}→${capacityJin(gone).toFixed(2)} 斤｜工时 ${base.grid}→${prepBudget(gone)} 格`);
    const leave = newGame(SEED);
    leave.laborOn = true; leave.XiaodouAbsentDays = 1;      // 「请假一天」：只退加成，不吃 ×0.90
    check('请假一天与被挖走分开记：同一天不在场，成因不同 → 产能一个 ×1.00、一个 ×0.90',
      laborCapMul(leave) === 1.0 && leave.PoachedAway === false,
      `请假 laborCapMul ${laborCapMul(leave)}｜挖角 ${LABOR.poachedCapMul}`);
    const back = newGame(SEED);
    back.laborOn = true; back.XiaodouAbsentDays = 14; back.PoachedAway = true;
    const days = [];
    for (let i = 0; i < 14; i++) { beginDay(back); days.push(xiaodouPresent(back)); }
    check('缺席 14 日 = 第 1 步每日减一：人不在 13 个营业日、第 14 个营业日回来（PoachedAway 随归零一起清）',
      days.filter(x => !x).length === 13 && days[13] === true && back.PoachedAway === false,
      `不在场 ${days.filter(x => !x).length} 日／在场 ${days.filter(x => x).length} 日`);
    const locked = newGame(SEED);
    check('「签合同」分支要 fac_contract 才可选（引擎与界面同一判据；两互为前置的死锁已登记回报）',
      isActionAvailable(locked, POACH.actions[1]) === false
      && isActionAvailable(locked, POACH.actions[0]) === true
      && (locked.Facilities.push('fac_contract'), isActionAvailable(locked, POACH.actions[1])) === true);
  }

  // 8) 界面侧的现金门（正文 :169 分支可用性 + ui-spec UI-11 置灰；引擎侧不拦，已登记回报）
  {
    const s = newGame(SEED);
    s.Cash = 100000;
    check('涨薪 1,800 的按钮：现金 1,000 元时置灰、2,000 元时可点（isActionAffordable 只认 gate:afford）',
      isActionAffordable(s, POACH.actions[0]) === false && (s.Cash = 200000, isActionAffordable(s, POACH.actions[0])) === true
      && isActionAffordable(s, LEDGER.actions[0]) === true,
      `afford gate = ${POACH.actions[0].gate}`);
  }

  // 9) 宣传队 / 锦旗 / 立账的落地
  {
    const p = newGame(SEED);
    p.Rep = 60; p.Facilities = ['fac_display', 'fac_contract']; p.d0_buff_mult = 1.2; p.d0_buff_days = 3;
    check('宣传队 condition 读 FacilityCount 别名（两件设施过门、一件不过）',
      evalCondition(PROMO.condition, p) === true && (p.Facilities = ['fac_display'], evalCondition(PROMO.condition, p)) === false);
    p.Facilities = ['fac_display', 'fac_contract'];
    const r = resolveChoice(p, PROMO, null);
    check('宣传队无分支：明账 ×1.15/4 日乘入既有 buff（天数取最大）+ ① 类强制留言，暗账 Rep+3/R+10/L+1',
      Math.abs(p.d0_buff_mult - 1.2 * 1.15) < 1e-9 && p.d0_buff_days === 4
      && p.today.forcedComments.length === 1 && p.Rep === 63 && p.R === 10 && p.L === 1 && r.action === null,
      `buff ${p.d0_buff_mult.toFixed(4)}/${p.d0_buff_days} 日｜Rep ${p.Rep} R ${p.R} L ${p.L}`);
    const f = newGame(SEED);
    f.SemesterDay = 25; f.Rep = 60; f.Risk = 0;
    const picked = drawEvent(f, 'evening', makeRng(f));
    resolveChoice(f, picked, null);
    check('锦旗：窗口内硬触发当晚必来（不走 35% 门），L +1 且留言位多一条',
      picked.id === 'evt_s_flag' && f.L === 1 && f.Rep === 65 && f.today.forcedComments.length === 1,
      `第 ${f.SemesterDay} 学期日 → ${picked.id}｜L ${f.L}｜留言 ${f.today.forcedComments.join('/')}`);
    const out = newGame(SEED);
    out.SemesterDay = 29; out.Rep = 90;
    // 抽 20 次而不是抽两次：drawEvent 会推进 evening 子流的计数，「第一次没抽到」不等于「这条不入池」。
    // 第八批把日常池从 6 行扩到 12 行后，同一张状态的两次抽取能一次中、一次空，旧写法就在自己不该管的格子里翻了车。
    const draws = [];
    for (let i = 0; i < 20; i++) { const e = drawEvent(out, 'evening', makeRng(out)); if (e) draws.push(e.id); }
    check('窗口外（第 29 学期日）锦旗不入池：一次性事件只在 SemesterDay 24–28',
      !draws.includes('evt_s_flag'), `20 抽里出现 ${draws.filter(x => x !== 'evt_s_flag').length} 次他条、锦旗 0 次`);
    const led = newGame(SEED);
    led.Day = 10; led.Tier = 2;
    resolveChoice(led, LEDGER, 'skip');
    check('立账两条分支同账：Rep +2 与「今日已立账」一样给，且 EVT?evt_d_021 当场放行用料展示柜（附录 D.3 unlock）',
      led.Rep === REP0 + 2 && led.today.notes.join('/') === '今日已立账'
      && evalCondition(FACILITIES.fac_display.unlock, led) === true && FACILITIES.fac_display.price === 120000,
      `Rep ${led.Rep}｜unlock ${FACILITIES.fac_display.unlock} → ${evalCondition(FACILITIES.fac_display.unlock, led)}`);
  }

  // 10) 销毁进账后现金桥仍平（附录 B :442 的「非现金资产净变化」与 NP 同源）
  {
    const s = newGame(SEED);
    s.eventScope = 'full';
    let bridged = 0, ran = 0, destroyed = 0, inspNight = 0, band = '', diff = 0;
    for (let i = 0; i < 12 && !s.EndingId; i++) {
      const r = beginDay(s);
      morningPreEvent(s, r);
      // NS2 是 keep:true 的无票可抽签货：买得比卖得多 → 隔夜留得下来，晚上才有东西可销
      submitBasket(s, [{ sku: 'MB1', qty: 4 }, { sku: 'NS2', qty: 20 }, { sku: 'SP1', qty: 12 }], r);
      lockTradingDay(s, { priceTier: 'qinmin' });
      morningEvent(s, r, () => null);
      runDay(s, drawHandOrders(s, r), o => Object.fromEntries(o.lines.map(l => [l.cat, l.grams])), r);
      nightSettle(s, r);
      // 硬触发只在「柜里确实还剩无票货」的第一晚点亮（走 C>=8 那条，不抬 Risk，免得多判一次结局）
      if (inspNight === 0 && ticketlessCostCents(s) > 0) s.C = 8;
      const ev = eveningDraw(s, r);
      const choice = ev && ev.id === 'evt_s_insp' ? 'destroy' : null;
      const close = nightClose(s, r, ev, choice);
      ran += 1;
      if (ev && ev.id === 'evt_s_insp') {
        inspNight += 1;
        destroyed += s.today.eventAssetLoss || 0;
        const jd = close.evening.choice.judgment;
        band = `${jd.band}（Score ${jd.score.toFixed(1)}、销毁 ${jd.destroyedCents / 100} 元）`;
      }
      const bc = bridgeCheck(s);
      if (bc.ok) bridged += 1; else diff = bc.diff;
    }
    check('销毁当日现金桥逐日平（含大检查那一晚）：资产项在 NP 与库存两端同幅出现，现金一分不动',
      ran > 0 && inspNight === 1 && destroyed > 0 && bridged === ran,
      `跑了 ${ran} 日、大检查 ${inspNight} 晚 ${band}、累计销毁 ${destroyed / 100} 元、桥平 ${bridged}/${ran}（末次差 ${diff / 100} 元）`);
  }
}

// ── 13. M2 第六批：烫煮（开关式实现）+ 常客最低实现（正文 3.11 :210/:213、5.4 :326、附录 H.3 :676、§八 :362）──
{
  // 1) 五个手感参数逐字照正文 :213 / 附录 H.5 :615；开关按 §八「在建时默认关闭」
  check('BLANCH 五数照录（全程 4.0 秒、绿区 55–78、中心 66.5 ±3），绿区上下沿折秒正好 2.2 与 3.12',
    BLANCH.sweepSec === 4.0 && BLANCH.greenLow === 55 && BLANCH.greenHigh === 78
    && BLANCH.center === 66.5 && BLANCH.centerBand === 3
    && Math.abs(blanchValueAt(2.2) - BLANCH.greenLow) < 1e-9
    && Math.abs(blanchValueAt(3.12) - BLANCH.greenHigh) < 1e-9,
    `绿区 ${(BLANCH.greenLow / 100 * BLANCH.sweepSec).toFixed(2)}–${(BLANCH.greenHigh / 100 * BLANCH.sweepSec).toFixed(2)} 秒`);
  const fresh = newGame(SEED);
  check('§八 排期收口：烫煮「开关式实现（在建时默认关闭）」= CONFIG.blanch false，新档 blanchOn 照它起',
    CONFIG.blanch === false && fresh.blanchOn === false && typeof fresh.blanchOn === 'boolean',
    `CONFIG ${CONFIG.blanch}｜新档 ${fresh.blanchOn}`);

  // 2) 熟度条读数：0→100 匀速，越界夹住（判定式不碰随机）
  check('熟度读数匀速且钳制：0 秒 0、1 秒 25、4 秒满、超时仍 100、负秒回 0',
    blanchValueAt(0) === 0 && blanchValueAt(1) === 25 && blanchValueAt(4) === 100
    && blanchValueAt(9) === 100 && blanchValueAt(-1) === 0);

  // 3) 四带判定：夹生 / 绿区 / 中心 ±3 最佳+ / 烫老，端点归属照「早于 55、晚于 78」
  const bandOf = v => judgeBlanch(v)?.band;
  check('四带端点：55 与 78 都算绿区（原文「早于 55 / 晚于 78」才判夹生与烫老），中心 63.5–69.5 记最佳+',
    bandOf(54.99) === 'under' && bandOf(55) === 'green' && bandOf(63.4) === 'green'
    && bandOf(63.5) === 'best' && bandOf(66.5) === 'best' && bandOf(69.5) === 'best'
    && bandOf(69.51) === 'green' && bandOf(78) === 'green' && bandOf(78.01) === 'over',
    `55→${bandOf(55)}、63.5→${bandOf(63.5)}、69.51→${bandOf(69.51)}、78.01→${bandOf(78.01)}`);
  check('档位与文案照原文：夹生 / 最佳 / 最佳+ / 烫老；升一档记 +1、最佳+ 记 +2、夹生与烫老记 −1',
    judgeBlanch(30).label === '夹生' && judgeBlanch(30).delta === -1
    && judgeBlanch(60).label === '最佳' && judgeBlanch(60).delta === 1
    && judgeBlanch(66.5).label === '最佳+' && judgeBlanch(66.5).delta === 2
    && judgeBlanch(90).label === '烫老' && judgeBlanch(90).delta === -1);
  check('碗没下锅 = 没这一下：读数为空判 null，信号一格都不挪（开关开着也不动）',
    judgeBlanch(undefined) === null && judgeBlanch(null) === null);

  // 4) 「档」的阶梯：全案只列过 <90% / 90–98% / ≥98% 三条判定带（正文 :211、附录 H.5 :649–651），上下都夹在这条阶梯两端
  const tierNum = (base, v, on = true) => signalTier(base === 'short' ? { short: true } : base === 'full' ? { full: true } : {}, v, on);
  const tierOf = (base, v, on = true) => ['short', 'normal', 'full'][tierNum(base, v, on)];
  const LADDER = [
    ['short', 66.5, 'full'], ['normal', 66.5, 'full'], ['full', 66.5, 'full'],
    ['short', 60, 'normal'], ['normal', 60, 'full'], ['full', 60, 'full'],
    ['normal', 30, 'short'], ['short', 30, 'short'], ['short', 60, 'normal'],
    ['full', 90, 'normal'], ['normal', 90, 'short'], ['short', 90, 'short'],
    ['short', undefined, 'short'], ['normal', undefined, 'normal'], ['full', undefined, 'full'],
  ];
  const ladderBad = LADDER.filter(([b, v, want]) => tierOf(b, v) !== want);
  check('升/降档表 15 格逐格对：最佳+ 升两档（短斤直达足称）、绿区升一档、夹生与烫老降一档，上下都夹在三档阶梯内',
    ladderBad.length === 0, ladderBad.map(([b, v, w]) => `${b}@${v}→${tierOf(b, v)}（应 ${w}）`).join('、') || '15/15');
  check('开关关着时信号档逐字等于过称档（on=false 一支不读熟度，烫成 66.5 也不动）',
    tierOf('short', 66.5, false) === 'short' && tierOf('normal', 30, false) === 'normal'
    && tierOf('full', 90, false) === 'full');

  // 5) 整日账面：开关开着只挪「该单信号」那一格，C/H/Risk/Q/流水/COGS 与关着时逐分一样
  const RATIOS = [0.85, 1.0, 0.95];   // 短斤 / 足称 / 正常各一单（三档判定带都覆盖到）
  const dayRun = (on, vals) => {
    const s = newGame(SEED);
    s.eventScope = 'm1';
    const r = beginDay(s);
    morningPreEvent(s, r);
    submitBasket(s, [{ sku: 'MB1', qty: 4 }, { sku: 'VG1', qty: 6 }, { sku: 'NS1', qty: 4 }], r);
    lockTradingDay(s, { priceTier: 'qinmin' });
    morningEvent(s, r, () => null);
    const orders = drawHandOrders(s, r);
    s.blanchOn = on;
    const blanchBy = !on || !vals ? null : Object.fromEntries(orders.map((o, i) => [o.customerId, vals[i % vals.length]]));
    runDay(s, orders, o => Object.fromEntries(o.lines.map(l => [l.cat, Math.round(l.grams * RATIOS[orders.indexOf(o) % RATIOS.length])])), r, blanchBy);
    return { s, orders };
  };
  const off = dayRun(false), offNoVal = dayRun(true), onMix = dayRun(true, [66.5, 30, 90]);
  const acct = x => [x.s.C, x.s.H, x.s.Risk, x.s.Q, x.s.today.revenueCents, x.s.today.J, x.s.today.shortWeighCount, x.s.today.fullWeighCount].join('|');
  check('开关开着且一份没夹：账面与过称计数与关着时逐字相同（没下手就不进这一层）',
    acct(off) === acct(offNoVal) && offNoVal.s.today.signalShortCount === offNoVal.s.today.shortWeighCount
    && offNoVal.s.today.signalFullCount === offNoVal.s.today.fullWeighCount
    && Object.values(offNoVal.s.today.blanchCounts).every(v => v === 0),
    `过称 ${offNoVal.s.today.shortWeighCount}/${offNoVal.s.today.fullWeighCount}｜信号 ${offNoVal.s.today.signalShortCount}/${offNoVal.s.today.signalFullCount}`);
  check('开关开着且夹了：C/H/Risk/Q/流水/J 与关着时逐分相等（正文 :213「只作用单笔信号、不进 Q」，附录 :652 同口径）',
    acct(off) === acct(onMix) && acct(offNoVal) === acct(onMix),
    `关 ${acct(off)}｜开 ${acct(onMix)}`);
  const VALS = [66.5, 30, 90];
  check('夹生 / 烫老 / 最佳+ 三下各落一格：下手数与 blanchCounts 分带计数对上（3 单各夹一次）',
    onMix.s.today.blanchCounts.best === 1 && onMix.s.today.blanchCounts.under === 1
    && onMix.s.today.blanchCounts.over === 1 && onMix.s.today.blanchCounts.green === 0,
    `最佳+ ${onMix.s.today.blanchCounts.best}｜绿区 ${onMix.s.today.blanchCounts.green}｜夹生 ${onMix.s.today.blanchCounts.under}｜烫老 ${onMix.s.today.blanchCounts.over}`);
  const mixTier = i => signalTier(onMix.s.HandOrders[i], VALS[i % VALS.length], true);
  check('信号档逐单对得上：三单的 (过称档, 熟度) 组合走同一张升降档表，计数不重不漏',
    onMix.s.today.signalShortCount === onMix.s.HandOrders.filter((_, i) => mixTier(i) === 0).length
    && onMix.s.today.signalFullCount === onMix.s.HandOrders.filter((_, i) => mixTier(i) === 2).length
    && off.s.today.signalShortCount === off.s.today.shortWeighCount
    && off.s.today.signalFullCount === off.s.today.fullWeighCount,
    `开 ${onMix.s.today.signalShortCount}/${onMix.s.today.signalFullCount}｜关 ${off.s.today.signalShortCount}/${off.s.today.signalFullCount}`);

  // 6) 第 12 步留言第③层读的是这一对：短斤烫回正常就不再必然出嘀咕，足称烫老也不再必然出夸
  const regularOf = (short, full) => {
    const s = newGame(SEED);
    beginDay(s);
    s.R = 0; s.Risk = 0; s.Q = 60; s.today.QZeroSales = true;   // 掐掉①②两层的越线通路，只看③落哪一支
    s.today.shortWeighCount = short; s.today.fullWeighCount = full;
    s.today.signalShortCount = short; s.today.signalFullCount = full;
    return buildComments(s, makeRng(s)).filter(c => c.kind === 'regular').map(c => c.text);
  };
  check('③层：signalShort>0 出分量嘀咕、signalFull>0 出夸、两个都 0 且 R=0 时这一层整层空',
    regularOf(1, 0).length === 1 && regularOf(0, 1).length === 1
    && regularOf(1, 0)[0] === COMMENT_POOLS.portion[2] && regularOf(0, 1)[0] === COMMENT_POOLS.portion[1]
    && regularOf(0, 0).length === 0,
    `短 ${regularOf(1, 0)[0]}｜足 ${regularOf(0, 1)[0]}`);
  {
    const orders = [{ customerId: 'cX', name: '测试', bowls: 1, lines: [{ cat: 'MB', grams: 500 }] }];
    const night = (on, value) => {
      const s = newGame(SEED);
      beginDay(s);
      s.R = 0; s.Risk = 0; s.Q = 60; s.blanchOn = on;
      const r = makeRng(s);
      runDay(s, orders, () => ({ MB: 425 }), r, value === undefined ? null : { cX: value });   // 425/500 = 85% → 短斤
      return { s, reg: buildComments(s, r).filter(c => c.kind === 'regular').map(c => c.text) };
    };
    const up = night(true, 66.5), down = night(false, undefined);
    check('一单短斤烫到「最佳+」（升两档）→ 当晚出的是夸不是嘀咕；开关关着时同一单同一克数必出嘀咕',
      up.s.today.shortWeighCount === 1 && up.s.today.signalShortCount === 0 && up.s.today.signalFullCount === 1
      && up.reg[0] === COMMENT_POOLS.portion[1] && down.reg[0] === COMMENT_POOLS.portion[2]
      && up.s.C === down.s.C && up.s.H === down.s.H && up.s.Risk === down.s.Risk,
      `开 ${up.reg[0]}｜关 ${down.reg[0]}｜C/H/Risk ${up.s.C}/${up.s.H}/${up.s.Risk} 对 ${down.s.C}/${down.s.H}/${down.s.Risk}`);
  }

  // 7) 常客最低实现（§八「3 位有台词、无完整故事弧」+ 正文 5.4「不设选项、不给奖励清单」）
  check('常客线四个槽固定给 c01–c04（附录 E.10 约束第 3 条），有台词的正好三位 = §八 的额度',
    REGULAR_SLOTS.join(',') === 'c01,c02,c03,c04'
    && REGULAR_SLOTS.filter(c => (REGULAR_LINES[c] || []).length > 0).length === 3,
    `有台词 ${REGULAR_SLOTS.filter(c => (REGULAR_LINES[c] || []).length > 0).join('/')}｜句数 ${REGULAR_SLOTS.map(c => (REGULAR_LINES[c] || []).length).join('/')}`);
  check('regularLine 随进度走、到顶停在最后一句（不回卷、不沉默），越界与负数都不崩',
    regularLine('c01', 0) === REGULAR_LINES.c01[0] && regularLine('c01', 1) === REGULAR_LINES.c01[1]
    && regularLine('c01', 99) === REGULAR_LINES.c01[REGULAR_LINES.c01.length - 1]
    && regularLine('c01', -1) === REGULAR_LINES.c01[0] && regularLine('c04', 0) === null,
    `第 0 句「${regularLine('c01', 0)}」`);
  {
    const s = newGame(SEED);
    beginDay(s);
    s.HandOrders = [{ customerId: 'c01' }, { customerId: 'c06' }, { customerId: 'c03' }];
    const before = [...s.RegularStory];
    nightClose(s, makeRng(s), null, null);
    check('第 12 步推进：今天上过亲手单的常客线顾客那一格 +1，不占槽的剧情人物（c06 赵大妈）一格都不动',
      s.RegularStory[0] === before[0] + 1 && s.RegularStory[2] === before[2] + 1
      && s.RegularStory[1] === before[1] && s.RegularStory[3] === before[3],
      `推进 ${s.RegularStory.join('/')}（原 ${before.join('/')}）`);
    const none = newGame(SEED);
    beginDay(none);
    nightClose(none, makeRng(none), null, null);
    check('没上过的常客不推进（RegularStory 不是「天数计数器」，附录 F.5 :442 写的是这来过几回）',
      none.RegularStory.every(v => v === 0), none.RegularStory.join('/'));
  }
  check('台词只从 5.4 的四条生活线取材：不出现「要不要 / 便宜 / 省钱」式提问，不写年龄年级，不涉自伤表述（正文 §九 与附录 H.3 :676）',
    Object.values(REGULAR_LINES).flat().every(l => !/要不要|便宜|省钱|打折|黑心|良?心/.test(l))
    && Object.values(REGULAR_LINES).flat().every(l => !/[0-9一二三四五六七八九十]+\s*(年级|岁)/.test(l))
    && Object.values(REGULAR_LINES).flat().every(l => !/死|自伤|割腕|活不下去/.test(l)),
    `${Object.values(REGULAR_LINES).flat().length} 句逐句扫`);
  check('存档迁移：老档缺 blanchOn / RegularStory / signal* 三样按「没烫过、没来过」补齐，不作废（裁定 9a959bd §一）',
    (() => {
      const store = new Map();
      globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
      };
      const raw = JSON.parse(JSON.stringify(newGame(SEED)));
      raw.saveVersion = 'v4.9.2-cal.1';
      delete raw.blanchOn; delete raw.RegularStory;
      delete raw.today.signalShortCount; delete raw.today.signalFullCount; delete raw.today.blanchCounts;
      store.set(STORAGE_KEY, JSON.stringify(raw));
      const back = loadGame();
      delete globalThis.localStorage;
      return back !== null && back.blanchOn === CONFIG.blanch && back.RegularStory.length === 4
        && back.today.signalShortCount === (raw.today.shortWeighCount || 0)
        && back.today.signalFullCount === (raw.today.fullWeighCount || 0)
        && !!back.today.blanchCounts && Object.values(back.today.blanchCounts).every(v => v === 0);
    })());
}

// ── 14. M2 第七批：结局判定归属（附录 G.4 四个动作）+ 摊位六档升级段（UI-05 上段，此前只有无头线能走）──
{
  const mk = o => Object.assign(newGame(SEED), o);

  // 1) #3「规矩立住」四项门槛逐项（现金 60,000 / Rep 75 / H ≤10 / L ≥4，附录 G.4:590 与 ui-spec 换算表第 16 行）
  check('G.4 #3 四项同时达标（全取下界）判给「规矩立住」',
    judgeBuyout(mk({ Cash: BUYOUT_PRICE_CENTS, Rep: 75, H: 10, L: 4 })) === ENDING.RULES);
  check('#3 四项差一口气就判空（现金少一分 / Rep 差 0.01 / H 到 10.01 / L 只有 3）——判空即过，只升档',
    [
      judgeBuyout(mk({ Cash: BUYOUT_PRICE_CENTS - 1, Rep: 75, H: 10, L: 4 })),
      judgeBuyout(mk({ Cash: BUYOUT_PRICE_CENTS, Rep: 74.99, H: 10, L: 4 })),
      judgeBuyout(mk({ Cash: BUYOUT_PRICE_CENTS, Rep: 75, H: 10.01, L: 4 })),
      judgeBuyout(mk({ Cash: BUYOUT_PRICE_CENTS, Rep: 75, H: 10, L: 3 })),
    ].every(e => e === 0));
  check('G.4 #4 烧心大王：H≥18 且 Wmax≥210 斤（v4.9.2 由 70 斤随量纲重锚上调）判给 #4',
    judgeBuyout(mk({ Cash: BUYOUT_PRICE_CENTS, Rep: 75, H: 18, Wmax: 210, L: 4 })) === ENDING.HEARTBURN
    && judgeBuyout(mk({ Cash: 0, Rep: 0, H: 18, Wmax: 209.99 })) === 0);
  check('#3 排在 #4 前面且两者按构造互斥（H≤10 与 H≥18 不可能同时成立）→ 同日多条取序号最小这条不会被触发',
    judgeBuyout(mk({ Cash: BUYOUT_PRICE_CENTS, Rep: 75, H: 9, Wmax: 900, L: 4 })) === ENDING.RULES);

  // 2) #5 金盆洗手：NP≥300,000 元 且 C≥5；C<5 时目标墙那个入口根本不出现
  check('G.4 #5 门槛 NP≥300,000 元 且 C≥5（两个下界同取给 #5，任一项不足判空）',
    judgeRetire(mk({ NP: RETIRE_NP_CENTS, C: 5 })) === ENDING.RETIRE
    && judgeRetire(mk({ NP: RETIRE_NP_CENTS - 1, C: 5 })) === 0
    && judgeRetire(mk({ NP: RETIRE_NP_CENTS, C: 4 })) === 0);

  // 3) #6 变体门槛（附录 G.4 第 6 行 / ui-spec 换算表：NP≥90,000 元 且 Rep≥60）
  check('#6 变体「街坊会想你的摊」= NP≥90,000 元 且 Rep≥60；id 仍是 6，不是第七个结局',
    quitVariant(mk({ NP: QUIT_VARIANT_NP_CENTS, Rep: 60 })) && !quitVariant(mk({ NP: QUIT_VARIANT_NP_CENTS - 1, Rep: 60 }))
    && !quitVariant(mk({ NP: QUIT_VARIANT_NP_CENTS, Rep: 59.99 }))
    && ENDING.MEDIOCRE === 6 && Object.keys(ENDING).length === 6);

  // 4) 拆分不许改结果：无头线的 closeShop 与拆前三条内联式子逐状态同值（sweep C 段靠它，动一下就漂已签带）
  {
    const legacy = s => {
      if (s.Cash >= BUYOUT_PRICE_CENTS && s.Rep >= 75 && s.H <= 10 && s.L >= 4) return ENDING.RULES;
      if (s.H >= 18 && s.Wmax >= HEARTBURN_WMAX_JIN) return ENDING.HEARTBURN;
      if (s.C >= 5 && s.NP >= RETIRE_NP_CENTS) return ENDING.RETIRE;
      return ENDING.MEDIOCRE;
    };
    const probes = [
      mk({ Cash: 7000000, Rep: 80, H: 5, L: 5, C: 6, NP: 40000000 }),
      mk({ Cash: 7000000, Rep: 80, H: 20, Wmax: 300, L: 5 }),
      mk({ Cash: 100, Rep: 10, H: 20, Wmax: 300, C: 6, NP: 40000000 }),
      mk({ Cash: 100, Rep: 10, C: 4, NP: 40000000 }),
      mk({}), newGame(SEED),
    ];
    check('closeShop（无头线沿用）与拆前的合成式子在 6 个代表状态上逐字同结果',
      probes.every(s => closeShop(s) === legacy(s)),
      probes.map(s => `${closeShop(s)}`).join('/'));
  }

  // 5) 为什么 #3 必须判在钱出去之前（本批最实质的一条口径证据）
  {
    const s = mk({ Cash: BUYOUT_PRICE_CENTS + 10000, Rep: 80, H: 5, L: 4, Tier: 5 });
    const before = judgeBuyout(s);
    upgradeStall(s);
    check('盘店那笔 60,000 付出去之后现金必然跌破 60,000 ⇒ 判在付钱之后 = 「规矩立住」要手里攥着两份盘店钱；本批按 G.4 判在动作当刻（付钱前）',
      before === ENDING.RULES && judgeBuyout(s) === 0 && s.Tier === 6,
      `付钱前 ${before}｜付钱后现金 ${(s.Cash / 100).toFixed(2)} 元 → ${judgeBuyout(s)}｜档 ${s.Tier}`);
  }

  // 6) 摊位六档（附录 G.5:609 那行四列 + D.1:52 的赊购额阶梯，全部照表钉；这一整条此前只有无头线走得到，界面没有入口）
  {
    const s = newGame(SEED);
    let ok = true; const detail = [];
    let cash = 0;
    const want = {
      baseSales: [90, 180, 320, 550, 900, 1500],
      fixedCost: [75, 135, 240, 420, 780, 1440],
      creditCap: [600, 1500, 2500, 4000, 6500, 10000],
      capacity: [130, 260, 460, 790, 1300, 2160],
      upgradePrice: [800, 4500, 13500, 27000, 60000],
    };
    for (let i = 0; i < 6; i++) {
      const t = TIERS_STALL[i];
      cash += (want.upgradePrice[i] || 0);
      ok = ok && t.baseSales === want.baseSales[i] && t.fixedCost === want.fixedCost[i] * 100
        && t.creditCap === want.creditCap[i] * 100 && t.capacity === want.capacity[i]
        && (i === 5 ? t.upgradePrice === null : t.upgradePrice === want.upgradePrice[i] * 100);
      detail.push(`${t.name} ${t.baseSales}/${t.fixedCost / 100}/${t.creditCap / 100}/${t.capacity}`);
    }
    check('六档四列照附录 G.5:609 逐档钉（基础销量 / 固定支出 / 赊购额〔D.1:52〕/ 出餐产能斤数），末档 upgradePrice = null',
      ok && TIERS_STALL.length === 6, detail.join('　'));
    check('upgradeStall 五档一路买上去：逐档扣价、七个字段同起同落、换档当刻爬坡重新置 3（附录 G.5）',
      (() => {
        const u = newGame(SEED);
        let acc = 0, steps = 0;
        for (let i = 0; i < 5; i++) {
          const price = TIERS_STALL[u.Tier - 1].upgradePrice;
          u.Cash = price;                       // 取下界：正好够付
          const c0 = u.Cash, t0 = u.Tier;
          if (!upgradeStall(u)) return false;
          acc += c0 - u.Cash;
          if (u.Tier !== t0 + 1 || u.RampDays !== 3 || u.NetInvestSpent !== acc) return false;
          steps += 1;
        }
        return steps === 5 && u.Tier === 6 && u.BaseSales === 1500 && u.FixedCost === 144000
          && u.CreditCap === 1000000 && u.CapacityBase === 2160 && u.tierName === '整街双店'
          && acc === (800 + 4500 + 13500 + 27000 + 60000) * 100;   // 首档 800 = 定稿修订 R11
      })());
    const broke = newGame(SEED);
    const cashBefore = broke.Cash;
    check('现金不够付下一档 → upgradeStall 返回 false 且一分不扣（正文 3.5:136「额度耗尽只会让篮子提交不了」的同族边界）',
      upgradeStall(broke) === false && broke.Cash === cashBefore && broke.Tier === 1);
    const top = mk({ Tier: 6 });
    check('末档没有 upgradePrice → 买不动、不给结局（双店是终点档，§三 档位表）',
      upgradeStall(top) === false && top.Tier === 6 && top.EndingId === 0);
  }

  // 7) 档位一解锁，三条随档的线立刻跟着动（附录 H:621 亲手单 3→4、附录 G.5:610 工时 4·4·5·5·6·6、D.3 设施解锁）
  {
    const handAt = t => handOrderCount(mk({ Tier: t }));
    check('亲手单数随档位（正文 §八 M2 行「恢复 3 单/天、固定摊位档起 4 单/天」）：档 1–2 = 3 单，档 3 起 = 4 单',
      [1, 2].every(t => handAt(t) === CONFIG.handOrdersPerDay)
      && [3, 4, 5, 6].every(t => handAt(t) === CONFIG.handOrdersPerDayFull)
      && CONFIG.handOrdersTierFull === 3,
      `档 1–6 = ${[1, 2, 3, 4, 5, 6].map(handAt).join('/')}`);
    const gridAt = t => prepBudget(mk({ Tier: t, laborOn: false }));   // CONFIG.labor 是 true，先关掉人工再看档位那一格
    check('工时预算按档位 4·4·5·5·6·6（附录 G.5:610 工时行），小豆在场再多 1 格',
      [1, 2, 3, 4, 5, 6].map(gridAt).join('/') === '4/4/5/5/6/6'
      && (() => { const s = mk({ Tier: 3 }); s.laborOn = true; return prepBudget(s) === gridAt(3) + LABOR.gridBonus; })(),
      `档 1–6 = ${[1, 2, 3, 4, 5, 6].map(gridAt).join('/')}`);
    check('设施解锁条件走 DSL 原文且随档位放行：试吃角要二手餐车（档 2）、显多秤要固定摊位（档 3）',
      !isFacilityUnlocked(mk({ Tier: 1 }), 'fac_taste') && isFacilityUnlocked(mk({ Tier: 2 }), 'fac_taste')
      && Object.values(TOOLS).every(t => (t.id !== 'JI_SCALE') || (!evalCondition(t.unlock, mk({ Tier: 2 })) && evalCondition(t.unlock, mk({ Tier: 3 })))));
    check('界面置灰之外引擎侧也拦得住（buyTool 里那道 unlock 门）：档 1 买显多秤返回 false、不扣现金',
      (() => { const s = mk({ Cash: 10000000 }); const c0 = s.Cash;
        return buyTool(s, 'JI_SCALE') === false && s.Cash === c0 && !ownsTool(s, 'JI_SCALE'); })());
  }

  // 8) 为什么 #3 在 M1 口径下是 ⊘ 而不是 ✗：M1 内容能给的 L 到不了 4
  //    L 的来源正文写死两处（3.4:113）：店规设施每件 +1（共 6）＋良心版名场面每条 +1（共 4：回流全档 / 宣传队 / 锦旗 / 美食节获奖）→ 0–10。
  //    本实现只落了前三条（美食节评选按 §八 排期收口归"首更补齐"，未在建内），所以全池实际是 9 而不是 10。
  {
    const L_SCENES = ['evt_s_return', 'evt_s_promo', 'evt_s_flag'];
    // seen_routine_inspection 只有 M2 的例行检查能点亮，M1 口径下不许替它作弊（不然 fac_cert 被错算进 M1 池）
    const lUnder = scope => {
      const s = mk({ Tier: 6, BizDays: 200 });
      if (scope !== 'm1') s.seen_routine_inspection = true;
      s.EventHistory = EVENTS.filter(e => scope === 'm1' ? e.ship === 'M1' : true).map(e => e.id);
      const facs = Object.values(FACILITIES).filter(f => isFacilityUnlocked(s, f.id)).length;
      return { facs, scenes: L_SCENES.filter(id => s.EventHistory.includes(id)).length };
    };
    const m1 = lUnder('m1'), full = lUnder('full');
    check('L 上限 = 可解锁设施件数 + 可触发的良心名场面（正文 3.4:113 两处来源，只数设施是漏的）：M1 池 3＋0 < 4 ⇒ #3 在已签发带上 ⊘ scope-blocked，不记红',
      m1.facs + m1.scenes === 3 && m1.scenes === 0, `M1 设施 ${m1.facs}＋名场面 ${m1.scenes}＝L 上限 3`);
    check('M2 接上完整事件池：设施六件全解锁 + 三条名场面都在池 → L 上限 9 ≥ 4，「规矩立住」那一栏在 M2 可达（正文 3.4:113 干净线核对：设施 5 件本身就给到 L=5）',
      full.facs === 6 && full.scenes === 3, `全池 设施 ${full.facs}＋名场面 ${full.scenes}＝L 上限 ${full.facs + full.scenes}`);
    check('三条名场面在数据里各写死 L+1（回流全档挂在 Rep≥50 那一档的分支效果里；器具显多秤不计 L，附录 E 实现约束第 2 条）',
      L_SCENES.every(id => JSON.stringify(EVENTS.find(e => e.id === id)).includes('"L":1')), L_SCENES.join(' / '));
  }

  // 9) 两条被动结局（#1/#2）——每晚第 11 步判，与主动型不同轨
  check('#1 翻车三条入口都在（Risk=100、risk_100_pending、大检查 Score<35 由 §12 钉）',
    checkEndings(mk({ Risk: 100 })) === ENDING.CRASH && checkEndings(mk({ Risk: 0, risk_100_pending: true })) === ENDING.CRASH
    && checkEndings(mk({ Risk: 99.9 })) === 0);
  check('#2 破产 = 现金连负 3 天（第 2 天不判，第 3 天判）',
    checkEndings(mk({ NegativeCashStreak: 3 })) === ENDING.BANKRUPT && checkEndings(mk({ NegativeCashStreak: 2 })) === 0);

  // 10) #6 的合成评语两支：变体名正本 §六 给死，另一支是 agent 自撰；红线扫一遍
  {
    const hi = quitBlurb(mk({ NP: QUIT_VARIANT_NP_CENTS, Rep: 60, Day: 40 }));
    const lo = quitBlurb(mk({ NP: 0, Rep: 10, Day: 3 }));
    check('#6 评语两支都在（变体那句照 §六 原文「街坊会想你的摊」），且不碰暗线数字、不写道德判词',
      hi === '街坊会想你的摊。' && lo.includes('3') && !/Rep|Risk|口碑|良心|黑心|坚守|降级/.test(hi + lo),
      `「${hi}」/「${lo}」`);
  }

  // 11) 任意采购序列不死档（§八 M2 验收栏第一条）：五种买法各跑满 12 天，一天不许卡、账一天不许不平
  {
    const byTier = (t, jin, sp) => () => SOLID_CATS.map(c => ({ sku: SKU_BY_ID[c + t], qty: jin }))
      .concat([{ sku: SKU_BY_ID['SP' + t], qty: sp }]);
    const SEQ = {
      '空篮': () => [],
      '顶档正经料': byTier('1', 6, 24),
      '清仓特价（无票）': byTier('3', 6, 24),
      '强哥无标': byTier('6', 6, 24),
      '巨量（远超现金 + 赊购额）': byTier('2', 400, 400),
    };
    const drive = picks => {
      const s = newGame(SEED);
      let days = 0, bridge = 0, committed = 0, refused = 0, leak = 0, nan = 0, threw = null, firstBasket = 0;
      for (let i = 0; i < 12 && !s.EndingId; i++) {
        try {
          const r = beginDay(s);
          morningPreEvent(s, r);
          const cashBefore = s.Cash;
          const sub = submitBasket(s, picks(), r);
          if (i === 0) firstBasket = (sub.plan ? sub.plan.total / 100 : 0);
          if (sub.ok) committed += 1;
          // 篮子被拒付必须一分不扣（正文 3.5:136「额度耗尽只会让篮子提交不了」）——扣了就是账漏
          else { refused += 1; if (s.Cash !== cashBefore) leak += 1; }
          lockTradingDay(s, { priceTier: 'standard' });
          morningEvent(s, r, () => null);
          runDay(s, drawHandOrders(s, r), o => Object.fromEntries(o.lines.map(l => [l.cat, l.grams])), r);
          nightSettle(s, r);
          const ev = eveningDraw(s, r);
          nightClose(s, r, ev, ev ? (ev.actions?.[0]?.id ?? null) : null);
          days += 1;
          if (bridgeCheck(s).ok) bridge += 1;
          for (const v of [s.Cash, s.NP, s.today.revenueCents, s.today.netOpsCents, s.today.J])
            if (!Number.isFinite(v)) nan += 1;
        } catch (e) { threw = e.message; break; }
      }
      return { s, days, bridge, committed, refused, leak, nan, threw, firstBasket, ending: s.EndingId || 0 };
    };
    const runs = Object.fromEntries(Object.entries(SEQ).map(([k, v]) => [k, drive(v)]));
    const row = k => {
      const r = runs[k];
      return `${k}：篮 ${r.firstBasket} 元、${r.days} 天（买成 ${r.committed}／拒付 ${r.refused}）`
        + (r.ending ? `／第 ${r.s.Day} 天撞结局 #${r.ending}` : '')
        + `、桥 ${r.bridge}/${r.days}${r.threw ? `／抛异常 ${r.threw}` : ''}`;
    };
    const clean = r => !r.threw && r.nan === 0 && r.leak === 0 && r.bridge === r.days && (r.days === 12 || r.ending > 0);
    check('五种买法各 12 天：不抛异常、不出现 NaN、拒付不扣现金、现金桥天天平；结局提前落地算通过（触发制落地，不是死档）',
      Object.values(runs).every(clean), Object.keys(SEQ).map(row).join('　'));
    // 上一版这五条全在第 8 天并列撞 #2 —— 那是 600 元起步现金下四只篮子全被拒付、探针其实只在跑「什么都不买」。
    // 所以这一条把「篮子确实提交得了」钉住，病态买法才有病态的样子。
    check('买法真的买成了：三只买得起的篮子每天提交成功；巨量天天被拒付且一分不扣（提交不了 ≠ 死档）',
      ['顶档正经料', '清仓特价（无票）', '强哥无标'].every(k => runs[k].committed === runs[k].days && runs[k].committed > 0)
      && runs['巨量（远超现金 + 赊购额）'].committed === 0
      && runs['巨量（远超现金 + 赊购额）'].refused === runs['巨量（远超现金 + 赊购额）'].days,
      Object.keys(SEQ).map(k => `${k} 买成 ${runs[k].committed}/${runs[k].days}`).join('　'));
    check('结局分流只由 G.4 的两条判据走：无票货堆 Risk → #1，不买货烧固定支出 → #2，正经料跑到第 12 天没有结局',
      runs['顶档正经料'].ending === 0 && runs['顶档正经料'].days === 12
      && runs['清仓特价（无票）'].ending === ENDING.CRASH && runs['强哥无标'].ending === ENDING.CRASH
      && runs['空篮'].ending === ENDING.BANKRUPT && runs['巨量（远超现金 + 赊购额）'].ending === ENDING.BANKRUPT,
      Object.keys(SEQ).map(k => `${k} → #${runs[k].ending || '无'}`).join('　'));
  }
}

// ── 15. M2 第八批：事件池补六条（spec-event-pool-6-20261101，Orange 设计签发）+ 裁定 63a2ec8 ⑫ 脏档兜底 ──
{
  const EV = id => EVENT_BY_ID[id];
  const SIX = ['evt_s_copycat', 'evt_s_buyout', 'evt_d_stockout', 'evt_d_complaint', 'evt_d_pot', 'evt_d_blogger'].map(EV);
  const clone = s => JSON.parse(JSON.stringify(s));
  // 初值从 newGame 读，不写死（同 §12 的口径；§12 那两个常量在它自己的块作用域里，这里拿不到）
  const REP0 = newGame(SEED).Rep;
  const CASH0 = newGame(SEED).Cash;      // 分

  // 1) 池子计数与字段口径（spec §三 验收第一条）
  const kinds = { 坏事: 0, 好事: 0, 中性: 0 };
  EVENTS.forEach(e => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
  check('spec §三：池子 18 条 = 坏 10 / 好 5 / 中 3（本批 +4 / +1 / +1）',
    EVENTS.length === 18 && kinds['坏事'] === 10 && kinds['好事'] === 5 && kinds['中性'] === 3,
    `坏 ${kinds['坏事']}／好 ${kinds['好事']}／中 ${kinds['中性']}`);
  check('六条新行齐备、全带 ship="M2"、timing 只落在两条既有子流上（spec §三「不新增子流」）',
    SIX.length === 6 && SIX.every(e => e.ship === 'M2')
    && SIX.every(e => SUBSTREAMS.includes(e.timing === 'morning_pre' ? 'event_morning_pre' : 'event_evening')),
    SIX.map(e => `${e.id}=${e.pool}/${e.timing}/${e.kind}/${e.weight}`).join('　'));

  // 2) 门槛、冷却、数值族逐项对照 spec（引用式断言：spec 改了这里就红）
  check('门槛照 spec 落行：山寨 Rep≥70 & Tier≥3｜收购 NP≥48,000 元（= 4,800,000 分）｜断货 Day≥5｜探店 近 3 日平均 Q≥65 & Tier≥2',
    EV('evt_s_copycat').condition === 'Rep>=70 & Tier>=3 & !EVT?evt_s_copycat'
    && EV('evt_s_buyout').condition === 'NP>=4800000 & !EVT?evt_s_buyout'
    && EV('evt_d_stockout').condition === 'Day>=5'
    && EV('evt_d_blogger').condition === 'AvgQ3>=65 & Tier>=2');
  check('冷却照 spec 落行：断货 9 / 吃坏肚子 7 / 汤锅 10 / 探店 14；山寨与收购一次性（999 + condition 里的 !EVT? 自锁）',
    EV('evt_d_stockout').cooldown === 9 && EV('evt_d_complaint').cooldown === 7
    && EV('evt_d_pot').cooldown === 10 && EV('evt_d_blogger').cooldown === 14
    && EV('evt_s_copycat').cooldown === 999 && EV('evt_s_buyout').cooldown === 999);
  const opsOf = e => (e.actions || []).flatMap(a => a.open || []).concat(e.open || []);
  const hidOf = e => (e.actions || []).flatMap(a => a.hidden || []).concat(e.effect_hidden || []);
  const cashAbs = SIX.flatMap(opsOf).filter(o => o.cash).map(o => Math.abs(o.cash));
  const d0s = SIX.flatMap(opsOf).map(o => o.nextDayTrafficMult ?? (o.d0Buff ? o.d0Buff.mult : undefined)).filter(x => x !== undefined);
  const reps = SIX.flatMap(hidOf).filter(o => o.Rep).map(o => o.Rep);
  const risks = SIX.flatMap(hidOf).filter(o => o.Risk).map(o => o.Risk);
  check('数值全落在 spec §一 点名的量级族内：现金 150–300｜D0 乘数 0.85–1.15｜Rep ±2–5｜Risk +8 量级（六条里只这两笔钱、两个乘数）',
    cashAbs.join() === '26000,18000' && cashAbs.every(c => c >= 15000 && c <= 30000)
    && d0s.join() === '0.92,1.1' && d0s.every(m => m >= 0.85 && m <= 1.15)
    && reps.join() === '-2,-5,5' && reps.every(r => Math.abs(r) >= 2 && Math.abs(r) <= 5)
    && risks.join() === '8', `现金 ${cashAbs.join('/')} 分｜D0 ${d0s.join('/')}｜Rep ${reps.join('/')}｜Risk ${risks.join('/')}`);
  check('六条都不越 3.13 红线、也不动清单外的格子：无 R / 无 L / 无 C / 无 H / 无产能与库存直改',
    SIX.flatMap(hidOf).every(o => o.R === undefined && o.L === undefined && o.C === undefined && o.H === undefined)
    && SIX.flatMap(opsOf).every(o => o.reserveBowls === undefined && o.deposit === undefined
      && o.pricewarDays === undefined && o.destroyUnticketed === undefined && o.wageRaise === undefined),
    '暗线只有 Rep 与 Risk 两格，明账只有现金 / D0 乘数 / 下架 / 汤封顶 / 惯性封顶');

  // 3) 山寨摊：五条营业日的惯性封顶（spec §一.1「走 3.13 既有参数，加状态 CopycatDays 计数」）
  {
    const s = newGame(SEED);
    resolveChoice(s, EV('evt_s_copycat'), null);
    const flags = [];
    for (let i = 0; i < 6; i++) { beginDay(s); flags.push(s.today.copycatActive); }
    check('山寨摊存续 5 个营业日：第 1 步「先写当日标志再递减」，与 PricewarDays 三日倒计时同一写法',
      s.CopycatDays === 0 && flags.join() === 'true,true,true,true,true,false', flags.join('/'));
    const compState = active => {
      const c = clone(s);
      c.competitionOn = true; c.P = 90; c.RivalP = 30; c.PricePerJin = 19.2; c.RivalPrice = 28.9;
      c.QueueInertia = [1.15, 1, 1, 1];      // 昨日惯性带内上沿：份额再高也咬在 1.15（G.1 钳位带）
      c.today.copycatActive = active;
      return c;
    };
    const off = compState(false), on = compState(true);
    const offRet = sharesAndS(off), onRet = sharesAndS(on);   // 落账写 state.QueueInertia / state.Share，返回值里没有惯性
    check('封顶只咬本摊那一格：无山寨时惯性 1.15（带内上沿）→ 存续期内压到 1.0；其余三摊逐字不变',
      off.QueueInertia.length === 4 && Math.abs(off.QueueInertia[0] - 1.15) < 1e-9 && on.QueueInertia[0] === 1.0
      && off.QueueInertia.slice(1).join() === on.QueueInertia.slice(1).join(),
      `惯性 ${off.QueueInertia.map(x => x.toFixed(3)).join('/')} → ${on.QueueInertia.map(x => x.toFixed(3)).join('/')}`);
    check('封顶不动份额账：山寨只截惯性这一格，S 与四摊 share 逐字不变（3.13 红线：竞争层不许开新口子）',
      Math.abs(offRet.S - onRet.S) < 1e-12 && offRet.share.join() === onRet.share.join(),
      `S ${offRet.S.toFixed(6)}｜份额 ${offRet.share.map(x => x.toFixed(4)).join('/')}`);
  }

  // 4) 收购邀约：纯演出（spec §一.2「无机械效果、配一条留言、不设分支不设报价数值」）
  {
    const s = newGame(SEED);
    s.NP = 4800000;
    const before = clone(s);
    const r = resolveChoice(s, EV('evt_s_buyout'), null);
    const watched = ['Cash', 'NP', 'Rep', 'R', 'R_v', 'L', 'C', 'H', 'Risk', 'RiskShort', 'Q', 'StockSoup',
      'd0_buff_mult', 'd0_buff_days', 'next_day_traffic_mult', 'event_demand_mult', 'CopycatDays', 'PricewarDays'];
    const moved = watched.filter(k => JSON.stringify(before[k]) !== JSON.stringify(s[k]));
    check('收购邀约一分子钱都不动：明账 / 暗线 / 竞争层格子全等，只多一条 ① 类强制留言，且是单按钮（actions 空）',
      moved.length === 0 && r.action === null && s.today.forcedComments.length === 1
      && EV('evt_s_buyout').actions.length === 0 && EV('evt_s_buyout').open.length === 1,
      moved.length ? `动了 ${moved.join('/')}` : `留言「${s.today.forcedComments[0]}」`);
    check('一次性：触发后 condition 里的 !EVT? 当场自锁（NP 仍达标也抽不到），冷却再兜一层 999 日',
      evalCondition(EV('evt_s_buyout').condition, s) === false
      && s.Cooldowns.evt_s_buyout === s.Day + 999);
  }

  // 5) 粉坊断货：只次日、四档全拒、不掷随机、柜里存量照卖
  {
    const s = newGame(SEED);
    s.Day = 5;
    resolveChoice(s, EV('evt_d_stockout'), null);
    check('第 2 步的晨间情报写的是「明天」：落地当刻 today.delist 仍是空的（今日照旧能囤粉）',
      s.pendingDelist === 'NS' && !s.today.delist);
    beginDay(s); const d1 = s.today.delist, pending1 = s.pendingDelist;
    beginDay(s); const d2 = s.today.delist;
    check('下架只次日：第 1 步结转成真、用完即清', d1 === 'NS' && pending1 === null && d2 === null,
      `D+1 ${d1 || '无'}｜D+2 ${d2 || '无'}`);
    const q = newGame(SEED); beginDay(q); q.today.delist = 'NS'; q.C = 5; q.Day = 20;
    const counters = JSON.stringify(q.streamCounter);
    const nsOut = ['NS1', 'NS2', 'NS3', 'NS6'].map(k => skuAvailable(q, SKU_BY_ID[k], makeRng(q)));
    check('「全档下架」= 粉面四档一起不收（正经 / 批发 / 清仓 / 强哥全 false），别的品类不受影响',
      nsOut.every(v => v === false) && skuAvailable(q, SKU_BY_ID['MB1'], makeRng(q)) === true
      && skuAvailable(q, SKU_BY_ID['VG3'], makeRng(q)) === true, nsOut.join('/'));
    check('下架判定不吃随机：四档问一遍，supply 子流一次都没抽（已签带的随机轨不漂）',
      JSON.stringify(q.streamCounter) === counters);
    const sell = newGame(SEED); beginDay(sell); sell.today.delist = 'NS';
    sell.Batches = SOLID_CATS.map(c => ({ cat: c, sku: c + '1', tier: 1, qty: 300, unit: '斤', q: 95,
      costPerUnit: 5, hasReceipt: 1, day: sell.Day }))
      .concat([{ cat: 'SP', sku: 'SP1', tier: 1, qty: 400, unit: '份', q: 95, costPerUnit: 1, hasReceipt: 1, day: sell.Day }]);
    recomputeStock(sell);
    lockTradingDay(sell, { priceTier: 'standard' });
    runDay(sell, [], () => ({}), makeRng(sell));
    check('下架挡买不挡卖：柜里的粉照样在第 7 步出菜（soldJin.NS > 0），缺口由 ω/Ω 与 7f 溢出吸收',
      sell.today.soldJin.NS > 0 && sell.StockSolid.NS < 300, `售出 NS ${sell.today.soldJin.NS} 斤`);
  }

  // 6) 跑表线跟着玩家看得见的那面货架走：断货日 NS 零进货，且六条在真实线上确实各自触发过
  {
    const M2 = { labor: true, competition: true, eventScope: 'full' };
    const lines = [...Object.values(REF_STRATEGIES),
      ...Object.values(STRATEGIES).map(s => ({ ...s, buyFacilities: true, upgrade: true, buyout: false }))];
    const hits = Object.fromEntries(SIX.map(e => [e.id, 0]));
    const bad = [];
    const nsBad = [];
    let delistDays = 0;
    for (const strat of lines) {
      for (let i = 0; i < 6; i++) {
        const seed = SEED + i * 977;
        const r = simulate(seed, 200, strat, 'headless',
          { ...M2, buy: 'appc', additive: strat.key === 'ref3' ? 'more' : 'none' });
        const seen = new Set();
        for (const d of r.log) for (const id of [d.pre, d.morning, d.evening]) if (id) seen.add(id);
        for (const e of SIX) if (seen.has(e.id)) hits[e.id]++;
        for (const rep of r.state.DailyReports) {
          if (rep.delist === 'NS') {
            delistDays += 1;
            if (rep.purchasedJin.NS > 0) nsBad.push(`${seed}D${rep.day} 买了 ${rep.purchasedJin.NS} 斤`);
          }
        }
        if (!bridgeCheck(r.state).ok) bad.push(`${seed}/${strat.key} 现金桥不平`);
      }
    }
    check('spec §三：六条各自至少 1 次种子实测触发（不造态，6 条线 × 6 颗种子 × 200 日）',
      SIX.every(e => hits[e.id] > 0) && bad.length === 0,
      SIX.map(e => `${e.id.replace('evt_', '')} ${hits[e.id]}场`).join('　') + (bad.length ? `／${bad.join('、')}` : ''));
    check('跑表线不买市场拒收的货：全部断货日 NS 进货为零，且这些日子确实出现过（不是一句空判）',
      delistDays > 0 && nsBad.length === 0,
      `${delistDays} 个断货日、NS 零进货${nsBad.length ? '／' + nsBad.join('、') : ''}`);
  }

  // 7) 汤锅裂了：补锅一笔钱 / 将就次日封顶减半
  {
    const mk = on => {
      const s = newGame(SEED);
      beginDay(s);
      s.Batches = SOLID_CATS.map(c => ({ cat: c, sku: c + '1', tier: 1, qty: 300, unit: '斤', q: 95,
        costPerUnit: 5, hasReceipt: 1, day: s.Day }))
        .concat([{ cat: 'SP', sku: 'SP1', tier: 1, qty: 20, unit: '份', q: 95, costPerUnit: 1, hasReceipt: 1, day: s.Day }]);
      recomputeStock(s);
      s.today.soupHalf = on;
      lockTradingDay(s, { priceTier: 'standard' });
      return runDay(s, [], () => ({}), makeRng(s));
    };
    const a = mk(false), b = mk(true);
    check('拿盆将就 = 第 7c-2 步那条「可售份数上限」×0.5（同一格封顶、不新造系统），卖出的碗数跟着减半',
      a.bowls > 0 && b.bowls > 0 && Math.abs(a.bowls - 2 * b.bowls) < 0.05 && b.soupSoldOut === true,
      `封顶前 ${a.bowls} 碗 → 封顶后 ${b.bowls} 碗（汤底 20 份）`);
    const p = newGame(SEED);
    resolveChoice(p, EV('evt_d_pot'), 'improvise');
    beginDay(p); const t1 = p.today.soupHalf;
    beginDay(p); const t2 = p.today.soupHalf;
    check('将就也只次日：pendingSoupHalf → 第 1 步结转 → 第三天自己清掉',
      p.pendingSoupHalf === false && t1 === true && t2 === false, `${t1}/${t2}`);
    const cashBefore = CASH0;
    const q = newGame(SEED);
    const r = resolveChoice(q, EV('evt_d_pot'), 'patch');
    check('花钱补锅走事件账晚间一栏（现金桥口径）：当场 −180 元、eventCashEvening 同步记一笔、NP 在第 11 步才吃这一笔',
      q.Cash === cashBefore - 18000 && q.today.eventCashEvening === -18000
      && r.judgment === null && q.NP === 0, `现金 ${(q.Cash / 100).toFixed(2)} 元｜事件账 ${(q.today.eventCashEvening / 100).toFixed(2)}`);
    // v4.9.3 整合批：第八批回报 ⑤ 店主裁定「补上」——补锅那颗照事件通则置灰，另一颗不花钱故不构成死局
    const P = EV('evt_d_pot');
    const poor = newGame(SEED); poor.Cash = 10000;
    const g100 = isActionAffordable(poor, P.actions[0]);
    poor.Cash = 20000;
    const g200 = isActionAffordable(poor, P.actions[0]);
    check('掏不起 180 元时「花钱补锅」置灰（gate:afford，与赔礼 260 / 涨薪 1,800 同一道门），「拿盆将就」不吃这道门 ⇒ 两个都付不起的死局选项不出现（正文 3.5 / 3.7）',
      g100 === false && g200 === true && isActionAffordable({ ...poor, Cash: 10000 }, P.actions[1]) === true,
      `100 元 → ${g100}｜200 元 → ${g200}`);
    const gated = newGame(SEED); gated.Cash = 10000;
    resolveChoice(gated, P, 'patch');
    check('这道门只写在界面侧：无头线现金不足照样走「花钱补锅」并扣成负数，引擎不因置灰改道（与 gate 的既有口径逐字同构）',
      gated.Cash === 10000 - 18000 && gated.pendingSoupHalf === false, `现金 ${(gated.Cash / 100).toFixed(2)} 元`);
  }

  // 8) 吃坏肚子来理论：双分支、双入池路、近 3 日窗口
  {
    const C = EV('evt_d_complaint');
    const s = newGame(SEED);
    s.Cash = 10000;
    check('赔礼分支 260 元掏不起就置灰（spec「照事件通则」→ gate:afford），硬扛分支不吃这道门',
      isActionAffordable(s, C.actions[0]) === false && isActionAffordable(s, C.actions[1]) === true
      && (s.Cash = 30000, isActionAffordable(s, C.actions[0]) === true));
    const ap = newGame(SEED);
    resolveChoice(ap, C, 'apologize');
    check('赔礼道歉：现金 −260 + Rep −2 + 一条致歉向留言，不动次日客流',
      ap.Cash === CASH0 - 26000 && ap.Rep === REP0 - 2
      && ap.today.forcedComments.length === 1 && ap.next_day_traffic_mult === 1.0,
      `Rep ${ap.Rep}｜留言「${ap.today.forcedComments[0]}」`);
    const dn = newGame(SEED);
    resolveChoice(dn, C, 'deny');
    check('硬扛不认：Risk +8、Rep −5、次日 D0 ×0.92（走 next_day_traffic_mult 那一格，与「当场要钱」×0.85 同一条通道）',
      dn.Risk === 8 && dn.Rep === REP0 - 5 && dn.next_day_traffic_mult === 0.92,
      `Risk ${dn.Risk}｜Rep ${dn.Rep}｜明日乘数 ${dn.next_day_traffic_mult}`);
    const d0ratio = mult => {
      const s2 = newGame(SEED);
      beginDay(s2);
      s2.next_day_traffic_mult = mult;
      s2.Batches = SOLID_CATS.map(c => ({ cat: c, sku: c + '1', tier: 1, qty: 300, unit: '斤', q: 95,
        costPerUnit: 5, hasReceipt: 1, day: s2.Day }))
        .concat([{ cat: 'SP', sku: 'SP1', tier: 1, qty: 400, unit: '份', q: 95, costPerUnit: 1, hasReceipt: 1, day: s2.Day }]);
      recomputeStock(s2);
      lockTradingDay(s2, { priceTier: 'standard' });
      runDay(s2, [], () => ({}), makeRng(s2));
      return s2;
    };
    const one = d0ratio(1.0), nine = d0ratio(0.92);
    check('×0.92 落在第 7a 步的 D0 上、且只用一次就复位',
      Math.abs(nine.today.D0 - one.today.D0 * 0.92) < 1e-9 && nine.next_day_traffic_mult === 1.0,
      `D0 ${one.today.D0.toFixed(3)} → ${nine.today.D0.toFixed(3)}`);
    // 双权重：近 3 日出了品质问题 → weight，没出 → baseWeight（同一条事件的罕见路）
    const wq = sig => { const s3 = newGame(SEED); s3.Day = 6; Object.assign(s3, sig); return weightOf(s3, C); };
    const clean = wq({ Q: 80, AdditiveTier: 'none' });
    const badQ = wq({ Q: 40 });
    const cheap = (() => { const s4 = newGame(SEED); s4.Day = 6; s4.today.purchases = [{ cat: 'VG', tier: 3 }]; return weightOf(s4, C); })();
    const more = wq({ Q: 80, AdditiveTier: 'more' });
    check('spec §二.4 的「双路入池」：近 3 日任一（当日 Q<45 / 特价或特供料 / 多掺）→ weight 7，一条都没出 → baseWeight 1 的罕见路',
      C.weight === 7 && C.baseWeight === 1 && badQ === 7 && cheap === 7 && more === 7 && clean === 1,
      `干净 ${clean}｜Q40 ${badQ}｜特价 ${cheap}｜多掺 ${more}`);
    const hist = w => { const s5 = newGame(SEED); s5.Recent3 = w; s5.Q = 90; return s5; };
    check('近 3 日窗口读的是「当日 + 前两日」：历史里的坏日子还在窗口内，第三日之后翻篇',
      evalCondition(C.weightCond, hist([{ day: 1, q: 40, cheap: false, add: false }])) === true
      && evalCondition(C.weightCond, hist([{ day: 1, q: 40, cheap: false, add: false }, { day: 2, q: 90, cheap: false, add: false }])) === true
      && evalCondition(C.weightCond, hist([
        { day: 1, q: 90, cheap: false, add: false }, { day: 2, q: 90, cheap: false, add: false }])) === false,
      '窗口只数三条，多出来的最老那条自动掉出去');
    const rolled = newGame(SEED);
    for (let i = 0; i < 6; i++) { beginDay(rolled); nightClose(rolled, makeRng(rolled), null, null); }
    check('窗口随第 12 步滚存、长度封顶 3（不随存档越长越大）',
      rolled.Recent3.length === 3 && rolled.Recent3.every(d => Number.isFinite(d.q)),
      rolled.Recent3.map(d => `D${d.day}:Q${d.q}`).join(' '));
    check('罕见路仍带 Day≥3 地板：定稿 §四「压力后置」+ 回签审复 §一.1（负面机制第 3 天之后才解锁）是正文级口径，批内简报不覆盖它',
      C.condition === 'Day>=3' && evalCondition(C.condition, Object.assign(newGame(SEED), { Day: 1 })) === false
      && evalCondition(C.condition, Object.assign(newGame(SEED), { Day: 3 })) === true);
  }

  // 9) 测评号探店：品质门槛 + buff 合并 + 小刘人物
  {
    const B = EV('evt_d_blogger');
    const mkState = (q, tier) => {
      const s = newGame(SEED);
      s.Day = 8; s.Tier = tier; s.Q = q;
      s.Recent3 = [{ day: 6, q, cheap: false, add: false }, { day: 7, q, cheap: false, add: false }];
      return s;
    };
    check('近 3 日平均 Q≥65 且 Tier≥2 才入池：Q 不够根本抽不到（没有惩罚版），档位不够也抽不到',
      evalCondition(B.condition, mkState(70, 2)) === true && evalCondition(B.condition, mkState(60, 2)) === false
      && evalCondition(B.condition, mkState(90, 1)) === false,
      `Q 70/档 2 → ${evalCondition(B.condition, mkState(70, 2))}｜Q 60 → ${evalCondition(B.condition, mkState(60, 2))}`);
    const s = newGame(SEED);
    s.d0_buff_mult = 1.2; s.d0_buff_days = 3;
    resolveChoice(s, B, null);
    check('探店落地：Rep +5 进暗账、明账是 ×1.10 持续 3 日的 d0Buff，与既有 buff 按 E 表通用规则「乘入 + 天数取最大」合并',
      s.Rep === REP0 + 5 && Math.abs(s.d0_buff_mult - 1.2 * 1.10) < 1e-9 && s.d0_buff_days === 3,
      `buff ${s.d0_buff_mult.toFixed(4)}/${s.d0_buff_days} 日｜Rep ${s.Rep}`);
    check('人物用附录 H 既有 c05「小刘（测评号）」、不新造人；文案与宣传队那条 ① 类留言错位（各写各的）',
      /小刘/.test(B.text) && B.actions.length === 0 && B.effect_hidden.length === 1 && B.open.length === 1);
  }

  // 10) 红线：六条新行的玩家可见文本不许出现暗线数值与道德判词
  {
    const strings = SIX.flatMap(e => [e.text].concat((e.actions || []).map(a => a.label))
      .concat((e.actions || []).flatMap(a => (a.open || []).filter(o => o.forcedComment).map(o => o.forcedComment)))
      .concat((e.open || []).filter(o => o.forcedComment).map(o => o.forcedComment)));
    const forbidden = /Rep|Rep\s*[≥>=]|Risk|风声|暗线|良心|黑心|缺德|道德|口碑值|概率|权重|触发|系统|判定式|Q\s*[≥><=]|品质分/;
    const money = strings.filter(x => /[0-9０-９]/.test(x));
    check('六条新行的可见文本零命中暗线数值与道德判词；带数字的只有两笔明账钱（−260 / −180 在按钮上）',
      strings.every(x => !forbidden.test(x)) && money.length === 2 && money.every(x => /−\d{3}/.test(x)),
      money.join(' / '));
    check('食安题材边界（正文 :370）：吃坏肚子那条只写暧昧归因，不出现呕吐 / 就医 / 确诊字样，也不给可执行暗示',
      /说不清|是不是/.test(EV('evt_d_complaint').text)
      && !/呕吐|拉肚子|医院|就医|确诊|输液|中毒|配?方|配比/.test(strings.join('')),
      EV('evt_d_complaint').text);
    check('玩梗边界（正文 :372）：小刘那条不影射真实测评账号、不点名任何平台或 UP 主',
      !/小红书|抖音|B站|微博|快手|UP主|博主|测评号/.test(EV('evt_d_blogger').text), EV('evt_d_blogger').text);
  }

  // 11) 已签带零扰动：m1 口径下六条新行不进池，抽取序列与本批之前同轨
  {
    const s = newGame(SEED);
    s.eventScope = 'm1'; s.Day = 5; s.Rep = 90; s.NP = 99999999; s.Tier = 6; s.Risk = 90; s.Q = 100;
    const ids = [];
    for (let i = 0; i < 60; i++) {
      const e = drawEvent(s, 'evening', makeRng(s));
      if (e) ids.push(e.id);
      s.Day += 1;
    }
    check('eventScope="m1" 时六条新行全部进不了池（门槛全造满也不抽）：已签发的 M1 带不受本批影响',
      ids.every(id => EVENT_BY_ID[id].ship === 'M1'), `60 抽里出现 ${[...new Set(ids)].join('/')}`);
    const pre = [];
    for (let i = 0; i < 60; i++) {
      const e = drawEvent(s, 'morning_pre', makeRng(s));
      if (e) pre.push(e.id);
    }
    check('晨间情报通道同一条理由：m1 口径下断货那条（morning_pre / M2）也不进池',
      pre.every(id => EVENT_BY_ID[id].ship === 'M1'), `${[...new Set(pre)].join('/') || '无'}`);
  }

  // 12) 裁定 63a2ec8 ⑫：脏档只兜这一处、只这一种；引擎侧的断言是「读档不许凭空造情境」
  {
    const store = new Map();
    globalThis.localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    };
    const good = newGame(SEED);
    beginDay(good);
    good.today.scenario = null;                            // 模拟写坏：当日情境这一格没了
    const raw = JSON.parse(JSON.stringify(good));
    raw.saveVersion = 'v4.9.2-cal.1';
    for (const k of ['CopycatDays', 'pendingDelist', 'pendingSoupHalf', 'Recent3']) delete raw[k];
    delete raw.today.copycatActive; delete raw.today.delist; delete raw.today.soupHalf;
    store.set(STORAGE_KEY, JSON.stringify(raw));
    const back = loadGame();
    delete globalThis.localStorage;
    check('旧档缺第八批四样按「没被山寨过、今天没断货、近三日用空窗」补齐，不作废（裁定 9a959bd §一）',
      back !== null && back.CopycatDays === 0 && back.pendingDelist === null
      && back.pendingSoupHalf === false && Array.isArray(back.Recent3) && back.Recent3.length === 0
      && back.today.copycatActive === false && back.today.delist === null && back.today.soupHalf === false);
    check('兜底不许在读档里凭空造一份情境：today.scenario 缺就让它缺着，界面据此路由回 beginDay（裁定 ⑫ 只许这一处、这一种）',
      back !== null && (back.today.scenario === null || back.today.scenario === undefined)
      && back.dayStarted === true, `scenario ${JSON.stringify(back.today.scenario)}`);
    check('脏档进引擎入口就自愈：beginDay 重跑第 1 步把当日情境补齐，晨间屏读得到东西',
      (() => {
        const s = back;
        beginDay(s);
        return !!s.today.scenario && !!s.today.forecast && s.today.scenario.weather.id !== undefined;
      })());
  }
}
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
