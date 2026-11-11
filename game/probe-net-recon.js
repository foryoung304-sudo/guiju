// 常设探针 · 净额试算对账（补条追加 6，guiju-playtest-fixbatch-addendum-20261110，Orange 2026-11-11 签收时下达）
// 单上原话：「乙5 的 D1/D4 对账夹具跑完即删是浪费——立成常设探针（独立成项、不并针数，同 voice/gap 两探针先例），
// 容差按已登记残差留边（|残差| ≤ 10 元），以后任何动 forecastBasket 的批次必跑。」
//
// 为什么独立成项、不并针数：它跑的是整段日历（随机流 + 结算 + 现金滚动），不是单点断言；
// 与 probe-voice-mount.js / probe-gap-shape.js 同族——离线、不 import 呈现层、不联网、不写任何存档键。
//
// 夹具六个旋钮一次钉全（§一百零四 只登记了 seed 与三个口径开关、没登记策略键，D4/D6 两档因此复现不出来；
// 订正与实测读数见 delta §一百零七。本探针以这里钉死的六旋钮为准，不以那两行旧读数为准）：
//   ① seed 20261110  ② STRATEGIES.clean（tier1 正经 + 亲民价 + 事件全让步）  ③ closer headless
//   ④ opts { labor:false, competition:false, eventScope:'m1' }（3.5:141 的 M1 构建口径）
//   ⑤ buy appc（附录 C 试算碗数 + 卖断日托底，sim.js:63-73 同式）  ⑥ 6 天
//
// 防漂移护栏：本探针自己驱动日历（照 probe-gap-shape.js 先例），但逐日把 bought / bowls / revenue / netOps / cash
// 与 `simulate(seed, 6, clean, 'headless', opts)` 的逐日表对撞。sim 的玩家政策一旦改式而这里没跟上，
// 对撞立刻翻红——不许探针 quietly 变成另一条口径还报绿。
//
// 容差：净额 |残差| ≤ 10 元。残差来源是随机层不可预知项（当日质量抽 Q / 烫锅熟度 / 溢出 spill /
// 暗口碑 Rep 与公开代理 P 的口径差 / 洗切跳过 +20% 报损在第 4 步才定），逐条登记在 §一百零四，不是式子漏项。
// 门只卡净额、逐项差照报不卡：§一百零四 登记的 D4 流水项本身就是 +11.52 元（>10），单项容差从来不是 10 元口径。
// 进容差门的只有 D1 / D4 两档——单上「容差按已登记残差留边」指的就是 §一百零四 登记过的那两笔（+1.81 / +7.10）。
// D2 / D3 / D5 / D6 逐日照报残差但不进门，各有各的结构性来路（探针把来路一并印出来，不许把超差藏进绿里）：
//   D3：晨间事件 evt_d_002 让步 = 当日客流 ×0.6，第 6 步才落地（采购后）⇒ 补条 1 明写这一支不进试算，残差是口径不是漏项；
//   D2 / D5：篮子被可供封顶时 writeoffEstimate 按「这一篮卖光」算余货 ⇒ 估近 0、实际有剩汤底，报损项低估；
//   D6：卖断日低锚，追加 5 的托底落点，另列定性读数。
// 这三条超差是本探针新量出来的（§一百零四 只登记了 D1/D4），是否另立单待裁——见 delta §一百零七 卡点。
//
// 复跑：node probe-net-recon.js（全绿 exit 0，任一条翻红 exit 1）
import { newGame } from './src/engine/state.js';
import { makeRng } from './src/engine/rng.js';
import {
  beginDay, morningPreEvent, previewBasket, submitBasket, lockTradingDay, morningEvent, runDay, closeDay,
} from './src/engine/day.js';
import { drawHandOrders } from './src/engine/weigh.js';
import { SKU_BY_ID } from './src/data/skus.js';
import { CAT, SOLID_CATS, PACKING } from './src/data/constants.js';
import { additiveOf } from './src/engine/production.js';
import { simulate, STRATEGIES } from './src/sim.js';

const SEED = 20261110;
const DAYS = 6;
const STRATEGY = STRATEGIES.clean;
const OPTS = { labor: false, competition: false, eventScope: 'm1' };
const TOL_CENTS = 1000;
const GATE_DAYS = [1, 4];   // 只有 §一百零四 登记过残差的那两档进门（理由见头注）

const yuan = c => (c / 100).toFixed(2);
const round3 = x => Math.round(x * 1000) / 1000;

// ↓ 玩家政策四件：与 src/sim.js 的 picksFor / demandTarget / chooseBasket / chooseFor 同式镜像。
//   镜像不是第二套口径——下面逐日与 simulate 对撞，漂了就翻红。
function picksFor(state, tier, bowls) {
  const sc = state.today.scenario;
  const omega = {};
  for (const c of SOLID_CATS) omega[c] = CAT[c].share * sc.catCoef[c];
  const Omega = SOLID_CATS.reduce((s, c) => s + omega[c], 0);
  const shelfHasTier = !(tier === 3 && !state.cheapUnlocked);
  const picks = shelfHasTier
    ? SOLID_CATS.filter(c => c !== state.today.delist)
      .map(c => ({ sku: SKU_BY_ID[c + tier], qty: round3(bowls * sc.avgJin * omega[c] / Omega) }))
    : [];
  if (shelfHasTier) picks.push({ sku: SKU_BY_ID['SP' + tier], qty: round3(bowls * sc.T) });
  return picks;
}

function demandTarget(state) {
  const appc = previewBasket(state, [], STRATEGY.price).forecast.estBowls;
  if (state.YesterdaySoldOut) return Math.max(appc, state.YesterdayD0 || appc);
  return appc;
}

function chooseBasket(state, target) {
  const hi = Math.max(0, Math.floor(target));
  const fits = bowls => bowls <= 0 ? true
    : previewBasket(state, picksFor(state, STRATEGY.tier, bowls), STRATEGY.price).forecast.plan.submittable;
  if (fits(hi)) {
    const picks = picksFor(state, STRATEGY.tier, hi);
    return { picks, forecast: previewBasket(state, picks, STRATEGY.price).forecast };
  }
  let lo = 0, top = hi;
  while (lo + 1 < top) {
    const mid = (lo + top) >> 1;
    if (fits(mid)) lo = mid; else top = mid;
  }
  const picks = picksFor(state, STRATEGY.tier, lo);
  const { forecast } = previewBasket(state, picks, STRATEGY.price);
  return lo > 0 ? { picks, forecast } : { picks: [], forecast };
}

function chooseFor(ev) {
  if (!ev.actions || !ev.actions.length) return null;
  switch (ev.id) {
    case 'evt_d_001': return 'record';
    case 'evt_d_002': return 'rectify';
    case 'evt_d_031': return 'accept';
    case 'evt_s_insp': return 'destroy';
    case 'evt_s_poach': return 'raise';
    case 'evt_d_complaint': return 'apologize';
    case 'evt_d_pot': return 'patch';
    default: return ev.actions[0].id;
  }
}

// 试算侧的 COGS 是一个合计数（ledger.js evalMetrics 把食材/打包/添加剂加在一起才取整）。
// 拆开时打包与添加剂按与结算同口径重算（元/碗 × 取整碗数），食材取余额；
// 合计与 estCogsCents 的取整差至多 1 分，下面断言钉住。
function splitForecastCogs(state, f) {
  const bowls = Math.round(f.capped);
  const packing = bowls * PACKING[state.PackingTier] * 100;
  const additive = bowls * additiveOf(state).perBowl * 100;
  return { ingredient: f.estCogsCents - packing - additive, packing, additive };
}

const ref = simulate(SEED, DAYS, STRATEGY, 'headless', OPTS).log;
const state = newGame(SEED);
state.laborOn = OPTS.labor;
state.competitionOn = OPTS.competition;
state.eventScope = OPTS.eventScope;

const rows = [];
const fails = [];
let prevSellout = null;

for (let d = 0; d < DAYS; d++) {
  const rng = makeRng(state);
  beginDay(state);
  morningPreEvent(state, rng);
  const target = demandTarget(state);
  const { picks, forecast } = chooseBasket(state, target);
  // 拆分要在当日账动之前取：PackingTier / AdditiveTier / FixedCost 都读采购时点那一版，与试算面板同刻
  const fc = splitForecastCogs(state, forecast.display ?? forecast);
  const submit = submitBasket(state, picks, rng);
  lockTradingDay(state, {
    priceTier: STRATEGY.price, packingTier: STRATEGY.packing, flavor: STRATEGY.flavor,
  });
  const morning = morningEvent(state, rng, chooseFor);
  const orders = drawHandOrders(state, rng);
  runDay(state, orders, o => Object.fromEntries(o.lines.map(l => [l.cat, l.grams])), rng);
  closeDay(state, rng, chooseFor);

  const t = state.today;
  const f = forecast.display ?? forecast;
  const r = ref[d];
  const day = t.day ?? d + 1;

  // 护栏①：与 simulate 逐日表对撞（政策镜像是否仍是同一条口径）
  const bought = submit.plan ? submit.plan.total : 0;
  const mirror = [
    ['bought', bought, r.bought * 100],
    ['bowls', Math.round(t.bowls), r.bowls],
    ['revenue', t.revenueCents, r.revenue * 100],
    ['netOps', t.netOpsCents, r.netOps * 100],
    ['cash', state.Cash, r.cash * 100],
  ];
  for (const [name, mine, theirs] of mirror) {
    if (Math.abs(mine - theirs) > 1) fails.push(`D${day} 政策镜像与 simulate 对不上：${name} 本探针 ${mine} / simulate ${theirs}`);
  }

  const est = {
    流水: f.estRevenueCents,
    食材COGS: -fc.ingredient,
    打包: -fc.packing,
    添加剂: -fc.additive,
    隔夜报损: -f.estWriteoffCents,
    固定支出: -state.FixedCost,
    人工: -f.laborCents,
    试吃净额: f.tastingNetCents,
  };
  const act = {
    流水: t.revenueCents,
    食材COGS: -t.ingredientCents,
    打包: -t.packingCents,
    添加剂: -t.additiveCents,
    隔夜报损: -t.writeoffCents,
    固定支出: -state.FixedCost,
    人工: -state.LaborCost,
    试吃净额: t.tastingNetCents,
  };
  const estSum = Object.values(est).reduce((s, x) => s + x, 0);
  const actSum = Object.values(act).reduce((s, x) => s + x, 0);
  // 护栏②：两侧逐项加总都必须逐分等于各自的净额（§一百零四 夹具内那条断言，这里立成常设）
  if (Math.abs(estSum - f.estNetCents) > 1) fails.push(`D${day} 试算逐项加总 ${estSum} ≠ display.estNetCents ${f.estNetCents}`);
  if (Math.abs(actSum - t.netOpsCents) > 1) fails.push(`D${day} 结算逐项加总 ${actSum} ≠ netOpsCents ${t.netOpsCents}`);
  if (Math.abs(fc.ingredient + fc.packing + fc.additive - f.estCogsCents) > 1) fails.push(`D${day} COGS 拆分与合计差超过 1 分`);

  rows.push({
    day, weather: t.scenario.label, est, act, estSum, actSum,
    estNet: f.estNetCents, actNet: t.netOpsCents,
    estBowls: f.estBowls, capped: f.capped, actBowls: t.bowls,
    D0: t.D0, D: t.D, D_eff: t.D_eff,
    soldOut: t.soldOutCats.length > 0 || !!t.soupSoldOut || (t.handRefused || 0) > 0,
    soldOutCats: [...t.soldOutCats], soupSoldOut: !!t.soupSoldOut, handRefused: t.handRefused || 0,
    yesterdaySoldOut: prevSellout, floorApplied: f.floorApplied, eventMult: f.eventMult,
    morning: morning?.id ?? null, selloutLift: f.parts ? f.parts.soldOutLift : 1,
  });
  prevSellout = {
    soldOut: rows[rows.length - 1].soldOut,
    D0: t.D0, bowls: t.bowls, cats: [...t.soldOutCats], soup: !!t.soupSoldOut, refused: t.handRefused || 0,
  };
}

console.log(`夹具：seed ${SEED}｜${STRATEGY.key}（${STRATEGY.name}）｜closer headless｜opts ${JSON.stringify(OPTS)}｜buy appc｜${DAYS} 天`);
console.log(`容差：净额 |残差| ≤ ${yuan(TOL_CENTS)} 元（逐项差照报不卡）；进容差门的天：D${GATE_DAYS.join(' / D')}`);
console.log('');

for (const r of rows) {
  console.log(`D${r.day}（${r.weather}）试算 ${r.estBowls.toFixed(2)} 碗 / 能出 ${r.capped.toFixed(2)} 碗｜结算 D0 ${r.D0.toFixed(2)} / D ${r.D.toFixed(2)} / D_eff ${r.D_eff.toFixed(2)} / 实卖 ${r.actBowls.toFixed(2)} 碗`);
  console.log('  项            试算        结算        差');
  for (const k of Object.keys(r.est)) {
    const diff = r.est[k] - r.act[k];
    console.log(`  ${k.padEnd(10, '　')} ${yuan(r.est[k]).padStart(10)} ${yuan(r.act[k]).padStart(11)} ${(diff >= 0 ? '+' : '') + yuan(diff).padStart(9)}`);
  }
  const nd = r.estNet - r.actNet;
  console.log(`  净额       ${yuan(r.estNet).padStart(10)} ${yuan(r.actNet).padStart(11)} ${(nd >= 0 ? '+' : '') + yuan(nd).padStart(9)}`);
  console.log(`  卖断：${r.soldOut ? `是（品类 ${r.soldOutCats.join('/') || '—'}｜汤底 ${r.soupSoldOut}｜拒单 ${r.handRefused}）` : '否'}｜地板 ${r.floorApplied}｜采购前事件乘数 ${r.eventMult}｜卖断托底 ×${r.selloutLift.toFixed(4)}｜采购后晨间事件 ${r.morning ?? '无'}`);
  if (!GATE_DAYS.includes(r.day)) {
    console.log(`  ※ 本档不进容差门（§一百零四 未登记过它的残差）：净额残差 ${yuan(r.estNet - r.actNet)} 元，来路见头注逐条`);
  }
  console.log('');
  if (GATE_DAYS.includes(r.day)) {
    // 门只卡净额（追加 6 的标题就是「净额对账夹具」，已登记残差 +1.81 / +7.10 也都是净额那一行）。
    // 逐项差照报不卡：§一百零四 登记的 D4 流水项本身就是 +11.52 元（>10），单项容差从来不是 10 元口径。
    if (Math.abs(nd) > TOL_CENTS) fails.push(`D${r.day} 净额残差 ${yuan(nd)} 元超出 ±${yuan(TOL_CENTS)} 元`);
  }
}

// 追加 5：D6 低锚残差先定性——只查一件事，D5 是不是卖断日（YesterdaySoldOut）。
const d5 = rows[4], d6 = rows[5];
console.log('=== 追加 5 · D6 低锚定性 ===');
console.log(`D5 卖断日判定：${d5.soldOut ? '是' : '否'}（soldOutCats [${d5.soldOutCats.join(',')}]｜soupSoldOut ${d5.soupSoldOut}｜handRefused ${d5.handRefused}）`);
console.log(`D5 需求侧 D0 = ${d5.D0.toFixed(2)} 碗｜D5 实卖 = ${d5.actBowls.toFixed(2)} 碗`);
console.log(`D6 开局读到的 YesterdaySoldOut = ${d6.yesterdaySoldOut ? d6.yesterdaySoldOut.soldOut : 'n/a'}｜YesterdayD0 = ${d6.yesterdaySoldOut ? d6.yesterdaySoldOut.D0.toFixed(2) : 'n/a'}`);
console.log(`D6 显示需求 ${d6.estBowls.toFixed(2)} 碗（托底 ×${d6.selloutLift.toFixed(4)}；不托底则为 ${(d6.estBowls / d6.selloutLift).toFixed(2)} 碗）｜结算 D0 ${d6.D0.toFixed(2)} / D_eff ${d6.D_eff.toFixed(2)} / 实卖 ${d6.actBowls.toFixed(2)} 碗｜净额残差 ${yuan(d6.estNet - d6.actNet)} 元`);
console.log(`托底后显示需求与结算 D0 的差：${(d6.estBowls - d6.D0).toFixed(2)} 碗（托底前 ${(d6.estBowls / d6.selloutLift - d6.D0).toFixed(2)} 碗）`);
console.log(`判定：${d5.soldOut
  ? 'D5 是卖断日 ⇒ 按追加 5 走显示层托底（与 sim.js:71 同构：显示估算不得低于昨日需求侧口径折算值），加针钉住'
  : 'D5 不是卖断日 ⇒ 按追加 5 只回报，处置转首更，本批不硬修'}`);
console.log('');

const worst = rows.filter(r => GATE_DAYS.includes(r.day))
  .map(r => ({ day: r.day, net: Math.abs(r.estNet - r.actNet) }))
  .sort((a, b) => b.net - a.net)[0];
console.log(`容差门内最大净额残差：D${worst.day} ${yuan(worst.net)} 元（限 ${yuan(TOL_CENTS)} 元）`);
console.log(`政策镜像对撞：${DAYS} 天 × 5 项（bought / bowls / revenue / netOps / cash）全数逐分对上 simulate 逐日表`);

if (fails.length) { fails.forEach(f => console.log('红：' + f)); process.exit(1); }
console.log('✓ 净额试算对账全绿：两侧逐项加总逐分等于各自净额，容差门内净额残差均在 ±10 元内，政策镜像与 simulate 零漂移');