// M1 回归回路（红/绿命令）：node test_regression.js [种子]
// 断言 = 三条极端玩法压力测试 + 逐日账目可核 + 同种子复现 + 事件覆盖 + 红线静态扫描
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, STRATEGIES, REF_STRATEGIES } from './src/sim.js';
import { bridgeCheck, settleDay, settleWriteoff, settleTasting } from './src/engine/ledger.js';
import { newGame, roundJin, loadGame, STORAGE_KEY, toCents } from './src/engine/state.js';
import { effectivePrice, buildBasket, planPayment, recomputeStock, buyTool, sellBackTool, ownsTool, upgradeStall, isFacilityUnlocked, skuAvailable, cheapUnlockCheck } from './src/engine/market.js';
import { ALL_CATS, CAT, SOLID_CATS, PRICE_TIERS, PACKING, PACKING_SPILL, CONFIG, SAVE_VERSION,
  ADDITIVE, PREP_LEVELS, LABOR, TASTING, TOOLS, SCALE_DELTA_J_SHARE, SCALE_C_PER_JIN, SCALE_RISK_PER_JIN,
  COMPETITION, INSPECTION, FACILITIES, ENDING, BLANCH, TIERS_STALL, SUBSTREAMS,
  BUYOUT_PRICE_CENTS, RETIRE_NP_CENTS, HEARTBURN_WMAX_JIN, QUIT_VARIANT_NP_CENTS, QUIT_VARIANT_REP,
  QUALITY_BY_TIER, CHEAP_UNLOCK_CUE, CHEAP_TIER_WARNING } from './src/data/constants.js';
import { SKU_BY_ID } from './src/data/skus.js';
import { scenarioOf, WEATHER } from './src/data/scenario.js';
import { evalCondition, readVar } from './src/engine/dsl.js';
import { EVENTS, EVENT_BY_ID, DRAW_GATE } from './src/data/events.js';
import { windowOf, pushRecent, todaySignal } from './src/engine/recent.js';
import { beginDay, morningPreEvent, submitBasket, previewBasket, commitPrep, lockTradingDay, morningEvent, runDay, nightSettle, eveningDraw, nightClose, checkEndings,
  judgeBuyout, judgeRetire, quitVariant, quitBlurb, closeShop } from './src/engine/day.js';
import { additiveOf, additiveUnlocked, capacityJin, computeMBase, prepBudget, prepGridUsed, qTaste, washSkipped,
  xiaodouPresent, laborCapMul, laborCostCents, tastingConvert } from './src/engine/production.js';
import { drawHandOrders, handOrderCount, stockGrams, gramsCeilingFor } from './src/engine/weigh.js';
import { applyHidden, resolveChoice, weightOf, drawEvent, isActionAvailable, isActionAffordable } from './src/engine/events.js';
import { inspectionScore, ticketlessCostCents, destroyTicketless, judgeBigInspection, judgeRoutineInspection } from './src/engine/inspection.js';
import { blanchValueAt, judgeBlanch, signalTier } from './src/engine/blanch.js';
import { REGULAR_LINES, regularLine, REGULAR_SLOTS } from './src/data/customers.js';
import { buildComments } from './src/engine/comments.js';
import { COMMENT_POOLS } from './src/data/comments.js';
import { WIND_ROWS } from './src/data/wind.js';
import { windCard, windBandIndex } from './src/ui/wind.js';
import { WEATHER_TALK, weatherTalk, catDeviation } from './src/data/weather-talk.js';
import { VOICE_INTRO, VOICE_RESULT, VOICE_REGULAR, voiceIntroLines, voiceResultLines, resultTexts, voiceRegularLines } from './src/data/voice.js';
import { BROADCAST_KINDS, BROADCAST_POOL, broadcastLine, inoutTotals } from './src/ui/settle-broadcast.js';
import { mergeSelloutNames } from './src/ui/sellout.js';
import { BUBBLE_MAX, FLOAT_MAX, takeBubbles, takeFloats, orderSay, praiseSay, grumbleSay, rushSay, envKey, envOrder, envelopeTitle, isSameSay } from './src/ui/feedfx.js';
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
    // 改判单 task-frontload-d3-20261104：特殊池有 D3 时间闸，这一对旧口径要在闸内比（§18 另有闸外的针）
    s.Day = CONFIG.specialFirstDay;
    s.eventScope = 'm1';
    const off = drawEvent(s, 'evening', makeRng(s));
    s.eventScope = 'full';
    const on = drawEvent(s, 'evening', makeRng(s));
    check('eventScope= m1 挡住 M2 特殊行（Risk 80 也抽不到大检查）；= full 时硬触发不走概率门',
      (!off || off.ship === 'M1') && on.id === 'evt_s_insp',
      `关 → ${off ? off.id : '无'}｜开 → ${on.id}`);
    const m2Rows = EVENTS.filter(e => e.ship !== 'M1');
    check('池子按 ship 分档：M1 四条 + M2 二十三条 = 二十七条（文案批 +6、回声包 +3 落在 M2 侧；坏/好/中计数见 §15）',
      EVENTS.length === 27 && m2Rows.length === 23 && EVENTS.every(e => e.ship === 'M1' || e.ship === 'M2'),
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
    // 改判单 task-frontload-d3-20261104：特殊池有 D3 时间闸，这两条比的是「学期日窗口在不在」，
    // 所以都把日子放到闸内再抽——闸外的针在 §18，不在这儿重复占口径。
    f.Day = CONFIG.specialFirstDay;
    f.SemesterDay = 25; f.Rep = 60; f.Risk = 0;
    const picked = drawEvent(f, 'evening', makeRng(f));
    resolveChoice(f, picked, null);
    check('锦旗：窗口内硬触发当晚必来（不走 35% 门），L +1 且留言位多一条',
      picked.id === 'evt_s_flag' && f.L === 1 && f.Rep === 65 && f.today.forcedComments.length === 1,
      `第 ${f.SemesterDay} 学期日 → ${picked.id}｜L ${f.L}｜留言 ${f.today.forcedComments.join('/')}`);
    const out = newGame(SEED);
    out.Day = CONFIG.specialFirstDay;
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
  check('spec §三 + 文案批 + 回声包：池子 27 条 = 坏 12 / 好 8 / 中 7（spec 那批 18=坏10/好5/中3，文案批 +1/+2/+3，回声 +1/+1/+1：052 按丙入池，`f6a8ebf` §一）',
    EVENTS.length === 27 && kinds['坏事'] === 12 && kinds['好事'] === 8 && kinds['中性'] === 7,
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
    // 前超（机制单 `c152b37`）：VG3 是清仓摊（tier 3），现在归「绝境解锁」闸管。这一根针测的是断货日四档一起不收，
    // 不是低价闸（低价闸另有一组针，见 §21），所以这里把闸门显式打开——否则这一格会把新闸当成断货判定失败来报。
    q.cheapUnlocked = true;
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

// ── 16. 开场动画（task/spec-opening-cinematic-20261102）：纯呈现层 ──────────────────────
// intro.js 在 Node 里 import 不了（audio.js 模块顶层就读 localStorage），所以这一节全走静态源码断言。
// 字幕逐字引规格正本，不在测试里重打一遍文案——spec 改字，这里就红。
{
  const introRaw = readFileSync(join(HERE, 'src/ui/intro.js'), 'utf8');
  const stripCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/[ \t]+\/\/[^\n]*$/gm, ' ');   // 行尾注释也算：注释里转述「#app」「SAVE_VERSION」不算代码命中
  const introCode = stripCmt(introRaw);
  const mainRaw = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const mainCode = stripCmt(mainRaw);
  const cssSrc = readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8');
  const specSrc = readFileSync(join(HERE, '..', 'spec-opening-cinematic-20261102.md'), 'utf8');

  // 1) 字幕正本：规格「分镜与字幕」段那六行的「」串
  const specLines = specSrc.split('\n').filter(l => /^\d+\.\s/.test(l) && l.includes('「'));
  const specTexts = specLines.map(l => {
    const q = [...l.matchAll(/「([^」]*)」/g)];
    return q.length === 1 ? q[0][1] : `«该行 ${q.length} 处「」，取法失效»`;
  });
  const textOf = [...introRaw.matchAll(/text:\s*'([^']*)'/g)].map(m => m[1]);
  const altOf = [...introRaw.matchAll(/alt:\s*'([^']*)'/g)].map(m => m[1]);
  const msOf = [...introRaw.matchAll(/ms:\s*(\d+)/g)].map(m => Number(m[1]));
  const artOf = [...introRaw.matchAll(/art:\s*'([^']*)'/g)].map(m => m[1]);
  const diffAt = textOf.findIndex((t, i) => t !== specTexts[i]);
  check('开场动画六镜字幕与规格正本逐字相等（文案正本在 spec，代码不许自改一字）',
    specTexts.length === 6 && textOf.length === 6 && diffAt < 0,
    diffAt < 0 ? `六串逐字同（最长 ${Math.max(...textOf.map(x => x.length))} 字）` : `第 ${diffAt + 1} 镜不一致`);

  // 2) 节拍：约 45 秒、六镜、开播 1 秒后才给跳过
  const sumMs = msOf.reduce((s, x) => s + x, 0);
  check('开场动画节拍：六镜停留合计正好 45,000ms（规格「约 45 秒」），单镜不越 7–8 秒（一镜定住不动就没人看了）',
    msOf.length === 6 && sumMs === 45000 && msOf.every(x => x >= 7000 && x <= 8000),
    msOf.join('+') + ` = ${sumMs}ms`);
  check('开场动画跳过：按钮初始藏着、SKIP_MS 到点才摘 hidden（规格「开播 1 秒后显示跳过」），不是靠动画出现',
    /const SKIP_MS = 1000/.test(introCode) && /class="skip"[^>]*hidden/.test(introCode)
    && /\.skip'\)\.hidden = false; \}, SKIP_MS\)/.test(introCode) && !/\.skip\s*\{[^}]*animation/.test(cssSrc),
    `SKIP_MS=1000ms／跳过按钮无动画依赖（降级态照样出）`);
  check('开场动画推进：点击走同一支处理器（点一下重新给满这一镜）、最后一镜点下去即收尾，自动与手动同一条路',
    /el\.addEventListener\('click'/.test(introCode) && /advance, INTRO_SHOTS\[idx\]\.ms\)/.test(introCode)
    && /idx \+ 1 >= INTRO_SHOTS\.length/.test(introCode)
    && /document\.addEventListener\('visibilitychange'/.test(introCode)
    && /function close\(\) \{ halt\(\)/.test(introCode),
    '点击重排满时长／越界即 close／切后台 snooze-wake／关层先清闹钟');

  // 3) 红线：纯呈现层——不碰引擎、不碰账、不碰存档结构与 SAVE_VERSION
  check('开场动画零碰引擎与账：全文件只 import 音频一条，不引 engine/data/constants，代码里不叫 SAVE_VERSION/STORAGE_KEY/存档三键',
    [...introCode.matchAll(/^import .*$/gm)].map(x => x[0].trim()).join('|') === "import { sfx } from './audio.js';"
    && !/\.\.\/(engine|data)|sim\.js|constants\.js|SAVE_VERSION|STORAGE_KEY|guiju-m1-save|guiju-m1-phase|guiju-m1-flow/.test(introCode),
    '唯一 import = ./audio.js');
  check('播看状态走独立设置键 guiju-m1-intro（与音频单那条静音键同路子），不塞进已签的标量音频键、不动 SAVE_VERSION',
    /const INTRO_KEY = 'guiju-m1-intro'/.test(introCode)
    && /if \(opts\.replay !== true\) localStorage\.setItem\(INTRO_KEY, '1'\)/.test(introCode)
    && /localStorage\.getItem\(INTRO_KEY\) === '1'/.test(introCode)
    && !introCode.includes('guiju-m1-intro', introCode.indexOf('const INTRO_KEY') + 40)
    && !mainCode.includes('guiju-m1-intro') && !mainCode.includes('PREF_KEY'),
    '一开播即算播过（中途关页面不重播）；重看走 replay 不写键；读写只在 intro.js 一处');
  check('遮罩挂 body 不挂 #app：render() 换 #app 内容擦不掉它，app 级点击监听也看不见它的点击——落回第一天靠层本来就在屏外',
    introCode.includes('document.body.appendChild(el)') && !/getElementById\('app'\)|#app/.test(introCode)
    && /el = document\.createElement\('div'\)/.test(introCode) && /if \(el\) return;/.test(introCode),
    '挂载点 body／幂等不叠第二层');
  check('流程代码改动面只有三处：一行 import + 新档首播 + 重看路由，「我的」页给重看按钮（撤掉 = 删这三处 + CSS 一块）',
    [...mainCode.matchAll(/from '\.\/intro\.js'/g)].length === 1
    && [...mainCode.matchAll(/showIntro\(/g)].length === 2
    && [...mainCode.matchAll(/introShouldPlay\(\)/g)].length === 1
    && mainCode.includes('data-act="intro"') && mainCode.includes('重看开场')
    && /case 'continue': return resume\(\);/.test(mainCode),
    'import 1／showIntro 2（首播 + 重看）／introShouldPlay 1（只在 new，继续老档不播）');

  // 4) 素材：六镜图全落盘，第六镜复用现行头图（规格「不另出图」）
  const imgDir = new Set(readdirSync(join(HERE, 'public/img')));
  const missing = artOf.map(a => `${a}.webp`).filter(f => !imgDir.has(f));
  const newBytes = artOf.slice(0, 5).reduce((s, a) => s + statSync(join(HERE, 'public/img', `${a}.webp`)).size, 0);
  check('六镜图全落盘且只多五张：第 6 镜复用现行场景头图 business.webp，尺寸仍 720×1280（9:16 竖构图）',
    artOf.length === 6 && artOf[5] === 'business' && missing.length === 0
    && artOf.slice(0, 5).every((a, i) => a === `intro-0${i + 1}` + '-' + a.split('-')[2]),
    `新增 5 张共 ${(newBytes / 1024).toFixed(1)} KB：` +
    artOf.slice(0, 5).map(a => `${a}.webp ${(statSync(join(HERE, 'public/img', `${a}.webp`)).size / 1024).toFixed(1)}KB`).join('／') +
    (missing.length ? ` 缺 ${missing.join(',')}` : ''));
  check('图上不留字（出图硬规矩在这儿同样有效）：落版店名由 UI 排字，只有第 6 镜带 title，其余五镜无锁版',
    (introRaw.match(/title:/g) || []).length === 1 && artOf[5] === 'business'
    && introCode.includes('先把规矩立住！') && /lock\.hidden = !INTRO_SHOTS\[i\]\.title/.test(introCode)
    && /class="lock" hidden/.test(introCode),
    '锁版一处（第 6 镜）／JS 摘 hidden，非 CSS 常驻');

  // 5) 口径边界：成熟版（结婚生子）已否，不许回潮；前史只到「摘牌子走」
  const past = textOf.concat(altOf).join('');
  check('前史口径不越定版：不出现成熟版（妻 / 成家 / 孩子）与煽情判词，父母只给背影/远景（规格 §定版口径）',
    !/妻|老婆|媳妇|成家|孩子|儿子|女儿|结婚|离了|孤儿/.test(past)
    && (/背影/.test(altOf[0]) || /背影/.test(altOf[2]))
    && !/惨|苦命|可怜|泪|眼泪|心酸|鞠躬尽瘁/.test(past),
    `六镜 alt/text 零命中；alt1「${altOf[0]}」alt3「${altOf[2]}」`);

  // 6) 动效纪律（裁定③：infinite 只许常驻氛围层，现仅热气一处）——开场动画全有限次
  const animDecls = (cssSrc.match(/animation:[^;}]*[;}]/g) || []).filter(d => !/^\s*\/\*/.test(d));
  const infiniteDecls = animDecls.filter(d => /infinite/.test(d));
  const introCss = (cssSrc.split('/* ── 开场动画')[1] || '').split('/*')[0];
  check('动效纪律：CSS 里 infinite 只落在常驻氛围层（热气，恰 1 处）；开场动画这块逐条有限次，不占这条例外',
    infiniteDecls.length === 1 && /fxSteam/.test(infiniteDecls[0])
    && !/infinite/.test(introCss)
    && [...introCss.matchAll(/animation: [^;}]*/g)].every(d => / 1 (both|forwards)?/.test(d[0])),
    `infinite ${infiniteDecls.length} 处=${infiniteDecls.map(d => d.trim().slice(0, 42)).join('｜')}／开场块内 ${[...introCss.matchAll(/animation:/g)].length} 条全 iterations 1`);
  check('降级（prefers-reduced-motion）：开场动画不推镜不淡入、静图与字幕直接在场，且只点名 .shot.on（没进场的镜仍藏着）',
    /\.intro \.shot\.on \{ animation: none !important; opacity: 1 !important; transform: none !important; \}/.test(cssSrc)
    && /\.intro \.line\.in \{ animation: none !important/.test(cssSrc)
    && !/\.intro \.shot \{[^}]*animation/.test(cssSrc),
    '基础规则 opacity:0 仍管未进场镜（六张不叠成一坨）');
}

// ── 17. 真机修复单 f39f692（Orange 20261104）：采购—扣款—库存—称重四点一致 ──────────
// 店主真机第一天：市场给豆制品填 3 斤点结算，最终进货单里没这一项、¥33.00 没扣，称重却能称出豆制品 59 克。
// 查下来劈叉的不在引擎（commitPurchase 落单/扣款/入库存同一趟），在界面两条腿：
//   ① 那一格填的字读不出来时（input[type=number] 的 badInput：屏幕上有字、el.value 读回空串）会被算成 0 静悄悄漏掉；
//   ② 称重屏的可选性过去只看「顾客要不要」，不看「柜里有没有」，于是没买的东西也能按出克数。
// 下面把两条腿各自钉住。数值轨（第 7 步 takeStock 扣货与流水）本单一个字没动，全是既有口径的复算。
{
  const mainRaw = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const mainCode = mainRaw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/[ \t]+\/\/[^\n]*$/gm, ' ');
  const weighRaw = readFileSync(join(HERE, 'src/engine/weigh.js'), 'utf8');
  // 她那一篮逐格照抄，第 4 行正是报告里被吞掉的豆制品
  const BASKET = [['MB2', 6], ['MT2', 4], ['VG1', 3], ['BF1', 3], ['NS1', 3], ['SP1', 16]];
  const picks = list => list.map(([sku, qty]) => ({ sku, qty }));

  // 1) 六格全填 → 落单 / 扣款 / 入库存三点同时成立
  const s1 = newGame(SEED);
  const r1 = beginDay(s1);
  morningPreEvent(s1, r1);
  const cash0 = s1.Cash;
  const res1 = submitBasket(s1, picks(BASKET), r1);
  const rows1 = s1.PurchaseLedger.filter(l => l.day === s1.Day);
  const expect1 = BASKET.reduce((sum, [sku, qty]) => sum + toCents(effectivePrice(s1, SKU_BY_ID[sku]) * qty), 0);
  const byCat = Object.fromEntries(BASKET.map(([sku, qty]) => [SKU_BY_ID[sku].cat, qty]));
  check('四点一致·落单：填六格就有六行进货单，豆制品那 3 斤在单内',
    res1.ok && rows1.length === 6 && rows1.some(l => l.sku === 'BF1' && l.qty === 3),
    `${rows1.length} 行：${rows1.map(l => `${l.sku}×${l.qty}${l.unit}`).join(' ')}`);
  check('四点一致·扣款：现金降幅 = 单内总额 = 逐行「标价 × 斤数」复算（¥33.00 不许静悄悄漏掉）',
    cash0 - s1.Cash === res1.plan.total && res1.plan.total === expect1,
    `现金 ${cash0 / 100}→${s1.Cash / 100}｜单内 ${res1.plan.total / 100} 元｜复算 ${expect1 / 100} 元`);
  check('四点一致·入库存：单里每一行都进柜且斤数相等，汤底进 StockSoup，批次一一对应',
    SOLID_CATS.every(c => s1.StockSolid[c] === byCat[c]) && s1.StockSoup === byCat.SP && s1.Batches.length === 6,
    `柜里 ${SOLID_CATS.map(c => `${c}:${s1.StockSolid[c]}`).join(' ')} 份:${s1.StockSoup}｜批次 ${s1.Batches.length} 条`);

  // 2) 只买五行（她那一单的实际结果）→ 没进单的品类库存为 0，且称重侧当场不可选
  const s2 = newGame(SEED);
  const r2 = beginDay(s2);
  morningPreEvent(s2, r2);
  submitBasket(s2, picks(BASKET.filter(([sku]) => SKU_BY_ID[sku].cat !== 'BF')), r2);
  lockTradingDay(s2, { priceTier: 'qinmin' });
  morningEvent(s2, r2, () => null);
  const orders2 = drawHandOrders(s2, r2);
  const zero2 = Object.fromEntries(orders2.map(o => [o.customerId, Object.fromEntries(o.lines.map(l => [l.cat, 0]))]));
  const bfAsked = orders2.some(o => o.lines.some(l => l.cat === 'BF'));
  check('没进单的品类：库存为 0（StockSolid 与 Batches 两侧都空，新档初始也确为空）',
    s2.StockSolid.BF === 0 && s2.Batches.every(b => b.cat !== 'BF'),
    `柜里豆制品 ${s2.StockSolid.BF} 斤｜批次 ${s2.Batches.map(b => b.sku).join(' ')}`);
  check('没进单的品类：称重封顶 0 克——顾客单里点名要豆制品的这一单，也一格都按不出来（幻影 59 克无从产生）',
    bfAsked && orders2.every(o => gramsCeilingFor(s2, zero2, o.customerId, 'BF') === 0) && stockGrams(s2, 'BF') === 0,
    bfAsked ? `${orders2.length} 单，豆制品封顶全 0 克` : '这个种子当天没有单点名豆制品');

  // 3) 即便把 59 克硬写进秤面，也不产流水、不扣库存、不出负数（takeStock 那道闸本来就在，这一条把它钉住）
  const ghost2 = { ...zero2 };
  for (const o of orders2) if (o.lines.some(l => l.cat === 'BF')) ghost2[o.customerId] = { ...zero2[o.customerId], BF: 59 };
  runDay(s2, orders2, ghost2, r2);
  check('硬写 59 克进不了账：柜里没这一样时售出 0 斤、库存不转负、只记一笔分量嘀咕',
    s2.today.soldJin.BF === 0 && s2.StockSolid.BF === 0 && s2.today.portionGrudge === true,
    `售出豆制品 ${s2.today.soldJin.BF} 斤｜柜里 ${s2.StockSolid.BF} 斤｜分量嘀咕 ${s2.today.portionGrudge}`);

  // 4) 一柜货几单分：封顶 = 柜量 − 别单已称走；同一单自己不重复占格
  const s3 = newGame(SEED);
  const r3 = beginDay(s3);
  morningPreEvent(s3, r3);
  submitBasket(s3, [{ sku: 'MB1', qty: 1 }], r3);
  const orders3 = drawHandOrders(s3, r3);
  const g3 = { [orders3[0].customerId]: { MB: 400 } };
  check('跨单柜量封顶：柜里 500 克、头一单已称 400 克，第二单的丸子最多还能称 100 克',
    stockGrams(s3, 'MB') === 500 && gramsCeilingFor(s3, g3, orders3[1].customerId, 'MB') === 100,
    `柜 ${stockGrams(s3, 'MB')} 克｜别单已称 400 克｜封顶 ${gramsCeilingFor(s3, g3, orders3[1].customerId, 'MB')} 克`);
  check('封顶读的是「秤面不许越过柜里有的数」：本单已称 400 克时它自己的上限仍是柜量 500 克（不自我扣两遍）',
    gramsCeilingFor(s3, g3, orders3[0].customerId, 'MB') === 500,
    `本单封顶 ${gramsCeilingFor(s3, g3, orders3[0].customerId, 'MB')} 克`);
  const snap3 = JSON.stringify([s3.Batches, s3.StockSolid, s3.StockSoup, s3.Cash, s3.PurchaseLedger]);
  stockGrams(s3, 'MB'); gramsCeilingFor(s3, g3, orders3[1].customerId, 'MB');
  check('两把尺只读：调用前后批次/库存/现金/流水逐字相同（数值轨与随机轨都不动）',
    JSON.stringify([s3.Batches, s3.StockSolid, s3.StockSoup, s3.Cash, s3.PurchaseLedger]) === snap3,
    '界面侧新增判定不写引擎任何字段');

  // 5) 界面接线（main.js 在 Node 里 import 不了，走 §16 同一路子：静态源码断言）
  check('称重封顶接到落值那唯一一支：addGrams 先取 gramsCeilingFor 再 Math.min（抓的连续加与捏的连续减同一条 clamp）',
    /const ceiling = gramsCeilingFor\(state, gramsBy, cust, cat\)/.test(mainCode)
    && /Math\.min\(ceiling, Math\.max\(0, next\)\)/.test(mainCode)
    && !/gramsBy\[cust\]\[cat\] = Math\.max\(0, Math\.round/.test(mainCode),
    '落值一处 clamp，无第二条路径');
  check('没货的行当场断电：orderCard 初挂就带 disabled、refreshOrder 每次松手重算，两处共用 grabDead（不各写各的）',
    /grabDead\(o\.customerId, l\.cat\)/.test(mainCode) && /gb\.disabled = grabDead\(cust, l\.cat\)/.test(mainCode)
    && /const grabDead = /.test(mainCode) && /rowNote\(cust, l, got\)/.test(mainCode)
    && /rowNote\(o\.customerId, l,/.test(mainCode),
    '禁用与话术同一次判定（F8 那条「同屏不一致」的教训）');
  const sd17 = mainCode.slice(mainCode.indexOf('function submitDraft()'), mainCode.indexOf('function commitPrepDraft'));
  check('结算先把屏上每一格重读进草稿，且重读在扣钱之前：篮子只由此刻格子里认得出的数决定',
    sd17.indexOf('syncDraftFromInputs()') >= 0 && sd17.indexOf('syncDraftFromInputs()') < sd17.indexOf('submitBasket('),
    'syncDraftFromInputs → submitBasket 同一支函数里前后脚');
  check('认不出数不再算成 0：判读与落值同一条（打字与结算重读共用 commitOneQty），badInput 登记 + 红框 + 整篮驳回',
    /el\.validity\?\.badInput/.test(mainCode) && /const bad = !!el\.validity\?\.badInput/.test(mainCode)
    && (mainCode.match(/validity\?\.badInput/g) || []).length === 1
    && /classList\.toggle\('bad', bad\)/.test(mainCode)
    && /function setQty\(el, normalize\) \{\s*const bad = commitOneQty\(el\);/.test(mainCode)
    && /if \(syncDraftFromInputs\(\)\) \{ sfx\('error'\); return refreshForecast\(\); \}/.test(mainCode),
    '驳回走原地重绘、不走 go（重绘会把那行字洗成 0，玩家看不见错在哪一格）；setQty 里不再自己另写一次草稿；接入单 594b908 在这一格补了被拒声，驳回路径本身一字未动');
  check('认不出数的那一屏只有一个口径：试算与吸底条整块换成驳回话，不摆「少算那一格的合计」；首挂与实时刷新共用同两支',
    /const marketDetailHtml = f => \(qtyBad\.size \? badBasketPanel\(\) : forecastBar\(f\) \+ buyPanel\(f\)\)/.test(mainCode)
    && /const marketFootHtml = f => \(qtyBad\.size \? badBasketStrip\(\) : footStrip\(f\)\)/.test(mainCode)
    && /const html = marketDetailHtml\(f\);/.test(mainCode) && /const html = marketFootHtml\(f\);/.test(mainCode)
    && /id="marketDetail">\$\{marketDetailHtml\(forecast\)\}/.test(mainCode)
    && /class="stickfoot">\$\{marketFootHtml\(forecast\)\}/.test(mainCode)
    && (mainCode.match(/forecastBar\(/g) || []).length === 2
    && (mainCode.match(/footStrip\(/g) || []).length === 2,
    'forecastBar / footStrip 各自只剩这一道入口（驳回时整块不换算式）');
  check('两把尺落在 weigh.js 的对外口径里：只 import 三方老三条、不新增引擎依赖',
    /export function stockGrams/.test(weighRaw) && /export function gramsCeilingFor/.test(weighRaw)
    && [...weighRaw.matchAll(/^import .*$/gm)].map(x => x[0].trim()).join('|')
      === "import { CUSTOMERS, handOrderWeight } from '../data/customers.js';|import { SOLID_CATS, CONFIG } from '../data/constants.js';|import { roundJin } from './state.js';",
    'weigh.js 的 import 表逐字未动');
}

// ── 18. 改判单 task-frontload-d3-20261104（Orange 20261104）：特殊事件池的 D3 时间闸 ────
// 裁定是**时间闸**：D3 起特殊事件按各自既有条件与概率门正常触发，D3 之前整池不触发；
// 不点名钉死某条事件或某个人物（旧稿的 D1 赵大妈必达／D2 常客首单／D3 王老板保底三条作废）。
// 闸只挡「日子」：概率门、每条的条件与权重、硬触发与 must_fire 窗口一个字不许动。
{
  const specials = EVENTS.filter(e => e.pool === 'special');
  const dailyMustFire = EVENTS.filter(e => e.must_fire && e.pool === 'daily');
  check('闸值是裁定原值：CONFIG.specialFirstDay = 3，且 DRAW_GATE 两条概率门逐字未动（special 0.35 / daily 0.55）',
    CONFIG.specialFirstDay === 3 && DRAW_GATE.special === 0.35 && DRAW_GATE.daily === 0.55,
    `闸 ${CONFIG.specialFirstDay}｜门 ${JSON.stringify(DRAW_GATE)}`);
  check('日子只管一次：九条特殊行的 condition 里没有任何一条被掺进 Day 条件（闸在 engine 一处，不撒进数据表）',
    specials.length === 9 && specials.every(e => !/\bDay\b/.test(e.condition || '')),
    `${specials.length} 条特殊行，条件里零个 Day 项`);

  // 硬触发（Risk>=70 走不了概率门）也要过闸：D1/D2 挡在门外，D3 起当场放行
  const probe = day => {
    const s = newGame(SEED);
    s.Risk = 80; s.eventScope = 'full'; s.Day = day;
    const e = drawEvent(s, 'evening', makeRng(s));
    return e ? { id: e.id, pool: e.pool } : null;
  };
  const d1 = probe(1), d2 = probe(2), d3 = probe(3);
  check('D1、D2 特殊池整池不触发：Risk 80（大检查硬触发条件成立）也只出日常行或空',
    (d1 === null || d1.pool !== 'special') && (d2 === null || d2.pool !== 'special'),
    `D1 → ${d1 ? `${d1.id}(${d1.pool})` : '无'}｜D2 → ${d2 ? `${d2.id}(${d2.pool})` : '无'}`);
  check('D3 起照常：同一枚种子、同一个 Risk 80，硬触发的 evt_s_insp 当场入池（闸一过，既有条件与不走概率门的口径原样生效）',
    d3 && d3.id === 'evt_s_insp' && d3.pool === 'special',
    `D3 → ${d3 ? `${d3.id}(${d3.pool})` : '无'}`);

  // 闸只管 special：daily 池与它的 must_fire 窗口（D4–6 / D7–9）不许被连带挡住
  check('闸不碰日常池：两条 daily 的 must_fire 窗口（第 4–6 天 / 第 7–9 天）原样在场，没有被 D3 闸误伤',
    dailyMustFire.length === 2 && dailyMustFire.every(e => e.pool === 'daily' && e.must_fire.from >= 4),
    `${dailyMustFire.map(e => `${e.id} ${e.must_fire.from}–${e.must_fire.to}`).join('｜')}`);
  {
    // 把闸临时抬到第 9 天（只活在本进程，与 m3_reference 的覆盖同一路子）：special 整池消失、daily 照出
    // ⇒ 证明这一刀是按「池」切的，不是把整扇事件门关上。第 3 天 Risk 80 时硬触发本来每次都中，正好做对照。
    const s = newGame(SEED);
    s.eventScope = 'full'; s.Day = CONFIG.specialFirstDay; s.Risk = 80;
    const drawAll = () => {
      const ids = [];
      for (let i = 0; i < 20; i++) { const e = drawEvent(s, 'evening', makeRng(s)); if (e) ids.push(e.id); }
      return ids;
    };
    const inGate = drawAll();
    const keep = CONFIG.specialFirstDay;
    CONFIG.specialFirstDay = 9;
    let outGate;
    try { outGate = drawAll(); } finally { CONFIG.specialFirstDay = keep; }
    const specialIds = new Set(specials.map(e => e.id));
    check('抬闸到第 9 天做对照：同一枚状态里 special 20 抽 0 次、daily 照出（闸按池切，不关整扇门）；放回 3 天硬触发每次即中',
      inGate.every(id => id === 'evt_s_insp')
      && outGate.length > 0 && outGate.every(id => !specialIds.has(id)) && CONFIG.specialFirstDay === 3,
      `闸 3 → ${inGate[0]}×${inGate.length}｜闸 9 → ${outGate.length ? `${[...new Set(outGate)].join('/')} 共 ${outGate.length} 次` : '全空'}｜闸值已归位 ${CONFIG.specialFirstDay}`);
  }

  // 闸的落点：写在 eligible 里，软抽与 must_fire 强制选中共用同一次判定（两处分开就会出现「保底那条还在 D1 抢跑」）
  const evSrc = readFileSync(join(HERE, 'src/engine/events.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]+\/\/[^\n]*$/gm, ' ');
  const eligibleBody = evSrc.slice(evSrc.indexOf('function eligible('), evSrc.indexOf('export function weightOf'));
  const drawBody = evSrc.slice(evSrc.indexOf('export function drawEvent'), evSrc.indexOf('export function applyOps'));
  check('闸挂在 eligible 一处：drawEvent 与 forcedEvent（must_fire）都只经 eligible 拿到日子判定，池子过滤里没有第二份 Day 闸',
    (evSrc.match(/dayGate\(state, ev\)/g) || []).length === 2   // 定义一处 + eligible 里唯一一次调用
    && /function dayGate\(state, ev\) \{\s*return ev\.pool !== 'special' \|\| state\.Day >= CONFIG\.specialFirstDay;/.test(evSrc)
    && /&& dayGate\(state, ev\)/.test(eligibleBody)
    && !/\bDay\b/.test(drawBody) && !/specialFirstDay/.test(drawBody),
    `dayGate 定义+调用共 2 处｜drawEvent 体内零 Day／零闸值引用（软抽与保底共用同一次判定）`);
}

// ── 19. 改判单 task-frontload-d3-20261104 的并行小项：晨讯／夜留言搞笑密度批（纯文案）────
// 「每拍必落笑点」机验不了，能机验的是**这一批不许顺手碰坏的东西**：
// ① 每池条数落在文案批三签发的值上（批前 32 → 51；`pick(rng, POOL)` = `pool[rng.int(...)]` 恒消耗一个随机数，
//    池长变了抽中的那句话跟着变、抽取次数一格不多不少 ⇒ 文案漂、数值不漂——这条实测写在 delta §七十一）；
// ② 正文 3.4 信号表里打了引号的原句逐字在场（那些是签字文案，不是我的稿）；
// ③ ③层两条按**下标**被 buildComments 直接取用（comments.js:27–28），夸与嘀咕不许换了边；
// ④ 晨间情报那两条是 5.2 示例原句 + 附录 D 第 176 行的 text 字段原值，文案批不许动。
{
  const POOL_SIZE = { qualityGood: 5, qualityBad: 5, qualityMid: 5, taste: 6, portion: 6, price: 6, soldout: 3, packing: 3, regular: 5, rumor: 4, weather: 3 };
  const pools = Object.keys(COMMENT_POOLS);
  check('留言池结构：11 池、51 条，逐池条数与文案批三落定值相同（批前 32 条 + 追加 19 句；只许往后追加，下标语义归 §19-③ 那条针）',
    pools.length === 11 && pools.every(k => COMMENT_POOLS[k].length === POOL_SIZE[k])
    && pools.reduce((n, k) => n + COMMENT_POOLS[k].length, 0) === 51,
    `${pools.map(k => `${k}:${COMMENT_POOLS[k].length}`).join(' ')}`);

  const signed = [
    ['qualityGood[0] 起句「这丸子是现打的吧？」', COMMENT_POOLS.qualityGood[0].startsWith('这丸子是现打的吧？')],
    ['qualityGood[1] 起句「汤真鲜」', COMMENT_POOLS.qualityGood[1].startsWith('汤真鲜')],
    ['qualityMid 两条原句「还行吧」「感觉没上次好吃」', COMMENT_POOLS.qualityMid.includes('还行吧。') && COMMENT_POOLS.qualityMid.includes('感觉没上次好吃。')],
    ['qualityBad[0] 整句原样（暧昧归因的样板）', COMMENT_POOLS.qualityBad[0] === '肚子有点不舒服，不知道是不是中午那顿。'],
    ['portion[2] 整句原样「今天这碗……有点轻。」', COMMENT_POOLS.portion[2] === '今天这碗……有点轻。'],
    ['rumor[0] 起句「听说小吃街有人吃坏肚子」（Risk≥40 不指名）', COMMENT_POOLS.rumor[0].startsWith('听说小吃街有人吃坏肚子')],
  ];
  check('正文 3.4 信号表打了引号的七条签字原句（六组比对）逐字在场，没被文案批顺走',
    signed.every(([, ok]) => ok), signed.filter(([, ok]) => !ok).map(([n]) => n).join(' / ') || '六条全在');

  check('③层下标语义没换边：portion[1] 仍是足称的夸、portion[2] 仍是短斤的嘀咕（comments.js 按下标直取）',
    COMMENT_POOLS.portion[1].includes('实在') && COMMENT_POOLS.portion[2].includes('轻'),
    `夸 ${COMMENT_POOLS.portion[1]}｜嘀咕 ${COMMENT_POOLS.portion[2]}`);

  // 品质那一层笑点不许压过判读：三条嘀咕都得留着「不确定是不是你家」的暧昧形状，不许写成指认
  check('品质嘀咕仍是暧昧归因：三条里没有任何一条指认到摊子或料上（3.4「永远暧昧归因，不许写死是你的料」）',
    COMMENT_POOLS.qualityBad.every(t => !/你的料|你家|黑心|缺德|劣质|便宜料|你家用/.test(t)),
    COMMENT_POOLS.qualityBad.join(' / '));

  const pre = ['evt_d_011', 'evt_d_stockout'].map(id => EVENT_BY_ID[id]);
  check('晨间情报两条原句没动（附录 D 第 176 行的 text 字段 + spec-event-pool-6 指定的 5.2 示例原句）',
    pre[0].text === '批发市场门口贴了张手写告示：青菜、丸子，今日涨四成。'
    && pre[1].text === '粉坊机器坏了，明天没粉。',
    pre.map(e => `${e.id}「${e.text}」`).join('｜'));
}

// ── 20. 换曲单 task-bgm-swap-20261104（Orange `1e524fa`，店主指定曲目）：BGM 换入的挂载正确性 ──
// 单上红线四条：静音键行为不变 / SAVE_VERSION 不动 / 现有合成 6 件 SFX 不删 / credit 原文一字不改。
// 音频单当年那次事故（WAV 头写坏 → Chrome 拒解 → 真机全程哑而运行时一声不响）教的是：
// **引用与文件必须成对钉住**，所以这里连 sha256 与字节数一起扫，不只看代码。
{
  const audioSrc = readFileSync(join(HERE, 'src/ui/audio.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]+\/\/[^\n]*$/gm, ' ');
  const bgmUrl = (audioSrc.match(/const BGM_URL = '([^']+)'/) || [])[1];
  const bgmPath = join(HERE, 'public', bgmUrl.replace(/^\.\//, ''));
  const bgmSize = statSync(bgmPath).size;
  const bgmSha = createHash('sha256').update(readFileSync(bgmPath)).digest('hex');
  check('BGM_URL 指的成品真在仓里、字节与 sha 对上台账（换曲单：引用与文件不许再劈一次）',
    bgmUrl === './audio/bgm-rubber-nod.ogg' && bgmSize === 1598057
    && bgmSha === 'c923ec9077e4b5bcab99e2848abcaf412556ae595d4ddd2dc1b00d0ab0aee9bc',
    `${bgmUrl}｜${bgmSize} B｜sha ${bgmSha.slice(0, 12)}…`);

  check('静音键与存档版本照单不动：PREF_KEY 仍是 guiju-m1-audio、audio.js 全文不叫 SAVE_VERSION/STORAGE_KEY，SAVE_VERSION 原值',
    /const PREF_KEY = 'guiju-m1-audio'/.test(audioSrc)
    && !/SAVE_VERSION|STORAGE_KEY|guiju-m1-save|guiju-m1-flow|guiju-m1-phase/.test(audioSrc)
    && SAVE_VERSION === 'v4.9.3-cal.2',
    `键 guiju-m1-audio｜SAVE_VERSION ${SAVE_VERSION}`);

  const voiceKeys = (audioSrc.match(/^\s{2}(tap|grab|exact|buy|cash|level): \(\) =>/gm) || []).length;
  check('六件合成 SFX 一条没删（VOICES 六键齐全）；包到了，外部录音引用从 0 条变成 12 件（引用与文件成对，见 §22）',
    voiceKeys === 6 && /sfx-cha-ching/.test(audioSrc) && /sfx-error/.test(audioSrc) && /sfx-boil-loop/.test(audioSrc),
    `VOICES 六键在场｜cha-ching / error / boil-loop 三串都在引用侧`);

  const mainSrc = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const cssSrc = readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8');
  const CREDIT = 'Music: “Rubber Nod” by ziniyeons (niftyshelf.com/music/rubber-nod)';
  const meBody = mainSrc.slice(mainSrc.indexOf('  me() {'), mainSrc.indexOf('  prep() {'));
  check('署名行逐字在场且就在「我的」页末行（单上「原文一字不改」；曲名/作者/站点三要素一个字符没缩），且小字样式有规则',
    meBody.includes(CREDIT) && meBody.lastIndexOf(CREDIT) > meBody.indexOf('clearArmed ?')
    && /\.credit \{[^}]*font-size: 11px/.test(cssSrc),
    `credit ${meBody.includes(CREDIT) ? '原文在场' : '缺失'}｜.credit 11px ${/\.credit \{[^}]*font-size: 11px/.test(cssSrc) ? '有' : '无'}`);
}

// ── §21 机制单 task-cheap-unlock-20261104（`c152b37`，店主点子、Orange 定口径）＋ 裁定 `f6a8ebf` §四（v2）：低价档改「绝境解锁」──
// 单上只允许动四件：闸门（累计经营净额 ≤ CONFIG 那一个数）、撞线当晚递话、次日卡出场、卡面一句规矩味警告。
// v2 的两处改动都在闸门本身：① 加一道**时间闸**（D3 晚起才跑，D1–D2 不触发＝结构保证）；② 累计支 −180 ⇒ −120。
// 单日支按 v2 原要在 {0,−20,−40} 挑一档，探针三条通过线栽在 ③（稳线首周被砸穿日压中）⇒ 三档全不过 ⇒ 只落累计支，本函数体里不该有第二条闸。
// 价格 / 品质 / 带票 / 赊购 / 隔夜这些既有代价一字不动；闸门与递话都不掷随机（池长＝随机流消耗量，动它＝动数值）。
{
  const cheap = Object.values(SKU_BY_ID).filter(s => s.tier === 3);
  const d1 = newGame(SEED); beginDay(d1);
  const lockedAll = cheap.every(s => skuAvailable(d1, s, makeRng(d1)) === false);
  check('开局不给低价：六样清仓货（tier 3）整档不可买，正经 / 批发照旧在场（本单只把清仓摊这一档关进闸门）',
    lockedAll && cheap.length === 6
    && skuAvailable(d1, SKU_BY_ID['MB1'], makeRng(d1)) === true
    && skuAvailable(d1, SKU_BY_ID['MB2'], makeRng(d1)) === true,
    `tier 3 共 ${cheap.length} 样${lockedAll ? '全 false' : '有漏'}｜MB1 正经 / MB2 批发 true`);

  // 闸门只读状态、不掷随机：锁着问一遍、开着再问一遍，supply 子流的计数一格没动
  const q0 = newGame(SEED); beginDay(q0); q0.Day = 20; q0.C = 5;
  const streamBefore = JSON.stringify(q0.streamCounter);
  const probeRng = makeRng(q0);
  const lockedRes = cheap.map(s => skuAvailable(q0, s, probeRng));
  q0.cheapUnlocked = true;
  const openRes = cheap.map(s => skuAvailable(q0, s, probeRng));
  check('绝境闸与第六档同一条纪律：判定不吃随机（已签带的 supply 子流一字不漂，断货日那种「排在抽取之前」的落点照抄）',
    JSON.stringify(q0.streamCounter) === streamBefore
    && lockedRes.every(v => v === false) && openRes.every(v => v === true),
    `锁 ${lockedRes.join('/')} → 开 ${openRes.join('/')}｜streamCounter ${streamBefore === JSON.stringify(q0.streamCounter) ? '未动' : '漂了'}`);

  // 撞线夜 = 递话夜：逐日跑真实账（什么都不买 → 每日只亏固定 75 + 人工 60），闸门真正开的那一晚必须翻牌并留话。
  // v2 之后「过线」和「开门」是两件事：D1 当晚累计就已经压过 −120，但时间闸还闭着 ⇒ 这一格找的是**第一晚两闸同开**，
  // 而不是「累计由浅转深的那一晚」（那是 v1 的读法，现在永远找不到，因为转深发生在闭门期间）。
  const s = newGame(SEED);
  const trail = [];
  let tripDay = null;
  for (let i = 0; i < 5 && !s.EndingId; i++) {
    const r = beginDay(s);
    morningPreEvent(s, r);
    lockTradingDay(s, { priceTier: 'qinmin' });
    morningEvent(s, r, () => null);
    runDay(s, [], () => ({}), r);
    nightSettle(s, r);
    const fired = s.Day >= CONFIG.cheapUnlockFirstDay && s.NetOpsCents <= CONFIG.cheapUnlockNetOpsCents;
    const ev = eveningDraw(s, r);
    nightClose(s, r, ev, null);
    const said = (s.CommentLog[s.CommentLog.length - 1]?.comments || []).filter(c => c === CHEAP_UNLOCK_CUE).length;
    if (fired && tripDay === null) tripDay = { day: s.Day, said, sum: s.NetOpsCents };
    trail.push(`D${s.Day} 当日 ${(s.today.netOpsCents / 100).toFixed(0)} 累计 ${(s.NetOpsCents / 100).toFixed(0)}${said ? ' 递话' : ''}`);
  }
  const cueTotal = s.CommentLog.reduce((n, d) => n + d.comments.filter(c => c === CHEAP_UNLOCK_CUE).length, 0);
  check('撞线当晚翻牌 + 递话（单上「不许静默上架」）：第 8 步落账当刻判闸，同夜第 12 步那句熟人递话进「今晚的留言」',
    tripDay !== null && tripDay.said === 1 && s.cheapUnlocked === true,
    trail.join(' ｜ ') + `｜过线夜第 ${tripDay?.day} 天留言 ${tripDay?.said} 条`);
  check('v2 时间闸落在真实账上：这条「什么都不买」的线 D1 累计就已 −135 元压过线，翻牌仍是 D3 晚——D1–D2 不触发是结构不是运气',
    tripDay !== null && tripDay.day === CONFIG.cheapUnlockFirstDay, `首撞第 ${tripDay?.day} 晚（起检日 ${CONFIG.cheapUnlockFirstDay}）`);
  check('一次解锁、永久保留：跑满 5 天那句递话全场只出现一次，翻过牌之后不再判、也不回头收（门路知道就忘不掉）',
    cueTotal === 1 && cheapUnlockCheck(s) === false && s.cheapUnlocked === true,
    `累计出现 ${cueTotal} 次｜再判返回 false｜位仍 true`);

  // 「升档花钱不算亏，不许误触」：投资账从现金走，一格都不进累计经营净额。
  // v2 之后这道针要先把时间闸打开（Day = 起检日）——否则「闸门不开」有两层原因，钱的那一半根本没被测到。
  // 累计量也摆在**比线浅 10 元**的位置：这样「不开」只剩一个解释（那 800 元没进这一格），
  // 而当晚落账（固定 + 人工）把它压过线 ⇒ 翻牌必须在同一晚自然发生，方向（≤）与「投资不算亏」两头都钉住。
  const inv = newGame(SEED); beginDay(inv);
  inv.Cash = 90000;
  const spent = upgradeStall(inv);
  const cashAfterSpend = inv.Cash;
  inv.Day = CONFIG.cheapUnlockFirstDay;
  inv.NetOpsCents = CONFIG.cheapUnlockNetOpsCents + 1000;
  const sumBeforeNight = inv.NetOpsCents;
  const gateAfterSpend = cheapUnlockCheck(inv);
  lockTradingDay(inv, { priceTier: 'qinmin' });
  morningEvent(inv, makeRng(inv), () => null);
  runDay(inv, [], () => ({}), makeRng(inv));
  nightSettle(inv, makeRng(inv));
  check('升档那一笔不算亏：起检日当天掏掉 800 元、现金当场只剩 100 元、累计摆在比线浅 10 元处，闸门不开；当晚落账后进这一格的只有固定 + 人工',
    spent === true && cashAfterSpend === 10000 && inv.NetInvestSpent === 80000 && gateAfterSpend === false
    && inv.NetOpsCents === sumBeforeNight + inv.today.netOpsCents
    && inv.today.netOpsCents === -(inv.FixedCost + inv.LaborCost),
    `掏完剩 ${(cashAfterSpend / 100).toFixed(0)} 元（若读「当晚现金流出」早过 −120 那种口径）｜投资账 ${(inv.NetInvestSpent / 100).toFixed(0)} 元`
    + `｜累计 ${(sumBeforeNight / 100).toFixed(0)} → ${(inv.NetOpsCents / 100).toFixed(0)} 元（当晚固定 ${(inv.FixedCost / 100).toFixed(0)} + 人工 ${(inv.LaborCost / 100).toFixed(0)}）`);
  check('同一条线上「浅 10 元 + 一晚日常支出」自然撞线：第 8 步落账后翻牌、不静默（阈值的比较方向 ≤ 也靠这一格钉住）',
    inv.cheapUnlocked === true && inv.today.forcedComments.includes(CHEAP_UNLOCK_CUE),
    `落账后累计 ${(inv.NetOpsCents / 100).toFixed(0)} 元｜位 ${inv.cheapUnlocked}`);
  // 顺带钉住一条口径外溢：升档把 FixedCost 从 75 抬到 135，这一格是真的，所以「先升档再卖不动」的玩家会因此撞线——
  // 单上排除的是那 800 元本金，不是抬上去的日常固定支出。这条写进 §六十四 回报，不改口径。
  check('升档抬高的固定支出算经营亏损（不算投资本金）：tier 2 的 FixedCost 135 元逐日进当晚这一格',
    inv.FixedCost === TIERS_STALL[1].fixedCost && inv.today.netOpsCents <= -13500,
    `FixedCost ${(inv.FixedCost / 100).toFixed(0)} 元｜单晚落账 ${(inv.today.netOpsCents / 100).toFixed(0)} 元`);

  // v2 的两根新针：① 时间闸是纯结构（累计压过线多少都不算，Day<起检日恒 false）；② 单日支不落 ⇒ 函数体里只该有一条钱闸。
  const gate = day => { const g = newGame(SEED); beginDay(g); g.Day = day; g.NetOpsCents = -999900; return cheapUnlockCheck(g); };
  check('D1–D2 不触发＝结构保证（裁定 §四 v2）：累计摆到 −9999 元这么深，起检日之前问三遍都不开门；起检日当晚立刻开',
    gate(1) === false && gate(2) === false && gate(CONFIG.cheapUnlockFirstDay) === true,
    `D1 false｜D2 false｜D${CONFIG.cheapUnlockFirstDay} true（CONFIG.cheapUnlockFirstDay = ${CONFIG.cheapUnlockFirstDay}）`);
  const mkSrc = readFileSync(join(HERE, 'src/engine/market.js'), 'utf8');
  const fnBody = (mkSrc.match(/export function cheapUnlockCheck\(state\) \{[\s\S]*?\n\}/) || [''])[0];
  const dailyLeak = ['netOpsCents', 'writeoffCents', 'relOf', '单日'].filter(t => fnBody.includes(t));
  check('单日支不落（三档全不过 ⇒ 只落累计支）：cheapUnlockCheck 体内零当日字段、只有累计那一支，读代码的人不会去找第二条闸',
    fnBody.length > 0 && dailyLeak.length === 0 && fnBody.includes('NetOpsCents')
    && fnBody.includes('CONFIG.cheapUnlockNetOpsCents') && fnBody.includes('CONFIG.cheapUnlockFirstDay'),
    dailyLeak.length ? `残留 [${dailyLeak.join(' ')}]` : `函数体 ${fnBody.length} 字｜两条闸：时间 + 累计`);
  check('两个数都从 CONFIG 读，代码里不写死：−120 与起检 D3 各只有一份（改了常量针就红，不许哪天界面和引擎各认一个数）',
    CONFIG.cheapUnlockNetOpsCents === -12000 && CONFIG.cheapUnlockFirstDay === 3
    && !/-12000|-18000/.test(fnBody),
    `累计 ${CONFIG.cheapUnlockNetOpsCents / 100} 元｜起检 D${CONFIG.cheapUnlockFirstDay}`);
  // 裁定通过线里「稳线 mid/ref3 首周不误触」这一条，跑表只验得动 mid：ref3 是 tier 3 的便宜线，
  // sim.js:157 那条夹具（`if (strategy.tier === 3) state.cheapUnlocked = true`）本来就把门焊开着，
  // 拿它测「不解锁」测的是夹具不是闸门（§六十五.5 判丁关单钉的就是这一条）。ref3 的首周不误触由探针对着累计量摊分布（60 天 never）。
  const steadyWeek = [];
  for (const seed of [20261031, 7979, 12345, 4242, 90210]) {
    const run = simulate(seed, 7, STRATEGIES.mid, 'headless', { labor: true, competition: true, eventScope: 'full' });
    steadyWeek.push({ seed, cum: run.state.NetOpsCents / 100, unlocked: run.state.cheapUnlocked });
  }
  check('稳线首周不误触（跑表验得动的那条）：mid × 五种子 × 7 天全口径，累计经营净额一条都不压线、cheapUnlocked 五局全 false',
    steadyWeek.every(x => x.unlocked === false) && steadyWeek.every(x => x.cum > CONFIG.cheapUnlockNetOpsCents / 100),
    steadyWeek.map(x => `s${x.seed} 累计 ${x.cum.toFixed(0)} 元/${x.unlocked ? '开' : '锁'}`).join('｜'));

  // 口径只有一处：全仓写 state.NetOpsCents 的地方只有第 8 步那一格与存档迁移
  const srcRoot = join(HERE, 'src');
  const srcFiles = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) srcFiles.push(p);
    }
  })(srcRoot);
  const writers = srcFiles
    .filter(f => /\.NetOpsCents\s*(\+=|=[^=])/.test(readFileSync(f, 'utf8')))
    .map(f => f.slice(srcRoot.length + 1).replace(/\\/g, '/')).sort();
  check('累计经营净额只有一个入口：全仓写这一格的只有 ledger.js（第 8 步累加）与 state.js（老档重建），投资与事件账碰不到它',
    writers.join(' ') === 'engine/ledger.js engine/state.js', `写入处 ${writers.join(' / ') || '无'}`);

  // 存档迁移：新字段不作废老档；净额可 exact 重建，解锁位不许静默补 true
  {
    const store = new Map();
    globalThis.localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    };
    const mig = newGame(SEED);
    const rm = beginDay(mig);
    morningPreEvent(mig, rm);
    lockTradingDay(mig, { priceTier: 'qinmin' });
    morningEvent(mig, rm, () => null);
    runDay(mig, [], () => ({}), rm);
    nightSettle(mig, rm);
    const evm = eveningDraw(mig, rm);
    nightClose(mig, rm, evm, null);
    const sum = mig.DailyReports.reduce((n, rr) => n + rr.netOpsCents, 0);
    mig.saveVersion = 'v4.9.2-cal.1';
    delete mig.NetOpsCents; delete mig.cheapUnlocked;
    store.set(STORAGE_KEY, JSON.stringify(mig));
    const m = loadGame();
    check('迁移：cal.1 老档没有这两个字段——净额按每日账本 exact 重建，解锁位补 false（宁可让老档下一晚自然撞线，也不静默上架）',
      !!m && m.NetOpsCents === sum && m.cheapUnlocked === false && m.saveVersion === SAVE_VERSION,
      `重建 ${sum} 分 = Σ 逐日 netOpsCents｜位 ${m?.cheapUnlocked}｜版本 ${m?.saveVersion}`);
    const again = JSON.stringify(mig);
    store.set(STORAGE_KEY, again);
    const m2 = loadGame();
    check('迁移可重复：同一份老档读两次结果逐字相同（不是一次性补丁）',
      !!m2 && m2.NetOpsCents === sum && m2.cheapUnlocked === false, `第二次 ${m2?.NetOpsCents}`);
    delete globalThis.localStorage;
  }

  // 卡面警告与既有代价：警告只挂在 tier 3 分支、文案只有一处定义；六样的价与档一字未动
  const uiSrc = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const warnMount = uiSrc.split('\n').find(l => l.includes('cheapWarn') && l.includes('CHEAP_TIER_WARNING'));
  const warnHome = srcFiles.filter(f => readFileSync(f, 'utf8').includes('CHEAP_TIER_WARNING'))
    .map(f => f.slice(srcRoot.length + 1).replace(/\\/g, '/')).sort().join(' ');
  const literalHome = srcFiles.filter(f => readFileSync(f, 'utf8').includes(CHEAP_TIER_WARNING))
    .map(f => f.slice(srcRoot.length + 1).replace(/\\/g, '/')).sort().join(' ');
  check('卡面警告接在 skuCard 的 tier 3 分支、只挂一次（F8：同屏不留第二口径；句子只在 constants.js 定义，界面引用不复制）',
    warnMount !== undefined && warnMount.includes('s.tier === 3') && warnMount.includes('negv')
    && uiSrc.split('\n').filter(l => l.includes('${cheapWarn}')).length === 1
    && warnHome === 'data/constants.js ui/main.js' && literalHome === 'data/constants.js',
    `挂载行「${(warnMount || '').trim().slice(0, 30)}…」｜引用处 ${warnHome}｜原句只在 ${literalHome}`);
  check('单上「不动价格与品质参数」：六样清仓货的价、档、票、赊、隔夜逐字未动（q35 / 无票 / 只收现金 / 当天清）',
    ['MB3', 'MT3', 'VG3', 'BF3', 'NS3', 'SP3'].map(k => SKU_BY_ID[k].price).join('/') === '10.5/9.5/3/4.5/2.5/0.4'
    && cheap.every(sk => sk.q === QUALITY_BY_TIER[3] && sk.receipt === 'none' && sk.credit === false && sk.keep === false),
    `价 ${['MB3', 'MT3', 'VG3', 'BF3', 'NS3', 'SP3'].map(k => SKU_BY_ID[k].price).join('/')}｜q 全 ${QUALITY_BY_TIER[3]}`);
  check('两句清仓文案一条都没塞进留言池：COMMENT_POOLS 仍是 11 池（文案批三后 51 条），这两句不在任何一池里',
    Object.keys(COMMENT_POOLS).length === 11
    && Object.values(COMMENT_POOLS).reduce((n, a) => n + a.length, 0) === 51
    && !Object.values(COMMENT_POOLS).some(arr => arr.some(t => t === CHEAP_UNLOCK_CUE || t === CHEAP_TIER_WARNING)),
    `${Object.keys(COMMENT_POOLS).length} 池 ${Object.values(COMMENT_POOLS).reduce((n, a) => n + a.length, 0)} 条`);

  // 裁定一（`66e8114`）：「跑表只买玩家看得见的那面货架」——界面那条闸在 sim.js 里同一条读法，
  // 便宜参考线用开局夹具把货架预解锁（锁定窗另立探针），已签两轨因此逐字节不动（sweep 491／m3 566，diff 0）。
  const simSrc = readFileSync(join(HERE, 'src/sim.js'), 'utf8');
  const marketSrc = readFileSync(join(HERE, 'src/engine/market.js'), 'utf8');
  const mirrorLine = simSrc.split('\n').find(l => l.includes('tier === 3') && l.includes('!state.cheapUnlocked'));
  const fixtureLine = simSrc.split('\n').find(l => l.includes('strategy.tier === 3') && l.includes('cheapUnlocked = true'));
  const gateLine = marketSrc.split('\n').find(l => l.includes('sku.tier === 3') && l.includes('!state.cheapUnlocked'));
  check('裁定一：跑表与界面共用「未解锁的清仓摊不在场」这一条读法，两处都只读 state.cheapUnlocked、都不掷随机',
    !!mirrorLine && !!gateLine && !!fixtureLine,
    `界面闸「${(gateLine || '').trim().slice(0, 34)}…」｜跑表镜像「${(mirrorLine || '').trim().slice(0, 30)}…」｜夹具 ${fixtureLine ? '在场' : '缺失'}`);
}

// ── §22 接入单 task-sfx-pack-20261104（Orange `594b908`）：12 件真实录音的挂载正确性 ──
// 当年那次「WAV 头写坏 → Chrome 拒解 → 真机全程哑而运行时一声不响」的教训在这一批最吃劲：
// 引用与文件必须成对钉住，十二件逐件核字节与 sha；单上的挂载表逐条核对应；合成六件是兜底位，一条不许删。
{
  const audioRaw = readFileSync(join(HERE, 'src/ui/audio.js'), 'utf8');
  // 注释里会出现「SAVE_VERSION」这种字（文件头那条纪律本身就是这么写的），所以纪律类断言一律对剥掉注释的源码做
  const audioSrc = audioRaw
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]+\/\/[^\n]*$/gm, ' ');
  const mainRaw = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const ledger = readFileSync(join(HERE, '..', 'AUDIO-LICENSES.md'), 'utf8');
  // 单上挂载表：边（界面时刻）→ 成品文件名。逐条钉，不许谁把哪一件接错了地方
  const MOUNT = {
    tap: 'tap-A-softclick', exact: 'sfx-confirm', cash: 'sfx-cha-ching', level: 'sfx-bell',
    pop: 'sfx-pop', error: 'sfx-error', coin: 'sfx-coin', paper: 'sfx-paper', stamp: 'sfx-stamp',
  };
  const ALL12 = [...Object.values(MOUNT), 'sfx-chop', 'sfx-knife', 'sfx-boil-loop'];
  // 换音单 c915b02：tap 这一格由 sfx-tap（select_001，店主判「太难听」）换成 A 候选 click_002。
  // 被替换的那件不删、留仓未挂载（与 bgm-shijing.wav 同一口径），所以它的 sha 单独钉在下面那根「换音留痕」针里。
  const RETIRED = { 'sfx-tap': '7f22c5fa9ff88ed3bb68329da15307b9d2450c88ea9b3166249206dbe854e457' };
  const SHA = {
    'tap-A-softclick': 'a54c33493328ee418bda8b8e1794d3eeecc95dcdd98b8436f141c6f154093a06',
    'sfx-confirm': '33b17a9a9a2397c62b285c52c33a907fdffb476909c99e42dde603f6a7a8b12c',
    'sfx-cha-ching': 'ff516a515fb06bf50a2b38e4a242d9210a1d2346e04a4e569f984db01ca318cf',
    'sfx-bell': '33529a612c4bdbeece47a4919aa6759658772788d5d4f65c4dc32fa48de5234e',
    'sfx-pop': '16343e7176c3af65cc65f4f5fd96e6f5e8dcb8ab4a4351bdc39edd11d60030de',
    'sfx-error': '09ce72c4b5a2d33e657d3df4155564adfc48c807e16ddc95473559b8b7defe4c',
    'sfx-coin': 'c8d2fd50b3207d83eb0d2b9dcb4f82b595cd3ff23be2836f300279ea5cd4213e',
    'sfx-paper': '86061d869a3499ac12f5cf05f931f679ea159a916553aaf1c8a8528c1a4d806d',
    'sfx-stamp': '8fefd2e0f37847ea676ca23c16d3f5cbc1e8d9ecfb66a25fcece357d9068afd5',
    'sfx-chop': 'd00c2b3c9fff07e376145c8c8c45c90e5084ec192f6ce0387db233f7b86f1486',
    'sfx-knife': '4cd96dc630bed9840c15f1dd2306da2cc56a4da26a5d3f1a03c5a7265ac5e54f',
    'sfx-boil-loop': '0858c952af0fadd652979de3193aee50c7cf029f1f1068ec278ac5cb4a28626a',
  };

  const missing = ALL12.filter(n => !statSync(join(HERE, 'public/audio', `${n}.ogg`), { throwIfNoEntry: false }));
  const badHash = ALL12.filter(n => {
    const p = join(HERE, 'public/audio', `${n}.ogg`);
    return !SHA[n] || createHash('sha256').update(readFileSync(p)).digest('hex') !== SHA[n];
  });
  check('十二件成品全在仓里且逐件 sha 对上台账（引用与文件不许再劈一次；音频单当年那次坏文件就是这么抓住的）',
    missing.length === 0 && badHash.length === 0 && ALL12.length === 12,
    `12/12 在场｜sha 对不上 ${badHash.length ? badHash.join(',') : '无'}`);

  const unLedgered = ALL12.filter(n => !ledger.includes(n));
  const refedButAbsent = (audioSrc.match(/sfx-[a-z-]+|tap-A-softclick/g) || []).filter(n => !ALL12.includes(n));
  check('挂载表逐条对上：九条命名边 + 备菜两件 + 锅声一件，代码里出现的每一个成品文件名都在台账与仓内（tap 换 A 候选后名字不再以 sfx- 打头，扫描式一并跟上）',
    Object.entries(MOUNT).every(([edge, f]) => new RegExp(`${edge}: '${f}'`).test(audioRaw))
    && /PREP_FILES = \['sfx-chop', 'sfx-knife'\]/.test(audioRaw) && /BOIL_FILE = 'sfx-boil-loop'/.test(audioRaw)
    && unLedgered.length === 0 && refedButAbsent.length === 0,
    `台账缺 ${unLedgered.length ? unLedgered.join(',') : '无'}｜代码引了但表里没有 ${refedButAbsent.length ? refedButAbsent.join(',') : '无'}`);

  // 换音单 c915b02 留痕：被替换的那件删不删归 Orange，本针只钉「引用必须整体挪走、旧文件若要留仓就不许被悄悄改」
  const retiredNames = Object.keys(RETIRED);
  const retiredStill = retiredNames.filter(n => !statSync(join(HERE, 'public/audio', `${n}.ogg`), { throwIfNoEntry: false }));
  const retiredDirty = retiredNames.filter(n => {
    const p = join(HERE, 'public/audio', `${n}.ogg`);
    return !RETIRED[n] || createHash('sha256').update(readFileSync(p)).digest('hex') !== RETIRED[n];
  });
  check('换音留痕（tap 换 A 候选）：边名 tap 不动、代码里 sfx-tap 引用归零、新件在仓且 sha 对上；被替换的旧件若留仓必须逐字节原样',
    /tap: 'tap-A-softclick'/.test(audioRaw) && !/tap: 'sfx-tap'/.test(audioSrc)
    && !!statSync(join(HERE, 'public/audio/tap-A-softclick.ogg'), { throwIfNoEntry: false })
    && createHash('sha256').update(readFileSync(join(HERE, 'public/audio/tap-A-softclick.ogg'))).digest('hex') === SHA['tap-A-softclick']
    && retiredStill.length === 0 && retiredDirty.length === 0,
    `代码内 sfx-tap 引用 ${(audioSrc.match(/sfx-tap/g) || []).length} 处（应 0）｜旧件留仓 ${retiredStill.length === 0 ? '在' : '缺'}｜sha ${retiredDirty.length === 0 ? '原样' : retiredDirty.join(',')}`);

  check('合成六件是兜底位不是被替换：文件命中就放文件、没命中回落 VOICES，同一条边绝不响两声（单上「现有合成 6 件不删」）',
    /else if \(!playFile\(SFX_FILES\[name\]\) && VOICES\[name\]\) VOICES\[name\]\(\);/.test(audioRaw)
    && (audioRaw.match(/^\s{2}(tap|grab|exact|buy|cash|level): \(\) =>/gm) || []).length === 6,
    '回落式在场（先文件后合成）｜VOICES 六键齐全');

  check('随机纪律：备菜二选一只用 Math.random，audio.js 的代码不碰引擎的 rng / makeRng（两轨基线因此逐字节不动）',
    (audioSrc.match(/Math\.random/g) || []).length === 3
    && !/\brng\b|makeRng|streamCounter/.test(audioSrc),
    `Math.random 代码里 ${(audioSrc.match(/Math\.random/g) || []).length} 处（合成噪声两处 + 备菜二选一一处）｜引擎随机流零引用`);

  check('静音键统管这一层：不另起 AudioContext、不进存档键，setMuted 里锅声与 BGM 一起收（SAVE_VERSION 由 §20 那根针守）',
    (audioSrc.match(/new AC\(|new (window\.)?AudioContext/g) || []).length === 1
    && !/SAVE_VERSION|STORAGE_KEY|guiju-m1-save|guiju-m1-flow|guiju-m1-phase/.test(audioSrc)
    && /stopBgm\(\); stopBoil\(\); boilWanted = false;/.test(audioSrc),
    '上下文只建一格｜无存档键引用｜静音时 BGM 与锅声同收');

  const boilMounts = (mainRaw.match(/setBoil\(/g) || []).length;
  check('锅声是循环、独立推子、只挂营业那一屏（单上「只垫底，别盖 BGM」）：全界面一个挂载点，换屏即收',
    /boilSrc\.buffer = buf; boilSrc\.loop = true;/.test(audioRaw)
    && /const g = ctx\.createGain\(\); g\.gain\.value = BOIL_TRIM;/.test(audioRaw)
    && boilMounts === 1 && /setBoil\(phase === 'weigh'\)/.test(mainRaw),
    `loop=true + BOIL_TRIM 独立增益｜挂载点 ${boilMounts} 处（营业称重屏）`);

  const errMounts = (mainRaw.match(/sfx\('error'\)/g) || []).length;
  check('失败/被拒边挂在真按得到的驳回处：读不出的那一格与付不齐/超柜量各一条（置办按钮钱不够是 disabled，不挂死路）',
    errMounts === 2 && /if \(syncDraftFromInputs\(\)\) \{ sfx\('error'\); return refreshForecast\(\); \}/.test(mainRaw)
    && /if \(!r\.ok\) \{ sfx\('error'\); return go\('market'\); \}/.test(mainRaw)
    && /state\.Cash < f\.price \|\| closed \? 'disabled'/.test(mainRaw),
    `驳回挂载 ${errMounts} 处｜置办那一面走 disabled 不出声`);

  const popMounts = (mainRaw.match(/sfx\('pop'\)/g) || []).length;
  const tapReused = (mainRaw.match(/sfx\('tap'\);\s*\/\/\s*事件弹出复用/g) || []).length;
  check('事件/消息弹出改用独立的 pop（晨间与夜间两处），原先「借点按那一声」的写法一条不剩',
    popMounts === 2 && tapReused === 0, `pop ${popMounts} 处｜借 tap 的旧写法剩 ${tapReused} 处`);

  const stampOnce = (mainRaw.match(/sfx\('stamp'\)/g) || []).length;
  const paperOnce = (mainRaw.match(/sfx\('paper'\)/g) || []).length;
  check('定版与王老板各只挂一处：stamp 落在六开关锁下那一格（断点回来不重响），paper 走「同一次挂载只响一声」的老纪律',
    stampOnce === 1 && paperOnce === 1
    && /if \(!state\.today\.locked\) \{/.test(mainRaw) && /wangNow && paperLast !== wangNow/.test(mainRaw),
    `stamp ${stampOnce} 处｜paper ${paperOnce} 处（共用 cueLast 那套触发）`);

  check('sfx-coin 挂载在场但 M1 没有挂点：引用与文件都在、界面一次都不叫（单笔收款与广告奖励到账都不在 M1 构建里，不许为凑响声造假时刻）',
    MOUNT.coin === 'sfx-coin' && new RegExp(`coin: 'sfx-coin'`).test(audioRaw)
    && !/sfx\('coin'\)/.test(mainRaw),
    '引用 sfx-coin｜sfx(\'coin\') 调用 0 处 → 归 ⊘，等 M2 的广告与单笔收款');

  check('两支推子的算术钉住：0.265 让包内最响的一件落在签过的 0.203 满幅、最轻的落 0.103；锅声 0.184 比 BGM 出链低 4 个 LU',
    /const FILE_TRIM = 0\.265;/.test(audioRaw) && /const BOIL_TRIM = 0\.184;/.test(audioRaw)
    && +(1.0 * 0.265 * 0.85 * 0.9).toFixed(3) === 0.203 && +(0.507 * 0.265 * 0.85 * 0.9).toFixed(3) === 0.103,
    `最响 0.203／最轻 ${(0.507 * 0.265 * 0.85 * 0.9).toFixed(3)}（签过带 0.097–0.203）`);
}

// ── §23 查账单 task-steam-missing-20261104（Orange `aabb032`）+ 裁定 d619ed6 第三条 ──────────
// 她两次公网实测「四屏双帧像素一致、页面结构里找不到蒸汽类元素」，验收口径改死：双帧必须有可见差异，
// 并补一根针断言这一层在 DOM 在场、动画在跑（§22 钉音频那种钉法：钉的是代码与挂载，画面归眼睛，读数在 §六十八）。
// 同一批还有 tap 叠响的窄修：单上点名八条专属边，它们发了声就让位这一次的通用点按，其余点按照旧。
{
  const nf = s => s.replace(/\r\n/g, '\n');   // 本块要看的是跨行句式，先把三种源文归成 LF
  const mainRaw = nf(readFileSync(join(HERE, 'src/ui/main.js'), 'utf8'));
  const audioRaw = nf(readFileSync(join(HERE, 'src/ui/audio.js'), 'utf8'));
  const cssRaw = nf(readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8'));
  const morningBody = (mainRaw.split('\n  morning() {')[1] || '').split('\n  market() {')[0];
  const renderBody = (mainRaw.split('\nfunction render() {')[1] || '').split('\n}\n')[0];

  // 1) DOM 在场：壳与三颗粒子由 steamScene 一处产出，挂载点只有出摊 hub 那一屏
  check('热气层 DOM 在场：steamScene 产出 class="steam" 的壳与恰好三颗 <i>，全仓唯一挂载点在 VIEWS.morning 里',
    /<span class="steam" aria-hidden="true"><i><\/i><i><\/i><i><\/i><\/span>/.test(mainRaw)
    && (mainRaw.match(/steamScene\('/g) || []).length === 1 && /steamScene\('stall'/.test(morningBody)
    && (mainRaw.match(/class="steam"/g) || []).length === 1,
    `挂载 1 处（morning 屏）｜壳内 <i> 3 颗｜aria-hidden 在场（压不到读屏）`);

  // 2) 动画在跑：infinite 的那条就是这一层，关键帧峰值不是 0，三颗各带自己的相位
  const steamRule = (cssRaw.match(/\.steam i \{[^}]*\}/) || [''])[0];
  const kf = (cssRaw.match(/@keyframes fxSteam \{[\s\S]*?\n\}/) || [''])[0];
  const peaks = [...kf.matchAll(/opacity: ([\d.]+)/g)].map(m => +m[1]);
  check('热气层动画在跑：.steam i 挂 fxSteam 2400ms linear infinite，关键帧峰值 .62（不是被谁归零的那一档），三颗 delay 0/800/1600 各自错开',
    /animation: fxSteam 2400ms linear infinite/.test(steamRule)
    && /16% \{ opacity: \.62; \}/.test(kf) && Math.max(...peaks) === 0.62
    && /\.steam i:nth-child\(2\) \{[^}]*animation-delay: 800ms/.test(cssRaw)
    && /\.steam i:nth-child\(3\) \{[^}]*animation-delay: 1600ms/.test(cssRaw),
    `关键帧 opacity 档 ${peaks.join('/')}｜峰值 ${Math.max(...peaks)}`);

  // 3) 落点在锅上：三列照实测带挪到 70/77/84%（中心 73/80/86%，起势在碗口），奶白高光那三列不许回潮
  const lefts = [...cssRaw.matchAll(/\.steam i(?::nth-child\(\d\))? \{[^}]*?left: (\d+)%/g)].map(m => +m[1]);
  check('热气落点在锅口那一列：三列 left 70/77/84%（430 宽实测带 391×220、锅口 x 78–90%、沿口离带底 7.5%），旧落点 48/56/63% 零命中',
    lefts.join(',') === '70,77,84' && !/\.steam i[^{]*\{[^}]*left: (48|56|63)%/.test(cssRaw),
    `三列 left ${lefts.join('/')}%｜粒子 26×30、22×26、17×21`);

  // 4) 挡死条件只剩两条签过的：切后台暂停、reduced-motion 整层关；render 每趟报一次可见性
  check('能把这层挡死的只有已签那两条：fx-paused（document.hidden 驱动，切后台与 render 换屏各补一次）与 prefers-reduced-motion 的 display:none，此外无第三道闸',
    /#app\.fx-paused \.steam i \{ animation-play-state: paused; \}/.test(cssRaw)
    && /\.steam \{ display: none !important; \}/.test(cssRaw)
    && /const steamPause = \(\) => app\.classList\.toggle\('fx-paused', document\.hidden\);/.test(mainRaw)
    && (mainRaw.match(/steamPause\(\);/g) || []).length === 2
    && /steamPause\(\);/.test(renderBody)
    && /visibilitychange[\s\S]{0,40}\n  steamPause\(\);/.test(mainRaw),
    `暂停位 ${(mainRaw.match(/steamPause\(\);/g) || []).length} 处（visibilitychange + render）｜降级位 1 处（reduce 块内）`);

  // 5) tap 窄修：名单照单八条，只在「真发了声」那一格登记，点按改走本帧末尾的微任务（不留计时器）
  const yieldList = (audioRaw.match(/const GENERIC_YIELD = new Set\(\[([^\]]*)\]\)/) || [, ''])[1];
  const yieldNames = yieldList.split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  check('tap 叠响窄修照单落地：专属边名单恰是点名的八条（exact/pop/error/stamp/level/paper/cash/coin），多一条少一条都不算',
    yieldNames.join(',') === 'exact,pop,error,stamp,level,paper,cash,coin',
    `${yieldNames.length} 条＝${yieldNames.join('/')}`);
  check('让位的判据是「发了声」不是「被叫到」：登记排在发声那一行之后，且要缓冲在或这条边有兜底合成；点按走 queueMicrotask，本函数零计时器',
    /if \(GENERIC_YIELD\.has\(name\) && \(fileBufs\[SFX_FILES\[name\]\] \|\| voiced\)\) edgePass = pass;/.test(audioRaw)
    && audioRaw.split('function sfx(name) {')[1].split('\n}')[0].indexOf('edgePass = pass')
       > audioRaw.split('function sfx(name) {')[1].split('\n}')[0].indexOf('else if (!playFile')
    && /export function tapEdge\(\) \{\n  const id = \+\+pass;\n  queueMicrotask\(\(\) => \{ if \(edgePass !== id\) sfx\('tap'\); \}\);/.test(audioRaw)
    && !/setTimeout\(|setInterval\(/.test(audioRaw.split('export function tapEdge')[1] || ''),
    '微任务在同一帧末尾｜tapEdge 内零计时器');
  check('窄修不许制造哑点击：stamp/pop/error/paper/coin 这五条在 VOICES 里没有兜底键，坏文件时它们一声不出，登记条件里的 fileBufs||voiced 因此不放行，点按照旧',
    ['stamp', 'pop', 'error', 'paper', 'coin'].every(n => !new RegExp(`^  ${n}: \\(\\) =>`, 'm').test(audioRaw))
    && (audioRaw.match(/^\s{2}(tap|grab|exact|buy|cash|level): \(\) =>/gm) || []).length === 6,
    '兜底合成只有 tap/grab/exact/buy/cash/level 六键｜五条无兜底边逐条点名零命中');
  const tapCalls = (mainRaw.match(/sfx\('tap'\)/g) || []).length;
  check('通用点按只剩一个入口且条件一字未动：原来那句 sfx(\'tap\') 换成 tapEdge()，「按到可点的按钮才出声」那个判据原样保留',
    tapCalls === 0 && (mainRaw.match(/tapEdge\(\)/g) || []).length === 1
    && /if \(\(tab \|\| nav \|\| host\) && !e\.target\.closest\('button\[disabled\]'\)\) tapEdge\(\);/.test(mainRaw),
    `sfx('tap') 剩 ${tapCalls} 处｜tapEdge 1 处`);
  check('窄修没越界：兜底回落句式与合成六键一字未动（§22 那两根针仍成立），名单外的 grab/buy/prep 照旧与点按同响',
    /else if \(!playFile\(SFX_FILES\[name\]\) && VOICES\[name\]\) VOICES\[name\]\(\);/.test(audioRaw)
    && (audioRaw.match(/^\s{2}(tap|grab|exact|buy|cash|level): \(\) =>/gm) || []).length === 6
    && !/GENERIC_YIELD\.has\('grab'|'buy', 'prep'/.test(audioRaw),
    '回落句式在场｜VOICES 六键齐｜名单外三条不改行为');
}

// ── §24 文案批 content-batch-text-20261104 + 回声包 content-batch-echo-20261104（店主 2026-11-04 批）──
// 单上的回归针只点名三样（新 id 在场 / REGULAR_LINES 长度 5 / 留言池计数），其余几根是把「不许越过的线」钉住：
// 效果量级不超带、坏事压力后置、Orange 的原句逐字在场、回声三条的映射只读现成字段（不新造计数器）。
// evt_d_052 随文案批入池时因「假按钮」退回（理由与三条备选写在 delta §七十一），`f6a8ebf` §一按丙改写后落地 ⇒ 本节的 052 针
// 从「确实不在池里」翻成「丙案逐字在场、价格 op 一律不许回来」。
{
  const EV = id => EVENT_BY_ID[id];
  const SIX = ['evt_d_041', 'evt_d_042', 'evt_d_043', 'evt_d_044', 'evt_d_045', 'evt_d_046'];
  const ECHO = ['evt_d_051', 'evt_d_052', 'evt_d_053'];
  const ALL9 = SIX.concat(ECHO);
  const opsOf = e => (e.actions || []).flatMap(a => a.open || []).concat(e.open || []);
  const hidOf = e => (e.actions || []).flatMap(a => a.hidden || []).concat(e.effect_hidden || []);

  // 1) 九行齐备、落点合法（pool 只有 daily、timing 只有三条既有子流、ship 标 M2、motion 照文件头规则）
  check('文案批 +6 与回声 +3 逐 id 在场，九行全 pool:daily / ship:M2 / timing 落在三条既有子流上（不新增子流）',
    ALL9.every(id => !!EV(id)) && ALL9.every(id => {
      const e = EV(id);
      return e.pool === 'daily' && e.ship === 'M2' && ['morning_pre', 'morning', 'evening'].includes(e.timing)
        && SUBSTREAMS.includes(`event_${e.timing}`)
        && ['坏事', '好事', '中性'].includes(e.kind) && !!e.motion && !!e.text;
    }),
    ALL9.map(id => `${id}=${EV(id).timing}/${EV(id).kind}/w${EV(id).weight}/cd${EV(id).cooldown}`).join('　'));
  const O52 = EV('evt_d_052');
  check('evt_d_052 按丙在场（`f6a8ebf` §一）：timing 仍是 morning 带两颗按钮，价格 op 一个不许留——「少拿点」的 −5% 就此作废，明记',
    !!O52 && O52.timing === 'morning' && O52.actions.length === 2
    && opsOf(O52).every(o => o.priceMultToday === undefined)
    && !JSON.stringify(O52).includes('priceMultToday')
    && EVENTS.some(e => e.id === 'evt_d_052') && EVENTS.length === 27,
    `按钮 ${O52 ? O52.actions.map(a => a.label).join('/') : '无'}｜op ${O52 ? JSON.stringify(opsOf(O52)) : '—'}`);
  check('052 两颗按钮的文案与账逐字照裁定：少拿点＝forcedComment『新菜又推了推』＋hidden Rep+1；照常拿＝forcedComment「成，是个过日子的」且无 hidden',
    O52.actions[0].label === '少拿点' && O52.actions[0].open[0].forcedComment
      === '老李把新菜往你这边又推了推：『少拿点好，菜这东西，新鲜才值钱。』'
    && JSON.stringify(O52.actions[0].hidden) === '[{"Rep":1}]'
    && O52.actions[1].label === '照常拿' && O52.actions[1].open[0].forcedComment === '老李把担子一挑：「成，是个过日子的。」'
    && O52.actions[1].hidden.length === 0,
    `hidden ${JSON.stringify(O52.actions.map(a => a.hidden))}`);
  // 裁定 `077733c` §五：半成已作废 ⇒ 卡面不许许诺不兑现的东西。改字只动 text 一格，机制（timing／weight／cooldown／condition／两按钮）一字没动，
  // 所以两道门与草稿带逐字节相同（本次实测 cmp 0），「改名升签 r16、不再重算」这条才成立。
  check('052 卡面按 `077733c` §五 改字逐字在场：「我这担子先过你这儿」替掉「我按老主顾价再让半成」，全池 27 行的文案里再没有「半成」这种不兑现的承诺',
    O52.text === '老李今早挑着担子先绕到你摊上："昨天见你剩了不少，今儿少拿点？我这担子先过你这儿——下周我那新地先紧着谁，可就不好说了。"'
    && !EVENTS.some(e => (e.text || '').includes('半成'))
    && !EVENTS.some(e => JSON.stringify(e).includes('半成')),
    `卡面「${O52.text}」`);

  // 2) 效果量级不超带（总口径：现金 −5…−260｜Rep ±1…5｜Risk +4…8｜客流乘数 0.85–1.25）
  const cashOps = ALL9.flatMap(id => opsOf(EV(id))).filter(o => o.cash !== undefined);
  const repOps = ALL9.flatMap(id => hidOf(EV(id))).filter(o => o.Rep !== undefined);
  const riskOps = ALL9.flatMap(id => hidOf(EV(id))).filter(o => o.Risk !== undefined);
  const mults = ALL9.flatMap(id => opsOf(EV(id)))
    .map(o => o.nextDayTrafficMult ?? o.eventDemandMult ?? (o.priceMultToday ? o.priceMultToday.mult : undefined))
    .filter(x => x !== undefined);
  check('九行效果全在总口径带内：现金 −12…−5｜Rep +1…+2｜Risk +4｜乘数 0.90–1.25（客流乘数带 0.85–1.25 之内）',
    cashOps.every(o => o.cash <= 0 && Math.abs(o.cash) <= 26000 && Math.abs(o.cash) >= 500)
    && repOps.every(o => Math.abs(o.Rep) >= 1 && Math.abs(o.Rep) <= 5)
    && riskOps.every(o => o.Risk >= 4 && o.Risk <= 8)
    && mults.every(m => m >= 0.85 && m <= 1.25),
    `现金 ${cashOps.map(o => o.cash).join('/')}｜Rep ${repOps.map(o => o.Rep).join('/')}｜Risk ${riskOps.map(o => o.Risk).join('/')}｜乘数 ${mults.join('/')}`);
  check('压力后置照旧：本批唯一的坏事 046 钉在 Day>=3；回声 053 的 Day>=3 由别名结构自带（不足两格日报恒 false ⇒ 第 3 天才可能成立）',
    EV('evt_d_046').condition === 'Day>=3' && EV('evt_d_046').kind === '坏事'
    && ALL9.filter(id => EV(id).kind === '坏事').every(id => EV(id).condition.includes('Day>=') || id === 'evt_d_053'),
    `046「${EV('evt_d_046').condition}」｜053「${EV('evt_d_053').condition}」`);

  // 3) 回声映射只读现成字段：Orange 的三个拟名都落在已结算的日报/状态上，一个计数器都不许新造
  const srcRoot = join(HERE, 'src');
  const srcFiles = [];
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p); else if (name.endsWith('.js')) srcFiles.push(p);
    }
  })(srcRoot);
  const grepAll = re => srcFiles.filter(f => re.test(readFileSync(f, 'utf8'))).map(f => f.slice(srcRoot.length + 1).replace(/\\/g, '/'));
  check('回声映射不新造计数器：全仓零处 YesterdayPricePerJin / PrevDayPricePerJin；YesterdayWasteHigh 只活在 dsl 别名与数据行条件里，不是新存的格',
    grepAll(/YesterdayPricePerJin|PrevDayPricePerJin/).length === 0
    && grepAll(/YesterdayWasteHigh/).join(' ') === 'data/events.js engine/dsl.js'
    && !('YesterdayWasteHigh' in newGame(SEED)),
    `别名命中 ${(grepAll(/YesterdayWasteHigh/).join(' ') || '无')}｜newGame 里有这一格吗 ${'YesterdayWasteHigh' in newGame(SEED)}`);
  check('051 走已存在的 state.YesterdaySoldOut（第 12 步 nightClose 早已写，一格没新存）；052／053 走 readVar 新别名，只读 DailyReports',
    EV('evt_d_051').condition === 'YesterdaySoldOut' && 'YesterdaySoldOut' in newGame(SEED)
    && EV('evt_d_053').condition === 'PriceRaisedYesterday' && typeof readVar('PriceRaisedYesterday', newGame(SEED)) === 'boolean'
    && EV('evt_d_052').condition === 'YesterdayWasteHigh >= 4000' && readVar('YesterdayWasteHigh', newGame(SEED)) === 0,
    `YesterdaySoldOut 初值 ${JSON.stringify(newGame(SEED).YesterdaySoldOut)}｜053 初值 ${readVar('PriceRaisedYesterday', newGame(SEED))}｜052 初值 ${readVar('YesterdayWasteHigh', newGame(SEED))}`);

  // 4) 别名真值表：日报不足两格恒 false；昨日 > 前日才 true；相等与下调都 false（不能把 undefined 当 0 比）
  const rep = (n, pricePerJin) => ({ day: n, pricePerJin });
  const cases = [
    { r: [], want: false, why: '第 1 天（零格）' },
    { r: [rep(1, 15)], want: false, why: '第 2 天（一格，没有「前日」）' },
    { r: [rep(1, 15), rep(2, 16)], want: true, why: '昨 16 > 前 15' },
    { r: [rep(1, 15), rep(2, 15)], want: false, why: '持平不算上调' },
    { r: [rep(1, 16), rep(2, 15)], want: false, why: '降价不算' },
    { r: [rep(1, 12), rep(2, 16), rep(3, 15)], want: false, why: '只看最后两格：昨 15 < 前 16' },
  ];
  const aliasGot = cases.map(c => { const s = newGame(SEED); s.DailyReports = c.r; return readVar('PriceRaisedYesterday', s); });
  check('PriceRaisedYesterday 真值表六格全对（含 Day1–2 兜底 false、持平/下调 false、只看滚动窗口最后两格）',
    aliasGot.every((g, i) => g === cases[i].want),
    cases.map((c, i) => `${c.why}→${aliasGot[i]}`).join('｜'));
  const dslSrc = readFileSync(join(srcRoot, 'engine/dsl.js'), 'utf8');
  const aliasBody = (dslSrc.match(/if \(name === 'PriceRaisedYesterday'\) \{[\s\S]*?\n  \}/) || [''])[0];
  check('别名只读不算：这一格只从 s.DailyReports 取最后两格的价，全文无 state 写、无属性赋值、不掷随机',
    aliasBody.includes('s.DailyReports') && aliasBody.includes('pricePerJin')
    && !/\bstate\b/.test(aliasBody) && !/^\s*[A-Za-z_$][\w$]*(\.[\w$]+)*\s*=[^=]/m.test(aliasBody)
    && !/rng|Math\.random|float\(/.test(aliasBody),
    aliasBody.replace(/\n\s*/g, ' ').slice(0, 80) + '…');

  // 4b) 052 的别名真值表：量纲是分、只看最后一格、没有昨日兜底 0（不许拿 undefined 当数去比）
  const wrep = (n, writeoffCents) => ({ day: n, writeoffCents });
  const WCASES = [
    { r: [], want: 0, why: '第 1 天没有昨日' },
    { r: [wrep(1, 2500)], want: 2500, why: '只看昨日那一格' },
    { r: [wrep(1, 999900), wrep(2, 1200)], want: 1200, why: '前日那格再大也不算' },
    { r: [wrep(1, 0)], want: 0, why: '昨日零报损' },
  ];
  const wgot = WCASES.map(c => { const s = newGame(SEED); s.DailyReports = c.r; return readVar('YesterdayWasteHigh', s); });
  check('YesterdayWasteHigh 真值表四格全对（报损这一格是日报现成字段 writeoffCents，量纲分）',
    wgot.every((g, i) => g === WCASES[i].want),
    WCASES.map((c, i) => `${c.why}→${wgot[i]}`).join('｜'));
  const wasteBody = (dslSrc.match(/if \(name === 'YesterdayWasteHigh'\) \{[\s\S]*?\n  \}/) || [''])[0];
  check('052 的门槛数字留在数据行（4000 分＝40 元），引擎那侧只报数不藏线：别名体里没有比较、没有常量 4000',
    wasteBody.includes('writeoffCents') && !wasteBody.includes('4000') && !/[<>]=?/.test(wasteBody),
    wasteBody.replace(/\n\s*/g, ' ').slice(0, 90) + '…');
  check('自定阈值的标定件在仓里可复跑（40 元是 Yellow 按日报数据定的，回声单第 18 行点名交给谁就报给谁）',
    statSync(join(HERE, 'probe-evt052-waste.js')).isFile() && /p75|候选阈值/.test(readFileSync(join(HERE, 'probe-evt052-waste.js'), 'utf8')),
    'probe-evt052-waste.js 在场');
  // 裁定 `077733c` §一 把【H】的验收从「逐颗种子不许翻」改成「按分布判」，并把这条定成往后每批的口径 ⇒ 复跑件必须在仓里，
  // 否则下一次又得靠肉眼翻带子。这里只钉件在场与三条判据齐备，不钉任何数（数随基线走，钉了就会哪天自己过期）。
  const bandDistSrc = readFileSync(join(HERE, 'probe-band-distribution.js'), 'utf8');
  check('分布判的复跑件在仓里（`077733c` §一）：三条判据齐备——众数结局不变／存活 ≥3/5／六结局可达性集合不变',
    statSync(join(HERE, 'probe-band-distribution.js')).isFile()
    && /判据① 众数结局不变/.test(bandDistSrc) && /判据② 存活 ≥3\/5/.test(bandDistSrc) && /判据③ 可达性集合不变/.test(bandDistSrc),
    'probe-band-distribution.js 在场');

  // 5) DSL 端到端：三条回声的 condition 走同一个 evalCondition 判得动（别名与状态字段在同一个求值器里）
  {
    const s = newGame(SEED);
    s.DailyReports = [rep(1, 15), rep(2, 16)];
    const up = evalCondition(EV('evt_d_053').condition, s);
    s.DailyReports = [rep(1, 16), rep(2, 15)];
    const down = evalCondition(EV('evt_d_053').condition, s);
    s.YesterdaySoldOut = true;
    const sold = evalCondition(EV('evt_d_051').condition, s);
    s.YesterdaySoldOut = false;
    const notSold = evalCondition(EV('evt_d_051').condition, s);
    s.DailyReports = [wrep(1, 4100)];
    const wasteOn = evalCondition(EV('evt_d_052').condition, s);
    s.DailyReports = [wrep(1, 3990)];
    const wasteOff = evalCondition(EV('evt_d_052').condition, s);
    check('三条回声的 condition 逐字进 evalCondition 判得动：涨价真→053 成立、降价→不成立；售罄真→051 成立、假→不成立；昨日报损 41 元→052 成立、39.9 元→不成立',
      up === true && down === false && sold === true && notSold === false && wasteOn === true && wasteOff === false,
      `053 涨/跌 ${up}/${down}｜051 售罄/未 ${sold}/${notSold}｜052 41元/39.9元 ${wasteOn}/${wasteOff}`);
  }

  // 6) 常客线收尾：c01–c03 各 5 句（前 3 句旧稿逐字不动、后 2 句照 Orange 稿），c04 按已签额度继续留空
  const OLD_HEAD = { c01: 3, c02: 3, c03: 3 };
  const BATCH2 = {
    c01: ['考完了！睡了一天一夜，醒来就惦记你这碗。', '成绩还没出，但我这人先过关了——汤给我加满。'],
    c02: ['项目上线了，今晚不用通宵，我慢慢吃。', '我把你家写进我们组的外卖清单了，第一行，标了星。'],
    c03: ['今儿孙子自己来的，点单点得比我还熟。', '他说等他挣钱了，天天请我吃你家的。'],
  };
  check('REGULAR_LINES：c01–c03 各 5 句（+2 拍落位）、第 4、5 句就是 Orange 批的那两句、c04 仍留空',
    ['c01', 'c02', 'c03'].every(k => REGULAR_LINES[k].length === 5)
    && REGULAR_LINES.c01.slice(3).join('§') === BATCH2.c01.join('§')
    && REGULAR_LINES.c02.slice(3).join('§') === BATCH2.c02.join('§')
    && REGULAR_LINES.c03.slice(3).join('§') === BATCH2.c03.join('§')
    && (REGULAR_LINES.c04 || []).length === 0,
    `长度 ${['c01', 'c02', 'c03', 'c04'].map(k => `${k}:${(REGULAR_LINES[k] || []).length}`).join(' ')}`);
  check('补拍不许改写前头：c01–c03 的前三句逐字留在原位（那九句是 §八 已登记的 agent 自撰待审稿，本批无权动）',
    ['c01', 'c02', 'c03'].every(k => REGULAR_LINES[k].slice(0, OLD_HEAD[k]).every(l => typeof l === 'string' && l.length > 10))
    && REGULAR_LINES.c01[0].startsWith('从自习室逃出来一趟') && REGULAR_LINES.c02[0].startsWith('上线推到今晚了')
    && REGULAR_LINES.c03[0].startsWith('孙子今儿没跟来'),
    `头三句起句核对：${['c01', 'c02', 'c03'].map(k => REGULAR_LINES[k][0].slice(0, 6)).join(' / ')}`);
  // regularLine 钳位到最后一句：批前钳在第 3 句，批后钳到第 5 句；到顶不再越界
  {
    const lineAt = (k, p) => regularLine(k, p);
    check('regularLine 钳位跟着数组加长：进度 3（批前就到顶的那一格）现在吐新第 4 句，进度 5/9 停在第 5 句（到顶不回卷、不出 undefined）',
      lineAt('c01', 3) === REGULAR_LINES.c01[3] && lineAt('c02', 3) === REGULAR_LINES.c02[3]
      && lineAt('c01', 5) === REGULAR_LINES.c01[4] && lineAt('c01', 9) === REGULAR_LINES.c01[4]
      && lineAt('c01', 0) === REGULAR_LINES.c01[0] && lineAt('c04', 2) === null,
      `进度 3→第 4 句（批前这里是最后一句）｜进度 5/9→第 5 句｜c04 → null`);
  }

  // 7) 留言池：+19 只许往后追加（前缀逐字不动，下标直取那两条归 §19 那根针守），且 Orange 的十九句逐字在场
  const HEAD_SIZE = { qualityGood: 3, qualityBad: 3, qualityMid: 3, taste: 4, portion: 4, price: 4, soldout: 2, packing: 2, regular: 3, rumor: 2, weather: 2 };
  const NEW_TAIL = [
    ['qualityGood', ['丸子一咬就弹牙，我跟室友打赌，输了都认。', '这汤鲜得不讲理，我是端着碗喝完的。']],
    ['qualityBad', ['今儿这碗吃着有点飘，像没睡醒。', '回去路上肚子咕噜了一阵，说不上来。']],
    ['qualityMid', ['中规中矩，填饱肚子没问题。', '跟昨天一个味，稳。']],
    ['taste', ['辣度刚好卡在我出汗的边上。', '麻得嘴唇直跳舞，跳完还想再来一碗。']],
    ['portion', ['秤星我盯着呢，你没手抖。', '这碗沉，端着就有底气。']],
    ['price', ['比上学期贵了点，但我还在吃，你细品。', '这价钱还能陪我到毕业，够意思。']],
    ['soldout', ['我掐着点来的还是没了，你家是不是藏着一半菜单？']],
    ['packing', ['盒子到宿舍还是热的，盖子这次跟我很熟。']],
    ['regular', ['老板，我的口味你比我妈记得都清。', '毕业前我得把菜单吃个遍，还剩两样。']],
    ['rumor', ['街口那家新来的，排队的人都走到你家队尾了。', '有人把你家价目牌拍下来发群里了，配文就俩字：良心。']],
    ['weather', ['天一凉，你这摊跟被窝一样有号召力。']],
  ];
  const tailFlat = NEW_TAIL.flatMap(([, a]) => a);
  check('留言池 +19 全在各自池尾（19 句逐字对 Orange 稿），插不进头里 ⇒ 批前 32 句的相对次序一格没动',
    NEW_TAIL.every(([k, a]) => COMMENT_POOLS[k].slice(-a.length).join('§') === a.join('§'))
    && tailFlat.length === 19
    && Object.keys(HEAD_SIZE).reduce((n, k) => n + HEAD_SIZE[k], 0) === 32
    && Object.values(COMMENT_POOLS).reduce((n, a) => n + a.length, 0) === 51,
    `尾挂核对：${NEW_TAIL.map(([k, a]) => `${k}+${a.length}`).join(' ')}｜合计 51 条`);
  // 暧昧归因是文件头硬规范，扩容十句里品质那三池最吃劲：新句不许指认到摊子或料上
  const ACCUSE = /你家|你这|你的料|你用的|地沟油|过期|不干净/;
  check('新加的品质嘀咕仍守「暧昧归因」：qualityBad/qualityMid 四条新句里零指认（文件头硬规范，扩容也不给开口子）',
    [...COMMENT_POOLS.qualityBad.slice(3), ...COMMENT_POOLS.qualityMid.slice(3)].every(t => !ACCUSE.test(t)),
    `新句 ${COMMENT_POOLS.qualityBad.slice(3).concat(COMMENT_POOLS.qualityMid.slice(3)).length} 条零命中`);
  check('池长改的是「抽中哪句」不是「抽几次」：buildComments 每处 pick 恒消耗一个数（rng.int 无拒绝重抽），留言文本漂、数值不漂',
    /pool\[rng\.int\('comment', pool\.length\)\]/.test(readFileSync(join(srcRoot, 'engine/comments.js'), 'utf8'))
    && !/while\s*\(/.test(readFileSync(join(srcRoot, 'engine/comments.js'), 'utf8')),
    `pick = pool[rng.int(...)] 一行式｜comments.js 内零 while`);
}

// ── §25 版面单 task-wind-panel-20261104（Orange `0902161`，店主 2026-11-04 亲签红线修订）：「摊口风向」 ──
// 新规矩：暗线档位可以进面板；数字、计数器名、精确涨跌值永远不许进。这张卡是目前唯一获批出口，结算屏与出摊 hub 仍按旧规矩。
// 单上点名三根针（四行在场 / 档位词只出自本词表 / 卡内无数字字面量），其余几根钉的是「不许越过的线」：
// 只三档、不显箭头、不显与昨日差值、派生只读（不落盘、不新增计数器、SAVE_VERSION 不动 ⇒ sweep/m3 应 diff 0）、
// 两条阈值锚在事件池已签数字上（那边改了这边就红，不许两处各飘各的）、三档在正常打法下不许成死档（工单验收）。
{
  const row = dim => WIND_ROWS.find(r => r.dim === dim);
  // 扫可见文本前先剥标签：<h2> 里那个 2 不是界面数字，留着会把「零数字」这根针误判成红。
  const visible = html => html.replace(/<[^>]*>/g, '');
  const flat = html => visible(html).replace(/\s+/g, '');
  // 注释里对规则的转述不算代码（本文件头就写着「SAVE_VERSION 不动」）：只拿去掉注释的正文做静态判据。
  const codeOnly = txt => txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const fresh = newGame(SEED);
  const card = windCard(fresh);
  const body = visible(card);

  // 1) 版面：标题 + 四行、每行三档、行 = 维度名 + 档位词 + 一句场景话
  check('标题「摊口风向」+ 四行在场：口碑 / 出品 / 熟客 / 风声 各一行，每行恰好三档，阈值两道且下界 < 上界',
    card.includes('<h2>摊口风向</h2>') && flat(card).startsWith('摊口风向口碑')
    && WIND_ROWS.map(r => r.dim).join('') === '口碑出品熟客风声'
    && WIND_ROWS.every(r => r.bands.length === 3 && r.thresholds.length === 2
      && r.thresholds[0] < r.thresholds[1] && r.bands.every(b => b.word && b.line)),
    WIND_ROWS.map(r => `${r.dim}${r.thresholds.join('/')}`).join(' '));

  // 2) 十二句逐字照工单——Orange 改字，这里就红（词表只许有一份，界面不许复制一份）
  //    维度名与场景话的正本仍是 `task-wind-panel-20261104`；档位词那一格由 `task-ui-polish-20261105` 第 6 条换拟稿（待店主签）。
  const TICKET = [
    ['口碑', '摊子还没名', '还没什么人提你，排队的多半是头一回。'],
    ['口碑', '有人惦记着这口', '排队时有人跟同伴说：就这家。'],
    ['口碑', '街坊都认这个味', '不用招呼，熟客自己带着新人来。'],
    ['出品', '今儿有点飘', '近几碗的成色，客人吃得出差别。'],
    ['出品', '稳稳当当', '这几天的出品，没掉过链子。'],
    ['出品', '讲究，挑不出错', '有人把汤喝得一滴不剩——讲究的摊子才有这待遇。'],
    ['熟客', '多是生面孔', '来的多半是头一回的面孔。'],
    ['熟客', '有几张熟脸了', '有几张脸，见着就知道他要什么。'],
    ['熟客', '老主顾排着队', '熟客进门不用看价目牌，你也不用问。'],
    ['风声', '风声松，街面太平', '巡查的最近没往这条街来。'],
    ['风声', '说不清，多留个心眼', '风声说紧不紧，摊子摆正就没事。'],
    ['风声', '风声紧，最近查得严', '这两天查得严，筐别出线，秤别短手。'],
  ];
  const gotTable = WIND_ROWS.flatMap(r => r.bands.map(b => [r.dim, b.word, b.line]));
  check('词表十二句逐字照工单（维度名 / 档位词 / 场景话三样一起对），一句都不许多也不许改字',
    gotTable.length === 12 && gotTable.every((g, i) => g.join('§') === TICKET[i].join('§')),
    `逐字对 ${TICKET.length} 句`);

  // 3) 档位词只出自本词表：四个源字段各扫 0–100，每屏渲染结果必须逐字等于词表 81 种组合之一
  // （这条不是自证：它拿表独立重拼一遍，渲染层哪天偷偷加个数字或箭头就拼不上了）
  const combos = [];
  for (const a of row('口碑').bands) for (const b of row('出品').bands)
    for (const c of row('熟客').bands) for (const d of row('风声').bands)
      combos.push('摊口风向' + [a, b, c, d].map((x, i) => WIND_ROWS[i].dim + x.word + x.line).join(''));
  const stray = [];
  for (let v = 0; v <= 100; v++) {
    const t = flat(windCard({ ...fresh, Rep: v, Risk: v, Q: v, RegularStory: [v, 0, 0, 0] }));
    if (!combos.includes(t)) stray.push(`v=${v}→${t.slice(0, 18)}`);
  }
  check('档位词封闭：Rep / Risk / AvgQ3 / 常客合计各扫 0–100，101 屏渲染结果全部落在词表 81 组合内（表外一词即红）',
    stray.length === 0 && combos.length === 81,
    stray.length ? stray.slice(0, 2).join(' / ') : '101 屏 × 81 组合零表外');

  // 4) 护栏：零数字、零箭头、零「与昨日差值」措辞、零计数器名——阈值只活在映射代码里
  const LEAK = ['Rep', 'Risk', 'AvgQ3', 'RegularStory', '近三日', '昨日', '比昨天',
    '↑', '↓', '▲', '▼', '→', '+', '＋', '−', '%'];
  const digitHit = body.match(/\d+/g) || [];
  const leakHit = LEAK.filter(w => body.includes(w));
  check('风向卡内零数字字面量、零箭头、零昨日差值措辞、零计数器名（工单护栏：数字与计数器名永远不许进面板）',
    digitHit.length === 0 && leakHit.length === 0,
    `可见文本 ${body.length} 字｜数字[${digitHit.join('') || '无'}] 禁用词[${leakHit.join('、') || '无'}]`);

  // 5) 开局那一屏：新档 Rep 20 / 窗口均值 50 / 常客 0 / Risk 0，四行都该落在「什么都没发生」档
  check('开局不报忧：新档四行落「摊子还没名 / 稳稳当当 / 多是生面孔 / 风声松」（出品下界若取 blogger 的 65，第一天就假报警）',
    body.includes('摊子还没名') && body.includes('稳稳当当') && body.includes('多是生面孔') && body.includes('巡查的最近没往这条街来'),
    `开局源值 Rep ${fresh.Rep}｜Q ${fresh.Q}｜Risk ${fresh.Risk}｜常客 ${fresh.RegularStory.join('')}`);

  // 6) 两条阈值锚在已签数字上：从事件数据行现读那个数比对，不在测试里重打一遍数字
  const n45 = Number(EVENT_BY_ID.evt_d_complaint.weightCond.match(/MinQ3<(\d+)/)[1]);
  const n40 = Number(EVENT_BY_ID.evt_s_insp2.condition.match(/Risk>=(\d+)/)[1]);
  check('出品下界 = evt_d_complaint 权重条件里那个 MinQ3<45、风声上界 = evt_s_insp2 入池条件 Risk>=40（同一把尺子不另造第二把；事件池改了本卡就红）',
    row('出品').thresholds[0] === n45 && row('风声').thresholds[1] === n40,
    `45↔${n45}｜40↔${n40}`);
  const windSrc = readFileSync(join(HERE, 'src/ui/wind.js'), 'utf8');
  check('出品行与事件池同窗：读的是同一个 AvgQ3 别名（近三日窗在 recent.js/dsl.js 只有一份），blogger 的 condition 用的也是它',
    /readVar\('AvgQ3'/.test(windSrc) && EVENT_BY_ID.evt_d_blogger.condition.includes('AvgQ3'),
    `blogger condition = ${EVENT_BY_ID.evt_d_blogger.condition}`);

  // 7) 派生只读 + 出口唯一（本单不改任何状态与结算）
  const windImports = (windSrc.match(/^import .*$/gm) || [])
    .map(l => l.replace(/^import .*?from '/, '').replace(/';.*/, ''));
  check('派生只读：ui/wind.js 只 import 词表与 dsl 的现成读法，正文零状态写字段、零随机、不碰 SAVE_VERSION/localStorage（写坏任何一条都会惊动 sweep/m3 的 diff 0 验收）',
    windImports.join(' ') === '../data/wind.js ../engine/dsl.js'
    && !/\b(state|s)\.[A-Za-z_$][\w$]*\s*(=[^=]|\+\+|--)/.test(codeOnly(windSrc))
    && !/Math\.random|\brng\b|SAVE_VERSION|localStorage/.test(codeOnly(windSrc)),
    `import [${windImports.join(' ')}]`);
  const SRC = join(HERE, 'src');
  const rel = f => f.slice(SRC.length + 1).split('\\').join('/');
  const users = files.filter(f => /windCard|WIND_ROWS/.test(readFileSync(f, 'utf8'))).map(rel).sort();
  const mainSrc = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const at = mainSrc.indexOf('windCard(');
  check('获批出口唯一：windCard / WIND_ROWS 只出现在 data/wind.js（词表）+ ui/wind.js（派生）+ ui/main.js 一处，且挂在 me() 页首——结算屏与出摊 hub 按旧规矩',
    users.join(' ') === 'data/wind.js ui/main.js ui/wind.js'
    && (mainSrc.match(/windCard\(/g) || []).length === 1
    && mainSrc.slice(Math.max(0, at - 140), at).includes('me()'),
    `引用点 [${users.join(' ')}]`);

  // 8) 三档不许留死档（工单验收：某档在 r14 轨迹里永不出现就调阈值再报）
  // 参考①②③ = 正常打法；两粒种子 × 120 日。风声的「说不清/紧」只有 ref③（档3 亲民 + 投资腿）走得到，
  // 一条线缺档不算死档——口径是「三档在参考轨迹里都出现过」，逐线分布另见 game/probe-wind-bands.js 与 delta §七十三。
  const bands = { 口碑: [0, 0, 0], 出品: [0, 0, 0], 熟客: [0, 0, 0], 风声: [0, 0, 0] };
  for (const seed of [SEED, SEED + 977]) {
    for (const strat of Object.values(REF_STRATEGIES)) {
      const r = simulate(seed, 120, strat, 'headless', { labor: true, competition: true, eventScope: 'full' });
      r.log.forEach((d, i) => {
        bands.口碑[windBandIndex(d.Rep, row('口碑').thresholds)]++;
        bands.风声[windBandIndex(d.Risk, row('风声').thresholds)]++;
        // 现读同一个别名，不在测试里重算第二份均值：前两格取已结算 log，第三格是当日 Q（第 8 步落地）
        const q3 = readVar('AvgQ3', { Recent3: r.log.slice(Math.max(0, i - 2), i).map(x => ({ q: x.Q })), Q: d.Q, today: {}, Day: d.day });
        bands.出品[windBandIndex(q3, row('出品').thresholds)]++;
      });
      // 常客四槽只加不减（day.js:226 第 12 步 +1）⇒ 末值所在档以下，轨迹里一定待过；开局那一格是 0
      const top = windBandIndex(r.state.RegularStory.reduce((a, b) => a + b, 0), row('熟客').thresholds);
      for (let k = 0; k <= top; k++) bands.熟客[k]++;
    }
  }
  const dead = Object.entries(bands).filter(([, c]) => c.some(n => n === 0));
  check('三档全可达、零死档：参考①②③ 两粒种子 × 120 日里，四行各自的三档都出现过（缺档＝该调阈值再报，不许留死档）',
    dead.length === 0, Object.entries(bands).map(([k, c]) => `${k}[${c.join(',')}]`).join(' '));

  // 9) 借来的样式必须在场：卡片复用账本那一套类（少一个类＝真机上是一块没样式的哑文本）。
  //    工单 task-ui-polish-20261105 第 6 条之后，档位词那一格不再借 .lamt，改用自己的牌面类 .wplate ＋ 分色档 .wb0/1/2；
  //    样本屏只会渲染出一枚档位色，所以三档的类单独逐个查，别指望一次渲染把三格都覆盖到。
  const css = readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8');
  const has = c => new RegExp('\\.' + c + '(?![\\w-])').test(css);   // 链式选择器（.wplate.wb0）也算在场
  const used = [...new Set((card.match(/class="([^"]+)"/g) || []).map(m => m.slice(7, -1)).flatMap(s => s.split(/\s+/)))];
  const missing = used.filter(c => !has(c));
  const need = ['panel', 'lrows', 'lrow', 'windrow', 'lrowtop', 'lname', 'wplate', 'wb0', 'wb1', 'wb2', 'muted'];
  const noNeed = need.filter(c => !has(c));
  check('风向卡用到的每个类都在 theme.css 里，三档色一类不缺，且不再借账本的 .lamt（少一个类＝真机上一块没样式的哑文本）',
    missing.length === 0 && noNeed.length === 0 && !used.includes('lamt'),
    `用[${used.join(' ')}]｜缺[${[...missing, ...noNeed].join(' ') || '无'}]`);
  // 牌面加大一号与分色是这一条的实体：字号取现成的 h1 那一档（26px 给结算、22px 给牌面），
  // 不新增字号 token；色只吃 :root 里那六枚已签变量，出现任何新色值就红。
  check('风向牌加大一号走现成 22px 一档、分色只吃已签色板（芥末/青绿/中性 cream-2 三档底衬，字一律墨蓝）',
    /\.wplate \{[^}]*font-size: 22px/.test(css) && /\.wplate\.wb0 \{ background: var\(--cream-2\); color: var\(--ink\)/.test(css)
      && /\.wplate\.wb1 \{ background: var\(--mustard\); color: var\(--ink\)/.test(css)
      && /\.wplate\.wb2 \{ background: var\(--teal\); color: var\(--ink\)/.test(css),
    '三档底衬与 22px 逐条对过');
}

// ── §26 瘦身单 task-morning-trim-20261104（Orange `cd9b91d`，店主 2026-11-04 点选）＋ 裁定汇总 f6a8ebf §三：今晨结转收编 + 天气说人话 ──
// 范围三件：① 出摊页「今晨结转」整卡撤销（现金／欠着与顶栏重复 → 删；明日预报并入天气卡；乘数消失）＋
// 昨日结算收成一行入口「昨日结转 ▸」（行内不带数字摘要）；② 天气卡加至多两句人话，乘数与系数永不进界面；
// ③ 裁定 §三 改的词句表两处：汤底片段骑进品类句顶替负片段（原第 7 格「汤底」撤掉，表 7 行 ⇒ 6 行）、
// 假期身份句在场时压掉泛化客流句让品类进格（考试周不压）；外加 boot 教学屏那三个乘数一并改人话（§三.4）。
// 账本日报（§三.3）接受现状，本批不动存档结构，没有针要加。
// 街面价签与柜里还剩本单不动（店主未批搬家）——下面用源码针把这两块钉在原位。
{
  // 1) 裁定汇总 `f6a8ebf` §三.1 的字面示例逐字复现：汤底片段在品类句**内**顶替品类负片段，
  // 雨天平稳读作「粉面卖得俏，汤底走得快。」——是一句的两半，不是并列的第三句（排错就拼不出这句）。
  const say = (w, d, ramp = 0) => weatherTalk(scenarioOf(w, d), { RampDays: ramp }).join('');
  check('裁定 §三.1 逐字复现：雨天 + 平稳期 ⇒「今儿人少些。粉面卖得俏，汤底走得快。」（汤底顶替品类负片段）',
    say('rain', 10) === '今儿人少些。粉面卖得俏，汤底走得快。', say('rain', 10));

  // 2) §三.2 的字面示例：假期身份句在场时压掉泛化客流句，那一格让品类进来（假期四档同 0.8，负片段被汤底顶掉后独占）。
  //    考试周那一格不动（它的客流是 ×1.15 高，与身份句不冗余）——两句都逐字钉住，防止哪天把压制改成「所有身份句」。
  const CASES = [
    ['rain｜平稳期（§三.1 示例）', 'rain', 10, 0, '今儿人少些。粉面卖得俏，汤底走得快。'],
    ['rain｜开学周（客流高仍与品类并列两句）', 'rain', 3, 0, '今儿人多。粉面卖得俏，汤底走得快。'],
    ['rain｜考试周（§三.2「不动」）', 'rain', 20, 0, '考试周，学生吃得少些，备料悠着点。粉面卖得俏，汤底走得快。'],
    ['rain｜假期（§三.2 压客流句，汤底独占品类格）', 'rain', 25, 0, '放假了，学校空了大半。汤底走得快。'],
    ['sunny｜假期（五档同值 0.8 ⇒ 点名声明顺序第一个 MB）', 'sunny', 25, 0, '放假了，学校空了大半。丸子容易剩。'],
    ['sunny｜平稳期（无信号）', 'sunny', 10, 0, ''],
    ['heat｜平稳期（青菜与豆制品同值 1.2，取声明顺序第一个）', 'heat', 10, 0, '青菜卖得俏。'],
    ['sunny｜开学周·爬坡中（身份句在场，§三.2 只压假期不压爬坡）', 'sunny', 3, 3, '开业头几天，还没人知道你。今儿人多。'],
  ];
  const badCase = CASES.map(([name, w, d, r, want]) => {
    const got = say(w, d, r);
    return got === want ? null : `${name}：得到「${got}」期望「${want}」`;
  }).filter(Boolean);
  check('八格逐字对上：雨天四校历段 + 假期两型 + 无信号日 + 同值并列 + 爬坡中', badCase.length === 0, badCase.join(' / ') || '八格全对');

  // 3) 组句规则：上限两句（全表扫）；品类「一正一负」是一句，汤顶替的是那句里的负片段。
  let over = 0, digit = 0, soupRamp0 = 0, rainRamp0 = 0, soupRampOn = 0, rainRampOn = 0;
  for (const w of ['sunny', 'cloudy', 'rain', 'heat']) for (const d of [3, 10, 20, 25]) for (const r of [0, 3]) {
    const t = weatherTalk(scenarioOf(w, d), { RampDays: r });
    if (t.length > 2) over++;
    if (t.some(x => /\d|×/.test(x))) digit++;
    const soup = t.some(x => x.includes('汤底走得快'));
    if (w === 'rain') { if (r === 0) { rainRamp0++; soupRamp0 += soup ? 1 : 0; } else { rainRampOn++; soupRampOn += soup ? 1 : 0; } }
  }
  check('32 格组合（四天气 × 四校历段 × 爬坡两态）全守 ≤2 句、零数字零乘数', over === 0 && digit === 0,
    `超句 ${over}｜露数 ${digit}`);
  // 4) 原「32 格零出场」那根针按 §三.1 翻成正向验收：雨天四格（四个校历段、无爬坡）4/4 必出汤底句。
  // 可达性一翻类就该红：谁改了表序、阈值或系数表，这条先响，再重判，不许悄悄退回「空转」。
  check('雨天 + 四校历段（无爬坡）4 格全出汤底句（`f6a8ebf` §三.1 把「不可达」翻成「必出」）',
    rainRamp0 === 4 && soupRamp0 === 4, `${soupRamp0}/${rainRamp0} 格出句`);
  // 5) 残留那一格已裁定：§三.2 只点名「假期压掉泛化客流句」，爬坡那三天（开业头三天／升档后头三天）的身份句同样占格
  // ⇒ 雨天爬坡格还是被身份＋客流占满两句、汤底句落不了地。`077733c` §四 判乙**维持现状**（教学窗里客流句比汤底句重要，甲还会误伤开学周），
  // 这四格从「待裁」转成「规格记录」：改与不改，这根针都要先响。
  check('规格记录（`077733c` §四 判乙维持）：雨天 + 爬坡中四格仍不出汤底句——压制不扩到爬坡，教学窗里「今儿人多／人少些」优先',
    rainRampOn === 4 && soupRampOn === 0, `${soupRampOn}/${rainRampOn} 格出句`);
  // 顶替负片段用合成 scenario 验「只有负片段」那一型：同一组品类系数，只把 T 从 1.0 抬到 1.4。
  // 真表里凑不出这一型（雨天假期是「五档同值」，正片段也没有），所以负片段被顶掉后整格只剩汤底半句。
  const mk = (T, hi) => ({ trafficTotal: 1.0, avgJin: 1.0, T, catCoef: { MB: 1, MT: 1, VG: 0.8, BF: 1, NS: hi ? 1.4 : 1 } });
  const pair = weatherTalk(mk(1.0, true), { RampDays: 0 });
  const swap = weatherTalk(mk(1.4, true), { RampDays: 0 });
  const solo = weatherTalk(mk(1.4, false), { RampDays: 0 });
  check('顶替发生在品类句内部：T=1.0 ⇒「粉面卖得俏，青菜容易剩。」；T=1.4 ⇒「粉面卖得俏，汤底走得快。」——两句都还是一句，负的那半消失',
    pair.join('') === '粉面卖得俏，青菜容易剩。' && pair.length === 1
    && swap.join('') === '粉面卖得俏，汤底走得快。' && swap.length === 1,
    `T1.0 ${pair.length} 句「${pair.join('')}」｜T1.4 ${swap.length} 句「${swap.join('')}」`);
  check('无正片段时汤底独占品类格（雨天假期那一型）：合成态「青菜容易剩。」被顶成「汤底走得快。」',
    solo.join('') === '汤底走得快。' && solo.length === 1, `「${solo.join('')}」`);
  check('品类位取现成名（CAT[].name），阈值取工单那两个数：≥1.2 算俏、≤0.8 算剩（浮点卡线的那格靠 1e-9 过线）',
    catDeviation(scenarioOf('rain', 10)).lo.cat === 'VG' && catDeviation(scenarioOf('rain', 10)).hi.cat === 'NS'
    && WEATHER_TALK.length === 6 && ['身份', '身份', '身份', '客流', '客流', '品类'].join() === WEATHER_TALK.map(r => r.kind).join(),
    `雨天平稳取到 ${catDeviation(scenarioOf('rain', 10)).hi.cat} 正 / ${catDeviation(scenarioOf('rain', 10)).lo.cat} 负｜表 ${WEATHER_TALK.length} 行`);

  // 4) 出摊页瘦身：main.js 在浏览器模块顶层读 localStorage，Node 里 import 不了 → 照 §16 开场动画那节的先例走静态源码断言
  const mSrc = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const scenSrc = readFileSync(join(HERE, 'src/data/scenario.js'), 'utf8');
  const morningBody = (mSrc.match(/\n  morning\(\) \{[\s\S]*?\n  \},/) || [''])[0];
  const gone = ['state.Cash', 'state.DebtSupplier', 'state.CreditCap', 'rampCoef', '×', '今晨结转', 'grid2', 's-people', 's-debt']
    .filter(t => morningBody.includes(t));
  check('今晨结转整卡撤销：出摊页这一屏零现金／欠款／额度／乘数（顶栏是唯一一份），「今晨结转」这个标题与那格 grid2 一起消失',
    morningBody.length > 0 && gone.length === 0, gone.length ? `残留 [${gone.join(' ')}]` : 'morning() 体内九项全零命中');
  const entry = (morningBody.match(/<p><button[^>]*>昨日结转 ▸<\/button><\/p>/) || [''])[0];
  check('昨日结算收成一行入口：「昨日结转 ▸」这颗按钮带 data-nav="ledger"（走既有导航，落账本逐日账），行内零数字；第 1 天没有昨日 ⇒ 由 DailyReports 挡在门外',
    entry !== '' && /data-nav="ledger"/.test(entry) && !/\d/.test(entry)
    && /state\.DailyReports\.length\s*\?/.test(morningBody),
    entry ? '一行入口在场（第 1 天不出场）' : '一行入口没找到');
  check('明日预报并入天气卡（forecast 只剩这一处引用），天气与校历的现行标签照旧保留',
    /weatherIcon\(sc\.weather\.id\)\}\$\{calendarIcon\(sc\.calendar\.id\)\}\$\{sc\.label\}/.test(morningBody)
    && /明日 \$\{state\.today\.forecast\}/.test(morningBody)
    && (mSrc.match(/state\.today\.forecast/g) || []).length === 1, '标签 + 明日一行同卡');
  check('本单不许搬家的两块仍在原位：街面价签与柜里还剩逐字留在 morning() 里（店主未批）',
    morningBody.includes('${streetPanel()}') && morningBody.includes('柜里还剩'), '两块都还在出摊页');
  // 裁定 §三.4：教学屏那三个乘数一并改人话（与天气词句同语域）。开机画面是 boot()，它不在 morning() 体内，
  // 所以上面那根「零乘数」针刺不到它——这里单独把 boot() 钉住：整个函数体里不许再出现 × 或那三个数。
  const bootBody = (mSrc.match(/\n  boot\(\) \{[\s\S]*?\n  \},/) || [''])[0];
  const bootLeak = ['×', '0.4', '0.6', '0.8', '客流 ×'].filter(t => bootBody.includes(t));
  check('裁定 §三.4：boot 教学屏改人话——函数体内零乘号零那三个系数，「前 3 天没人气」换成与天气句同语域的一说',
    bootBody.length > 0 && bootLeak.length === 0 && bootBody.includes('新摊子头三天没人认得你，一天比一天有人来，第四天才算站稳。'),
    bootLeak.length ? `残留 [${bootLeak.join(' ')}]` : `boot() ${bootBody.length} 字，露数 0 项`);
  check('priceMods 的市场注记按裁定保留（本来就是人话，不进改人话清单）：两条注记逐字在 scenario.js 里，句内零乘号零系数',
    /note: '雨天晨采青菜涨价'/.test(scenSrc) && /note: '开学周全线小涨'/.test(scenSrc), '两条注记原样在场');
  // 5) 词句模块只读：不 import 引擎、不写状态、不落盘
  const talkSrc = readFileSync(join(HERE, 'src/data/weather-talk.js'), 'utf8');
  const talkCode = talkSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  check('派生只读：weather-talk.js 只 import constants（品类名与 SOLID_CATS），零引擎依赖、零状态写字段、零随机、不碰存档',
    !/from '\.\.\/engine|require\(/.test(talkSrc) && !/\bstate\.[A-Za-z_$][\w$]*\s*=[^=]/.test(talkCode)
    && !/Math\.random|localStorage|SAVE_VERSION/.test(talkCode),
    `import ${(talkSrc.match(/from '([^']+)'/) || [, ''])[1]}`);
}

// ── §27 配音挂载单 voice-qc-mount-20261105（Orange `e21520c`，成品由店主转交的 voice-events-pack-20261105.zip）──
// 单上验的是「49 句逐名对齐、48 过 1 补录」；Yellow 这侧的验收口径写在最后一行：
// 每事件挂载表在场、静音时零播、缺文件时事件可完整走完。三件事各钉一根，外加分支与判定两处对位。
// 与 §22 音频包同一套钉法：引用与文件成对、sha 逐件对账；画面与听感归店主真机（本层进不了 node 的 WebAudio）。
{
  const scriptRaw = readFileSync(join(HERE, '..', 'voice-events-script-20261104.md'), 'utf8')
    + readFileSync(join(HERE, '..', 'voice-full-script-20261106.md'), 'utf8');   // 两份冻结稿：11-05 批 49 句 + 11-06 全覆盖批 67 句
  const introNames = Object.values(VOICE_INTRO).flatMap(l => l.map(x => x.f));
  const resultNames = Object.values(VOICE_RESULT).flatMap(m => m.map(x => x.f));
  const regularNames = Object.values(VOICE_REGULAR).flatMap(m => m.map(x => x.f));
  const tableNames = [...introNames, ...resultNames, ...regularNames];
  const scriptNames = [...new Set(scriptRaw.match(/vo_[a-z0-9]+_\d\d/g) || [])];
  const asc = ls => ls.map(l => +String(l.f).slice(-2)).every((n, i, a) => i === 0 || n > a[i - 1]);
  // 18 句 ★新写结果句不挂：冻结稿里带 ★ 的那 18 句，数据里一句都没有原文可认（对应选项的 open[] 只有数值效果），
  // 而单上写死「文本对上哪句播哪句，不许按固定顺序猜」⇒ 只能静默。这张名单是留痕闸门：
  // Orange 往 events.js 补了原文、或改了挂载口径之后，名单与表若没同步变动，本针当场翻红（登记见总报「待裁」）。
  const UNMOUNTED = ['vo_fine_05', 'vo_fine_06', 'vo_early_02', 'vo_tab_04', 'vo_tab_05', 'vo_banquet_02', 'vo_banquet_03',
    'vo_complaint_03', 'vo_pot_02', 'vo_pot_03', 'vo_reserve_02', 'vo_reserve_03', 'vo_change_03', 'vo_chess_03', 'vo_chess_04',
    'vo_spoon_02', 'vo_spoon_03', 'vo_monthly_03'];
  check('挂载表在场且与两份冻结稿逐名对齐（49 + 67 = 116 句）：表内 98 句 = 出场 69（27 个事件）+ 结果 14 + 常客 15；'
    + '稿里有而表里没有的 18 句逐名等于「无原文锚点」名单，零重名、每个事件内部严格照稿面序号升序',
    Object.keys(VOICE_INTRO).length === 27 && tableNames.length === 98 && new Set(tableNames).size === 98
    && scriptNames.length === 116 && tableNames.every(f => scriptNames.includes(f))
    && UNMOUNTED.length === 18 && new Set(UNMOUNTED).size === 18
    && scriptNames.filter(f => !tableNames.includes(f)).sort().join() === [...UNMOUNTED].sort().join()
    && Object.values(VOICE_INTRO).every(asc) && Object.values(VOICE_RESULT).every(asc) && Object.values(VOICE_REGULAR).every(asc),
    `表 ${tableNames.length}（出场 ${introNames.length}／结果 ${resultNames.length}／常客 ${regularNames.length}）｜稿 ${scriptNames.length}｜无锚点 ${scriptNames.filter(f => !tableNames.includes(f)).length}`);

  // 成品对账：转码包的字节就是交付物，逐件 sha 进台账（11-05 批 48 件 + 11-06 批 66 件 = 114 件）。
  // 这一根是留痕闸门不是故障：谁换了文件、谁在包没到的句子上提前挂了名，这里当场翻红。
  // 补录件到位（vo_poach_02 于 11-06 到货）走的就是这条路：新 sha 进表才算挂完，表里的占号行一字未动。
  const VOICE_SHA = {
    'vo_buyout_01': '035a3f2a739f549c275caa0ebe47828433ab338a7d262f5a31ed8533f9796bd1',
    'vo_buyout_02': '94075b589974f2ded866ae171c236171f011797355c5eb960a013f65133cf8b9',
    'vo_buyout_03': '5ac6c339b10d44eb898f3d859b99f714ac610b70c4bf9d600aa83d4e588a7d68',
    'vo_buyout_04': '359c33558e357aa87e100348b92f8086fdd779ba0c6a7e54e414c02ecc437b60',
    'vo_buyout_05': '691bda3a3bb22e4709816da958258fd7fdb98ae6e2621312f1966ca0dabcebce',
    'vo_buyout_06': '04d568f764112f807380823402de97926ee5c0544e5b19707a9a4e1dd8c26124',
    'vo_buyout_07': '6915bcde6e876cd6eb0eb14ba578cca0e07e23be534d0ec4ebe83c56a9c48d53',
    'vo_copycat_01': '27889a2d6e0a07544c3e5579f1dd64d3910146588d125bff74cf91d1b6a58c72',
    'vo_copycat_02': 'ea30bb6e0f8aa75be3c20e9c04c511850cc04db9f4fc5facf5ed0b4e5d42924e',
    'vo_copycat_03': '457fb14937028f51cf771630f5b21d9c6b6f2a431254568cb26754f454eedfeb',
    'vo_copycat_04': '7b3c0e1b8e5318a1a18d5b7bc523b360cf4f16dd16aa14b9ef1de590cf35c8e6',
    'vo_copycat_05': '5b447d370d45eeac16c368a7156be548b088402289b573901d8dfc72c43e773f',
    'vo_flag_01': 'bb23ea85480532c5a86fea4da6f5d70f090c0cdf06562ac214658931067c9d2a',
    'vo_flag_02': 'b51b8a1142d2ced106b829a575cd627de6527c1d768a78b62b56c5aaf7736652',
    'vo_flag_03': 'f7d6b6204eb4260c203fa3eb584de2d071815a761d8433f4290249f53f0ad9c7',
    'vo_flag_04': '999e9be5ce5e5353ae40874935db9a57b82963144d23bb458b7f6ba8b9541ef6',
    'vo_flag_05': '6697a246fbef44f869047b80646523f3738136844d1a15b4813f4ed901cae36c',
    'vo_flag_06': '5d97357085325fadbe16c159c45329d9c49caa50e13b5386132f845f86b0b3bf',
    'vo_insp2_01': '23e5ed1b645d2dbd4dfce1fb15cad467bb81c865048147283e407bd0773b08e3',
    'vo_insp2_02': '5ed1e0070b4827eca4bb0dbc0ff6b7ca88d8261ba49e4b204f57968a0df33754',
    'vo_insp2_03': '6678c39116b74701542b76d08214bc1f9f8bb713a88c0ad5da2ab97c01b768bb',
    'vo_insp2_04': 'f4b63c3fc490ce6829f929039649e12f323ed91c6427c40f7f7b6e77f0da3958',
    'vo_insp_01': 'd897289345cafbeda4189ea0e2ec7ea2a488373148eece6bc441dbbe9436facb',
    'vo_insp_02': 'a039bbcbe40c1d511d4edcfe3f340e1c878b44356903e8dba2ecfe7e82ed3031',
    'vo_insp_03': '9e9570ee0c0e716e76ae5622fb87dd8ccbafc3fc06508f0b008dc25820bac24c',
    'vo_insp_04': '0bf140dfd4d69940a81bd0b1c1cde76946c506b2e2063fda93f950c92b966535',
    'vo_insp_05': 'e0501fee928dcbb69bffd63ad703c7d456449bf2e354c4bd073b7ac022c46e57',
    'vo_insp_06': '043cb9dee259571b51c783d0e91587f726d7c344aae864739e65c628347f1141',
    'vo_poach_01': 'cd005abd542397bda1c0352e4602e440cbaaa5e74e6721a083431865bd697f3f',
    'vo_poach_03': '698bb8de467a81a7950afc059a76210981c59994088154460e6ac4d895f44074',
    'vo_poach_04': 'fd131346e90c4e5ba5661e6668453720b5e20a70f476851fca78e58c649456c7',
    'vo_poach_05': 'ee56592b732b638c78b85d27698e4e6d1d06695552099a82070119c15ce2604a',
    'vo_pricewar_01': '00232277214397ff9180e47d0e3eedec4986dd2bcec95bef0309b0e6b8df2a86',
    'vo_pricewar_02': '09a4f5a8640a5ad643093232de7ef5a6756ce9ed83c75a00080a116635c3413e',
    'vo_pricewar_03': 'd09fff6487a77a492378e818aa6c9d34f43ebf816f57361d4801914ebb2329fd',
    'vo_pricewar_04': '88ee9ca28b6177014027761f9205906ee67669aaac1d51a6c664f1176e776a09',
    'vo_pricewar_05': 'f2ffa081273a2ea22ee49bf70cb4c63168d4eeddbf154f55e379cdb14c241462',
    'vo_promo_01': '2aaceceac6c7522dfb8ac1ef968f1f3a1c819aea642049852d3f7a6a9d548b50',
    'vo_promo_02': 'a25c6e4258eed24c2e397dad56838e35359fee0dcb1188a0c1a288cf47d5fc80',
    'vo_promo_03': 'c0b8d5cae7eb23b5a490a429adfbbd07d3480b90380fa6dc04fc04759619099b',
    'vo_promo_04': 'fcbeb25c24b9df24710d1be552143244e1a994200d8ded5598562c42c169af27',
    'vo_promo_05': '5aa0fa7455b42a93b0ff36af4c332b30b2127cca170e9f3ca3901321af54aa52',
    'vo_promo_06': '9f98729a55e3b5ee16eeadd8ca031995c897e8fc65646f89b1c8e963493e9d0e',
    'vo_return_01': 'cacb2f025dddeb5c464ba2f2722d4f4f8a8f614662d56b69d14d050507994d7c',
    'vo_return_02': '7990059b1feb85abcdc877c2b19c824e46635d2c04bb0ec14342fe770d0b307c',
    'vo_return_03': 'cfc38d80d32da6108c66f73ec412809e6a59a98f46b37771dcdea9e82d865c13',
    'vo_return_04': 'f23e04bfc9faf1ca33f9dd66078fa4b1ac282a57b83b5b30fe6ff5a35f2edd14',
    'vo_return_05': '61c6961200c88012629028d07fed04887b96e1ce0d99e6ff3180b54195cae226',
    // ── 11-06 全覆盖批 66 件（voice-full-pack-20261106.zip，Orange 转码后逐件 sha；单上 335.6 s / 约 3.1 MB）──
    'vo_banquet_01': 'c769a2d9c80406e80aed7b6fd79666ad7055b0e05d35b4f0f8bf0e0a6a84418c',
    'vo_banquet_02': 'ed377c117a01c6599f5cae0ebb01482351491ae91c5179abd931286be1abf3c7',
    'vo_banquet_03': '13c85069835d3dd8c6908cd75dca3dc8e4aae63d37dfcb69f12ad4a83389d2eb',
    'vo_blogger_01': '7010b88d46ea30d1768ef690787da7d44d5a47315903afd03114a4cbe0d44703',
    'vo_c01_01': '0781104c1ec174162c72cfe589c269c51b3654d6d20d52f9369b893460d77990',
    'vo_c01_02': 'd5ae6a30b6ca60b03dbc2cdb40242179deddeeae94810c734aa3f509eb38f3dc',
    'vo_c01_03': '5562e14be3faf95d4977d35ea0f50969b814450741b17e25b90173451722c0dd',
    'vo_c01_04': '695ccb9703136ecc2360b5fec6290e98d0429d8aa33e44f0d7d53a1191910dba',
    'vo_c01_05': 'ea6852f385fe991bb6ed975a5535e8165ca06aba14373c845f7b0850ad15f62a',
    'vo_c02_01': 'ce08107f0ae4ca4889e44e966e0e13470bc9f0bf3709260efd2506292d6c74ef',
    'vo_c02_02': '2d48bd30da64e73666a4eb7aefc7bd20b48da34f7b946d6897f12e3d9cb6f04e',
    'vo_c02_03': '879b57d714e9a83c1caba2bbd41bc6a3b9b275eb60d26dd0b5dd151828035a1e',
    'vo_c02_04': '56907f1a4ac235fd1984c6c8849d8387fedfcb088ec2534b3b0c94852e9d6600',
    'vo_c02_05': '9dd88fbc59dc6a21d557e40a9f1da52c950e5210a7a6b5fcac7fe977fcef43c5',
    'vo_c03_01': 'af9b1e7c4893e2432b76d79718577d10c336fffcabe35ca8ec495ccdaccab992',
    'vo_c03_02': '14366505e24dc4fa7e3eb9d5eb2f2ead1fab2f883ff9401ecea297c55bd95171',
    'vo_c03_03': 'ca3bdaa16a5f330631857f34482f5f94fde7df167a23a4e9345fae3141bcf77f',
    'vo_c03_04': 'd57bfb228121b76ac79e8970167c54481a0e193065a21eba88c397a1f95ebbd7',
    'vo_c03_05': '5a2efcdc490b6a77da4e84d81e9c4a169c7118f52f6e9abb79ae390cbbd0b538',
    'vo_canteen_01': '6d1f554632381445549865a8667eb166accf477f9b51e5fba092ce32f3030e49',
    'vo_change_01': '3417b34732f5f2fc51486b387e41a448d7197e84fce9a483eb011056e9517305',
    'vo_change_02': '5c2eca255d6233780625bde2ef0500401a1e3ca371195ff8a7f40e9c5eab9f51',
    'vo_change_03': 'eb3f8f69f788b7b64cf5a1fc6089aa604b7eb4e1f851cba18c8668148893e643',
    'vo_change_04': '1993e1d1a5995202aa5d63cb8a1fae7bfa57932a270a656ae702c50d18c88100',
    'vo_chess_01': '108ebb82525cec33646bd95bf07e3396ccf6161b4621eddc93a88065081595d3',
    'vo_chess_02': 'a195578b22af34a62875b7a6dfd0346b4df73d110f6bb7d972a3be29572a2a17',
    'vo_chess_03': '94a514eeb43f035bfe2fdc7270e7e2690f334bda0b050a3093ffee3c67dedb07',
    'vo_chess_04': '2d71fa12f314b7058c1a4788e78f9f7473e2d0c82d0af2db50e334c67a16f629',
    'vo_complaint_01': 'c72a53bc7ee46cf265eaae0c2b444f6477038e668dcb92a13051e62b115d2eb8',
    'vo_complaint_02': '8f264d1e68b2ca1b3bcef28a4f5a0cd4f97765298552e61b2e08933b4ec50df7',
    'vo_complaint_03': 'c9f65db4b6f61b30b1b70d0110bad7dc4d77ae248a617241e7624e982d421876',
    'vo_early_01': 'c6b4320349971d3f0039dfd2a887c9fc3280eb7f749d26fbb01df2db26355f0b',
    'vo_early_02': 'd676cd7e01303122a9e2403d2990100d9e6229781811415eb5fa77c131adb144',
    'vo_early_03': '99e6f583b61fe706aad934176b1c9c62933f33e925802c6e996298d8931c8c15',
    'vo_field_01': '9b2cf8b23757377ef94b39eb04be64958845e3513f7a1e3939d87a02ab6fd7c5',
    'vo_fine_01': 'e9c54c92dbdb890211a1839e8f47154d8d45d2765df1eec57fe9099745774810',
    'vo_fine_02': '59b184032e97822e6d0109201262986a2803da85d599dba85a6e49bae5d70cc3',
    'vo_fine_03': 'b48357de0d158de453cfb536d1f0f5e44754bf7b9299ce75d43987959c81a1d0',
    'vo_fine_04': '56faafed05c0299a767a79a2164b923e7d981083cf2c5612a6a89e355c8c2fd9',
    'vo_fine_05': '0dc43be02fe2a1c958d01294ac2b31853e7b7db80599ce74b7c20bc7bd346f27',
    'vo_fine_06': 'a8964ec8fa9a1c71b4cc196d66f1c4ccf255980d880af82aa1108bc49e30b18f',
    'vo_laoli_01': '0e91edbe326cd3ebd18fa7a21be2ff243920fb84dcb8b71b952a62a631e4a210',
    'vo_laoli_02': 'b1795d16693c2204fd3b04b645a13bcc8a6062014c3ef75af8dddd30d558ae79',
    'vo_laoli_03': 'edc6cd1acb092fef9492f92420ffdda5747197aa7e65d11e45e98de9a50125ad',
    'vo_laoli_04': '93ddb8c3e7d4df0688de4c8964cec71e17e25ec81016b876c315f9bdd352ab57',
    'vo_monthly_01': '18523a3b91354ab221342b3f8d5ffab015fd3463b8ed2ede87610f15d6c67429',
    'vo_monthly_03': 'bfc36472249599cb1681d4eb40085165f0ac07d7aa2cd73e83c6fa3b28f5c320',
    'vo_monthly_04': '2efb6d21dbca8a7c422fea6ad7d3158bc8471aa15ce44efef004caf9da2228b8',
    'vo_poach_02': '1b477f4d237bf8958aa6f9c8ccdc5a0baed626b0cee136bc0b499832674f51a3',
    'vo_pot_01': '773006168e3c93afebc1f47d515c0a3b41a5d3de87f7f5a1b0173190037a52ad',
    'vo_pot_02': 'facab133d30567e61de847553f4f280bd3de2896c422d5f57bff8cac58567c97',
    'vo_pot_03': '1a1e5974591ddedc759739fa44f6bedb214c93c8df0ab95c69bff7fe7ba5beef',
    'vo_priceup_01': '940dff4553aa67a5d430b1c78bf482147182e68d8b025bfce89e637a732b75b9',
    'vo_reserve_01': 'd4e2898b5ff540ada589d2438c592577878c541f15edf28f41e1cfe8df72e9b7',
    'vo_reserve_02': '4c50b11943ab266a1903c5187dd0dd874a0161f8801f847eeb03c62c545d1c8d',
    'vo_reserve_03': 'f47e80297b21c3e46fd8937add562b15a17f68591acb6d3755e36e75d3fe5092',
    'vo_spoon_01': '903f0a4d52a8ef86ea2d2955a856e2480ffdc7e4ce7c9dd67fdffe8c5cefc3f2',
    'vo_spoon_02': '7fa735860a3c2f14b946eb70788c8fdec650d633d1044690f638fa652650b961',
    'vo_spoon_03': '769dd906679a2b9068820870d2923894f802f5a3b967f22ba30951c36fe6d149',
    'vo_stockout_01': 'c53d610e7edd4f24ce3691a74f9c306bc385bd4453e8276b09f0542db864da1a',
    'vo_tab_01': '246ebb42be77e8569841c1ba8aa930c2eb7bcaac421a92ba9ad00d73d4f2a048',
    'vo_tab_03': '1361f848ab73552ba088289cb89611bdaaf7d93de5222c750a2640a6ea55cb3a',
    'vo_tab_04': '4f94da046a93e77a417f81e647ea8edd732f15c580a3b23765c75d7b19bed75a',
    'vo_tab_05': '6e03f9935d870ce2b9b33bb315ed91724aef36592f7644325af5b1bf21bca650',
    'vo_tag_01': '53faed2313312b1da7aa7fbfd10513112f40e809af951d22f5fd46d35e986d1b',
    'vo_tag_02': 'e3abae1e9823a4c5965d7e0c3b62559148b0286fedfa75345f5d452b0be04d1a',
  };
  const packDir = join(HERE, 'public/audio');
  const onDisk = readdirSync(packDir).filter(f => /^vo_[a-z0-9]+_\d\d\.ogg$/.test(f)).map(f => f.replace('.ogg', ''));
  const shaBad = Object.keys(VOICE_SHA).filter(f => {
    const p = join(packDir, `${f}.ogg`);
    return !statSync(p, { throwIfNoEntry: false }) || createHash('sha256').update(readFileSync(p)).digest('hex') !== VOICE_SHA[f];
  });
  const packBytes = onDisk.reduce((s, f) => s + statSync(join(packDir, `${f}.ogg`)).size, 0);
  const oldBatch = new Set(readFileSync(join(HERE, '..', 'voice-events-script-20261104.md'), 'utf8').match(/vo_[a-z0-9]+_\d\d/g) || []);
  const batchBytes = onDisk.filter(f => !oldBatch.has(f)).reduce((s, f) => s + statSync(join(packDir, `${f}.ogg`)).size, 0);
  const unmountedOnDisk = onDisk.filter(f => !tableNames.includes(f)).sort();     // 盘上有、表里没 ＝ 那 18 句无锚点的 ★新写句
  const missingOnDisk = tableNames.filter(f => !onDisk.includes(f)).sort();       // 表里占号、盘上没件 ＝ 两句待重录
  check('转码包逐件对账：仓内 114 件（48 + 66）sha 逐件对上两份转交包，盘上多出的 18 件逐名等于无锚点名单、'
    + '表里占号而没件的正是待重录两句（vo_monthly_02 / vo_tab_02）；包体 11-06 本批对上单上「约 3.1 MB / 335.6 s」',
    shaBad.length === 0 && Object.keys(VOICE_SHA).length === 114 && onDisk.length === 114
    && unmountedOnDisk.join() === [...UNMOUNTED].sort().join() && missingOnDisk.join() === 'vo_monthly_02,vo_tab_02'
    && batchBytes > 3.3e6 && batchBytes < 3.4e6 && packBytes > 5.0e6 && packBytes < 5.1e6,
    `114/114 sha 齐（对不上 ${shaBad.length}）｜未挂载 ${unmountedOnDisk.length}｜占号缺件 [${missingOnDisk.join(' ')}]｜本批 ${(batchBytes / 1048576).toFixed(2)} MiB｜全批 ${(packBytes / 1048576).toFixed(2)} MiB`);

  // 分支对位：直接跑挂载表那个函数（与 main.js 卡片挂载那一刻调的是同一支），拿 Rep 三档验赢档/中档/输档
  const WIN = voiceIntroLines('evt_s_return', { Rep: 60 }), MID = voiceIntroLines('evt_s_return', { Rep: 35 }), LOSE = voiceIntroLines('evt_s_return', { Rep: 20 });
  check('客流回流的分支对位：vo_return_04/05 只在 Rep≥50 赢档出声（单上钉死），02 跟赢档、03 跟中档（稿面每行自带留言档位），输档只剩旁白那一句',
    WIN.join() === ['vo_return_01', 'vo_return_02', 'vo_return_04', 'vo_return_05'].join()
    && MID.join() === ['vo_return_01', 'vo_return_03'].join() && LOSE.join() === 'vo_return_01'
    && ['evt_s_pricewar', 'evt_s_promo', 'evt_s_flag', 'evt_s_copycat', 'evt_s_buyout', 'evt_s_poach']
      .every(id => voiceIntroLines(id, { Rep: 0 }).length === VOICE_INTRO[id].length),
    `赢 ${WIN.length} 句｜中 ${MID.length} 句｜输 ${LOSE.length} 句｜其余六条无条件句组不受 Rep 影响`);

  const inspSrc = readFileSync(join(HERE, 'src/engine/inspection.js'), 'utf8');
  const inspIds = ['evt_s_insp', 'evt_s_insp2'];
  const notePair = Object.entries(VOICE_RESULT).filter(([id]) => inspIds.includes(id)).flatMap(([id, ms]) => ms.map(m => [id, m]));
  const orphanNote = notePair.filter(([, m]) => !inspSrc.includes(`note(state, '${m.note}')`));
  const dupTarget = resultNames.filter((f, i) => resultNames.indexOf(f) !== i);
  check('检查两条的结果句与 inspection.js 一一对应（按结果原文落点挂，不许顺序乱播）：八条键名逐字命中引擎的 note 原文、各指向唯一一句、句号全部 ≥02；出场只 01',
    orphanNote.length === 0 && dupTarget.length === 0 && notePair.length === 8
    && notePair.every(([, m]) => +m.f.slice(-2) >= 2)
    && VOICE_INTRO.evt_s_insp.length === 1 && VOICE_INTRO.evt_s_insp2.length === 1
    && ['检查合格，严队长的记录本合上了。', '检查整改：罚款 200 当场开单，明天客人少些。', '检查整改：罚款没凑齐，记在明天的客人头上。',
      '检查整改：限期整改。', '检查不合格：封条贴上摊名了。', '抽查过了，票据夹里没挑出错。', '抽查未过：罚款 100 当场入账。',
      '抽查未过、罚款没凑齐：严队长摆摆手，明天客人少些。']
      .every(n => [...VOICE_RESULT.evt_s_insp, ...VOICE_RESULT.evt_s_insp2].filter(m => m.note === n).length === 1),
    `8/8 原文对上（键名漂了 ${orphanNote.length} 条）｜一句对多档 ${dupTarget.length}｜限期整改那条死支照占一格`);

  const mainRaw = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const audioRaw = readFileSync(join(HERE, 'src/ui/audio.js'), 'utf8');
  const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]+\/\/[^\n]*$/gm, ' ');
  const mainSrc = stripComments(mainRaw), audioSrc = stripComments(audioRaw);
  const voiceLayer = (audioSrc.match(/const VOICE_TRIM[\s\S]*?export function audioStatus/) || [''])[0];
  check('静音键统管配音（回归针②「静音时零播」）：playVoice 与 voiceStep 两头都认 muted，setMuted 里与 BGM/锅声同收；配音层不另起上下文、不碰存档键',
    /if \(muted \|\| !Array\.isArray\(names\) \|\| !names\.length\) return;/.test(audioSrc)
    && /if \(muted\) \{ voiceSeq = \[\]; return; \}/.test(audioSrc)
    && /stopBgm\(\); stopBoil\(\); boilWanted = false; stopVoice\(\);/.test(audioSrc)
    && (audioSrc.match(/new AC\(|new (window\.)?AudioContext/g) || []).length === 1
    && !/SAVE_VERSION|STORAGE_KEY|guiju-m1-save|guiju-m1-flow|guiju-m1-phase/.test(voiceLayer),
    '静音早退两处（挂载 + 逐句）｜静音时整段收队列｜上下文仍只建一格');

  const flowSrc = [readdirSync(join(HERE, 'src/engine')).filter(f => f.endsWith('.js')).map(f => `src/engine/${f}`),
    'src/data/events.js', 'src/sim.js'].flat().map(f => stripComments(readFileSync(join(HERE, f), 'utf8'))).join('');
  check('缺文件/解不开＝静默走纯文字（回归针③「缺文件时事件可完整走完」）：坏件记进 voiceFail 后指针直接进下一句，配音层零 throw/零 console/零画面写字；'
    + '播放与挂载层不点任何一句的名（补录哪句不许写死），事件所在的引擎与数据层对配音零引用——音频根本挡不住流程',
    /while \(voiceI < voiceSeq\.length && voiceFail\[voiceSeq\[voiceI\]\]\) voiceI\+\+;/.test(audioSrc)
    && /else \{ voiceI\+\+; voiceStep\(\); \}/.test(audioSrc)
    && voiceLayer.length > 0 && !/throw|console\.(log|error|warn)|innerHTML|querySelector/.test(voiceLayer)
    && !/vo_[a-z0-9]+_\d\d/.test(audioSrc) && !/vo_[a-z0-9]+_\d\d/.test(mainSrc)
    && !/vo_|voiceIntro|voiceResult|playVoice/.test(flowSrc),
    `配音层体块 ${voiceLayer.length} 字｜audio/main 里具名句 0 处｜引擎+events+sim 里配音引用 0 处`);

  const pv = (mainSrc.match(/playVoice\(/g) || []).length, av = (mainSrc.match(/advanceVoice\(/g) || []).length,
    sv = (mainSrc.match(/stopVoice\(/g) || []).length, vi = (mainSrc.match(/voiceIntroLines\(/g) || []).length,
    vr = (mainSrc.match(/voiceResultLines\(/g) || []).length, vrl = (mainSrc.match(/voiceRegularLines\(/g) || []).length;
  check('挂载点逐处对上全覆盖单的口径（e2a6293）：出场三处（晚间弹层／晨间抽卡／newDay 情报抽取）＋结果两处（晨间当场、晚间结算前）'
    + '＋常客一处并进晨间那一队；点按推进仍一处、落定收声仍一处；推进排在 act 之前，王老板线入场那一下让位给动画不吃词',
    pv === 5 && av === 1 && sv === 1 && vi === 3 && vr === 2 && vrl === 1
    && mainSrc.includes('playVoice(voiceIntroLines(pendingEvent.id, state))')
    && mainSrc.includes('playVoice(voiceIntroLines(preEvent.id, state))')
    && mainSrc.includes('playVoice(voiceResultLines(ev.id, resultTexts(state)))')
    && mainSrc.includes('playVoice(voiceResultLines(evening.event.id, resultTexts(state)))')
    && !mainSrc.includes('voiceResultLines(judge.id')
    && mainSrc.indexOf('advanceVoice()') < mainSrc.indexOf('if (host) act(host)')
    && /if \(!\(skip && !skip\.classList\.contains\('fx-done'\)\)\) advanceVoice\(\);/.test(mainSrc),
    `playVoice ${pv}｜advanceVoice ${av}｜stopVoice ${sv}｜表读取 ${vi}+${vr}+${vrl}`);

  // 回归针④「情报条同日不重播」：四句只可能从 newDay 的抽取点出声；随每次交互重绘的那张采购屏面板里一个 playVoice 都没有。
  const newDayAt = mainSrc.indexOf('function newDay()');
  const preAt = mainSrc.indexOf('preEvent = morningPreEvent(state, rng)');
  const intelMount = mainSrc.slice(preAt, mainSrc.indexOf('saveGame(state);', preAt));
  const intelPanel = mainRaw.slice(mainRaw.indexOf('<h3>晨间情报</h3>'), mainRaw.indexOf('<h3>晨间情报</h3>') + 600);
  check('情报条同日不重播（单上「挂 newDay 抽取点、抽中才播、重渲染/重进页面不重播」）：playVoice 紧跟 morningPreEvent 且落在 newDay 体内，'
    + '采购屏那张情报面板零出声调用；四条 timing 全是 morning_pre，另两处挂载点按 timing 分池，永远读不到这四行',
    newDayAt >= 0 && preAt > newDayAt && /playVoice\(voiceIntroLines\(preEvent\.id, state\)\)/.test(intelMount)
    && intelPanel.length >= 600 && !/playVoice/.test(intelPanel)
    && ['evt_d_011', 'evt_d_stockout', 'evt_d_041', 'evt_d_042']
      .every(id => EVENT_BY_ID[id].timing === 'morning_pre' && voiceIntroLines(id, {}).length === 1),
    `抽取点到出声 ${intelMount.indexOf('playVoice')} 字内｜面板里 playVoice ${(intelPanel.match(/playVoice/g) || []).length} 处`);

  // 晨间那一处必须与「回来不重抽」同一条命（盘点 §6.1）：挂在 !orders.length 守卫里面，挪到外面就当场翻红。
  const guardAt = mainSrc.indexOf('if (!orders.length)');
  const guardBody = mainSrc.slice(guardAt, mainSrc.indexOf('saveGame(state);', guardAt));
  const morningQueue = 'playVoice([...voiceIntroLines(pendingEvent ? pendingEvent.id : null, state), ...regularVoiceLines()])';
  const queueMounts = (mainSrc.match(/playVoice\(\[\.\.\.voiceIntroLines/g) || []).length;
  check('晨间出场句与「回来不重抽」同一条命（§6.1）：并队那一处写在 openShop 的 !orders.length 守卫里面、且全仓只有这一处；'
    + '常客拍点句走同一支 playVoice 排队尾，分两次调用会被后一次 stopVoice 掐掉前一段',
    guardAt >= 0 && guardBody.includes(morningQueue) && queueMounts === 1
    && guardBody.indexOf(morningQueue) > guardBody.indexOf('drawHandOrders(state, rng)'),
    `守卫内 ${guardBody.includes(morningQueue) ? 1 : 0} 处｜全仓并队 ${queueMounts} 处`);

  // 日常结果句那一半（§6.3）：键必须逐字命中 events.js 的原文落点；18 句无锚点的 ★新写句一个都不许挂。
  const textSinks = new Set();
  const walkOps = v => {
    if (Array.isArray(v)) { v.forEach(walkOps); return; }
    if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) {
      if ((k === 'forcedComment' || k === 'dayNote') && typeof val === 'string') textSinks.add(val); else walkOps(val);
    }
  };
  for (const e of EVENTS) { walkOps(e.open || []); (e.actions || []).forEach(a => walkOps(a.open || [])); }
  const dailyPair = Object.entries(VOICE_RESULT).filter(([id]) => !inspIds.includes(id)).flatMap(([id, ms]) => ms.map(m => [id, m]));
  const dailyBad = dailyPair.filter(([, m]) => !textSinks.has(m.note));
  const merged = resultTexts({ today: { notes: ['n1'], forcedComments: ['f1'] } });
  check('日常事件的结果句同样只认原文：六条键逐字命中 events.js 的 forcedComment 原文（notes 那一头另两条检查事件已由 inspection.js 对上）；'
    + '查找集合 = notes + forcedComments 合并，resultTexts 只读不写；无锚点的 18 句不在任何一行里＝没有按选项顺序猜档的口子',
    dailyPair.length === 6 && dailyBad.length === 0
    && merged.join() === 'n1,f1' && resultTexts({}).length === 0 && resultTexts(undefined).length === 0
    && UNMOUNTED.every(f => !resultNames.includes(f)),
    `6/6 原文对上（键名漂了 ${dailyBad.length} 条）｜合并集合取数 ${merged.join('+')}｜无锚点 18 句在场外`);

  // 常客表（全覆盖单第五节 15 句）：认的是 customers.js 那行灰字本身，双向零差；留空的线不出声。
  const regPair = Object.entries(VOICE_REGULAR).flatMap(([id, ms]) => ms.map(m => [id, m]));
  const regBad = regPair.filter(([id, m]) => !(REGULAR_LINES[id] || []).includes(m.note));
  const regUnvoiced = Object.entries(REGULAR_LINES).flatMap(([id, ls]) => ls.map(l => [id, l])).filter(([id, l]) => !voiceRegularLines(id, l).length);
  check('常客 15 句认原文不认拍次：VOICE_REGULAR 每一个键逐字等于 customers.js 里那一行灰字，正文每一行也各对上唯一一句（双向零差）；'
    + '留空的 c04 没有行也就没有出声，同一位同一天只有一句（拍次推进在打烊后第 12 步）',
    regPair.length === 15 && regBad.length === 0 && regUnvoiced.length === 0 && !VOICE_REGULAR.c04
    && regPair.every(([id, m]) => voiceRegularLines(id, m.note).join() === m.f),
    `15 句成对（表外键 ${regBad.length}｜正文无句 ${regUnvoiced.length}）｜c04 行数 ${(VOICE_REGULAR.c04 || []).length}`);

  const voiceSrc = readFileSync(join(HERE, 'src/data/voice.js'), 'utf8');
  const voiceCode = stripComments(voiceSrc);
  check('挂载表是纯读派生层：voice.js 只 import dsl 那一支 evalCondition（与 evt_s_return 的 auto_branch 同一判据），零状态写字段、零随机、零存档键、零 SAVE_VERSION',
    (voiceSrc.match(/from '([^']+)'/g) || []).join() === "from '../engine/dsl.js'"
    && !/\bstate\.[A-Za-z_$][\w$]*\s*=[^=]/.test(voiceCode) && !/Math\.random|localStorage|SAVE_VERSION/.test(voiceCode)
    && /evalCondition\(l\.when, state\)/.test(voiceCode),
    `import ${(voiceSrc.match(/from '([^']+)'/) || [, ''])[1]}｜写字段 0｜随机 0`);

  // 浏览器那一层跑不进回归回路，源码针只钉形状；实际走位交给仓里这个可复跑探针（垫最小形状的 localStorage/document/AudioContext/fetch）
  const probeSrc = readFileSync(join(HERE, 'probe-voice-mount.js'), 'utf8');
  check('挂载层走查件在仓可复跑（node probe-voice-mount.js）：四段齐备——①逐句播＋缺文件跳句（poach_02 补录件到货即自动接成五句、表里占号行一字未动，'
    + 'tab／monthly 各跳过待重录的 02）②点按推进 ③全覆盖三处新挂载（晨间并队／结果句认原文／常客认原文不认序号）④静音零播；探针不 import 引擎，四段全绿才 exit 0',
    statSync(join(HERE, 'probe-voice-mount.js')).isFile()
    && probeSrc.includes("seqPoach === 'vo_poach_01 → vo_poach_02 → vo_poach_03 → vo_poach_04 → vo_poach_05'")
    && probeSrc.includes("seqTab === 'vo_tab_01 → vo_tab_03'") && probeSrc.includes("seqMonthly === 'vo_monthly_01'")
    && /advanceVoice\(\)/.test(probeSrc) && /setMuted\(true\)/.test(probeSrc)
    && /process\.exit\(c1 && c2 && c3a && c3b && c3c && c4 \? 0 : 1\)/.test(probeSrc)
    && !/from '\.\/src\/engine/.test(probeSrc),
    'probe-voice-mount.js 在场（四段判语全绿才 exit 0）');
}

// ── §28 排版批 task-ui-polish-20261105（Orange `71ab432`，店主 2026-11-05 批「嫁接法」）───────
// 第一档 1–6 是纯文案 / 样式，第二档第 7 条动结算屏的版面结构。四条形同虚设最容易出事的硬约束在这里钉成针：
// 色板变量零改动、面板语言（2px 墨线 + 硬边偏移阴影）照旧、骨不动（不新增导航 / 不改流程步骤 / 零数值与判定）、
// SAVE_VERSION 与存档结构不动；再加一条本批特有的：结算那三段的数一律从已落的明账里读，暗线一个字不进界面。
// 冻结内容（事件卡文案 / 常客台词 / 配音台词）没碰——本批新增的句子只住在新模块与 UI 层两处。
{
  const css = readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8');
  const mainSrc = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const bcastSrc = readFileSync(join(HERE, 'src/ui/settle-broadcast.js'), 'utf8');
  const bcastCode = bcastSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const has = c => new RegExp('\\.' + c + '(?![\\w-])').test(css);
  const rule = c => {
    const m = css.match(new RegExp('(?:^|\\n)' + c.replace('.', '\\.') + '[^\\n]*\\{([^}]*)\\}'));
    return m ? m[1] : '';
  };
  const SRC2 = join(HERE, 'src');
  const rel2 = f => f.slice(SRC2.length + 1).split('\\').join('/');

  // 1) 色板：单上点名的六枚变量在 :root 里逐字还在；本批新增的每一条规则只吃 var(--…)，零个新色值。
  //    写成「逐字 + 逐块扫十六进制」两路，防止哪天在牌面里顺手补一枚 #xxxxxx 把已签色板绕过去。
  const rootBlock = (css.match(/:root \{[\s\S]*?\n\}/) || [''])[0];
  const PALETTE = [['--cream', '#fbf3e4'], ['--ink', '#1b2a4a'], ['--tomato', '#e24b33'],
    ['--mustard', '#f2b233'], ['--teal', '#2e9e8f'], ['--paper', '#fffaf0']];
  const palBad = PALETTE.filter(([k, v]) => !rootBlock.includes(`${k}: ${v};`));
  const NEW_RULES = ['.windrow .lrowtop', '.wplate', '.pickrow', '.netplate', '.netv', '.bcast', '.grp', '.netchk', '.carry'];
  const hexInNew = NEW_RULES.filter(c => /#[0-9a-fA-F]{3,8}/.test(rule(c)));
  check('硬约束·色板零改动：六枚已签变量逐字在场，本批新增规则块里一个新十六进制色值都没写（改色板要 Orange 另下签）',
    palBad.length === 0 && hexInNew.length === 0, `缺格[${palBad.map(p => p[0]).join(' ') || '无'}]｜带新色[${hexInNew.join(' ') || '无'}]`);

  // 2) 面板语言：三段式那三块外壳必须是 2px 墨线 + 硬边偏移阴影，与全站同一套（嫁接法只借构图，不借皮）。
  const skinBad = ['.netplate', '.bcast', '.grp'].filter(c =>
    !/border: 2px solid var\(--ink\)/.test(rule(c)) || !/box-shadow: 4px 4px 0 var\(--ink-2\)/.test(rule(c)));
  check('硬约束·面板语言照旧：净利牌 / 播报条 / 折叠组三块都是 2px 墨线 + 4px 硬边偏移阴影（圆角半径也走现成 token，没造新的）',
    skinBad.length === 0, `不合规[${skinBad.join(' ') || '无'}]`);

  // 3) 硬约束·SAVE_VERSION 与存档：单上写「不动」，这里就把那一串字钉住；新模块连它的名字都不许出现。
  check('硬约束·SAVE_VERSION 仍是 v4.9.3-cal.2，播报模块全文不叫 SAVE_VERSION / localStorage，也不写任何 state 字段',
    SAVE_VERSION === 'v4.9.3-cal.2' && !/SAVE_VERSION|localStorage|sessionStorage/.test(bcastCode)
      && !/\bstate\b/.test(bcastCode), `SAVE_VERSION = ${SAVE_VERSION}`);

  // 4) 硬约束·骨不动（呈现层拆得干净那一面）：新模块零 import 零依赖，引擎与数据层认不得它。
  const bcastUsers = files.filter(f => /settle-broadcast|broadcastLine|inoutTotals|BROADCAST_POOL/.test(readFileSync(f, 'utf8')))
    .map(rel2).sort();
  check('硬约束·骨不动：settle-broadcast.js 零 import（借不到引擎也就改不动引擎），引用点只有 ui/main.js 一处，src/engine 与 src/data 全盲',
    (bcastSrc.match(/^import .*$/gm) || []).length === 0
      && !/\bMath\.random\b|\bDate\.now\b|setTimeout|setInterval/.test(bcastCode)
      && bcastUsers.join(' ') === 'ui/main.js ui/settle-broadcast.js',
    `引用点[${bcastUsers.join(' ')}]｜随机 0｜计时 0`);
  const settleAt = mainSrc.indexOf('settle() {');
  const settleSrc = mainSrc.slice(settleAt, mainSrc.indexOf('night() {', settleAt));
  check('硬约束·不新增导航与流程步骤：结算屏三段只用原生 <details> 折叠（零 JS），屏上控件还是那一颗 data-act="evening"，data-nav 一个没有',
    !/data-nav=/.test(settleSrc) && (settleSrc.match(/data-act="([a-z]+)"/g) || []).join() === 'data-act="evening"'
      && !/onclick|addEventListener|<script/.test(settleSrc)
      && (settleSrc.match(/<details class="grp">/g) || []).length === 2 && !/details[^>]*\sopen/.test(settleSrc),
    '两颗 <details>、默认全收起、尾部一颗按钮');

  // 5) 第 7 条验收加项·「进账合计 − 出账合计 = 净利，分毫不差」：拿 r16 那四路参考轨迹的每一日报表逐日核整数分。
  //    口径全取 dailyReport 已经落好的格（ledger.js:28/29/35 那三条恒等式），所以这不是自证：
  //    任何一格账目在批里被挪走或漏算，这里就会在某一天的某一路上红出来。
  let repDays = 0;
  const repBad = [];
  for (const [key, run] of Object.entries(runs)) {
    for (const rep of run.state.DailyReports) {
      repDays++;
      const { inCents, outCents } = inoutTotals(rep);
      if (inCents - outCents !== rep.netOpsCents) {
        repBad.push(`${STRATEGIES[key].name}D${rep.day}:${inCents}-${outCents}=${inCents - outCents}≠${rep.netOpsCents}`);
      }
    }
  }
  check(`第 7 条：进账合计 − 出账合计 = 经营净额，${repDays} 个营业日逐日逐分对平（批里没挪走一格账、也没多算一笔）`,
    repBad.length === 0, repBad.slice(0, 3).join(' / ') || `${repDays} 日全平`);

  // 6) 合计与屏上明细行同源：出账组里那三行食材 / 包装 / 添加剂相加必须就是引擎的 cogsCents，
  //    「折叠只藏行，不藏数」——小计收掉之后，玩家能核对的只剩明细，明细再加不回合计就是账目事故。
  const rowsBad = [];
  for (const run of Object.values(runs)) {
    const t = run.state.today, rep = run.state.DailyReports[run.state.DailyReports.length - 1];
    if (!t || !rep || !rep.cogsCents) continue;
    if (t.ingredientCents + t.packingCents + t.additiveCents !== rep.cogsCents) {
      rowsBad.push(`D${rep.day}:${t.ingredientCents}+${t.packingCents}+${t.additiveCents}≠${rep.cogsCents}`);
    }
  }
  check('出账组三行明细（食材 / 包装 / 添加剂）相加＝那一格 cogsCents：折叠把「成本合计」收掉了，剩下的行必须还能自己加回来说得的数',
    rowsBad.length === 0, rowsBad.slice(0, 3).join(' / ') || '四路末日均平');

  // 7) 结算三段顺序与明细行不丢：净利牌在最前、播报条紧随、两组折叠在后；屏上每一行的字面都从现版搬来。
  //    「成本合计 / 销售毛利」两格按折叠口径收掉（它们是中间小计不是明细行）；尾部那句定义话仍写「销售毛利」，
  //    那是账本逐日账里的字段名，本批不动它——列进第 5 条回报，等 Orange 判要不要跟着换字。
  const iNet = settleSrc.indexOf('class="netplate"');
  const iBcast = settleSrc.indexOf('class="bcast"');
  const iGrp = settleSrc.indexOf('<details class="grp">');
  const ROW_LABELS = ['卖出', '流水', '食材成本（卖掉的才算）', '隔夜报损', '固定支出', '人工 · 小豆日结',
    '试吃', '样品食材（今天从柜里出，不另掏现金）', '今晚自动还款', '现金', '还欠'];
  const labelGone = ROW_LABELS.filter(x => !settleSrc.includes(x));
  check('第 7 条版面：净利大字最先 → 播报行紧随 → 两组折叠在后；明细十一行一行不丢（卖出那格升进牌里，字与数照搬）',
    iNet >= 0 && iNet < iBcast && iBcast < iGrp && labelGone.length === 0
      && !/<td>成本合计<\/td>/.test(settleSrc) && !/<td>销售毛利<\/td>/.test(settleSrc)
      && settleSrc.includes('PACKING_NAMES[state.PackingTier]') && settleSrc.includes('sceneImg(\'settlement\''),
    `顺序[${iNet},${iBcast},${iGrp}]｜缺行[${labelGone.join('、') || '无'}]`);

  // 8) 结算屏用到的每个类都在 theme.css 里（§25 同一把尺：少一个类＝真机上一块没样式的哑文本）。
  //    例外只有 .roll：它是滚动的那一层挂钩，按追补单的裁定「终值由模板先写好、不写 CSS 关键帧」（theme.css:525），本来就没有样式。
  const sClasses = [...new Set((settleSrc.match(/class="([^"]*)"/g) || []).map(m => m.slice(7, -1))
    .flatMap(s => s.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)).filter(Boolean))];
  const sMissing = sClasses.filter(c => c !== 'roll' && !has(c));
  check('结算屏用到的每个类都在 theme.css 里（netplate / netk / netv / bcast / grp / netchk / carry 一枚不缺；.roll 除外，它按裁定只有 JS 挂钩没有样式）',
    sMissing.length === 0 && ['netplate', 'netk', 'netv', 'bcast', 'grp', 'netchk', 'carry'].every(has),
    `用[${sClasses.sort().join(' ')}]｜缺[${sMissing.join(' ') || '无'}]`);
  check('第 7 条①「放大」走现成字号 token：净利数字取 h1 那一档 26px，不新增字号；正负色仍由 .pos / .negv 决定（亏的日子不许涂绿）',
    /\.netv \{[^}]*font-size: 26px/.test(css) && !/\.netv \{[^}]*color:/.test(css),
    rule('.netv').trim());

  // 9) 播报池：四类 × 三句、句内只许中文与钱数（拉丁字母＝计数器名与字段名的入口，一刀切掉），择句确定性。
  const kinds = Object.keys(BROADCAST_POOL);
  const poolFlat = kinds.flatMap(k => BROADCAST_POOL[k]);
  const sample = { day: 3, revenueCents: 100000, writeoffCents: 0, soldOutText: '', inCents: 100000, outCents: 75000, netOpsCents: 25000 };
  const said = kinds.flatMap(k => BROADCAST_POOL[k].map(v => v.t({ ...sample, soldOutText: '粉面、汤底（每碗耗 2 份）', writeoffCents: 40000 })));
  const latin = said.filter(s => /[A-Za-z]/.test(s));
  const leaks = said.filter(s => /%|↑|↓|→|系数|乘数|概率|暗线|档位|Rep|Risk|AvgQ3|RegularStory/.test(s));
  const blanks = said.filter(s => !s || /NaN|undefined|null/.test(s));
  check('第 7 条②：模板池四类起步、每类三句、字面互不重复；十二句里零拉丁字母（Rep / Risk / COGS 这类字段名进不来）、零禁用措辞、无空句与 NaN',
    kinds.join(' ') === BROADCAST_KINDS.join(' ') && kinds.join(' ') === 'record soldout waste flat'
      && poolFlat.length === 12 && new Set(said).size === 12 && latin.length === 0 && leaks.length === 0 && blanks.length === 0,
    `池[${kinds.map(k => `${k}:${BROADCAST_POOL[k].length}`).join(' ')}]｜带字母[${latin.join('|') || '无'}]｜越线[${leaks.join('|') || '无'}]`);

  // 10) 择句只认当日明账，且同账必同句；优先级照单上的行文顺序（流水新高 > 卖断 > 报损 > 平平无奇）。
  const pick = (over, prevBest) => broadcastLine({ ...sample, ...over }, prevBest).kind;
  const order = [
    ['record', pick({ revenueCents: 100001 }, 100000) === 'record' && pick({ revenueCents: 100001, soldOutText: '粉面', writeoffCents: 90000 }, 100000) === 'record'],
    ['soldout', pick({ revenueCents: 100000, soldOutText: '粉面' }, 100000) === 'soldout'],
    ['waste', pick({ revenueCents: 100000, writeoffCents: 30000 }, null) === 'waste'],
    ['flat', pick({ revenueCents: 100000, writeoffCents: 29999 }, null) === 'flat'],
  ];
  const wrongOrder = order.filter(([, ok]) => !ok).map(([k]) => k);
  const once = broadcastLine(sample, null), twice = broadcastLine(sample, null);
  const threeDays = [1, 2, 3].map(d => broadcastLine({ ...sample, day: d }, null).text);
  check('择句确定性：优先级四类各验一次（第一天没有「上一笔」可比 ⇒ 不吹流水新高）；同账两次调用同一句；连三天各轮一遍变体（按 Day 取模，不掷随机）',
    wrongOrder.length === 0 && once.kind === twice.kind && once.text === twice.text
      && new Set(threeDays).size === 3 && threeDays.every(s => s === broadcastLine({ ...sample, day: 1 }, null).text || true),
    `优先级越界[${wrongOrder.join(' ') || '无'}]｜三日变体 ${new Set(threeDays).size}/3`);

  // 11) 第 1 / 2 条的实物：称重说明三种操作都写实话（点按 / 按住 / 捏出），包装那一行改的是排版不是价。
  check('第 1 条：称重说明三种操作各有一句实话（轻点添一小撮 + 按住不松 + 松手定格 + 捏出减量），不在屏上写死克数——步长是 +5 / +1 分段的，数字归单子右边那一格',
    mainSrc.includes('轻点一下添一小撮') && mainSrc.includes('按住不松') && mainSrc.includes('松手定格')
      && mainSrc.includes('捏出一点') && !/轻点[^\n]{0,12}5 克/.test(mainSrc.slice(mainSrc.indexOf('先亮单子'), mainSrc.indexOf('先亮单子') + 400)),
    '秤上一句不含写死的 5 克');
  check('第 2 条：定价页那一排加的是 .pickrow（整排可换行、按钮内不拆字），价格数字与 data-act 一个字没动',
    /\.pickrow \{ flex-wrap: wrap; \}/.test(css) && /\.pickrow button \{ white-space: nowrap; \}/.test(css)
      && (mainSrc.match(/class="row pickrow"/g) || []).length >= 1,
    '「普通餐盒 · 0.30 元/碗」那排挂 .pickrow');

  // 12) 第 3 / 4 条的留白账：市场那一格是本批新补（#marketDetail），「我的」页那一格沿的是已签的 --tab-clear 预留——
  //     单上「≥ 底部导航高度」这一条现版本来就满足（预留 190px + 安全区 > 导航盒 94px + 安全区），不许为它再叠一层。
  check('第 4 条：市场长列表末尾补了 56px（吸底汇总条不再压住最后一张档口卡）；第 3 条的 hub 预留量逐字未动，「我的」页不许叠第二层留白',
    /#marketDetail \{ padding-bottom: 56px; \}/.test(css)
      && /--tab-clear: calc\(var\(--tab-h\) \+ var\(--tab-pad\) \+ var\(--tab-gap\) \+ env\(safe-area-inset-bottom\)\)/.test(css)
      && /#app\.hasTabs \{ padding-bottom: calc\(96px \+ var\(--tab-clear\)\); \}/.test(css),
    '预留 = 96px + 74 + 10 + 10 + 安全区');

  // 13) 第 5 条：裁定 `3f3d868` §一 把整张表签了（1–7 照拟改落、8–11 四条「可改」全批、12 明确不改），
  //     待签件就此升正本。这一节从「钉未落码」换成「钉已签的字面逐字在场 + 旧字面一处不留」——
  //     字面针是防着以后有人借再一轮梗化把签过的话悄悄换掉；旧名残留（含注释）也在这把尺下红。
  const SIGNED_COPY = [
    '还没买过东西。头一天的单子都这样，比脸干净。',
    '今晚没人说话。摊布明儿还得洗。',
    '工时不够，这一套备不下来——先挪一格，或者把早起那格勾掉。',
    '昨天卖断过货。今天这一样多备一手。',
    '柜里的钱不会自己变多。整篮驳回，不自动减量——点「照手上的钱缩一缩」那一颗。',
    '往上没有档了——这条街两个铺子都是你的，你已经是这条街的摊主了。',
    '重摆一个摊', '掀帘子，开门', '不夹它就等于没烫，这一只碗只管眼前这一单。',
  ];
  const copyGone = SIGNED_COPY.filter(s => !mainSrc.includes(s));
  const KEEP12 = '再点一次就清：这一局的账（浏览器里那份也一起）没了，回到开屏。';
  const OLD_NAMES = ['按手上的钱缩量', '就照这一篮买', '重开一局', '开门营业', '不动它就等于没烫'];
  const staleNames = OLD_NAMES.filter(s => mainSrc.includes(s));
  const shrinkBtns = (mainSrc.match(/data-act="shrink">照手上的钱缩一缩</g) || []).length;
  const submitBtns = (mainSrc.match(/data-act="submit"(?: disabled)?>就这一篮，付钱</g) || []).length;
  check('第 5 条（裁定 §一）：签下的九处新字面逐字在场；第 12 条那句实话原样不动；五枚旧字面（含注释）在 main.js 里一处不留',
    copyGone.length === 0 && mainSrc.includes(KEEP12) && staleNames.length === 0,
    `缺[${copyGone.join('、') || '无'}]｜旧名残留[${staleNames.join('、') || '无'}]`);
  // 联动（裁定 §一 最后那条）：红字里引的按钮名必须和第 6 条改后的新名同一个字面，两处不许一新一旧。
  check('第 5×6 条联动（裁定 §一）：两颗 data-act="shrink" 都是「照手上的钱缩一缩」，付不齐红字里引的也是这一串；三颗 submit 都是「就这一篮，付钱」',
    shrinkBtns === 2 && submitBtns === 3 && mainSrc.includes('点「照手上的钱缩一缩」那一颗。')
      && !/点「按手上的钱缩量」/.test(mainSrc),
    `shrink ${shrinkBtns}/2｜submit ${submitBtns}/3`);

  // 14) 版权行（裁定 §一）：批准在署名行上方加一行中文说明，署名本体一字不动 ⇒ 两句同时逐字钉，且新行必须就在它上面。
  const CREDIT_TXT = 'Music: “Rubber Nod” by ziniyeons (niftyshelf.com/music/rubber-nod)';
  const CN_CREDIT = '<p class="muted">片头曲：Rubber Nod，作者 ziniyeons，可商用</p>';
  const meBody = mainSrc.slice(mainSrc.indexOf('  me() {'), mainSrc.indexOf('  prep() {'));
  const iCN = meBody.indexOf(CN_CREDIT);
  check('版权行（裁定 §一）：中文说明行在场且就在署名行上方，署名本体（曲名/作者/站点）逐字未动',
    iCN >= 0 && meBody.includes(CREDIT_TXT) && iCN < meBody.indexOf(CREDIT_TXT)
      && (meBody.match(/Rubber Nod/g) || []).length === 2,
    `说明行 @${iCN}｜署名 ${meBody.includes(CREDIT_TXT) ? '逐字在场' : '被改过'}`);

  // 15) 播报池两句更换（裁定 §三）：秤不走流水（比喻不成立）；三成不进句子（判据一挪句子就成了假话，
  //     且触发是「≥ 三成」）。被点名的两句连同「成数」这种比例措辞一律不许回来，新句按裁定原文逐字钉。
  const OLD_SAID = ['这杆秤走了', '三成还多'];
  const goneSaid = OLD_SAID.filter(s => bcastSrc.includes(s));
  const NEW_SAID = ['今天进账 ${yuan(r.revenueCents)} 元，是开张以来最多的一天。',
    '报损 ${yuan(r.writeoffCents)} 元——今天流水的一大块，倒柜里了。备菜那三站，明天挪一挪。'];
  const missingNew = NEW_SAID.filter(s => !bcastSrc.includes(s));
  const ChengRE = /[一两三四五]成/;
  const chengLines = poolFlat.filter(v => ChengRE.test(v.t({ ...sample, soldOutText: '粉面', writeoffCents: 40000 })));
  check('第 7 条两句更换（裁定 §三）：record 第 3 句与 waste 第 3 句按裁定原文落码；秤走流水与「三成还多」两句零残留；十二句里再没有任何成数措辞（判据挪了句子不能变假话）',
    goneSaid.length === 0 && missingNew.length === 0 && chengLines.length === 0,
    `旧句残留[${goneSaid.join('、') || '无'}]｜缺新句[${missingNew.length ? '有' : '无'}]｜带成数 ${chengLines.length}`);

  // 16) `WASTE_SHARE = 0.3` 签的口径（裁定 §三）：只是版面择句判据——只住在这一个模块，不进结算、不进存档、不进引擎。
  const shareRefs = files.filter(f => /WASTE_SHARE/.test(readFileSync(f, 'utf8'))).map(rel2);
  check('WASTE_SHARE = 0.3（裁定 §三 签）：引用点只有 settle-broadcast.js 一个文件，src/engine 与 src/data 全盲——它选句子，不参与任何账与判定',
    shareRefs.join(' ') === 'ui/settle-broadcast.js' && /const WASTE_SHARE = 0\.3;/.test(bcastSrc),
    `引用[${shareRefs.join(' ') || '无'}]`);

  // 17) 待签件升正本：三件里被签掉与被改掉的都已在代码落定，那张单不许再留「未落码」与被撤的两句——
  //     留着就是下一次有人照单抄回旧句。「现文」列里的旧按钮名是改动来源记录，不在禁列（旧名在屏上零残留由上一针管）。
  const draftPath = join(HERE, '..', 'draft-ui-copy-grooming-20261105.md');
  const draft = readFileSync(draftPath, 'utf8');
  const draftStale = ['本批未落码', '这杆秤走了', '占今天流水的三成还多'].filter(s => draft.includes(s));
  check('第 5 条待签件已按裁定 3f3d868 升为落码记录：正本指针指向裁定文件、被撤的两句与「未落码」口径零残留、落码表在位',
    statSync(draftPath).isFile() && draft.includes('3f3d868') && draft.includes('ruling-batch-h-20261105.md')
      && draftStale.length === 0 && draft.includes('## 五、落码状态')
      && draft.includes('今天进账 {revenue} 元，是开张以来最多的一天。')
      && draft.includes('报损 {writeoff} 元——今天流水的一大块，倒柜里了。备菜那三站，明天挪一挪。'),
    `残留[${draftStale.join('、') || '无'}]｜指针[${draft.includes('ruling-batch-h-20261105.md') ? '在' : '缺'}]`);

  // 18) 第 3 条关闭（裁定 §五）：现版预留已够，不叠第二层——第 12 节那条针逐字钉着预留量，这里补一句「不许再加」。
  const hubAt = mainSrc.indexOf('  me() {');
  const hubSrc = mainSrc.slice(hubAt, mainSrc.indexOf('  prep() {'));
  check('第 3 条按裁定 §五 关闭：「我的」这一屏没为底部留白加任何补丁（屏内零 padding-bottom / margin-bottom，叠第二层只会把空白推得更长）',
    !/padding-bottom|margin-bottom/.test(hubSrc), 'hub 屏内零底部留白补丁');

  // 19) 裁定 §四.2 把「按住连加」从首更待加项里划掉，原话是「任何人不得据旧工单删它」。
  //     第 11 节那把尺只钉屏上那句实话（删了功能、话还留着也可能），所以这里补一根钉代码的：延迟闸与 60→180 克/秒那条加速曲线逐字在场。
  //     速率两个数是 `signoff-weighing-tuning` 签过的，本批一字未动——针红了就说明有人照旧工单动了现成功能。
  check('裁定 §四.2：按住连加是现成功能、不是首更待加项——HOLD_DELAY = 150 与 60→180 克/秒加速曲线逐字在场（谁照旧工单「本批不做」删它，这根针先红）',
    /const HOLD_DELAY = 150;/.test(mainSrc)
      && /return 60 \+ 120 \* Math\.min\(1, \(held - HOLD_DELAY\) \/ 1000\);/.test(mainSrc)
      && /const TAP_GRAMS = 5;/.test(mainSrc) && /const FINE_GRAMS = 1;/.test(mainSrc)
      && /const FINE_GAP = 20;/.test(mainSrc),
    '按住闸 150ms｜速率 60+120｜分段 +5 / ±1（差 >20 克）');
}

// ── §29 复现与修复单 task-repro-20261105（Orange `3ac1907`）第一项：卖断名单「汤底」按基名归并 ──────
// 病灶由 Yellow §八十一 钉准、Orange 采信并定死修法：重复的不是同字面，而是同一件东西的两种说法
// （`CAT.SP.name`「汤底」与 F7 那句带 T 的注记），所以再加一层 `new Set` 修不好。
// 本节按单上的验收口径写针：① 双路径同入名单 ⇒ 该基名至多一条且留带 T 那条；② 其余五品类不误伤；
// ③ 归并只在拼装源头做一次，红字行与播报句读同一份；④ 归并层不造数、不读引擎（与第四项「不许自己发明一个数填上」同一口径）。
{
  const NAMES = ALL_CATS.map(c => CAT[c].name);      // 丸子、鲜肉、青菜、豆制品/菌菇、粉面、汤底
  const SOUP = CAT.SP.name;
  const solidNames = SOLID_CATS.map(c => CAT[c].name);
  const mainR = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const selloutSrc = readFileSync(join(HERE, 'src/ui/sellout.js'), 'utf8');
  const T = `${SOUP}（每碗耗 1.4 份）`;

  // 1) 单上点名的用例：汤底同时从两条路径进名单（品类名那格 + soupSoldOut 那格）——第 1 天什么都不称就是这个形状。
  const both = mergeSelloutNames([SOUP], T);
  const soupRows = both.filter(x => x.split('（')[0] === SOUP);
  check('§29 第一项①：汤底从两条路径同时进名单 ⇒ 归并后该基名至多一条，留的是带 T 注记那条（信息量大的）',
    soupRows.length === 1 && soupRows[0] === T, `名单[${both.join('、')}]`);

  // 2) 六品类同场卖断：归并只许动汤底那一格，其余五品类逐格原样、位置不变。
  const allSix = mergeSelloutNames(NAMES, T);
  const hurt = solidNames.filter(n => !allSix.includes(n));
  const moved = NAMES.slice(0, SOLID_CATS.length).filter((n, i) => allSix[i] !== n);
  check('§29 第一项①：六品类齐卖断时其余五品类不误伤——丸子/鲜肉/青菜/豆制品·菌菇/粉面原样在场且位次不动，只有汤底换成带 T 那条',
    allSix.length === 6 && hurt.length === 0 && moved.length === 0 && allSix[5] === T,
    `名单[${allSix.join('、')}]｜误伤[${hurt.join('、') || '无'}]｜移位[${moved.join('、') || '无'}]`);

  // 3) 穷举六品类的全部子集 × 注记有/无 ⇒ 输出恒为「基名唯一」，且条数恰好等于输入里不同基名的个数（归并不吞别的、也不多造）。
  const exBad = [];
  let exCount = 0;
  for (let mask = 0; mask < (1 << NAMES.length); mask++) {
    for (const soup of [null, T]) {
      const input = NAMES.filter((_, i) => mask & (1 << i));
      const pool = [...input, ...(soup ? [soup] : [])];
      const bases = pool.map(x => x.split('（')[0]);
      const got = mergeSelloutNames(input, soup);
      const gotBases = got.map(x => x.split('（')[0]);
      exCount++;
      if (new Set(gotBases).size !== gotBases.length || got.length !== new Set(bases).size) {
        exBad.push(`${mask}/${soup ? 'T' : '无'}`);
      }
    }
  }
  check(`§29 第一项①：${exCount} 个子集用例全过——名单里任何基名都不重复，条数恰等于输入的不同基名数（第 1 天零称重的形状也在内）`,
    exBad.length === 0, `越界用例[${exBad.slice(0, 4).join(' ') || '无'}]`);

  // 4) 只有注记那一条时不许凭空多出品类名那一格。
  const onlyNote = mergeSelloutNames([], T);
  check('§29 第一项①：只有 soupSoldOut（品类那格空）⇒ 名单就一条带 T 的说法，不另生一条裸「汤底」',
    onlyNote.length === 1 && onlyNote[0] === T, `名单[${onlyNote.join('、')}]`);

  // 5) 单上「红字行与播报 soldout 句共用同一份归并后的名单，不许两处各拼一份」：拼装点唯一 + 两处引用同源 + 旧拼法零残留。
  const assembles = (mainR.match(/mergeSelloutNames\(/g) || []).length;
  const joins = (mainR.match(/out\.join\('、'\)/g) || []).length;
  check('§29 第一项②：名单在 settle() 的拼装源头只归并一次（调用点 1 处），红字行与播报句读同一份 out（两处引用），旧那层 new Set 拼法零残留',
    assembles === 1 && joins === 2 && !/new Set\(\[\.\.\.t\.soldOutCats/.test(mainR)
      && mainR.includes('soldOutText: out.join(\'、\')') && mainR.includes('今天这些卖断了：${out.join(\'、\')}'),
    `拼装 ${assembles}/1｜引用 ${joins}/2`);

  // 6) 归并层的干净：零 import、零数字字面（T 由调用方给，它不许自己造）、引擎与数据层对它全盲。
  const selloutCode = selloutSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
  const rel29 = f => f.slice(join(HERE, 'src').length + 1).split('\\').join('/');
  const listUsers = files.filter(f => /mergeSelloutNames/.test(readFileSync(f, 'utf8'))).map(rel29).sort();
  // 结构用的 `[]`/`< 0`（下标与「找不到」哨兵）不算造数，其余任何数字字面都算——T 只能由调用方递进来。
  const noStruct = selloutCode.replace(/\[\d+\]/g, '[]').replace(/< 0/g, '<哨兵');
  check('§29 第一项·护栏：src/ui/sellout.js 零 import、零数字字面（T 由调用方给，它不许自己造）、不碰 state/scenario，引用点只有 ui/main.js 一处，src/engine 与 src/data 全盲',
    (selloutSrc.match(/^import .*$/gm) || []).length === 0
      && !/[0-9]/.test(noStruct)
      && !/\bMath\.random\b|\bDate\.now\b|setTimeout|setInterval|\bstate\b|scenario/.test(selloutCode)
      && listUsers.join(' ') === 'ui/main.js ui/sellout.js',
    `引用点[${listUsers.join(' ')}]｜带数字[${/[0-9]/.test(noStruct) ? '有' : '无'}]`);
}

// ── §30 视觉批 I task-ui-visual-20261105（Orange `f22590c`；店主拍板：首更三件整体提前到上线前）───────
// 三件全在呈现层：营业屏气泡 + 金色浮字 / 称重手感（刻度 · 色带 · 克数气泡 · 松手顿帧 · 整百 tick）/ 夜晚留言信箱三态。
// 单上最容易「顺手改出事」的四条硬约束逐条钉死：① 信号只许映射现成字段与现成台词池（不新造计数器、不改任何数值与判定）；
// ② 色板变量零改动；③ SAVE_VERSION 与存档结构不动（已读态只活当晚会话）；④ 新模块照播报模块的护栏规格，src/engine 与 src/data 对它全盲。
// 按住连加那三数（HOLD_DELAY / 60→180 克每秒曲线 / 分段 5·1·20）§28 已钉防删针，本批只在它外面加呈现——第 6 针把「tick 挂在封顶之后」再钉一次。
// 金色浮字单上列的三类里，本批只落得下两类（出餐 = 这一口自己的克数、卖断 = 现成 rowNote 串）：
// 出餐金额要 UI 侧另算一遍钱、连对加成要一个新计数器，两条都撞单上红线 ⇒ 按 ⊘ 回报，不编数（第 4 针钉「没编」）。
{
  const strip30 = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ').replace(/[ \t]+\/\/[^\n]*$/gm, ' ');
  const mainRaw30 = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const mainC30 = strip30(mainRaw30);
  const feedRaw30 = readFileSync(join(HERE, 'src/ui/feedfx.js'), 'utf8');
  const feedC30 = strip30(feedRaw30);
  const audio30 = readFileSync(join(HERE, 'src/ui/audio.js'), 'utf8');
  const css30 = readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8');
  const cut30 = (a, b) => { const i = mainRaw30.indexOf(a); return mainRaw30.slice(i, mainRaw30.indexOf(b, i)); };
  const rule30 = sel => {
    const m = css30.match(new RegExp('(?:^|\\n)' + sel.replace(/\./g, '\\.') + '\\s*\\{([\\s\\S]*?)\\}'));
    return m ? m[1].replace(/\/\*[\s\S]*?\*\//g, ' ') : '';
  };
  const kfProps = n => {
    const m = css30.match(new RegExp('@keyframes ' + n + ' \\{([\\s\\S]*?)\\n\\}'));
    if (!m) return ['<没有这条关键帧>'];
    const body = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\d+%/g, '');
    return [...new Set(body.match(/[a-z-]+(?=\s*:)/g) || [])].sort();
  };
  const has30 = cls => new RegExp('\\.' + cls + '(?![\\w-])').test(css30);
  const n30 = (re, s) => (s.match(re) || []).length;
  const rel30 = f => f.slice(join(HERE, 'src').length + 1).split('\\').join('/');
  const card30 = cut30('function orderCard(o) {', '\nfunction streetPanel');
  const envList30 = cut30('function envList(comments) {', '\nfunction toggleEnv');
  const night30 = cut30('  night() {', '\n  },');
  const NEWRULES = ['.ordercard', '.bub', '.bub.on', '.bub::before', '.float', '.gramrow', '.grambub',
    '.grambub.settle', '.weigauge', '.weigauge::before', '.weigauge .band', '.weigauge .mark',
    '.env', '.env.read', '.env.open', '.envt', '.envbody'];

  // 1) 信号白名单（单上验收加项原话「只许列出现成字段名」）。四类气泡一句都不许是这一层新写的词，也不许长出一个计数器。
  const praiseTxt = COMMENT_POOLS.portion[1], grumbleTxt = COMMENT_POOLS.portion[2], rushTxt = COMMENT_POOLS.soldout[1];
  check('§30 第一件·信号白名单四类逐字钉住：点单泡只读单子自己那两格（order.bowls + CAT[l.cat].name，附录 H.1 的具名单），夸／抱怨＝portion 池第 1、2 两句（与引擎结算那晚 signalFullCount／signalShortCount 抽的同一对、同一下标直取），催＝soldout 池第 2 句；三句台词零拉丁字母，这一层零 ++、零 +=、零 combo／streak（没有新计数器的落脚处）',
    orderSay({ bowls: 3, lines: [{ cat: 'MB' }, { cat: 'SP' }] }) === `3 碗 · ${CAT.MB.name}、${CAT.SP.name}`
      && praiseSay() === praiseTxt && grumbleSay() === grumbleTxt && rushSay() === rushTxt
      && [praiseTxt, grumbleTxt, rushTxt].every(s => !!s && !/[A-Za-z]/.test(s))
      && /^export const orderSay = order => `\$\{order\.bowls\} 碗 · \$\{order\.lines\.map\(l => CAT\[l\.cat\]\.name\)\.join\('、'\)}`;$/m.test(feedRaw30)
      && /^export const praiseSay = \(\) => COMMENT_POOLS\.portion\[1\];$/m.test(feedRaw30)
      && /^export const grumbleSay = \(\) => COMMENT_POOLS\.portion\[2\];$/m.test(feedRaw30)
      && /^export const rushSay = \(\) => COMMENT_POOLS\.soldout\[1\];$/m.test(feedRaw30)
      && !/\+\+|\+=|\bcombo\b|\bstreak\b/.test(feedC30) && !/\bcombo\b|\bstreak\b/.test(mainC30),
    `夸[${praiseTxt}]｜抱怨[${grumbleTxt}]｜催[${rushTxt}]`);

  // 2) 「催」这一泡的门禁只许多读一次引擎本来就在写的布尔位，不许为它新写一格。
  check('§30 第一件·催的门禁是现成字段不是新计数：判据 state.YesterdaySoldOut 由 src/engine/day.js 的 nightClose 在写（day.js:242，出摊页那句红字也在读），main.js 对它零赋值；它挂第一桌是因为该字段是「天」级、给不出「哪一桌在催」——这一取舍写进回报，不改信号源',
    /if \(state\.YesterdaySoldOut\) cands\.unshift\(\{ cust: orders\[0\]\.customerId, text: rushSay\(\) \}\);/.test(mainC30)
      && !/YesterdaySoldOut\s*=[^=]/.test(mainRaw30)
      && /state\.YesterdaySoldOut = /.test(readFileSync(join(HERE, 'src/engine/day.js'), 'utf8')),
    `main.js 引用 ${n30(/YesterdaySoldOut/g, mainRaw30)} 处（含注释）｜赋值 0 处`);

  // 3) 同屏上限就是单上那两个数，超限按「丢弃」不是「排队」——取舍本身进针，防止以后有人顺手改成缓冲。
  const fourTab = [1, 2, 3, 4].map(i => ({ cust: 'c' + i, text: 'T' + i }));
  const dupTab = takeBubbles([{ cust: 'a', text: '1' }, { cust: 'a', text: '2' }, { cust: 'b', text: '3' }]);
  check('§30 第一件·上限＝气泡 2 / 浮字 3（值只在 feedfx 定义一处，main.js 不另抄），越界即丢弃：四桌同报只上前两桌、第 3、4 桌当场没了；同一桌第二泡被去重（一桌一泡）；余量为零时一条不进；浮字五条只上前三条。「排队」不选是因为同一句话会在玩家看完这一单之后才冒出来，读起来像屏幕自己坏了——这一取舍写进回报',
    BUBBLE_MAX === 2 && FLOAT_MAX === 3
      && /^export const BUBBLE_MAX = 2;$/m.test(feedRaw30) && /^export const FLOAT_MAX = 3;$/m.test(feedRaw30)
      && n30(/BUBBLE_MAX|FLOAT_MAX/g, mainC30) === 0
      && takeBubbles(fourTab).map(c => c.cust).join(',') === 'c1,c2'
      && takeBubbles(fourTab, 0).length === 0
      && dupTab.map(c => c.cust + ':' + c.text).join(',') === 'a:1,b:3'
      && takeFloats([1, 2, 3, 4, 5].map(i => ({ in: i, text: 'x' }))).length === 3
      && takeFloats([1, 2], 0).length === 0,
    `四桌→[${takeBubbles(fourTab).map(c => c.cust).join(' ')}]｜同桌重复→[${dupTab.map(c => c.cust).join(' ')}]`);

  // 4) 金色浮字两处挂点：都挂在「已经发生的那一下」上，锚点是数字自己那一行；单上第三类（连对加成）与金额类拿不到合法源，本针钉「没编」。
  check('§30 第一件·浮字只两处挂载：出餐＝松手那一口的自有克数（挂在 lv- 那一行的父节点 .gavecell 上，字面就是屏上那个数），卖断＝抓按钮由活转死那一次现成的 rowNote 串（note），两处都在已有分支里、不加新判定；这一层零金额算式（出餐金额与连对加成按 ⊘ 回报，不在 UI 侧另算钱或新造计数器）',
    /showFloats\(app, \[\{ in: document\.getElementById\(`lv-\$\{g\.cust\}-\$\{g\.cat\}`\)\?\.parentElement, text: `\$\{gave\} 克` \}\]\);/.test(mainC30)
      && /if \(fxOn\(\) && wasAlive && gb\.disabled\) fx\.push\(\{ in: gb\.parentElement, text: note \}\);/.test(mainC30)
      && n30(/showFloats\(/g, mainC30) === 2
      && /\.gavecell, \.grabrow \{ position: relative; \}/.test(css30)
      && !/cents|Cents|流水|价|元/.test(feedC30),
    `挂载点 ${n30(/showFloats\(/g, mainC30)}/2｜feedfx 里钱字面 ${/cents|元/.test(feedC30) ? '有' : '无'}`);

  // 5) 消散与降级两条：动效自己摘自己（不留计时器），总闸只在营业屏那一格放行——降级屏连节点都不生成。
  check('§30 第一件·不留计时器也不留空壳：气泡跑完摘 .on 并清空文本、浮字跑完摘节点，两处都挂 onanimationend（全文恰好 2 处）；总闸 fxOn = 营业屏 && !reduceMotion()，调用点 6 处全在闸后，闸外零节点生成（单上「节流不许糊屏」在降级屏与低配机两处的落点）',
    /el\.onanimationend = \(\) => \{ el\.classList\.remove\('on'\); el\.textContent = '';\s*\};/.test(feedC30)
      && /el\.onanimationend = \(\) => el\.remove\(\);/.test(feedC30)
      && n30(/onanimationend/g, feedC30) === 2
      && !/setTimeout|setInterval|setImmediate|requestAnimationFrame/.test(feedC30)
      && /const fxOn = \(\) => phase === 'weigh' && !reduceMotion\(\);/.test(mainC30)
      && n30(/fxOn\(\)/g, mainC30) === 6,
    `onanimationend ${n30(/onanimationend/g, feedC30)}｜fxOn() ${n30(/fxOn\(\)/g, mainC30)}`);

  // 6) 单上「按住连加是现成功能，本批只许在它外面加呈现」——三根防删针照旧在场，整百 tick 挂在封顶那一次判定之后。
  const iBefore = mainC30.indexOf('const before = orderTotal(cust);');
  const iClamp = mainC30.indexOf('gramsBy[cust][cat] = Math.min(ceiling, Math.max(0, next));');
  const iTick = mainC30.indexOf('if (Math.floor(after / TICK_EVERY) !== Math.floor(before / TICK_EVERY)) weighTick();');
  check('§30 第二件·连加本体一根没动（HOLD_DELAY = 150、60 + 120 × min(1, …) 曲线、分段 5/1/20 逐字在场），整百 tick 排在 addGrams 末尾的封顶之后、读同一枚总克数：先夹再响，被封顶挡掉那一截（before === after）天然不响，不另立第二处判定',
    /const HOLD_DELAY = 150;/.test(mainC30)
      && /return 60 \+ 120 \* Math\.min\(1, \(held - HOLD_DELAY\) \/ 1000\);/.test(mainC30)
      && /const TAP_GRAMS = 5;/.test(mainC30) && /const FINE_GRAMS = 1;/.test(mainC30) && /const FINE_GAP = 20;/.test(mainC30)
      && /const TICK_EVERY = 100;/.test(mainC30)
      && iBefore >= 0 && iClamp > iBefore && iTick > iClamp,
    `顺序 before ${iBefore} → 封顶 ${iClamp} → tick ${iTick}`);

  // 7) 进度轨与判定同源（预检 F8 的教训：一处一个口径＝同屏不一致）。带沿就是已签的两个比例，别处再写一遍就是第四口径。
  //    「进带」这一枚 class 也一样：卡片模板里算一次 ok，.ordercard 与 .scale 两格都读它——
  //    只靠 refreshOrder 事后补挂的话，换屏/读档重绘那一刻秤面反色会带着另两处（描边转青绿、色带点亮）错位。
  check('§30 第二件·色带与「进带」判定读同一枚常量：FULL_SHARE = 0.98 与 OVER_SHARE = 1.1 各声明一次，剥掉注释后 main.js 全文 0.98 与 1.1 各只剩这一枚字面（判定式与 CSS 都不再抄数）；--band / --band2 由两枚常量除以纯几何 TRACK_SPAN = 1.25 算出，TRACK_SPAN 只决定尺子画多长、不参与任何判定；进带位在 orderCard 模板里算一次（gave > 0 && gave / want >= FULL_SHARE 全文只出现这一处），.ordercard 与 .scale 两枚 class 都吃同一个 ok',
    /const FULL_SHARE = 0\.98;/.test(mainC30) && /const OVER_SHARE = 1\.1;/.test(mainC30)
      && n30(/0\.98/g, mainC30) === 1 && n30(/(?<![\d.])1\.1(?![\d])/g, mainC30) === 1
      && /const enough = want > 0 && total \/ want >= FULL_SHARE;/.test(mainC30)
      && n30(/gave > 0 && gave \/ want >= FULL_SHARE/g, card30) === 1
      && /const ok = gave > 0 && gave \/ want >= FULL_SHARE;/.test(card30)
      && /class="panel ordercard\$\{ok \? ' ok' : ''\}"/.test(card30)
      && /class="scale\$\{ok \? ' ok' : ''\}"/.test(card30)
      && /Number\(g\[l\.cat\] \|\| 0\) >= l\.grams \* OVER_SHARE/.test(mainC30)
      && /--band:\$\{\(FULL_SHARE \/ TRACK_SPAN \* 100\)\.toFixed\(2\)\}%;--band2:\$\{\(OVER_SHARE \/ TRACK_SPAN \* 100\)\.toFixed\(2\)\}%/.test(mainRaw30)
      && /const TRACK_SPAN = 1\.25;/.test(mainC30) && !/0\.98|(?<![\d.])1\.1(?![\d])/.test(rule30('.weigauge')),
    `0.98 字面 ${n30(/0\.98/g, mainC30)} 处｜1.1 字面 ${n30(/(?<![\d.])1\.1(?![\d])/g, mainC30)} 处｜模板内进带式 ${n30(/gave > 0 && gave \/ want >= FULL_SHARE/g, card30)} 处`);

  // 8) 松手顿帧：单上写「≤150ms 的定格 + 回弹」，这里钉在 150ms 顶格；两条挂点共用同一支 settleBubble，判据是「这一口真落了克没有」。
  check('§30 第二件·顿帧 150ms 顶格且只动 transform：.grambub.settle 那一格逐字在场，@keyframes fxSettle 的属性名只有 transform（不掺 opacity，更不碰 width / left——动几何就会顶开秤面读数）；抓菜与捏出两条挂点共用 settleBubble（全文 3 处＝定义 1 + 调用 2），捏出那一支的判据是 orderTotal 前后不等，不新造触发条件',
    /\.grambub\.settle \{ animation: fxSettle 150ms ease-out 1; \}/.test(css30)
      && kfProps('fxSettle').join() === 'transform'
      && /settleBubble\(g\.cust\)/.test(mainC30)
      && /if \(fxOn\(\) && orderTotal\(p\.cust\) !== p\.total0\) settleBubble\(p\.cust\);/.test(mainC30)
      && n30(/settleBubble\(/g, mainC30) === 3,
    `fxSettle 属性[${kfProps('fxSettle').join(' ')}]｜settleBubble ${n30(/settleBubble\(/g, mainC30)} 处`);

  // 9) 动效只用 transform / opacity（单上与 STYLE-FLATPLUS 共有的纪律：动几何会顶开读数、动颜色会绕开色板）。
  check('§30·动效属性面：三套关键帧 fxBub / fxFloatUp / fxSettle 改写的属性只有 opacity 与 transform，位移一律 translate3d（走合成层，不触发布局）',
    kfProps('fxBub').join() === 'opacity,transform' && kfProps('fxFloatUp').join() === 'opacity,transform'
      && kfProps('fxSettle').join() === 'transform'
      && ['fxBub', 'fxFloatUp', 'fxSettle'].every(n => {
        const m = css30.match(new RegExp('@keyframes ' + n + ' \\{([\\s\\S]*?)\\n\\}'));
        return m && !/\b(width|height|left|top|margin|padding|color|background|box-shadow|filter)\s*:/.test(m[1]);
      }),
    `fxBub[${kfProps('fxBub').join(' ')}]｜fxFloatUp[${kfProps('fxFloatUp').join(' ')}]｜fxSettle[${kfProps('fxSettle').join(' ')}]`);

  // 10) 硬约束·色板零改动 + 面板语言照旧 + 一张新图都没生成（单上「画不动先回报，不许生成新图顶上」）。
  const root30 = (css30.match(/:root \{[\s\S]*?\n\}/) || [''])[0];
  const PAL30 = [['--cream', '#fbf3e4'], ['--ink', '#1b2a4a'], ['--tomato', '#e24b33'],
    ['--mustard', '#f2b233'], ['--teal', '#2e9e8f'], ['--paper', '#fffaf0']];
  const pal30Bad = PAL30.filter(([k, v]) => !root30.includes(`${k}: ${v};`));
  const hex30Bad = NEWRULES.filter(sel => /#[0-9a-fA-F]{3,8}/.test(rule30(sel)));
  const url30Bad = NEWRULES.filter(sel => /url\(/.test(rule30(sel)));
  const skin30Bad = ['.bub', '.grambub', '.weigauge', '.env'].filter(sel => !/border: 2px solid var\(--ink\)/.test(rule30(sel)));
  check('硬约束·色板零改动 + 面板语言照旧 + 零新美术：六枚已签变量逐字在场，本批 17 条新规则块里零个十六进制色值、零个 url(...)（刻度线走 repeating-linear-gradient、泡尖走 border 三角、气泡与信封都是 var(--…)），四块新牌面全是 2px 墨线、信封沿用 4px 硬边偏移阴影；这一层零 <img> 零背景图 ⇒ 三件都没生成新素材',
    pal30Bad.length === 0 && hex30Bad.length === 0 && url30Bad.length === 0 && skin30Bad.length === 0
      && /box-shadow: 4px 4px 0 var\(--ink-2\)/.test(rule30('.env'))
      && !/<img|url\(/.test(feedC30)
      && !/<img|background-image/.test(envList30),
    `缺格[${pal30Bad.map(p => p[0]).join(' ') || '无'}]｜带新色[${hex30Bad.join(' ') || '无'}]｜带 url[${url30Bad.join(' ') || '无'}]｜不合规[${skin30Bad.join(' ') || '无'}]`);

  // 11) 硬约束·SAVE_VERSION 与存档结构不动：信封三态只活在一格会话变量里，新一天归零，绝不落盘。
  const saveFlow30 = cut30('function saveFlow() {', '\nfunction restoreFlow');
  const restoreFlow30 = cut30('function restoreFlow() {', '\n// 每一天的前段草稿从引擎当前值起');
  const KEYSET = 'guiju-m1-audio guiju-m1-flow guiju-m1-intro guiju-m1-phase guiju-m1-save';
  const keySet30 = [...new Set(files.flatMap(f => readFileSync(f, 'utf8').match(/guiju-m1[a-z-]*/g) || []))].sort().join(' ');
  check('硬约束·SAVE_VERSION 仍是 v4.9.3-cal.2，已读态一个字不进档：envState 只在 main.js 里活（6 处＝声明 1 / 信封表读 3 / 点选写 1 / 新一天归零 1），saveFlow 与 restoreFlow 两段的键名单逐字未动（…scalePick 收尾，两段里 env 字样零命中）；localStorage 写入点仍只有 PHASE_KEY 与 FLOW_KEY 两处，src 全仓的存档键集合还是已签那五枚，envKey 只是会话内的表键',
    SAVE_VERSION === 'v4.9.3-cal.2' && keySet30 === KEYSET
      && n30(/localStorage\.setItem\(/g, mainRaw30) === 2
      && !/env/i.test(saveFlow30) && !/env/i.test(restoreFlow30)
      && /prepPick, wakePick, packingPick, flavorPick, additivePick, tastingPick, scalePick,/.test(saveFlow30)
      && /let envState = \{\};/.test(mainC30) && n30(/envState/g, mainC30) === 6
      && /envState = \{\};/.test(cut30('function newDay()', '\nfunction '))
      && !/localStorage|sessionStorage/.test(feedC30)
      && envKey(3, 5) === '3:5',
    `键集合[${keySet30}]｜setItem ${n30(/localStorage\.setItem\(/g, mainRaw30)}`);

  // 12) 第三件·压平置后只动屏上读序：纯函数 + 输入数组不被改写（引擎那份 comments 是账，呈现层不碰）。
  const marks30 = ['read', undefined, 'read', 'open'];
  const frozen30 = [...marks30];
  const pool30 = Object.values(COMMENT_POOLS).flat();
  check('§30 第三件·置后不动引擎数组、标题不改写正文：envOrder(["read",空,"read","open"]) ⇒ [1,3,0,2]（未读在前、两组各保持先来顺序），输入逐字不变；全未读＝原序、全已读＝原序（稳定不跳）；台词池 51 句每一句的标题都是正文的前缀且 ≤20 字（截的是显示行，正文一个字没改），首句不成话的「还行吧。」整条上标题而不是截半截',
    envOrder(marks30).join(',') === '1,3,0,2' && marks30.join('|') === frozen30.join('|')
      && envOrder([undefined, undefined]).join(',') === '0,1'
      && envOrder(['read', 'read', 'read']).join(',') === '0,1,2'
      && pool30.length === 51
      && pool30.every(s => { const t = envelopeTitle(s); return t.length > 0 && t.length <= 20 && s.startsWith(t); })
      && envelopeTitle('还行吧。') === '还行吧。',
    `读序[${envOrder(marks30).join(',')}]｜池 ${pool30.length} 句｜越界标题 ${pool30.filter(s => { const t = envelopeTitle(s); return !(t.length > 0 && t.length <= 20 && s.startsWith(t)); }).length} 句`);

  // 13) 第三件·只换壳子不动内容：底部按钮与流程顺序照旧、正文仍走已签的 .comment / .hot 两层皮、旧拼法零残留。
  check('§30 第三件·壳子换了内容不换：夜晚屏底部三颗按钮逐字还是 next / quit / sellout 那一串（顺序也没动），空状态那句批H 文案原样在场，正文一格没改写（esc(c.text) + class="envbody comment" 与 .hot 沿用现成皮），旧那套 t.comments.map 直出 div 的拼法零残留；信封是 <button>（键盘与读屏走现成焦点导航），挂载点全文唯一一处 data-act="env"，置后不靠 sort／reverse',
    (night30.match(/data-act="[a-z]+"/g) || []).join(' ') === 'data-act="next" data-act="quit" data-act="sellout"'
      && night30.includes('今晚没人说话。摊布明儿还得洗。')
      && !/t\.comments\.map\(/.test(mainRaw30)
      && !/\.sort\(|\.reverse\(/.test(envList30)
      && /<span class="envbody comment\$\{c\.kind === 'hot' \? ' hot' : ''\}"\$\{open \? '' : ' hidden'\}>\$\{esc\(c\.text\)\}<\/span>/.test(mainRaw30)
      && n30(/data-act="env"/g, mainRaw30) === 1
      && /<button class="env\$/.test(mainRaw30)
      && /\.envbody\[hidden\] \{ display: none; \}/.test(css30)
      && /case 'env': return toggleEnv\(d\.n\);/.test(mainC30),
    `尾部[${(night30.match(/data-act="[a-z]+"/g) || []).join(' ')}]｜env 挂载点 ${n30(/data-act="env"/g, mainRaw30)} 处`);

  // 14) 一桌一泡是结构保证（每卡一个槽位），且装饰层不进读屏、不吃点击。
  check('§30 第一件·一桌一泡靠结构、不靠计数：#bub- 槽位只在 orderCard 里生成（全文一处），每张卡一个，feedfx 按 `#bub-` + 顾客号取那一格；气泡与进度轨都 aria-hidden（读数交给秤面大字与 .dual 那行），浮字与气泡都 pointer-events: none（单上「不许堆叠遮住操作区」——浮层绝不吞点击）',
    n30(/id="bub-/g, mainRaw30) === 1
      && /<span class="bub" id="bub-\$\{o\.customerId\}" aria-hidden="true"><\/span>/.test(mainRaw30)
      && /class="weigauge" id="wg-\$\{o\.customerId\}" style="\$\{gaugeVars\(o\.customerId, gave\)\}" aria-hidden="true">/.test(mainRaw30)
      && n30(/aria-hidden="true"/g, card30) === 2
      && /pointer-events: none/.test(rule30('.float')) && /pointer-events: none/.test(rule30('.bub'))
      && /root\.querySelector\('#bub-' \+ c\.cust\)/.test(feedC30),
    `bub 槽位 ${n30(/id="bub-/g, mainRaw30)} 处｜卡片内 aria-hidden ${n30(/aria-hidden="true"/g, card30)} 处`);

  // 15) 硬约束·骨不动（护栏照播报模块那一版）：feedfx 只从 src/data 读现成池，借不到引擎也就改不动引擎。
  const feedUsers = files.filter(f => /feedfx|showBubbles|showFloats|orderSay|praiseSay|grumbleSay|rushSay|envKey|envOrder|envelopeTitle|BUBBLE_MAX|FLOAT_MAX|takeBubbles|takeFloats|visibleBubbles|visibleFloats/
    .test(readFileSync(f, 'utf8'))).map(rel30).sort();
  const feedImports = feedRaw30.match(/^import .*$/gm) || [];
  check('§30·硬约束·骨不动：src/ui/feedfx.js 的两条 import 全部来自 src/data（台词池与品类名，只读），零条来自 src/engine，全文不叫 state / localStorage / SAVE_VERSION、不掷随机、不建计时器；引用点只有 ui/main.js 一处，src/engine 与 src/data 对它全盲 ⇒ 它拿不到账，也就动不了账',
    feedImports.length === 2 && feedImports.every(s => /from '\.\.\/data\//.test(s))
      && !/from '\.\.\/engine\//.test(feedRaw30)
      && !/\bMath\.random\b|\bDate\.now\b|setTimeout|setInterval|\bstate\b|localStorage|SAVE_VERSION/.test(feedC30)
      && feedUsers.join(' ') === 'ui/feedfx.js ui/main.js',
    `引用点[${feedUsers.join(' ')}]｜import[${feedImports.map(s => (s.match(/'([^']+)'/) || [])[1]).join(' ')}]`);

  // 16) 整百那一声音的取材（单上「复用现成音效池，回报写明挑了哪件；不许新录、不许外找」）：挑点按那一件 tap-A-softclick。
  check('§30 第二件·整百 tick 复用现成音效不新录：weighTick = sfx(\'tap\') 一支挂在 audio.js（素材还是已签的 tap-A-softclick，Kenney click_002），RATE 表里没有多出一个 tick 键、SFX_FILES 名单没多一件、GENERIC_YIELD 仍是已签那八件；main.js 里 sfx(\'tap\') 仍零处、tapEdge() 仍一处 ⇒ 裁定 d619ed6「通用点按只剩一个入口」那根针照旧成立。不选 coin 的理由进回报：那一件的挂载语义是「单笔收款」，秤上过一格没有钱进出',
    /^export const weighTick = \(\) => sfx\('tap'\);$/m.test(audio30)
      && !/tick\s*:/.test(audio30)
      && /const GENERIC_YIELD = new Set\(\['exact', 'pop', 'error', 'stamp', 'level', 'paper', 'cash', 'coin'\]\);/.test(audio30)
      && n30(/sfx\('tap'\)/g, mainC30) === 0 && n30(/tapEdge\(\)/g, mainC30) === 1
      && n30(/weighTick/g, mainC30) === 2,
    `weighTick 声明 1｜main 引用 ${n30(/weighTick/g, mainC30)}（import + 调用）`);

  // 17) 降弹窗范围照单：常规反馈走气泡/浮字，屏上没有新增模态；特殊事件弹层与常客拍点的呈现一个字没动。
  check('§30 第一件·降弹窗只降「常规反馈」这一档：main.js 全文 class="overlay 仍只 1 处（eventOverlay 那一层，单上写「特殊事件与常客拍点保持现版呈现，不许动」），本批没造第二层模态、没往 document 里插 div；常规反馈的出口是气泡 3 处挂载 + 浮字 2 处挂载',
    n30(/class="overlay/g, mainRaw30) === 1
      && /function eventOverlay\(\)/.test(mainC30)
      && n30(/showBubbles\(/g, mainC30) === 3
      && !/createElement\('div'\)|insertAdjacentHTML/.test(mainC30 + feedC30),
    `overlay ${n30(/class="overlay/g, mainRaw30)}｜气泡挂载 ${n30(/showBubbles\(/g, mainC30)}｜浮字挂载 ${n30(/showFloats\(/g, mainC30)}`);

  // 18) 两屏逐类覆盖（§25 同一把尺：少一个类＝真机上一块没样式的哑文本）。
  // 尾部带 `-` 的那一枚是插值前缀（class="ava ava-${顾客号}" 剥掉 ${…} 剩下的半截），不是类名，样式在 .ava 那一格。
  const cls30 = seg => [...new Set((seg.match(/class="([^"]*)"/g) || []).map(x => x.slice(7, -1))
    .flatMap(s => s.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)).filter(x => x && !x.endsWith('-')))];
  const used30 = [...cls30(card30), ...cls30(envList30)];
  const miss30 = used30.filter(x => !has30(x));
  check('§30 验收·两张屏用到的每个类都在 theme.css 里：ordercard / bub / gramrow / grambub / weigauge / band / mark / env / envt / envbody 一枚不缺，正文皮 comment 与 hot、浮字皮 float 与 num 也在场（缺一个类就是一块没样式的哑文本）',
    miss30.length === 0 && ['ordercard', 'bub', 'gramrow', 'grambub', 'weigauge', 'band', 'mark',
      'env', 'envt', 'envbody', 'comment', 'hot', 'float', 'num'].every(has30),
    `用[${used30.sort().join(' ')}]｜缺[${miss30.join(' ') || '无'}]`);
}

// ── §31 UI 小修单 task-ui-fix-20261106 第一项（Orange `f9ed233`；口径店主已批）夜晚留言展开态去重 ──────
// 走查实证（公网现版两局同形）：留言点开后同一句出现两遍——标题行一遍、下方内框正文再一遍，短留言两者只差句末标点。
// 单上口径逐条钉死：① 判重在渲染层；② 归一 = 去首尾空白与尾标点，全等才叫重复；③ 重复 ⇒ 展开态只留正文那一份（标题行不渲染）；
// ④ 正文长于标题的长留言维持标题 + 正文原样，不许误伤；⑤ 信封视觉不做，现有卡片折叠形态（封口 / 压平两态的标题行）一字不动。
// 加针按单上原话办：一短一长两条留言，断言短留言展开态那句话只出现一次、长留言标题与正文都在。
// 渲染器不另抄一份逻辑——把 main.js 里 row 那一段函数体原样交给 Function，只从外面喂它闭包拿到的四样（c / i / envState / key），
// 所以模板一改、这一组针就跟着改；仓里没有 DOM 库（devDeps 只有 vite），故 DOM 真值的复验走浏览器读数，写在 delta §八十四。
{
  const mainRaw31 = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const feedRaw31 = readFileSync(join(HERE, 'src/ui/feedfx.js'), 'utf8');
  const cssRaw31 = readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8');
  const cut31 = (a, b) => { const i = mainRaw31.indexOf(a); return mainRaw31.slice(i, mainRaw31.indexOf(b, i)); };
  const envList31 = cut31('function envList(comments) {', '\nfunction toggleEnv');
  const HEAD31 = 'const row = (c, i) => {';
  const rowStart = envList31.indexOf(HEAD31);
  const rowBody = envList31.slice(rowStart + HEAD31.length, envList31.indexOf('\n  };', rowStart));
  const key31 = i => envKey(7, i);                       // 表键与画面同一个函数，第 7 天只是不让它撞上真存档
  const esc31 = s => String(s);                          // 恒等转义：下面第一条针先钉住台词池 51 句零个 HTML 待转义字符
  let row31 = null, err31 = '';
  try { row31 = new Function('c', 'i', 'envState', 'key', 'esc', 'envelopeTitle', 'isSameSay', rowBody); }
  catch (e) { err31 = String((e && e.message) || e); }
  const draw31 = (text, st) => row31 ? row31({ text }, 0, { '7:0': st }, key31, esc31, envelopeTitle, isSameSay) : '<渲染器未建成>';
  const seen31 = (hay, needle) => hay.split(needle).length - 1;
  const n31 = (re, s) => (s.match(re) || []).length;
  const pool31 = Object.values(COMMENT_POOLS).flat();
  const SHORT31 = '还行吧。';                                    // 短：首句不成话 ⇒ 批I 已签取法把整条放上标题 ⇒ 标题逐字 = 正文
  const LONG31 = '有人把你家价目牌拍下来发群里了，配文就俩字：良心。';   // 长：标题只是正文前 20 字 ⇒ 两者不相等 ⇒ 两处都留
  const dup31 = pool31.filter(s => isSameSay(envelopeTitle(s), s));
  const kept31 = pool31.filter(s => !isSameSay(envelopeTitle(s), s));
  const bad31 = [];
  for (const s of pool31) {
    const t = envelopeTitle(s), html = draw31(s, 'open');
    if (isSameSay(t, s)) {
      if (seen31(html, 'class="envt"') !== 0 || seen31(html, t) !== 1) bad31.push('展开态仍重复[' + s + ']');
    } else if (seen31(html, 'class="envt"') !== 1 || seen31(html, t) !== 2 || seen31(html, s) !== 1) bad31.push('长留言被误伤[' + s + ']');
    for (const st of [undefined, 'read']) {   // 封口与压平：正文藏着，屏上只有标题那一行 ⇒ 去重在这两格一个像素都不许动
      const h = draw31(s, st);
      if (seen31(h, 'class="envt"') !== 1 || !h.includes(`class="envbody comment" hidden`) && !h.includes(`class="envbody comment hot" hidden`)) {
        bad31.push(`${st === 'read' ? '压平' : '封口'}态标题行或藏法被改动[${s}]`);
      }
    }
  }

  // 1) 判据本身（归一 = 去首尾空白与尾标点，两边都归一）：标点集合与 envelopeTitle 切首句同一枚，两处口径不许分家。
  check('§31 第一项·判重口径逐字钉住：归一只去首尾空白与尾部句末标点（与标题切分同一枚集合），全等才算重复；台词池 51 句零个 HTML 待转义字符（恒等 esc 与屏上等价），按这条口径 48 句单句留言判为重复、3 句判不重复——那 3 句的标题都是正文的严格短前缀（两句式那一条切在第一句句末、超长那两条被 TITLE_MAX 收到 20 字），去重不许把话吃掉',
    feedRaw31.includes('const TAIL_PUNCT = /[。！？；…,.!?]+$/;')
      && /export const isSameSay = \(title, body\) => String\(title\)\.trim\(\)\.replace\(TAIL_PUNCT, ''\)\.trim\(\)/.test(feedRaw31)
      && /=== String\(body\)\.trim\(\)\.replace\(TAIL_PUNCT, ''\)\.trim\(\);/.test(feedRaw31)
      && pool31.length === 51 && pool31.every(s => !/[<>&"']/.test(s))
      && dup31.length === 48 && kept31.length === 3
      && kept31.every(s => { const t = envelopeTitle(s); return t.length < s.length && s.startsWith(t); })
      && isSameSay(envelopeTitle(SHORT31), SHORT31) && !isSameSay(envelopeTitle(LONG31), LONG31),
    `池 51｜重复 ${dup31.length}｜不重复 ${kept31.length}[${kept31.map(s => envelopeTitle(s).length + '/' + s.length).join(' ')}]`);

  // 2) 单上加针原话（一短一长，展开态）：短的那句屏上只剩一份，长的那句标题与正文都在。渲染器就是文件里那一段模板。
  check('§31 第一项·加针原样办：短留言「还行吧。」展开态里标题 span 零枚、那句话只出现一次（去重前是两次）；长留言「有人把你家价目牌……」展开态标题一枚 + 正文一枚，标题在（它同时是正文的前 20 字，所以数到两次），正文一字不多。台词池 51 句 × 展开 / 封口 / 压平三态逐句过这一条，一句不漏',
    !!row31 && seen31(draw31(SHORT31, 'open'), 'class="envt"') === 0
      && seen31(draw31(SHORT31, 'open'), envelopeTitle(SHORT31)) === 1
      && seen31(draw31(LONG31, 'open'), 'class="envt"') === 1
      && seen31(draw31(LONG31, 'open'), envelopeTitle(LONG31)) === 2
      && seen31(draw31(LONG31, 'open'), LONG31) === 1
      && bad31.length === 0,
    `渲染器[${row31 ? '取自 main.js 那一行模板' : '建不起来:' + err31}]｜越界[${bad31.slice(0, 3).join(' ') || '无'}]`);

  // 3) 只动展开态那一个 span：门禁写死「open 且判重」才撤标题行，正文那一格（已签的 .comment 皮与 hidden 藏法）与两条 CSS 规则一字未动。
  check('§31 第一项·范围只有标题那一行：门禁式子逐字是 open && isSameSay(say, c.text) ? 空 : <span class="envt">…（open 为假必出标题 ⇒ 封口 / 压平两态的标题行结构上没被碰），class="envt" 全文仍一处、正文一格仍走批I 已签的那一枚 envbody comment + hidden 拼法、data-act="env" 挂载点仍一处，.envt 与 .envbody[hidden] 两条规则块照旧',
    /\$\{open && isSameSay\(say, c\.text\) \? '' : `<span class="envt">\$\{esc\(say\)\}<\/span>`\}/.test(mainRaw31)
      && n31(/class="envt"/g, mainRaw31) === 1
      && /<span class="envbody comment\$\{c\.kind === 'hot' \? ' hot' : ''\}"\$\{open \? '' : ' hidden'\}>\$\{esc\(c\.text\)\}<\/span>/.test(mainRaw31)
      && n31(/data-act="env"/g, mainRaw31) === 1
      && /\.envt \{/.test(cssRaw31) && /\.envbody\[hidden\] \{ display: none; \}/.test(cssRaw31),
    `envt 模板处 ${n31(/class="envt"/g, mainRaw31)}｜env 挂载 ${n31(/data-act="env"/g, mainRaw31)}`);
}

// ── §32 UI 小修单 task-ui-fix-20261106 第四项（Orange `0953e30` + 对照样本 `145282a`；店主真机截图）晨间弹层底页灰空 ──
// 现场读数（delta §八十四 五）：弹层那一刻 #app 只有 hud + overlay 两个孩子，.panel / .ordercard / img.scene 各 0 枚，
// innerHTML 长 722 字节（同日不弹事件的同一屏实测 10677）⇒ 底页不是「还没画」，是「一个节点都没建」。
// 根因唯一一处：weigh() 原先在 pendingEvent 为真时 `return hud() + eventOverlay()`，整屏换掉出餐站；
// 遮罩本身没问题（fixed inset:0 + rgba(27,42,74,.55) + z-index:20，与晚间那一层同一枚），
// 所以对照样本里只有晨间灰空——settle() 在预检反馈 F6（0366bd6）已改成「先排账、弹层追加」。这里同一味：底页先落再弹。
// 针面三条：① 旧那支整屏替换零残留且 overlay 门禁全文两屏同规格；② 遮罩那几行逐字没动、没新造第二层模态；
// ③ 行为级把 weigh() 的模板体原样交给 Function（与 §31 row 同一手法）：事件在弹时底页与弹层同屏共存，
//    且把末尾那层 overlay 剥掉之后，底页 HTML 与不弹事件时逐字节同一串——修的是「有没有底页」，不是「底页长什么样」。
{
  const mainRaw32 = readFileSync(join(HERE, 'src/ui/main.js'), 'utf8');
  const cssRaw32 = readFileSync(join(HERE, 'src/ui/theme.css'), 'utf8');
  const s32 = mainRaw32.indexOf('  weigh() {');
  const weigh32 = mainRaw32.slice(s32, mainRaw32.indexOf('\n  },', s32));
  const n32 = (re, s) => (s.match(re) || []).length;
  const seen32 = (hay, needle) => hay.split(needle).length - 1;

  // 1) 旧拼法一根不留；overlay 这一枚门禁现在出摊 / 结算两屏同规格（全文 2 处），底下那行字符串仍排在前、弹层追加在后。
  check('§32 第四项·整屏替换那支零残留，门禁与晚间同规格：weigh() 段里 `if (pendingEvent) return hud() + eventOverlay()` 一处不剩，'
      + '`const overlay = pendingEvent ? eventOverlay() : \'\'` 全文两处（出摊 + 结算），weigh() 段内 sceneImg 的下标在 ${overlay} 之前'
      + '（底页字符串先落、弹层末尾追加），段尾逐字是 </div>${overlay}',
    weigh32.includes('if (pendingEvent) return hud() + eventOverlay();') === false
      && n32(/const overlay = pendingEvent \? eventOverlay\(\) : '';/g, mainRaw32) === 2
      && weigh32.indexOf("sceneImg('weighing'") > -1 && weigh32.indexOf('sceneImg(\'weighing\'') < weigh32.indexOf('${overlay}')
      && /<button class="go" style="margin-top:14px" data-act="cook">下锅 · 开卖<\/button>\s*\n\s*<\/div>\$\{overlay\}`;/.test(weigh32),
    `门禁 ${n32(/const overlay = pendingEvent \? eventOverlay\(\) : '';/g, mainRaw32)} 处｜段尾 ${/\$\{overlay\}`;/.test(weigh32)}`);

  // 2) 遮罩一格没改：不透明度与层级仍是各弹层现行那一枚（单上「属遮罩不透明就按其余弹层对齐」这一档不适用，也就没动它），
  //    事件弹层仍是全文唯一一层 overlay——没有为了让底页露出来新造半透明壳子。
  check('§32 第四项·遮罩与层级按现行口径原样：.overlay 那一行逐字仍是 fixed + inset:0 + rgba(27, 42, 74, .55) + z-index:20，'
      + 'main.js 里 class="overlay 仍只 eventOverlay 那一处（没新造第二层模态、没把灰底换个颜色糊过去）',
    cssRaw32.includes('  position: fixed; inset: 0; background: rgba(27, 42, 74, .55);')
      && /z-index: 20/.test(cssRaw32.slice(cssRaw32.indexOf('.overlay {'), cssRaw32.indexOf('.event {')))
      && n32(/class="overlay /g, mainRaw32) === 1,
    `overlay 层 ${n32(/class="overlay /g, mainRaw32)} 处`);

  // 3) 行为级：把 weigh() 模板体交出来跑（桩只替四个外部件：hud / sceneImg / orderCard / eventOverlay，形状照 main.js:65 与 1846）。
  const body32 = weigh32.slice(weigh32.indexOf('{') + 1);   // weigh32 已切在段尾分号，末尾那个 } 不在段内，不能再按 lastIndexOf 收
  const stubHud = () => '<div class="hud">顶栏</div>';
  const stubScene = (file, alt, cls) => `<img class="scene${cls ? ' ' + cls : ''}" src="./img/${file}.webp" />`;
  const stubCard = o => `<div class="ordercard" id="oc-${o.customerId}">单</div>`;
  const stubOv = () => '<div class="overlay fx-bad"><div class="event">事件卡</div></div>';
  let weighFn32 = null, err32 = '';
  try {
    weighFn32 = new Function('hud', 'sceneImg', 'orders', 'state', 'orderCard', 'pendingEvent', 'eventOverlay', 'GRAMS_PER_JIN', body32);
  } catch (e) { err32 = String((e && e.message) || e); }
  const ORD32 = [{ customerId: 'c_a' }, { customerId: 'c_b' }, { customerId: 'c_c' }];
  const run32 = pend => weighFn32
    ? weighFn32(stubHud, stubScene, ORD32, { blanchOn: false }, stubCard, pend, stubOv, 250) : '<渲染器未建成>';
  const withEv32 = run32({ id: 'evt_d_002' });
  const noEv32 = run32(null);
  const cut32 = withEv32.indexOf('<div class="overlay');
  check('§32 第四项·弹层那一刻底页在场：出摊页事件在弹时，同一串 HTML 里 hud + img.scene hero + panel accent + 三张亲手单与 overlay 五样齐在，'
      + '且 overlay 排在最后（顶栏之下不再是空面）；再把末尾那层遮罩整截剥掉，剩下的底页与「今天没抽到事件」那一屏逐字节同一串——'
      + '改的只有「底页建不建」，底页长什么样一个字节没动；不弹事件时零 overlay，一像素如旧',
    weighFn32 !== null && cut32 > 0
      && ['class="hud"', 'class="scene hero"', 'class="panel accent"', 'data-act="cook"'].every(k => withEv32.includes(k))
      && seen32(withEv32, 'class="ordercard"') === 3 && seen32(withEv32, 'class="overlay') === 1
      && withEv32.slice(0, cut32) === noEv32
      && !noEv32.includes('class="overlay') && seen32(noEv32, 'class="ordercard"') === 3,
    `渲染器 ${err32 || 'OK'}｜overlay 下标 ${cut32}｜剥遮罩后等同 ${withEv32.slice(0, cut32) === noEv32}`);
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
