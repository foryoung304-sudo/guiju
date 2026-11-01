// 《先把规矩立住！》M1 呈现层：只做 3.14 十二步的界面投影，一切数字来自引擎，界面不许自己算账。
// 红线照正本 3.1 / 3.4 / 九：不许出现品质数字、不许出现道德标签、不许有一句劝善或劝坏的话。
import { CAT, SOLID_CATS, ALL_CATS, PRICE_TIERS, FACILITIES, ENDING, CONFIG, TIERS_STALL, START_CASH_CENTS, START_CREDIT_CAP_CENTS,
  PACKING, PACKING_NAMES, PREP_STATIONS, PREP_LEVELS, ADDITIVE, FLAVOR_DIMS, FLAVOR_DIM_NAMES, CLIENT_MIX,
  TASTING, TOOLS, SCALE_AUTO_MUL } from '../data/constants.js';
import { SKUS_BY_CAT, SKU_BY_ID } from '../data/skus.js';
import { newGame, loadGame, saveGame, clearSave, makeRng, roundJin, centsToYuan } from '../index.js';
import {
  beginDay, morningPreEvent, previewBasket, submitBasket, commitPrep, lockTradingDay, runDay,
  nightSettle, eveningDraw, nightClose, dailyReport, replayPage, closeShop,
} from '../engine/day.js';
import { additiveUnlocked, prepBudget, prepGridUsed, xiaodouPresent, laborCostCents, tastingConvert } from '../engine/production.js';
import { effectivePrice, skuAvailable, creditAvailable, buyFacility, rampCoef, ownsTool, buyTool, sellBackTool } from '../engine/market.js';
import { drawEvent, resolveChoice } from '../engine/events.js';
import { evalCondition } from '../engine/dsl.js';
import { EVENTS } from '../data/events.js';
import { drawHandOrders, GRAMS_PER_JIN } from '../engine/weigh.js';

// 美术资产（ui-spec §五）：24 款 SKU 图标 = 六品类各一张 2×2 拼版（档1/档2/档3/强哥特供），同品类三档必须一眼可辨
const SKU_SHEET = { MB: 'sku-mb', MT: 'sku-mt', VG: 'sku-vg', BF: 'sku-bf', NS: 'sku-ns', SP: 'sku-sp' };
const TIER_CELL = { 1: 'tl', 2: 'tr', 3: 'bl', 6: 'br' };
// 事件配图（实测反馈 §二.3）：M1 四条每类一张，牌面/告示纸留白，字由 UI 排
const EVENT_ART = { evt_d_001: 'event-zhaodama', evt_d_002: 'event-002', evt_d_011: 'event-011', evt_d_031: 'event-031' };
const AVA_SHEET = './img/avatars.webp';
const PHASE_KEY = 'guiju-m1-phase';
const FLOW_KEY = 'guiju-m1-flow';
const app = document.getElementById('app');

let state = null;
let rng = null;
let phase = 'boot';
let draft = {};          // sku → 斤/份（组篮草稿，提交前不进账）
let orders = [];         // 当日亲手单
let gramsBy = {};        // customerId → { 品类: 克数 }
let preEvent = null;     // 第 2 步晨间情报（无分支）
let pendingEvent = null; // 等玩家选的事件（第 6 步 / 第 10 步）
let pricePick = 'standard';
let prepPick = ['将就', '将就', '将就'];    // 第 4 步草稿：三站档名
let wakePick = false;                        // 早起勾选（占 1 格工时）
let packingPick = CONFIG.packingTier;        // 第 5 步②打包档
let flavorPick = { spicy: 3, numbing: 2, umami: 3 };   // 第 5 步③调味三维
let additivePick = CONFIG.additiveTier;      // 第 5 步④添加剂档
let tastingPick = 0;                 // 第 5 步⑤试吃份数（挂了试吃角才出现）
let scalePick = false;               // 第 5 步⑥显多秤开关（秤在手才出现）
let ledgerBack = 'morning';
let okRef = {};          // 本日每单是否已进入足称带（只在跨进那一刻震一次）

const y = c => centsToYuan(c).toFixed(2);
const sign = c => (c > 0 ? `<span class="pos">+${y(c)}</span>` : c < 0 ? `<span class="negv">${y(c)}</span>` : y(c));
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const go = p => { phase = p; localStorage.setItem(PHASE_KEY, p); saveFlow(); render(); };
// 实测问题 #7：买菜没有人说 1.476 斤，建议篮与缩量预填一律落到 0.1 斤
const round01 = x => Math.round(x * 10) / 10;

// 界面走到哪一步的临时件（当日亲手单、克数、待选事件）——刷新/切后台不丢，也不进引擎存档字段
function saveFlow() {
  localStorage.setItem(FLOW_KEY, JSON.stringify({
    pre: preEvent?.id ?? null, pending: pendingEvent?.id ?? null,
    orders, gramsBy, pricePick, draft,
    prepPick, wakePick, packingPick, flavorPick, additivePick, tastingPick, scalePick,
  }));
}

function restoreFlow() {
  let f = null;
  try { f = JSON.parse(localStorage.getItem(FLOW_KEY) || 'null'); } catch { f = null; }
  if (!f) return;
  const byId = id => (id ? EVENTS.find(e => e.id === id) || null : null);
  preEvent = byId(f.pre);   // 晨间情报已即时生效（无分支），只把话留着给玩家看
  // 待选事件若已在 EventHistory 里，说明这一步已经落地，不再重放弹层
  pendingEvent = f.pending && !state.EventHistory.includes(f.pending) ? byId(f.pending) : null;
  orders = f.orders || [];
  gramsBy = f.gramsBy || {};
  draft = f.draft || {};
  // 预检必修⑤：旧档里可能存着 1.6000000238 这类残留，还原时就按 0.1 斤洗净
  for (const k of Object.keys(draft)) draft[k] = Number.isFinite(draft[k]) ? round01(draft[k]) : 0;
  pricePick = f.pricePick || state.PriceTier;
  // 生产链前段的草稿（第 4/5 步）：脏值一律退回引擎当前值，界面草稿不许比引擎更野
  prepPick = Array.isArray(f.prepPick) && f.prepPick.every(l => PREP_LEVELS.some(x => x.id === l))
    ? f.prepPick : [...state.Prep];
  wakePick = !!f.wakePick;
  packingPick = PACKING[f.packingPick] ? f.packingPick : state.PackingTier;
  flavorPick = { ...state.Flavor, ...(f.flavorPick || {}) };
  additivePick = ADDITIVE[f.additivePick] ? f.additivePick : state.AdditiveTier;
  // ⑤⑥ 同样只认合法草稿：份数越界、开关没有秤，退回引擎当前值（界面草稿不许比引擎更野）
  tastingPick = Number.isInteger(f.tastingPick) && f.tastingPick >= TASTING.min && f.tastingPick <= TASTING.max
    ? f.tastingPick : state.TastingCount;
  scalePick = typeof f.scalePick === 'boolean' ? f.scalePick : state.ScaleShowOn;
}

// 每一天的前段草稿从引擎当前值起（调味是常驻配方，备菜照昨天）
function syncProdPicks() {
  prepPick = [...state.Prep];
  wakePick = state.WakeEarly;
  packingPick = state.PackingTier;
  flavorPick = { ...state.Flavor };
  additivePick = state.AdditiveTier;
  tastingPick = state.TastingCount;
  scalePick = state.ScaleShowOn;
}

function hud() {
  return `<div class="hud">
    <span>第 <b class="num">${state.Day}</b> 天 · ${state.tierName}</span>
    <span>现金 <b class="num ${state.Cash < 0 ? 'neg' : ''}">${y(state.Cash)}</b></span>
    <span>欠款 <b class="num">${y(state.DebtSupplier)}</b></span>
    <span>可赊 <b class="num">${y(creditAvailable(state))}</b></span>
    <button class="mini ghost" data-nav="ledger">进货单</button>
  </div>`;
}

// 按钮点击绑在 #app 上做一次：试算汇总条要就地刷新，刷新后不该再回头重绑一遍监听
app.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    if (nav.dataset.nav === 'ledger') { ledgerBack = phase; return go('ledger'); }
    return go(ledgerBack);
  }
  const host = e.target.closest('[data-act]');
  if (host) act(host);
});

function render() {
  app.innerHTML = (VIEWS[phase] || VIEWS.boot)();
  // 实测问题 #8：数量框一边打字一边刷试算（原来 input 用 change，必须回车/失焦才动）
  app.querySelectorAll('input[data-qty]').forEach(el => {
    // 复验 #21：任何来源（预填/缩量/旧档）落在控件上的值，渲染时先按 0.1 斤写回控件与草稿，
    // 不等到失焦——失焦前的那一眼不能看到 7.400000095367432
    const clean = round01(Number(el.value) || 0);
    if (el.value !== String(clean)) el.value = String(clean);
    draft[el.dataset.qty] = clean;
    el.addEventListener('input', () => setQty(el, false));
    el.addEventListener('change', () => setQty(el, true));
  });
  // 称重手感（spec-weighing-feel）：按住抓菜、松手定格、轻点一撮、捏出减量；滑杆整屏删除
  app.querySelectorAll('[data-grab]').forEach(el => {
    el.addEventListener('pointerdown', e => startGrab(e, el));
    el.addEventListener('pointerup', stopGrab);
    el.addEventListener('pointercancel', stopGrab);
    el.addEventListener('contextmenu', e => e.preventDefault());
  });
  app.querySelectorAll('[data-pinch]').forEach(el => {
    el.addEventListener('pointerdown', e => startPinch(e, el));
    el.addEventListener('pointerup', stopPinch);
    el.addEventListener('pointercancel', stopPinch);
    el.addEventListener('contextmenu', e => e.preventDefault());
    // 键盘/读屏触发的 click 不带指针（detail 0），补一次单击捏出；指针点击已由 pointerup 处理
    el.addEventListener('click', e => {
      if (e.detail !== 0) return;
      e.preventDefault();
      addGrams(el.dataset.cust, el.dataset.cat, -stepFor(el.dataset.cust, el.dataset.cat));
      lastLine = { cust: el.dataset.cust, cat: el.dataset.cat };
      usePinchHint();
      refreshOrder(el.dataset.cust);
    });
  });
}

// 预检必修⑤：输入层的落值一律按 0.1 斤规范化（1.6000000238 这类底层残留不进草稿），
// 并就地改写输入框，不再为了一次取整把整屏重绘掉（那会连带换掉汇总条上的按钮）
function setQty(el, normalize) {
  const v = Number(el.value);
  const clean = Number.isFinite(v) && v > 0 ? round01(v) : 0;
  draft[el.dataset.qty] = clean;
  if (normalize && el.value !== '' && el.value !== String(clean)) el.value = String(clean);
  return refreshForecast();
}

// 实测反馈 #8：打字时试算区与汇总条都要跟着动。只换这两个容器的内容，不碰输入框所在的面板；
// 预检必修④：内容没变就不动 DOM——首击落在汇总条上时，输入框失焦会触发 change，
// 整块重绘会把按钮从光标底下换掉，点击就丢了（表现为「缩量按钮首击无反应」）
function refreshForecast() {
  const f = previewBasket(state, picksFromDraft(), state.PriceTier).forecast;
  const detail = document.getElementById('marketDetail');
  if (detail) {
    const html = forecastBar(f) + buyPanel(f);
    if (detail.innerHTML !== html) detail.innerHTML = html;
  }
  const foot = document.getElementById('marketFoot');
  if (foot) {
    const html = footStrip(f);
    if (foot.innerHTML !== html) foot.innerHTML = html;
  }
  return f;
}

function act(host) {
  const d = host.dataset;
  switch (d.act) {
    case 'new': return startNew(Number(document.getElementById('seedbox')?.value) || (Date.now() % 100000));
    case 'continue': return resume();
    case 'toMarket': draft = defaultDraft(); return go('market');
    case 'setqty': draft[d.qty] = round01(Number(d.value) || 0); return go('market');
    case 'submit': return submitDraft();
    case 'shrink': return shrinkToAffordable();
    case 'facility': buyFacility(state, d.fac); return go('market');
    case 'buyTool': buyTool(state, d.tool); return go('market');
    case 'taste': tastingPick = Number(d.n) || 0; return go('lock');
    case 'scale': scalePick = d.on === '1'; return go('lock');
    case 'sellTool': sellBackTool(state, d.tool); return go('market');
    case 'price': pricePick = d.price; return go('lock');
    case 'pack': packingPick = d.pack; return go('lock');
    case 'flavor': flavorPick[d.dim] = Math.max(0, Math.min(5, flavorPick[d.dim] + Number(d.delta))); return go('lock');
    case 'additive': additivePick = d.add; return go('lock');
    case 'prepLevel': prepPick[Number(d.station)] = d.level; return go('prep');
    case 'wake': wakePick = !wakePick; return go('prep');
    case 'prepDone': return commitPrepDraft();
    case 'open': return openShop();
    case 'cook': return cook();
    case 'evening': return afterEvening();
    case 'choose': return resolvePending(d.choice);
    case 'next': return newDay();
    case 'sellout': return sellOutShop();
    case 'restart': clearSave(); return startNew((Date.now() % 100000) + 1);
    default: return undefined;
  }
}

// ── 一天的推进：3.14 十二步按界面顺序落在下面六个函数里 ──────────
function startNew(seed) {
  state = newGame(seed);
  pricePick = state.PriceTier;
  newDay();
}

function resume() {
  const s = loadGame();
  if (!s) return startNew(Date.now() % 100000);
  state = s;
  rng = makeRng(state);
  restoreFlow();
  const saved = localStorage.getItem(PHASE_KEY);
  // 存档点只有四个（晨间 / 已提交 / 已收摊 / 已过夜）：按引擎字段回推当时站在哪一步
  if (state.EndingId) return go('end');
  // 夜里存档（第 11 步已过账）必须先判「今天已经结过」，否则续档落在结算屏、再点一次「打烊」
  // 会把同一天的 NP／固定支出／结局检查重复入账，账本当场不平
  if (saved === 'night' || (state.DailyReports.length && state.DailyReports[state.DailyReports.length - 1].day === state.Day)) return go('night');
  if (state.today.revenueCents !== undefined) { orders = state.HandOrders; return go('settle'); }
  if (state.today.locked) return go('weigh');
  if (state.today.prepped) return go('lock');
  if (state.today.committed) return go(CONFIG.prep ? 'prep' : 'lock');
  if (saved === 'market' && Object.keys(draft).length) return go('market');
  draft = defaultDraft();
  return go('morning');
}

function newDay() {
  rng = makeRng(state);
  orders = []; gramsBy = {}; pendingEvent = null; draft = {}; lastLine = null;   // 昨天的亲手单、待选事件、组篮草稿不带进今天
  beginDay(state);                          // 第 1 步：晨间结转
  syncProdPicks();
  preEvent = morningPreEvent(state, rng);   // 第 2 步：晨间情报（采购前公布，无分支）
  saveGame(state);
  return go('morning');
}

function defaultDraft() {
  // 附录 D.1 的默认值只是界面初值：照昨天卖掉的斤数起，卖断货的那天得自己往上加
  // 实测问题 #7：初值按 0.1 斤出（1.476 斤不像买菜）；汤底按份出整数
  const out = {};
  for (const c of SOLID_CATS) out[c + 1] = round01(state.YesterdaySoldJinByCat?.[c] || 0);
  out.SP1 = Math.round(state.YesterdaySoup || 0);
  return out;
}

// 二审复 §二.3：付不齐时给一个**由玩家点**的「按购买力缩量」——把草稿篮按等比缩到刚好可提交，
// 缩完仍停在草稿里，玩家还能再改，改完必须自己点「就照这一篮买」。正本禁的是「系统自动减量成交」，
// 这里一分子钱都没进账，所以不破 canon。
// 预检必修④：与 harness 的 chooseBasket 同源——全部品类乘同一个系数（保住碗数构成），
// 固体落 0.1 斤、汤底落整份，取整后再逐行让一步直到付得起；不让「最贵那行几乎不动、别家压到见底」。
function shrinkToAffordable() {
  const base = { ...draft };
  const keys = Object.keys(base).filter(k => base[k] > 0);
  if (!keys.length) return go('market');
  const put = (k, v) => { draft[k] = SKU_BY_ID[k].cat === 'SP' ? Math.max(0, Math.round(v)) : Math.max(0, round01(v)); };
  const apply = m => { for (const k of keys) put(k, base[k] * m); };
  const fits = () => previewBasket(state, picksFromDraft(), state.PriceTier).forecast.plan.submittable;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    apply(mid);
    if (fits()) lo = mid; else hi = mid;
  }
  apply(lo);
  // 取整可能把篮子顶回不可提交：每次压「现付压力最大」的一行，最多 80 步
  for (let n = 0; n < 80 && !fits(); n++) {
    const { plan } = previewBasket(state, picksFromDraft(), state.PriceTier).forecast;
    const row = [...plan.lines].filter(l => l.cash > 0).sort((a, b) => b.cash - a.cash)[0];
    if (!row) break;
    if (SKU_BY_ID[row.sku].cat === 'SP') draft[row.sku] = Math.max(0, draft[row.sku] - 1);
    else draft[row.sku] = Math.max(0, round01(draft[row.sku] - 0.1));
  }
  if (!fits()) for (const k of keys) draft[k] = 0;   // 连最小的量都付不起：清空草稿（空篮恒可提交，第 3 步要能过）
  return go('market');
}

function picksFromDraft() {
  return Object.entries(draft).filter(([, q]) => q > 0).map(([sku, qty]) => ({ sku: SKU_BY_ID[sku], qty }));
}

function submitDraft() {
  const r = submitBasket(state, picksFromDraft(), rng);   // 第 3 步：组篮 + 支付
  if (!r.ok) return go('market');
  pricePick = state.PriceTier;
  saveGame(state);
  return go(CONFIG.prep ? 'prep' : 'lock');
}

// 第 4 步：备菜分配（工时预算超了不许提交，引擎与界面同一条门）
function commitPrepDraft() {
  const r = commitPrep(state, prepPick, wakePick);
  if (!r.ok) return undefined;                 // 按钮在超预算时已 disabled；直接返回不动流程
  saveGame(state);
  return go('lock');
}

function openShop() {
  // 第 5 步：六开关一次性定版（①定价 ②打包 ③调味 ④添加剂 ⑤试吃份数 ⑥显多秤）
  if (!state.today.locked) {
    lockTradingDay(state, {
      priceTier: pricePick, packingTier: packingPick,
      flavor: flavorPick, additiveTier: additivePick,
      tastingCount: tastingPick, scaleShowOn: scalePick,
    });
  }
  // 预检必修③：滑杆开局一律空碗（0 克）。原来预填成顾客的要量，核心操作被架空；
  // 顾客要多少仍写在滑杆标签与双读数里，抓多少由玩家自己定。
  if (!orders.length) {                                        // 断点回来不重抽（抽卡会推进随机流）
    pendingEvent = drawEvent(state, 'morning', rng);           // 第 6 步：晨间事件（先亮出来才让玩家选）
    orders = drawHandOrders(state, rng);                       // 第 7 步的亲手单先亮单子
    gramsBy = Object.fromEntries(orders.map(o => [o.customerId, Object.fromEntries(o.lines.map(l => [l.cat, 0]))]));
    okRef = {};
    lastLine = null;
  }
  saveGame(state);                                       // 定版已落地：刷新/切后台回来不该退回定价页
  return go('weigh');
}

// ── 称重手感（spec-weighing-feel + signoff-weighing-tuning / -finestep / -sim-ruling，店主已签发）──
// 按住的 150 毫秒内不算抓（区分轻点），之后 60 克/秒起步、1 秒内加速到 180 克/秒；松手即定格，之后不再加量。
// 接近目标自动刹车：剩余 ≤ max(30 克, 目标 15%) 且还没冲过头时封顶 min(40 克/秒, 目标 × 20%/秒)，
// 让大小目标通过刹车区的时间接近。精修步长分段：与目标差 > 20 克时轻点 +5 / 捏出 −5，≤ 20 克时 ±1；
// 当前步长写在按钮上。长按捏出仍约 30 克/秒。判定带与结算全不动。
const HOLD_DELAY = 150;
const BRAKE_GRAMS = 30;
const BRAKE_SHARE = 0.15;
const BRAKE_RATE = 40;
const BRAKE_SCALE = 0.2;
const TAP_GRAMS = 5;
const FINE_GRAMS = 1;
const FINE_GAP = 20;
const PINCH_RATE = 30;
let grab = null;
let pinch = null;
let lastLine = null;     // 最近松手的行：正在动的那一行不标红，离开后仍不足才提示

function lineTarget(cust, cat) {
  const o = orders.find(x => x.customerId === cust);
  const l = o && o.lines.find(x => x.cat === cat);
  return l ? l.grams : 0;
}

// 分段步长只读当前克数与目标：远离目标用 5 克大步，最后 20 克用 1 克精修
function stepFor(cust, cat) {
  return Math.abs(lineTarget(cust, cat) - Number(gramsBy[cust]?.[cat] || 0)) > FINE_GAP ? TAP_GRAMS : FINE_GRAMS;
}

function grabRate(cust, cat, held) {
  const target = lineTarget(cust, cat);
  const remaining = target - Number(gramsBy[cust]?.[cat] || 0);
  // 刹车只在下手一侧生效：冲过头就回到加速段，捏回目标以下再抓重新刹车
  if (remaining > 0 && remaining <= Math.max(BRAKE_GRAMS, target * BRAKE_SHARE)) {
    return Math.min(BRAKE_RATE, target * BRAKE_SCALE);
  }
  return 60 + 120 * Math.min(1, (held - HOLD_DELAY) / 1000);
}

function startGrab(e, el) {
  if (grab || pinch || e.button > 0) return;
  e.preventDefault();
  try { el.setPointerCapture?.(e.pointerId); } catch { /* 指针已失效时照常按抓菜处理 */ }
  el.classList.add('on');
  grab = { cust: el.dataset.cust, cat: el.dataset.cat, el, t0: performance.now(), last: performance.now(), acc: 0, timer: 0 };
  // 用定时器而不是 rAF：后台/隐藏页 rAF 会停，按住的手就白按了；16 毫秒一跳，前台观感一致
  grab.timer = setInterval(tickGrab, 16);
}

function tickGrab() {
  if (!grab) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - grab.last) / 1000);
  grab.last = now;
  const held = now - grab.t0;
  const rate = grabRate(grab.cust, grab.cat, held);
  if (held <= HOLD_DELAY) return;
  // 小数部分留在 acc 里逐跳累计，落进秤面的永远是整数克
  grab.acc += rate * dt;
  const whole = Math.floor(grab.acc);
  if (whole >= 1) { grab.acc -= whole; addGrams(grab.cust, grab.cat, whole); }
  // 抖动分区：只有高速段秤面才跳读，进了刹车区显示真值
  jitterScale(grab.cust, rate > BRAKE_RATE);
}

function stopGrab(e) {
  if (!grab) return;
  const g = grab;
  grab = null;
  clearInterval(g.timer);
  g.el.classList.remove('on');
  // 轻点 = 抓起一小撮，按当前档位 +5 或 +1 克；指针被系统收走（pointercancel）不算点按
  if (performance.now() - g.t0 < HOLD_DELAY && e?.type !== 'pointercancel') addGrams(g.cust, g.cat, stepFor(g.cust, g.cat));
  lastLine = { cust: g.cust, cat: g.cat };
  refreshOrder(g.cust);
}

function startPinch(e, el) {
  if (grab || pinch || e.button > 0) return;
  e.preventDefault();
  try { el.setPointerCapture?.(e.pointerId); } catch { /* 同上 */ }
  el.classList.add('on');
  pinch = { cust: el.dataset.cust, cat: el.dataset.cat, el, t0: performance.now(), last: performance.now(), acc: 0, flow: false, timer: 0 };
  pinch.timer = setInterval(tickPinch, 16);
}

function tickPinch() {
  if (!pinch) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - pinch.last) / 1000);
  pinch.last = now;
  if (now - pinch.t0 <= HOLD_DELAY) return;
  // 长按捏出：越过轻点门槛先按当前档位减一次，之后按 30 克/秒连续减（长按速率不受分段影响）
  if (!pinch.flow) { pinch.flow = true; addGrams(pinch.cust, pinch.cat, -stepFor(pinch.cust, pinch.cat)); }
  pinch.acc += PINCH_RATE * dt;
  const whole = Math.floor(pinch.acc);
  if (whole >= 1) { pinch.acc -= whole; addGrams(pinch.cust, pinch.cat, -whole); }
  refreshOrder(pinch.cust);
}

function stopPinch(e) {
  if (!pinch) return;
  const p = pinch;
  pinch = null;
  clearInterval(p.timer);
  p.el.classList.remove('on');
  if (!p.flow && e?.type !== 'pointercancel') addGrams(p.cust, p.cat, -stepFor(p.cust, p.cat));
  lastLine = { cust: p.cust, cat: p.cat };
  usePinchHint();
  refreshOrder(p.cust);
}

// 教学提示只用一次：捏过就整档退场，并立刻落档（spec-weighing-hint-20261031）
function usePinchHint() {
  if (state.pinchHintUsed) return;
  state.pinchHintUsed = true;
  saveGame(state);
  document.querySelectorAll('.pinchhint').forEach(h => { h.hidden = true; });
}

// 兜底：指针在按钮外抬起、或系统把指针收走时也要定格；捕获阶段先于按钮自身处理，重复调用是空操作
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, e => { if (grab) stopGrab(e); if (pinch) stopPinch(e); }, true);
}

function addGrams(cust, cat, delta) {
  gramsBy[cust][cat] = Math.max(0, Math.round((gramsBy[cust][cat] || 0) + delta));
}

function orderTotal(cust) {
  if (!gramsBy[cust]) return 0;
  const o = orders.find(x => x.customerId === cust);
  return (o ? o.lines : []).reduce((s, l) => s + Number(gramsBy[cust][l.cat] || 0), 0);
}

// 秤面跳读的 ±3 克抖动只加在显示上，落进结算的是实际克数；刹车区传 false，显示真值
function jitterScale(cust, jitter) {
  const el = document.getElementById('rd-' + cust);
  if (!el) return;
  const total = orderTotal(cust);
  el.textContent = String(jitter ? Math.round(total + (Math.random() * 6 - 3)) : total);
}

// 捏回提示的判定：从未捏过、且任一品类已 ≥ 该行目标的 110%
function hintWanted(o) {
  if (state.pinchHintUsed) return false;
  const g = gramsBy[o.customerId] || {};
  return o.lines.some(l => Number(g[l.cat] || 0) >= l.grams * 1.1);
}

// 「正好」：正在动/刚松手的那一行与目标差 ≤ max(1 克, 目标 1%) 时，读数旁点一下（只做呈现，不改判定）
function exactNow(cust) {
  let cat = null;
  if (grab && grab.cust === cust) cat = grab.cat;
  else if (pinch && pinch.cust === cust) cat = pinch.cat;
  else if (lastLine && lastLine.cust === cust) cat = lastLine.cat;
  if (!cat) return false;
  const target = lineTarget(cust, cat);
  const got = Number(gramsBy[cust]?.[cat] || 0);
  return got > 0 && Math.abs(got - target) <= Math.max(1, target * 0.01);
}

// 短斤带（<90%）行内提示的口径：这一行进过碗、松手后仍不足、且玩家已经离开它。
// 0 克是「还没称」不是「这一口下去了」；正在动的那一行也不提示——否则刚抓一撮就满屏红字。
function flagText(cust, l, got) {
  if (!(got > 0 && got < l.grams * 0.9)) return '';
  if (lastLine && lastLine.cust === cust && lastLine.cat === l.cat) return '';
  return `${CAT[l.cat].name}这一口下去就短了`;
}

// 实测反馈 #1/#2：这一屏一律用「克」，秤面读数带单位；顾客要的与实际称的两个数必须同时在屏上
function refreshOrder(cust) {
  const o = orders.find(x => x.customerId === cust);
  const g = gramsBy[cust];
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const total = o.lines.reduce((s, l) => s + Number(g[l.cat] || 0), 0);
  setText('rd-' + cust, String(total));
  // 预检应修⑦：秤面主读数保持克（真实秤就是这么读），斤换算常驻角标——买菜论斤、称重论克本就是真实口径
  setText('rj-' + cust, `${(total / GRAMS_PER_JIN).toFixed(2)} 斤`);
  setText('sum-' + cust, `顾客要 ${o.lines.reduce((s, l) => s + l.grams, 0)} 克 · 你称 ${total} 克`);
  const want = o.lines.reduce((s, l) => s + l.grams, 0);
  const enough = want > 0 && total / want >= 0.98;
  const sc = document.getElementById('sc-' + cust);
  if (sc) {
    sc.classList.toggle('ok', enough);
    // 足称那一刻：真机震一下（浏览器/无震动接口的环境自动跳过），音效素材后补
    if (enough && !okRef[cust]) navigator.vibrate?.(10);
  }
  okRef[cust] = enough;
  // 捏回教学：只在「松手定格」后判（refreshOrder 不在按住途中调用），任一品类 ≥110% 且从未捏回才露
  // 长按捏出的每一跳也会走到这里：正在捏的时候不提示「去捏」
  const hint = document.getElementById('hint-' + cust);
  if (hint) hint.hidden = !!pinch || !hintWanted(o);
  const ex = document.getElementById('ex-' + cust);
  if (ex) ex.hidden = !exactNow(cust);
  for (const l of o.lines) {
    const got = Number(g[l.cat] || 0);
    setText(`lv-${cust}-${l.cat}`, `你称 ${got} 克`);
    setText(`flag-${cust}-${l.cat}`, flagText(cust, l, got));
    // 分段步长写在按钮上：当前这行离目标多远，按钮就写对应的 ±5 / ±1
    const step = stepFor(cust, l.cat);
    setText(`tap-${cust}-${l.cat}`, `轻点 +${step} 克`);
    setText(`pn-${cust}-${l.cat}`, `捏出 −${step} 克`);
  }
}

function cook() {
  runDay(state, orders, gramsBy, rng);     // 第 7 步：营业
  nightSettle(state, rng);                 // 第 8–9 步：账目与暗线
  saveGame(state);
  return go('settle');
}

function afterEvening() {
  if (pendingEvent) return go(phase);        // 已经抽出来了，重复点「打烊」不再二次抽卡
  pendingEvent = eveningDraw(state, rng);  // 第 10 步抽取
  if (pendingEvent) return go(phase);       // 停在弹层等玩家选
  return finishNight(null);
}

function resolvePending(choice) {
  const ev = pendingEvent;
  pendingEvent = null;
  if (ev.timing === 'morning') {
    resolveChoice(state, ev, choice);      // 第 6 步当场入账
    saveGame(state);
    return go(phase);
  }
  return finishNight(choice, ev);           // 第 10–12 步在选择之后一次走完
}

// ev 显式传入：晚间事件要等玩家点选才落地，抽到的那张不能在中途被清空
function finishNight(choice, ev = pendingEvent) {
  nightClose(state, rng, ev || null, choice ?? null);
  pendingEvent = null;
  saveGame(state);
  return go('night');
}

function sellOutShop() {
  state.EndingId = closeShop(state);       // 主动盘店：判定只在当刻走一次
  saveGame(state);
  return go('end');
}

// ── 画面 ─────────────────────────────────────────────────
const VIEWS = {
  boot() {
    return `<img class="scene hero" src="./img/business.webp" alt="学校小吃街的三轮车摊" />
      <div class="panel accent">
      <h1>先把规矩<br>立住！</h1>
      <p class="muted">学校小吃街麻辣烫摊 · M1 样段</p>
      <div class="stack" style="margin-top:14px">
        <input type="text" id="seedbox" placeholder="种子（同种子复现同一局）" value="${Date.now() % 100000}" />
        <button class="go" data-act="new">开新档</button>
        ${loadGame() ? '<button class="ghost" data-act="continue">继续上一局</button>' : ''}
      </div></div>
      <div class="panel"><p class="muted">开局 ${y(START_CASH_CENTS)} 元；老李他们给 ${y(START_CREDIT_CAP_CENTS)} 元货款额度，卖了再给钱；三轮车每天固定支出 ${y(TIERS_STALL[0].fixedCost)} 元；
        新摊子前 3 天没人气（客流 ×0.4 / ×0.6 / ×0.8）。卖断货是看得见的信号，第二天买多少你说了算。</p></div>`;
  },

  morning() {
    const sc = state.today.scenario;
    return hud() + `
      <img class="scene" src="./img/stall.webp" alt="三轮车摊位" />
      <div class="panel">
        <div class="row"><h2>今晨结转</h2><span class="tag">${sc.label}</span></div>
        <div class="grid2">
          <div><div class="muted">明日</div>${state.today.forecast}</div>
          <div><div class="muted">人气</div>开业第 ${4 - state.RampDays} 天 · 客流 ×${rampCoef(state)}</div>
          <div><div class="muted">现金</div><span class="num ${state.Cash < 0 ? 'negv' : ''}">${y(state.Cash)} 元</span></div>
          <div><div class="muted">欠着</div><span class="num">${y(state.DebtSupplier)} / ${y(state.CreditCap)} 元</span></div>
        </div>
      </div>
      <div class="panel warn"><h3>柜里还剩</h3>
        <div class="row">${ALL_CATS.map(c => `<span class="muted">${CAT[c].name}<br><b class="num">${(c === 'SP' ? state.StockSoup : state.StockSolid[c]).toFixed(2)}</b>${c === 'SP' ? ' 份' : ' 斤'}</span>`).join('')}</div>
        ${state.YesterdaySoldOut ? '<p class="negv">昨天卖断过货。</p>' : ''}</div>
      ${preEvent ? `<div class="panel good"><h3>晨间情报</h3>
        <img class="inlineart" src="./img/${EVENT_ART[preEvent.id] || 'chenshi'}.webp" alt="" />
        <p class="text">${esc(preEvent.text)}</p>
        <p class="muted">市场页的标价已经按这个变了。</p></div>` : ''}
      <button class="go" data-act="toMarket">去市场</button>`;
  },

  market() {
    const { forecast } = previewBasket(state, picksFromDraft(), state.PriceTier);
    return hud() + `
      <img class="scene" src="./img/market.webp" alt="市场采购" />
      ${ALL_CATS.map(cat => shelfRow(cat, forecast)).join('')}
      ${facilityRow()}
      <div id="marketDetail">${forecastBar(forecast) + buyPanel(forecast)}</div>
      <div id="marketFoot" class="stickfoot">${footStrip(forecast)}</div>`;
  },

  prep() {
    const used = prepGridUsed(state, prepPick, wakePick);
    const budget = prepBudget(state);
    const over = used > budget;
    const washSkipped = prepPick[0] === '跳过';
    return hud() + `<img class="scene" src="./img/stall.webp" alt="开卖前的备菜" />
      <div class="panel ${over ? 'warn' : ''}">
      <div class="row"><h2>备菜</h2><span class="tag ${over ? 'due' : 'keep'}">工时 ${used} / ${budget} 格</span></div>
      <p class="muted">认真 2 格 · 将就 1 格 · 跳过 0 格。这一天的活计按摊位档给预算，够不够你自己排。</p>
      ${xiaodouPresent(state) ? `<p class="muted">小豆在帮厨：工时多 1 格，今天出餐也快一成；工钱 ${y(laborCostCents(state))} 元按日结，收摊时扣。</p>`
        : state.laborOn ? '<p class="muted">小豆今天不在：多出来的那一格工时、出餐加成与工钱一起落空。</p>' : ''}
      ${PREP_STATIONS.map((s, i) => `<div class="row tight"><b>${s.name}</b><span class="muted">${s.cats.map(c => CAT[c].name).join(' / ')}</span></div>
        <div class="row">${PREP_LEVELS.map(l => `<button class="${prepPick[i] === l.id ? 'sel' : 'ghost'}" data-act="prepLevel" data-station="${i}" data-level="${l.id}">
          ${l.id} · ${l.grid} 格</button>`).join('')}</div>`).join('')}
      <div class="row tight" style="margin-top:10px"><b>早起</b><span class="muted">占 1 格</span></div>
      <div class="row">
        <button class="${wakePick ? 'sel' : 'ghost'}" data-act="wake">勾上 · ${wakePick ? '今天五点起' : '不勾'}</button>
      </div>
      <p class="muted">早起换"晨采好货必到"：菜农直供与老李的正经货当天不断，免当日 30% 的晨采涨价。</p>
      ${washSkipped ? '<p class="negv">跳过洗切：青菜 / 豆制品菌菇 / 粉面 隔夜报损多两成。</p>' : ''}
      <p class="muted">备菜还决定今天出餐的快慢：认真备得多出几碗，跳过备得少出几碗。</p>
      ${over ? '<p class="negv">工时不够，这一套备不下来。</p>' : ''}
      <button class="go" style="margin-top:12px" data-act="prepDone" ${over ? 'disabled' : ''}>备完 · 去定版</button>
    </div>`;
  },

  lock() {
    const sc = state.today.scenario;
    const mix = CLIENT_MIX[sc.calendar.id] || CLIENT_MIX.normal;
    const crowd = Object.entries(mix).sort((a, b) => b[1] - a[1])[0][0];
    const showAdditive = additiveUnlocked(state);
    return hud() + `<img class="scene" src="./img/pricing.webp" alt="开门前定版" />
      <div class="panel">
      <h2>开门前定版</h2>
      <p class="muted">下面这几样一锁，今天全天照这一套卖，营业中不许回改。</p>
      <h3>每斤定价</h3>
      <div class="stack" style="margin-top:10px">
        ${Object.values(PRICE_TIERS).map(t => `<button class="${t.id === pricePick ? 'sel' : 'ghost'}" data-act="price" data-price="${t.id}">
          ${t.name} · 每斤 ${t.perJin.toFixed(1)} 元</button>`).join('')}
      </div>
      ${pricePick === 'qinmin' ? '<p class="muted" style="margin-top:8px">亲民价认的人多，单碗剩得薄。</p>'
        : pricePick === 'signature' ? '<p class="muted" style="margin-top:8px">招牌价靠门面与熟人口碑撑，考试周更吃亏。</p>'
          : '<p class="muted" style="margin-top:8px">标准价是这条街的默认档。</p>'}
      <h3 style="margin-top:14px">打包</h3>
      <div class="row">${['bag', 'normal', 'thermal'].map(id => `<button class="${packingPick === id ? 'sel' : 'ghost'}" data-act="pack" data-pack="${id}">
        ${PACKING_NAMES[id]} · ${PACKING[id].toFixed(2)} 元/碗</button>`).join('')}</div>
      <p class="muted">袋子最省，汤洒得多；保温最贵，洒得最少。</p>
      <h3 style="margin-top:14px">汤底配方</h3>
      <p class="muted">今天${sc.label}，街上人多的是${crowd}。</p>
      ${FLAVOR_DIMS.map(dim => `<div class="row tight"><b>${FLAVOR_DIM_NAMES[dim]}</b>
        <span><button class="mini ghost" data-act="flavor" data-dim="${dim}" data-delta="-1">−</button>
        <b class="num">${flavorPick[dim]}</b>
        <button class="mini ghost" data-act="flavor" data-dim="${dim}" data-delta="1">＋</button></span></div>`).join('')}
      <p class="muted">各 0–5 格，改完今天生效。</p>
      ${showAdditive ? `<h3 style="margin-top:14px">调味台</h3>
        <div class="row">${Object.values(ADDITIVE).map(a => `<button class="${additivePick === a.id ? 'sel' : 'ghost'}" data-act="additive" data-add="${a.id}">
          ${a.goods || a.name}</button>`).join('')}</div>
        <p class="muted">「${ADDITIVE[additivePick].pitch}」· 按售出的碗结成本。</p>` : ''}
      ${tasteSwitch()}
      ${scaleSwitch()}
      <button class="go" style="margin-top:14px" data-act="open">开门营业</button>
    </div>`;
  },

  weigh() {
    if (pendingEvent) return hud() + eventOverlay();
    return hud() + `<img class="scene hero" src="./img/weighing.webp" alt="出餐站过称" />
      <div class="panel accent">
      <div class="row"><h2>出餐站 · 亲手单 ${orders.length} 单</h2>
        <span class="whoimg"><img class="face" src="./img/chenshi.webp" alt="陈实" /><b>陈实 · 掌秤</b></span></div>
      <p class="muted">先亮单子，再过称。按住抓菜、松手定格；抓多了就捏出一点。这一屏只用克，一碗标准 ${GRAMS_PER_JIN} 克，秤上是多少就收多少。</p>
      <div class="stack" style="margin-top:10px">${orders.map(orderCard).join('')}</div>
      <button class="go" style="margin-top:14px" data-act="cook">下锅 · 开卖</button>
    </div>`;
  },

  settle() {
    if (pendingEvent) return hud() + eventOverlay();
    const r = dailyReport(state);   // 当日报表此刻还在 today 上，DailyReports 末尾是昨天的，不能取
    const t = state.today;
    const out = [...new Set([...t.soldOutCats.map(c => CAT[c].name), ...(t.soupSoldOut ? ['汤底'] : [])])];
    return hud() + `<img class="scene" src="./img/settlement.webp" alt="收摊结算" />
      <div class="panel">
      <h2>收摊账目</h2>
      <table>
        <tr><td>卖出</td><td class="r num">${r.bowls} 碗 / ${r.J.toFixed(2)} 斤${t.deltaJ ? `（秤上按 ${t.J_bill.toFixed(2)} 斤收的钱）` : ''}</td></tr>
        <tr><td>流水</td><td class="r num">${y(r.revenueCents)}</td></tr>
        <tr><td>食材成本（卖掉的才算）</td><td class="r num">−${y(t.ingredientCents)}</td></tr>
        <tr><td>${PACKING_NAMES[state.PackingTier]} · ${r.bowls} 碗 × ${PACKING[state.PackingTier].toFixed(2)} 元</td><td class="r num">−${y(t.packingCents)}</td></tr>
        ${t.additiveCents ? `<tr><td>${ADDITIVE[state.AdditiveTier].goods || '添加剂'}</td><td class="r num">−${y(t.additiveCents)}</td></tr>` : ''}
        <tr><td>成本合计</td><td class="r num">−${y(r.cogsCents)}</td></tr>
        <tr><td>销售毛利</td><td class="r num">${sign(r.grossCents)}</td></tr>
        <tr><td>隔夜报损</td><td class="r num">${sign(-r.writeoffCents)}</td></tr>
        <tr><td>固定支出</td><td class="r num">−${y(r.fixedCents)}</td></tr>
        ${r.laborCents ? `<tr><td>人工 · 小豆日结</td><td class="r num">−${y(r.laborCents)}</td></tr>` : ''}
        ${t.tastingPortions ? `<tr><td>试吃 ${t.tastingPortions} 份 · 每份 1 元</td><td class="r num">${sign(t.tastingIncomeCents)}</td></tr>
        <tr><td>样品食材（今天从柜里出，不另掏现金）</td><td class="r num">−${y(t.tastingCostCents)}</td></tr>` : ''}
        <tr><td><b>经营净额</b></td><td class="r num"><b>${sign(r.netOpsCents)}</b></td></tr>
        <tr><td>今晚自动还款</td><td class="r num">${y(t.repaidCents || 0)}</td></tr>
        <tr><td>现金</td><td class="r num ${state.Cash < 0 ? 'negv' : ''}">${y(state.Cash)}</td></tr>
        <tr><td>还欠</td><td class="r num">${y(state.DebtSupplier)}</td></tr>
      </table>
      ${out.length ? `<p class="negv" style="margin-top:8px">今天这些卖断了：${out.join('、')}。</p>` : ''}
      ${t.tastingConvert ? `<p class="muted">试吃尝过的人里有 ${t.tastingConvert} 位明天算回头熟客。</p>` : ''}
      ${(t.handRefused || 0) > 0 ? '<p class="negv">有亲手单没接住（超出当天能出的碗数）。</p>' : ''}
      ${t.spillBowls ? `<p class="muted">外带漏洒 ${t.spillBowls} 碗。</p>` : ''}
      ${t.deferredBowls ? `<p class="muted">锅出到头了：熟客有 ${t.deferredBowls} 碗当天没排上${t.regLost ? `，走了 ${t.regLost} 位。` : '，留到明天。'}</p>` : ''}
      <button class="go" style="margin-top:12px" data-act="evening">打烊 · 过一遍今晚的事</button>
    </div>`;
  },

  night() {
    const t = state.today;
    const dry = state.StockSoup <= 0 && SOLID_CATS.every(c => state.StockSolid[c] <= 0);
    return hud() + `<img class="scene" src="./img/night.webp" alt="打烊后的今晚" />
      ${state.Cash < 0 ? `<div class="panel accent">
        <h3 class="kind-bad">现金已经见底</h3>
        <p>现在是连负第 ${state.NegativeCashStreak}/3 天${state.NegativeCashStreak >= 3 ? '' : `——再连负 ${3 - state.NegativeCashStreak} 天就收摊（破产）。`}</p>
        ${dry ? '<p class="muted">柜里没汤底、也没剩货：明天这锅开不起来，先想办法把现金填回来。</p>' : ''}
      </div>` : ''}
      <div class="panel">
      <h2>今晚的留言</h2>
      ${t.comments.length ? t.comments.map(c => `<div class="comment ${c.kind === 'hot' ? 'hot' : ''}">${esc(c.text)}</div>`).join('')
        : '<p class="muted">今晚没人说话。</p>'}
      ${t.reserveResult ? `<p class="muted">社团那单预订${t.reserveResult.delivered ? '按数出满了。' : '没出满。'}</p>` : ''}
    </div>
    ${state.EndingId ? `<div class="panel accent"><h2 class="kind-bad">${ENDING_NAMES[state.EndingId]}</h2>
      <p>这一局到这儿。剩下的就是你那张进货单。</p>
      <button class="go" style="margin-top:10px" data-nav="ledger">看进货单</button></div>`
      : `<div class="row"><button class="ghost" data-act="next">开第 ${state.Day + 1} 天</button>
        <button class="ghost" data-act="sellout">把摊子盘出去</button></div>`}`;
  },

  ledger() {
    const p = replayPage(state);
    const byDay = {};
    for (const row of p.purchases) (byDay[row.day] = byDay[row.day] || []).push(row);
    const days = Object.keys(byDay).sort((a, b) => a - b);
    return hud() + `<div class="panel">
      <div class="row"><h2>进货单</h2><button class="mini ghost" data-nav="back">返回</button></div>
      ${days.length ? days.map(d => `<h3 style="margin-top:10px">第 ${d} 天</h3><table>
        <tr><th>货</th><th>来源</th><th class="r">数量</th><th class="r">单价</th><th class="r">金额</th><th class="r">现金/赊</th><th>票</th></tr>
        ${byDay[d].map(r => `<tr><td>${CAT[r.cat].name}</td><td>${r.supplier}</td>
          <td class="r num">${r.qty}${r.unit}</td><td class="r num">${r.unitPrice.toFixed(2)}</td>
          <td class="r num">${y(r.cost)}</td><td class="r num">${y(r.cash)} / ${y(r.credit)}</td>
          <td>${r.hasReceipt ? '有' : '无'}</td></tr>`).join('')}</table>`).join('')
        : '<p class="muted">还没买过东西。</p>'}
      <hr /><h3>逐日账</h3>
      <table><tr><th>天</th><th class="r">流水</th><th class="r">COGS</th><th class="r">报损</th><th class="r">经营净额</th><th class="r">事件账</th><th class="r">现金</th><th class="r">欠款</th></tr>
      ${p.reports.map(r => `<tr><td>${r.day}</td><td class="r num">${y(r.revenueCents)}</td><td class="r num">${y(r.cogsCents)}</td>
        <td class="r num">${y(r.writeoffCents)}</td><td class="r num">${sign(r.netOpsCents)}</td>
        <td class="r num">${sign(r.eventNetCents)}</td><td class="r num">${y(r.cash)}</td><td class="r num">${y(r.debt)}</td></tr>`).join('')}</table>
      <p class="muted" style="margin-top:8px">对账：现金 ${y(p.bridge.cash)} · 桥 ${y(p.bridge.bridge)} · 差 ${y(p.bridge.diff)}
        ${p.bridge.ok ? '（平）' : '（不平，报开发）'}</p>
      <p class="muted">经营净额这一列不只减报损：还扣了当日固定支出与人工（小豆在场才结），并把试吃的份钱减样品成本算了进去。要逐行看，每天收摊那屏都列全了。</p>
    </div>${state.EndingId ? endPanel(p) : ''}`;
  },

  end() {
    return endPanel(replayPage(state), true);
  },
};

const ENDING_NAMES = { 1: '翻车', 2: '破产', 3: '规矩立住', 4: '烧心大王', 5: '金盆洗手', 6: '平庸收摊' };

function shelfRow(cat, forecast) {
  const all = SKUS_BY_CAT[cat];
  const list = all.filter(s => skuAvailable(state, s, rng));
  // §七 采购呈现：强哥线开了但今天这一类他没带——只给一句话，不标价、不留能扣钱的按钮
  const absent = all.some(s => s.tier === 6) && state.today.qianggeCats && !list.some(s => s.tier === 6);
  const have = cat === 'SP' ? state.StockSoup : state.StockSolid[cat];
  return `<div class="panel"><div class="row"><h3>${CAT[cat].name}${cat === 'SP' ? '（份）' : '（斤）'}</h3>
      <span class="muted">柜里 ${have} · 试算今天能出 ${forecast.capped.toFixed(0)} 碗</span></div>
    <div class="shelf">${list.map(s => skuCard(cat, s)).join('')}${absent ? absentCard(cat) : ''}</div></div>`;
}

function absentCard(cat) {
  return `<div class="sku absent"><div class="skuimg" style="background-image:url(./img/${SKU_SHEET[cat]}.webp)"></div>
    <div class="src">强哥</div><div class="desc">今天强哥没带这个</div></div>`;
}

function skuCard(cat, s) {
  const price = effectivePrice(state, s);
  const q = draft[s.sku] || 0;
  const ticket = s.receipt === 'auto' ? '<span class="tag ticket">带票</span>'
    : s.receipt === 'excluded' ? ''
      : s.receipt === 'none' ? '<span class="tag nodoc">无票</span>' : '<span class="tag nodoc">票看手气</span>';
  const step = cat === 'SP' ? 1 : 0.5;
  return `<div class="sku ${q > 0 ? 'on' : ''}">
    <div class="skuimg" data-cell="${TIER_CELL[s.tier]}" style="background-image:url(./img/${SKU_SHEET[cat]}.webp)" role="img" aria-label="${CAT[cat].name} · ${s.supplier}"></div>
    <div class="src">${s.supplier}</div>
    <div class="price num">${price.toFixed(2)}<span class="muted">/${s.unit}</span></div>
    <div class="desc">${esc(s.desc)}</div>
    <div>${s.credit ? '<span class="tag credit">可赊</span>' : '<span class="tag cash">只收现金</span>'} ${ticket}
      ${cat === 'SP' ? '<span class="tag due">隔夜全损</span>' : s.keep ? '<span class="tag keep">能留明天</span>' : '<span class="tag due">当天清</span>'}</div>
    <div class="qty">
      <button class="mini" data-act="setqty" data-qty="${s.sku}" data-value="${round01(Math.max(0, q - step))}">−</button>
      <input type="number" min="0" step="${step}" value="${round01(q)}" data-qty="${s.sku}" />
      <button class="mini" data-act="setqty" data-qty="${s.sku}" data-value="${round01(q + step)}">＋</button>
    </div></div>`;
}

// 实测反馈 #8：调上面货架时看不见总额 —— 汇总压成一条吸底跟随，明细仍留在页尾原处
function footStrip(f) {
  const { plan } = f;
  if (plan.submittable) {
    return `<span>这一篮 <b>${y(plan.total)}</b> 元</span>
      <span>现付 ${y(plan.cashUsed)} · 走赊 ${y(plan.creditUsed)}</span>
      <span>买完剩 <b>${y(f.cashAfterCents)}</b> 元</span>
      <span>能出 ${f.capped.toFixed(0)} 碗</span>`;
  }
  return `<span>这一篮 <b>${y(plan.total)}</b> 元 · 付不齐，现钱要出 ${y(plan.cashUsed)}，手上 ${y(Math.max(0, state.Cash))}</span>
    <button class="mini" data-act="shrink">按手上的钱缩量</button>`;
}

// 实测问题 #3：附录 C 的 capped = min(需求侧估计, 这一篮能出)，只印一个数会让玩家以为「今天就只有这么多生意」。
// 需求侧与可供侧同时摆出来，缺口就是明天该多买多少——两个数都是引擎算好的公开项，界面不另立口径
function forecastBar(f) {
  const need = Math.round(f.estBowls);
  const gap = need - f.capped;
  return `<div class="forecast"><div class="k">试算（只看明账）${f.lowConfidence ? ' <span class="low">头一天没有昨日实卖，客流侧按开业基础量估</span>' : ''}</div>
    <div class="grid3" style="margin-top:8px">
      <div><div class="k">按今天客流要</div><div class="v num">${need} 碗</div></div>
      <div><div class="k">这一篮只够出</div><div class="v num">${Math.round(f.supplyBowls)} 碗</div></div>
      <div><div class="k">预计能出</div><div class="v num">${f.capped.toFixed(0)} 碗</div></div>
      <div><div class="k">预计流水</div><div class="v num">${y(f.estRevenueCents)}</div></div>
      <div><div class="k">预计净额</div><div class="v num">${y(f.estNetCents)}</div></div>
      <div><div class="k">这一篮</div><div class="v num">${y(f.plan.total)}</div></div>
      <div><div class="k">买完剩现金</div><div class="v num">${y(f.cashAfterCents)}</div></div>
      <div><div class="k">还剩额度</div><div class="v num">${y(f.creditRemainingCents)}</div></div>
    </div>
    ${gap > 0 ? `<div class="k" style="margin-top:6px">差 ${gap} 碗——${f.supplyBowls === 0
      ? '今天开空档，这一篮出不了货'
      : f.bottleneck === 'cap'
        // 3.12 第 7g 步：卡的是出餐产能，不是菜——多买的货今天照样出不掉
        ? `灶上一天出到 ${f.bottleneckBowls} 碗就满了，多买的菜今天出不掉`
        : `${CAT[f.bottleneck].name}只够出 ${f.bottleneckBowls} 碗，先补这一类`}</div>` : ''}
    <div class="k" style="margin-top:6px">现金 ${y(state.Cash)} · 走赊 ${y(f.plan.creditUsed)} · 现付 ${y(f.plan.cashUsed)}</div></div>`;
}

// 实测问题 #4：赊账没有开关，触发条件是「现钱不够时才自动走赊，且只走熟人正经货」，
// 屏上必须写明这条并让本篮逐笔看出哪行走赊、哪行走现钱（汤底与非熟人货只收现金）
function buyPanel(f) {
  const { plan } = f;
  if (plan.submittable) {
    return `<div class="panel good">
      <button class="go" data-act="submit">就照这一篮买</button>
      ${basketSplit(plan)}
      <p class="muted" style="margin-top:6px">现钱够就全走现钱；现钱不够的那一截才自动挂到熟人账上（只走带信用关系的正经货，${y(creditAvailable(state))} 元额度以内）。</p></div>`;
  }
  return `<div class="panel accent">
    <p class="negv">这一篮付不齐：现钱要出 ${y(plan.cashUsed)}，手上 ${y(Math.max(0, state.Cash))}；可赊 ${y(creditAvailable(state))} 只走熟人正经货（汤底和别家货只收现金）。整篮驳回，不自动减量。</p>
    ${basketSplit(plan)}
    <div class="row" style="margin-top:8px">
      <button class="ghost" data-act="shrink">按手上的钱缩量</button>
      <button class="go" data-act="submit" disabled>就照这一篮买</button>
    </div>
    <p class="muted" style="margin-top:6px">缩量只改草稿里的数字，改完还得你自己点「就照这一篮买」。</p></div>`;
}

function basketSplit(plan) {
  const rows = (plan.lines || []).filter(l => l.qty > 0);
  if (!rows.length) return '';
  return `<table style="margin-top:8px"><tr><th>这一篮怎么付</th><th class="r">数量</th><th class="r">现付</th><th class="r">走赊</th></tr>
    ${rows.map(l => `<tr><td>${CAT[l.cat].name} · ${l.supplier}</td>
      <td class="r num">${l.qty}${l.unit}</td><td class="r num">${y(l.cash)}</td>
      <td class="r num">${l.credit > 0 ? y(l.credit) : '—'}</td></tr>`).join('')}</table>`;
}

// 置办面板文案照附录 D.3 的「效果」列直译（六件设施此前界面上只有先钱后货牌一件，其余没有已签发文案）
const FACILITY_BLURB = {
  fac_prepay: '挂上这块牌，赊账不用一句一句说；赵大妈那笔上门赊账也不再抽到。',
  fac_taste: '挂上这一角，开门前多一个试吃开关：3–6 份、每份收 1 元，尝过的人明天回不回来按转化算。',
  fac_display: '用料上墙：第 7a 步的客流系数 F 加 5%，检查时也加分。',
  fac_cert: '证件墙 + 明厨亮灶：F 再加 5%，检查加分更多。',
  fac_contract: '把小豆的工钱写进合同：日结升到合同价、产能加成升到 15%（覆盖在场那一成，不叠加），人也不容易被挖走。',
  fac_sign: '招牌上刻一条你自己定的规矩：不做数字，只在终局演出里出现。',
};

// 正文 3.6 / 附录 D.3：六件设施 + 杂货摊器具一件。没解锁的不列（玩家看不见自己还没够到的东西），
// 解锁了的原地挂着，买过的标"已置办"。显多秤是器具：不进 Facilities、不计 L（附录 E 实现约束第 2 条）。
function facilityRow() {
  const facs = Object.values(FACILITIES).filter(f => state.Facilities.includes(f.id) || evalCondition(f.unlock, state));
  const tools = Object.values(TOOLS).filter(t => ownsTool(state, t.id) || evalCondition(t.unlock, state));
  if (!facs.length && !tools.length) return '';
  return `<div class="panel warn"><h3>小店置办</h3>
    ${facs.map(f => {
    const owned = state.Facilities.includes(f.id);
    return `<div class="row tight"><div><b>${f.name}</b>
        <p class="muted">${FACILITY_BLURB[f.id] || ''} ${f.price / 100} 元，一次性。</p></div>
      <button data-act="facility" data-fac="${f.id}" ${owned || state.Cash < f.price ? 'disabled' : ''}>${owned ? '已置办' : '买下'}</button></div>`;
  }).join('')}
    ${tools.map(t => {
    const owned = ownsTool(state, t.id);
    return `<div class="row tight"><div><b>${t.name}</b>
        <p class="muted">杂货摊有卖：${t.price / 100} 元买、${t.sellBack / 100} 元卖回（第 3 步按半价回收）。
          装上后散客那一层的计费斤数按 ×${SCALE_AUTO_MUL} 记账，开关在开门前定版、当日锁定。</p></div>
      <span class="row tight">${owned ? `<button class="ghost" data-act="sellTool" data-tool="${t.id}">卖回</button>` : ''}
        <button data-act="buyTool" data-tool="${t.id}" ${owned || state.Cash < t.price ? 'disabled' : ''}>${owned ? '已上秤' : '买下'}</button></span></div>`;
  }).join('')}</div>`;
}

// 第 5 步⑤试吃份数（附录 D.5 / 正文 3.6 注）：没挂试吃一元角这个开关根本不出现；份数玩家定，引擎不掷随机
function tasteSwitch() {
  if (!state.Facilities.includes('fac_taste')) return '';
  const conv = tastingConvert(tastingPick);
  return `<h3 style="margin-top:14px">试吃</h3>
      <div class="row">${[0, TASTING.min, 4, 5, TASTING.max].map(n => `<button class="${tastingPick === n ? 'sel' : 'ghost'}" data-act="taste" data-n="${n}">
        ${n === 0 ? '不试吃' : `${n} 份`}</button>`).join('')}</div>
      <p class="muted">${tastingPick >= TASTING.min
    ? `${tastingPick} 份收 ${tastingPick} 元，大约留下 ${conv} 个人明天回来；样品今天从柜里出，按食材成本记，不另掏现金。`
    : '试吃满 3 人才开始留下人；样品今天从柜里出，按食材成本记，不另掏现金。'}</p>`;
}

// 第 5 步⑥显多秤（附录 D.3）：秤不在手上（没买、或今天已在第 3 步卖回）开关不出现；当日锁定，营业中不许回改
function scaleSwitch() {
  if (!ownsTool(state, 'JI_SCALE')) return '';
  return `<h3 style="margin-top:14px">${TOOLS.JI_SCALE.name}</h3>
      <div class="row">
        <button class="${scalePick ? 'sel' : 'ghost'}" data-act="scale" data-on="1">开着 · 照秤上的数收钱</button>
        <button class="${scalePick ? 'ghost' : 'sel'}" data-act="scale" data-on="0">不开 · 递多少收多少</button>
      </div>
      <p class="muted">开着的时候，散客那一层记账的斤数比真正递出去的多 ${Math.round((SCALE_AUTO_MUL - 1) * 100)}%，多出来的部分照样收钱、不给货，这一天的账面上会留痕。</p>`;
}


function orderCard(o) {
  const g = gramsBy[o.customerId];
  const gave = o.lines.reduce((s, l) => s + Number(g[l.cat] || 0), 0);
  return `<div class="panel" style="box-shadow:3px 3px 0 var(--ink-2);background:var(--cream)">
    <div class="cust"><div class="ava ava-${o.customerId}" style="background-image:url(${AVA_SHEET})" role="img" aria-label="${esc(o.name)}"></div>
      <div><h3>${esc(o.name)}</h3><span class="muted">${esc(o.role)} · ${o.bowls} 碗</span></div></div>
    <div class="scale${gave > 0 && gave / o.lines.reduce((s, l) => s + l.grams, 0) >= 0.98 ? ' ok' : ''}" id="sc-${o.customerId}" style="margin:8px 0">
      <img src="./img/scale.webp" alt="电子秤" />
      <div class="readout num"><span id="rd-${o.customerId}">${gave}</span><span class="u">克</span>
        <span class="jin" id="rj-${o.customerId}">${(gave / GRAMS_PER_JIN).toFixed(2)} 斤</span>
        <span class="exact" id="ex-${o.customerId}" ${exactNow(o.customerId) ? '' : 'hidden'}>正好</span></div>
    </div>
    <div class="pinchhint" id="hint-${o.customerId}" ${hintWanted(o) ? '' : 'hidden'}>抓多了？点「捏出一点」往回捏</div>
    <div class="dual num muted" id="sum-${o.customerId}">顾客要 ${o.lines.reduce((s, l) => s + l.grams, 0)} 克 · 你称 ${gave} 克</div>
    ${o.lines.map(l => `<div class="grabrow">
      <button class="grab" data-grab data-cust="${o.customerId}" data-cat="${l.cat}">
        <span class="skuimg bowlchip" id="ch-${o.customerId}-${l.cat}" data-cell="tl" style="background-image:url(./img/${SKU_SHEET[l.cat]}.webp)"></span>
        <span class="grabname">${CAT[l.cat].name}<b class="want">要 ${l.grams} 克</b><span class="step" id="tap-${o.customerId}-${l.cat}">轻点 +${stepFor(o.customerId, l.cat)} 克</span></span>
      </button>
      <span class="num gave" id="lv-${o.customerId}-${l.cat}">你称 ${g[l.cat]} 克</span>
      <button class="pinch" id="pn-${o.customerId}-${l.cat}" data-pinch data-cust="${o.customerId}" data-cat="${l.cat}">捏出 −${stepFor(o.customerId, l.cat)} 克</button></div>
    <div class="muted kind-bad" id="flag-${o.customerId}-${l.cat}">${flagText(o.customerId, l, Number(g[l.cat] || 0))}</div>`).join('')}
  </div>`;
}

function eventOverlay() {
  const ev = pendingEvent;
  const acts = (ev.actions || []).length
    ? (ev.actions || []).map(a => {
      const net = (a.open || []).reduce((s, o) => s + (o.cash || 0), 0);
      const after = state.Cash + net;
      return `<button data-act="choose" data-choice="${a.id}">${esc(a.label)}${net && after < 0 ? `（现金要变 ${y(after)}）` : ''}</button>`;
    }).join('')
    : '<button data-act="choose">知道了</button>';
  return `<div class="overlay"><div class="event">
    <img class="art" src="./img/${EVENT_ART[ev.id] || 'chenshi'}.webp" alt="" />
    <div class="body"><span class="who">${esc(ev.kind)} · ${ev.timing === 'evening' ? '打烊后' : '清早'}</span>
      <p class="text">${esc(ev.text)}</p><div class="acts">${acts}</div></div>
  </div></div>`;
}

function endPanel(p, standalone) {
  const r = p.reveal;
  return (standalone ? hud() : '') + `<div class="panel accent">
    <h2 class="kind-bad">结局：${ENDING_NAMES[p.endingId]}</h2>
    <div class="grid2">
      <div><div class="muted">营业天数</div><div class="big num">${p.days}</div></div>
      <div><div class="muted">累计净赚</div><div class="big num ${r.NP < 0 ? 'negv' : 'pos'}">${y(r.NP)}</div></div>
      <div><div class="muted">票据覆盖率</div><div class="num">${(r.ReceiptRate * 100).toFixed(1)}%</div></div>
      <div><div class="muted">最大单日出菜</div><div class="num">${r.Wmax} 斤</div></div>
    </div>
    <hr /><p class="muted">这一路一共 ${p.purchases.length} 笔进货，逐笔在上面的进货单里。</p>
    <button class="go" style="margin-top:10px" data-act="restart">换个买法重开</button>
  </div>`;
}

// 预检应修⑧ + 复验 #24：首屏/定版/结算/夜屏首帧的米色空框，是预取排到 load 之后、玩家先点了「开新档」。
// 现在模块一执行就取（不等 load）：七张场景头图（HTML 侧另有 preload 链接抢在最前）+
// 事件卡四张 + 兜底立绘与秤面 + 同屏必现的六类 SKU 图标与顾客头像表；失败不重试。
// 图片响应是 no-cache（本地预览与静态托管都按 304 回），所以要留住解码结果：
// 预热用的 Image 必须挂在模块作用域，否则被回收后 <img> 再取会重走一次网络，首帧仍空。
const warmedImgs = (function preloadScenes() {
  const list = ['business', 'stall', 'market', 'pricing', 'weighing', 'settlement', 'night',
    'event-zhaodama', 'event-002', 'event-011', 'event-031', 'chenshi', 'scale',
    'avatars', 'sku-mb', 'sku-mt', 'sku-vg', 'sku-bf', 'sku-ns', 'sku-sp'];
  return list.map(n => { const im = new Image(); im.src = `./img/${n}.webp`; return im; });
})();
// 绑定挂在 window 上：模块级 const 若无人引用，打包后可能只剩调用、数组被丢，解码结果又被回收
window.guijuWarm = warmedImgs;

render();
