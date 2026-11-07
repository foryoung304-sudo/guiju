// 《先把规矩立住！》M1 呈现层：只做 3.14 十二步的界面投影，一切数字来自引擎，界面不许自己算账。
// 红线照正本 3.1 / 3.4 / 九：不许出现品质数字、不许出现道德标签、不许有一句劝善或劝坏的话。
import { CAT, SOLID_CATS, ALL_CATS, PRICE_TIERS, FACILITIES, ENDING, CONFIG, TIERS_STALL, START_CASH_CENTS, START_CREDIT_CAP_CENTS,
  PACKING, PACKING_NAMES, PREP_STATIONS, PREP_LEVELS, ADDITIVE, FLAVOR_DIMS, FLAVOR_DIM_NAMES, CLIENT_MIX,
  TASTING, TOOLS, SCALE_AUTO_MUL, BLANCH, RETIRE_NP_CENTS, BUYOUT_PRICE_CENTS, SAVE_VERSION, CHEAP_TIER_WARNING } from '../data/constants.js';
import { SKUS_BY_CAT, SKU_BY_ID } from '../data/skus.js';
import { newGame, loadGame, saveGame, clearSave, makeRng, roundJin, centsToYuan } from '../index.js';
import {
  beginDay, morningPreEvent, previewBasket, submitBasket, commitPrep, lockTradingDay, runDay,
  nightSettle, eveningDraw, nightClose, dailyReport, replayPage, judgeBuyout, judgeRetire, quitBlurb,
} from '../engine/day.js';
import { additiveUnlocked, prepBudget, prepGridUsed, xiaodouPresent, laborCostCents, tastingConvert } from '../engine/production.js';
import { effectivePrice, skuAvailable, creditAvailable, buyFacility, isFacilityUnlocked, ownsTool, buyTool, sellBackTool, upgradeStall } from '../engine/market.js';
import { drawEvent, resolveChoice, isActionAvailable, isActionAffordable } from '../engine/events.js';
import { ticketlessCostCents } from '../engine/inspection.js';
import { competitionOn, streetBoard } from '../engine/competition.js';
import { evalCondition } from '../engine/dsl.js';
import { EVENTS } from '../data/events.js';
import { armAudio, sfx, tapEdge, weighTick, isMuted, setMuted, motionCue, setBoil, playVoice, advanceVoice, stopVoice } from './audio.js';
// 特殊事件配音的挂载表（挂载单 voice-qc-mount-20261105）：本文件只问「这一段该出声的是哪几句」，出声全在 audio.js。
// 全覆盖批（挂载单 voice-qc-mount-full-20261106）在同一张表里加了日常事件出场句、结果句的原文集合与常客句：
// resultTexts 管「两处引擎落点合成一个查找集合」，voiceRegularLines 管「这行灰字对到哪一句」。
import { voiceIntroLines, voiceResultLines, resultTexts, voiceRegularLines } from '../data/voice.js';
// 开场动画（task-opening-cinematic-20261102）：只借两个入口——新档首播、以及「我的」页重看。
// 整层挂 body、不 import 引擎，撤掉 = 删这一行 + act 里两处 + me() 里那颗按钮 + theme.css 那一块。
import { introShouldPlay, showIntro } from './intro.js';
// 「摊口风向」卡（工单 task-wind-panel-20261104）：暗线档位化的唯一获批出口，派生与词表都在 wind.js / data/wind.js 里。
import { windCard } from './wind.js';
// 结算屏第二段那条播报 + 进出两组的合计（工单 task-ui-polish-20261105 第 7 条）：择句规则与词池都在这一层，引擎不认得它。
import { broadcastLine, inoutTotals } from './settle-broadcast.js';
import { mergeSelloutNames } from './sellout.js';
// 营业屏气泡 / 金色浮字 / 夜晚信封（视觉批 I，工单 task-ui-visual-20261105）：文案与上限都在 feedfx.js 那一层，
// 它零引擎 import、不写 state、不掷随机、不留计时器（撤掉 = 删这一行 + 下面调用点 + theme.css 那两块）。
import { orderSay, praiseSay, grumbleSay, rushSay, showBubbles, showFloats, envKey, envOrder, envelopeTitle, isSameSay } from './feedfx.js';
import { drawHandOrders, GRAMS_PER_JIN, stockGrams, gramsCeilingFor } from '../engine/weigh.js';
import { judgeBlanch, blanchValueAt } from '../engine/blanch.js';
import { regularLine, REGULAR_SLOTS } from '../data/customers.js';
// 天气卡的人话词句表与组句规则（工单 task-morning-trim-20261104）：乘数与系数只许活在这里的判据里，不进界面。
import { weatherTalk } from '../data/weather-talk.js';
import { icon, weatherIcon, calendarIcon } from './icons.js';

// 美术资产（ui-spec §五）：24 款 SKU 图标 = 六品类各一张 2×2 拼版（档1/档2/档3/强哥特供），同品类三档必须一眼可辨
const SKU_SHEET = { MB: 'sku-mb', MT: 'sku-mt', VG: 'sku-vg', BF: 'sku-bf', NS: 'sku-ns', SP: 'sku-sp' };
const TIER_CELL = { 1: 'tl', 2: 'tr', 3: 'bl', 6: 'br' };
// 事件配图（实测反馈 §二.3）：牌面/告示纸留白，字由 UI 排。
// 补图批（大任务单第二段）：18 行逐行落位——王老板组五条共用他的形象图（三个取景窗 + 两张同图变体），
// 其余九条各一张独立构图剪影。回落件从此只给未来新增的行兜底，现役行不再共用一张图。
// 工单 task-art-slot-43-20261106 §三：B 档 18 张 4:3 成品到手，九行把专用剪影换成成图、九行从兜底件里提出来，
// 剪影件就此退场（兜底件 event-silhouette.svg 留着）。A 档九行仍是 5:2，进 4:3 槽由 cover 居中裁——裁切验单见工单 §二。
const EVENT_ART = {
  evt_d_001: 'event-zhaodama.webp', evt_d_002: 'event-002.webp', evt_d_011: 'event-011.webp', evt_d_031: 'event-031.webp',
  evt_s_pricewar: 'event-wang-pricewar.webp', evt_s_poach: 'event-wang-poach.webp', evt_s_return: 'event-wang-return.webp',
  evt_s_copycat: 'event-wang-copycat.webp', evt_s_buyout: 'event-wang-buyout.webp',
  evt_d_021: 'event-tag.webp', evt_s_insp: 'event-insp.webp', evt_s_insp2: 'event-insp2.webp',
  evt_s_promo: 'event-promo.webp', evt_s_flag: 'event-flag.webp', evt_d_stockout: 'event-stockout.webp',
  evt_d_complaint: 'event-complaint.webp', evt_d_pot: 'event-pot.webp', evt_d_blogger: 'event-blogger.webp',
  evt_d_041: 'event-canteen.webp', evt_d_042: 'event-field.webp', evt_d_043: 'event-reserve.webp',
  evt_d_044: 'event-change.webp', evt_d_045: 'event-chess.webp', evt_d_046: 'event-spoon.webp',
  evt_d_051: 'event-early.webp', evt_d_052: 'event-laoli.webp', evt_d_053: 'event-monthly.webp'
};
// 预检反馈 F9（0366bd6）：没有配图的事件行原先一律回落 chenshi 立绘（一张 900×1800 的竖构图），
// 于是「夜晚连着两单同一张图」「情报卡只见下半身」（F10）都成了它的表现。四张成品图是 5:2 横构图，
// 卡框也是 5:2，竖图被横裁必然切头。
const EVENT_NO_ART = 'event-silhouette.svg';
const eventArt = id => `./img/${EVENT_ART[id] || EVENT_NO_ART}`;
// 追补单二（山寨专属）：双图对开的左半 = 自家摊。复用预热清单里已有的场景头图 stall.webp，
// 不新增素材、不进一批新的取图请求（右半用这条自己的 event-wang-copycat.webp）。
const OWN_STALL_ART = './img/stall.webp';
const AVA_SHEET = './img/avatars.webp';
// 修复单 P2-3：场景头图刚进屏时先亮一块米色底，玩家读成「图坏了/裁切没修」。这几张的名字与预热清单同名，
// 取图给最高优先、解码要在这帧之前完成——图没到就只见条纹占位（见 theme.css 的 .scene 底纹），到了就整幅盖住。
const sceneImg = (file, alt, cls = '') =>
  `<img class="scene${cls ? ' ' + cls : ''}" src="./img/${file}.webp" alt="${alt}" decoding="sync" fetchpriority="high" />`;
// 追补单三第 3 条：出摊 hub 的常驻热气。只多包一层定位壳、多三个软白粒子，图与取景窗一个字没改
// （壳接 .scene 原本那条 12px 下边距，读数见回报 §7）。撤掉 = 删这一处调用与 theme.css 那一块，不留残钩。
const steamScene = (file, alt) =>
  `<span class="scenewrap">${sceneImg(file, alt)}<span class="steam" aria-hidden="true"><i></i><i></i><i></i></span></span>`;
const PHASE_KEY = 'guiju-m1-phase';
const FLOW_KEY = 'guiju-m1-flow';
const app = document.getElementById('app');

let state = null;
let rng = null;
let phase = 'boot';
let draft = {};          // sku → 斤/份（组篮草稿，提交前不进账）
let qtyBad = new Set();  // 屏幕上填了字、但这一格读不出数的 sku（type=number 的 badInput 态）
let orders = [];         // 当日亲手单
let gramsBy = {};        // customerId → { 品类: 克数 }
let preEvent = null;     // 第 2 步晨间情报（无分支）
let pendingEvent = null; // 等玩家选的事件（第 6 步 / 第 10 步）
const CUE_EVENT_ID = 'evt_d_001';   // 声音标记唯一挂靠点（动画单第二条：赵大妈出场）；撤这条就是删这一行与 render() 里那三行
let cueLast = null;                 // 上一次挂载的事件 id，用来保证「同一次出场只响一声」
let paperLast = null;               // 同一套「只响一次」给王老板线那一声纸张（接入单 594b908）
let pricePick = 'standard';
let prepPick = ['将就', '将就', '将就'];    // 第 4 步草稿：三站档名
let wakePick = false;                        // 早起勾选（占 1 格工时）
let packingPick = CONFIG.packingTier;        // 第 5 步②打包档
let flavorPick = { spicy: 3, numbing: 2, umami: 3 };   // 第 5 步③调味三维
let additivePick = CONFIG.additiveTier;      // 第 5 步④添加剂档
// 视觉批 I 第三件：今晚信箱的信封三态（封口 / 拆封 / 压平）。只活在这一页会话里——
// 不进 saveFlow、不进 SAVE_VERSION、不给引擎加一个字段（单上红线，§30 有针盯着这一格）。
// 刷新页面就重新封口，读没读过是玩家的观感问题，不是存档问题。
let envState = {};
let tastingPick = 0;                 // 第 5 步⑤试吃份数（挂了试吃角才出现）
let scalePick = false;               // 第 5 步⑥显多秤开关（秤在手才出现）
let ledgerBack = 'morning';
let clearArmed = false;            // 「清除存档」的游戏内二次确认：第一击只把按钮变成「确认清除？」
let okRef = {};          // 本日每单是否已进入足称带（只在跨进那一刻震一次）
let blanchBy = {};       // customerId → 夹出时的熟度读数；没这格 = 这单没下手（正文 3.11）
let blanchRun = {};      // customerId → { t0, raf }：只在活着的那一屏存在，刷新即空（读数已落的走 blanchBy）

const y = c => centsToYuan(c).toFixed(2);
const sign = c => (c > 0 ? `<span class="pos">+${y(c)}</span>` : c < 0 ? `<span class="negv">${y(c)}</span>` : y(c));
// 追补单三第 2 条：结算主数字滚动。铁律「先算后演」——模板在这一刻已经把终值写进 DOM，滚动只是临时盖在显示上；
// 落定（播完 / 点一下 / 降级 / 切后台 / 换屏）一律还原成挂载时抓到的那一串原文，
// 终值与账面逐位相等由构造保证，动画不参与任何计算。data-c 带的就是同一个整数分，不新造数。
const ROLL_MS = 700;
let rollCancel = null;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 与 sign() 同一串字，只是把数字套进可滚的那一层（正负号留在外层，滚动期间不动）
const signRoll = c => (c > 0 ? `<span class="pos">+<span class="roll" data-c="${c}">${y(c)}</span></span>`
  : c < 0 ? `<span class="negv"><span class="roll" data-c="${c}">${y(c)}</span></span>`
    : `<span class="roll" data-c="0">${y(c)}</span>`);

function rollMount() {
  if (rollCancel) rollCancel();
  const nodes = [...app.querySelectorAll('.roll')];
  if (!nodes.length) return;
  const finals = nodes.map(el => el.textContent);
  // 滚动途中位数在变，右对齐那一列会左右跳：先把终值那一格的宽度钉住，只让数字在框里长；落定就撤
  nodes.forEach(el => { el.style.minWidth = Math.ceil(el.getBoundingClientRect().width) + 'px'; });
  if (reduceMotion() || document.hidden) return;      // 降级 / 后台：直接显终值，不演
  const mags = nodes.map(el => Math.round(Math.abs(Number(el.dataset.c))));
  const pres = finals.map(s => s.slice(0, Math.max(0, s.search(/\d/))));
  const write = f => nodes.forEach((el, i) => { el.textContent = pres[i] + (mags[i] * f / 100).toFixed(2); });
  const t0 = performance.now();
  let raf = 0, done = false;
  const land = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    nodes.forEach((el, i) => { el.textContent = finals[i]; el.style.minWidth = ''; });
    rollCancel = null;
  };
  rollCancel = land;
  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / ROLL_MS);
    write(1 - (1 - p) ** 3);
    if (p >= 1) land(); else raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
// 热气与滚动都按「看不见就不动」收：切后台把热气钉在暂停帧、把还在滚的数字就地落定
const steamPause = () => app.classList.toggle('fx-paused', document.hidden);
document.addEventListener('visibilitychange', () => {
  steamPause();
  if (document.hidden && rollCancel) rollCancel();
});
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
// 换屏就收回待确认：清除的二次确认只在「我的」这一屏有效，跳走就得重新点一遍
const go = p => { phase = p; clearArmed = false; localStorage.setItem(PHASE_KEY, p); saveFlow(); render(); };
// 实测问题 #7：买菜没有人说 1.476 斤，建议篮与缩量预填一律落到 0.1 斤
const round01 = x => Math.round(x * 10) / 10;

// 界面走到哪一步的临时件（当日亲手单、克数、待选事件）——刷新/切后台不丢，也不进引擎存档字段
function saveFlow() {
  localStorage.setItem(FLOW_KEY, JSON.stringify({
    pre: preEvent?.id ?? null, pending: pendingEvent?.id ?? null,
    orders, gramsBy, pricePick, draft, blanchBy,
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
  // 熟度读数只认「今天这张单 + 0–100 之间的数」；正在扫的那一格不还原（刷新后从 0 重扫，已夹出的数照留）
  blanchBy = {};
  for (const [k, v] of Object.entries(f.blanchBy || {})) {
    if (orders.some(o => o.customerId === k) && Number.isFinite(v) && v >= 0 && v <= 100) blanchBy[k] = v;
  }
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

// 预检反馈 F11（店主裁定 signoff-f11-tabbar-20261102）：五标签只挂 hub 屏，流程屏（备菜/定版/称重/结算/事件/结局）全屏无标签。
// 标签切换是纯视图行为：不推进天数、不触发结算与事件，也不给任何操作开新的时点。
const TABS = [{ id: 'stall', label: '出摊' }, { id: 'market', label: '采购' }, { id: 'ledger', label: '账本' },
  { id: 'shop', label: '置办' }, { id: 'me', label: '我的' }];
const HUB_PHASES = ['morning', 'night', 'market', 'ledger', 'shop', 'me'];
const TAB_OF = { morning: 'stall', night: 'stall', market: 'market', ledger: 'ledger', shop: 'shop', me: 'me' };
// 当日 hub：这一天还没收摊就落在晨间屏，已经收摊就落在夜屏（留言与目标墙都在那一屏）
const stallHub = () => (state.today && state.today.revenueCents !== undefined ? 'night' : 'morning');
// 采购窗口 = 第 3 步提交之前。市场页本来就只在这段里出现，标签按同一条件放行，不新增操作时点。
const buyWindowOpen = () => !!state.today && !state.EndingId
  && !state.today.committed && state.today.revenueCents === undefined;
// 从流程屏（结算等）经顶栏「进货单」进来的账本不给标签：那一步的过账动作不能被导航绕过去
const showTabs = () => HUB_PHASES.includes(phase) && !(phase === 'ledger' && !HUB_PHASES.includes(ledgerBack));
// 角标两语义（ui-spec §四：角标红点仅两种语义）：账本 = 有未清欠款；置办 = 有可购买的升级/设施。
// 「可购买」直接抄 facilityRow/tierBlock 那三条置灰条件（采购窗口内 + 已解锁 + 现金够），不新增任何判定，也不给操作开新时点。
const badgeLedger = () => state.DebtSupplier > 0;
function badgeShop() {
  if (!buyWindowOpen()) return false;
  if (state.Tier < 6 && state.Cash >= TIERS_STALL[state.Tier - 1].upgradePrice) return true;
  if (Object.values(FACILITIES).some(f => !state.Facilities.includes(f.id)
    && isFacilityUnlocked(state, f.id) && state.Cash >= f.price)) return true;
  return Object.values(TOOLS).some(t => !ownsTool(state, t.id)
    && evalCondition(t.unlock, state) && state.Cash >= t.price);
}
const BADGE_TITLE = { ledger: '有未清欠款', shop: '有能置办的东西' };
// 批 A（mockup 12 / ui-spec §四）：胶囊浮条 + 5 图标 + 选中番茄红底衬 + 角标 + 夜间态。
// 挂载范围、置灰条件、切换行为一律照旧——本批只换皮，导航规则一个字没动。
function tabBar() {
  if (!showTabs()) return '';
  const active = TAB_OF[phase];
  const night = phase === 'night';   // 夜间态整条换墨蓝底（UI-13 那一屏）
  return `<nav class="tabbar${night ? ' night' : ''}"><div class="tabrow">${TABS.map(t => {
    const off = t.id === 'market' && !buyWindowOpen();
    const dot = (t.id === 'ledger' && badgeLedger()) || (t.id === 'shop' && badgeShop());
    const tip = off ? ' title="今天已经收摊，明早开市再去市场"' : (dot ? ` title="${BADGE_TITLE[t.id]}"` : '');
    return `<button data-tab="${t.id}" class="${active === t.id ? 'on' : ''}"${dot ? ' data-badge="1"' : ''}${off ? ' disabled' : ''}${tip}>`
      + `<span class="tabic">${icon('tab-' + t.id)}${dot ? '<i class="dot"></i>' : ''}</span>${t.label}</button>`;
  }).join('')}</div></nav>`;
}
function goTab(id) {
  if (id === 'market' && !buyWindowOpen()) return undefined;
  // 草稿是空的才铺默认篮（和「去市场」那颗按钮同一份 defaultDraft）；已经有草稿就原样带过去，
  // 不然人在置办与账本之间跳一回，篮子就被重置一次。
  if (id === 'market' && !Object.keys(draft).length) draft = defaultDraft();
  if (id === 'ledger') ledgerBack = phase;
  return go(tabPhase(id));
}
const tabPhase = id => (id === 'stall' ? stallHub() : id);

// 按钮点击绑在 #app 上做一次：试算汇总条要就地刷新，刷新后不该再回头重绑一遍监听
app.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  const nav = e.target.closest('[data-nav]');
  const host = e.target.closest('[data-act]');
  // ① UI 点击/翻页（音频单）：只在按到了确实可点的按钮时出声，禁用的那颗不出声也不走逻辑
  // 裁定 d619ed6 第三条：改走 tapEdge——这一趟里若八条专属边发了声，这一次点按让位；条件一字没动
  if ((tab || nav || host) && !e.target.closest('button[disabled]')) tapEdge();
  // 追补单三：点按即落定。落在这一屏任何一处都算，位置在换屏与选择逻辑之前；
  // 滚动期间没有加过任何 pointer-events，所以「落定」与「按到按钮」是同一只手，不互相挡。
  if (rollCancel) rollCancel();
  // 追补单二：王老板线四套专属都「点按可跳过整段」——遮罩上再加一个 fx-done，CSS 把这一屏的子件全钉到落定态，
  // 同样不留计时器。延后出现的按钮在落定前不接点击（theme.css 的 pointer-events），所以头一下必定是跳过，
  // 不会被一颗还看不见、但按下去就会扣钱的按钮吃掉。（closest 上移到 act 之前：配音那一格要认这一次按的是不是入场）
  const skip = e.target.closest('.overlay.fx-wang');
  // 配音点按推进（挂载单 voice-qc-mount-20261105）：玩家点按＝跳当前句进下一句，队列空着就什么都不做。
  // 唯一让位的是王老板线入场那一下——落定前按钮不接点击，那一下归动画，不许顺手吃掉一句词。
  // 排在 act 之前：卡片被点选之后就归结果句（检查两条），旧句序不再往前跳。
  if (!(skip && !skip.classList.contains('fx-done'))) advanceVoice();
  if (tab) return goTab(tab.dataset.tab);
  if (nav) {
    if (nav.dataset.nav === 'ledger') { ledgerBack = phase; return go('ledger'); }
    return go(ledgerBack);
  }
  if (host) act(host);
  // 动画单：人物事件逐字蹦字「可点击补全整段」。补全只加一个 class，交给 CSS 收尾，不留计时器；
  // 放在 act 之后，点在按钮上的那一下仍旧照常走选择逻辑（.text 里没有按钮，两者不打架）
  const typed = e.target.closest('.event .text');
  if (typed) typed.classList.add('done');
  if (skip) skip.classList.add('fx-done');
});
// 按住与抬起要各记一次：见 refreshForecast 上方的 P2-2 注（捕获阶段先于按钮自身与失焦处理）
app.addEventListener('pointerdown', startPress, true);
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, endPress, true);
// 音频单行为规矩第 1 条：BGM 必须在玩家首次交互后才起（移动端自动播放策略），armAudio 自带幂等
document.addEventListener('pointerdown', armAudio, true);

function render() {
  stopAllBlanch();   // 换屏就把还在扫的熟度条收掉：没夹出的那一单按「没下手」走，不留着后台跑
  app.innerHTML = (VIEWS[phase] || VIEWS.boot)() + tabBar();
  // 声音标记（动画单第二条）：只挂赵大妈那条人物事件的入场，一声轻咳式拟声，不带一个字。
  // 独立开关是 audio.js 里的 MOTION_CUE；店主说要撤，删这一段 + audio.js 那一块就干净了，不留残钩。
  // 按「本次挂载」触发：同一条事件下一晚再抽到，还会再响一次。
  const cueNow = pendingEvent ? pendingEvent.id : null;
  if (cueNow === CUE_EVENT_ID && cueLast !== cueNow) motionCue('grandmaCough');
  cueLast = cueNow;
  // 接入单 594b908 两条新边（都只碰呈现，不进任何判定与随机流）：
  // ① 锅声循环只在营业那一屏垫底（下锅与过称都在这一屏），换屏即收；响度位见 audio.js 的 BOIL_TRIM 注。
  setBoil(phase === 'weigh');
  // ② 王老板线入场 = 递信封/翻账本那一下（sfx-paper）；与赵大妈那声咳嗽共用「同一次挂载只响一声」的触发纪律。
  const wangNow = pendingEvent && String(pendingEvent.motion || '').startsWith('wang') ? pendingEvent.id : null;
  if (wangNow && paperLast !== wangNow) sfx('paper');
  paperLast = wangNow;
  app.classList.toggle('hasTabs', showTabs());   // 有标签才留那一条底部高度，流程屏照旧全屏
  // 实测问题 #8：数量框一边打字一边刷试算（原来 input 用 change，必须回车/失焦才动）
  app.querySelectorAll('input[data-qty]').forEach(el => {
    // 复验 #21：任何来源（预填/缩量/旧档）落在控件上的值，渲染时先按 0.1 斤写回控件与草稿，
    // 不等到失焦——失焦前的那一眼不能看到 7.400000095367432
    const clean = round01(Number(el.value) || 0);
    if (el.value !== String(clean)) el.value = String(clean);
    // 货架重挂出来的格子必然是读得出数的（值是从草稿写回去的）：上一轮「认不出」跟着这一格一起作废
    if (el.validity && !el.validity.badInput) qtyBad.delete(el.dataset.qty);
    draft[el.dataset.qty] = clean;
    el.addEventListener('input', () => setQty(el));
    el.addEventListener('change', () => setQty(el));   // 同一支判据的兜底：打字与输入法那一路上控件里可能还是空串，值到失焦那一刻才定下来，定了再对一次
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
      usePinchHint();
      refreshOrder(el.dataset.cust);
    });
  });
  rollMount();     // 结算屏的主数字：先有终值，再盖显示（非结算屏找不到 .roll，直接返回）
  mountOrderSay(); // 营业屏开屏那一眼：气泡只在这一屏挂，别的屏走 fxOn 直接返回（视觉批 I 第一件）
  steamPause();    // 热气按可见性起停：换屏重挂时也把「正在后台」这一态补上
}

// 预检必修⑤：输入层的落值一律按 0.1 斤规范化（1.6000000238 这类底层残留不进草稿），
// 并就地改写输入框，不再为了一次取整把整屏重绘掉（那会连带换掉汇总条上的按钮）
// 真机修复单 f39f692：读不出来的那一格不再静悄悄算成 0 漏出篮子。判读只这一支（打字与结算重读同一条），
// 认出坏值就登记 + 红框、草稿按 0 走（屏上不留着一个篮子已经算进去的数）；submitDraft 见登记不为空整篮驳回。
function commitOneQty(el) {
  const bad = !!el.validity?.badInput;
  const v = Number(el.value);
  draft[el.dataset.qty] = !bad && Number.isFinite(v) && v > 0 ? round01(v) : 0;
  if (bad) qtyBad.add(el.dataset.qty);
  else qtyBad.delete(el.dataset.qty);
  el.closest('.sku')?.classList.toggle('bad', bad);
  return bad;
}

function syncDraftFromInputs() {
  let bad = 0;
  for (const el of app.querySelectorAll('input[data-qty]')) if (commitOneQty(el)) bad++;
  return bad;
}

// 复现单 236307a 线索一之三：控件上的字与真正入篮的那个数必须是同一个数。
// 浏览器递回来的值可以带 float32 尾巴（走查读到 4.900000095367432 / 3.0999999046325684 这类）：草稿按 round01 走、
// 屏上却留着长串，原来只在失焦（change）那一下回写，打字与滚轮那一路上玩家看到的数根本没进篮子。
// 判据用「屏上的数 ≠ 入篮的数」而不是「字符串不一样」：正打着的「4.」读成 4、与草稿相等，不去动它（不许把小数点吃掉）。
function setQty(el) {
  const bad = commitOneQty(el);
  const clean = draft[el.dataset.qty];
  if (!bad && el.value !== '' && Number(el.value) !== clean) el.value = String(clean);
  commitOneQty(el);
  return refreshForecast();
}

// 实测反馈 #8：打字时试算区与汇总条都要跟着动。只换这两个容器的内容，不碰输入框所在的面板；
// 预检必修④：内容没变就不动 DOM——首击落在汇总条上时，输入框失焦会触发 change，
// 整块重绘会把按钮从光标底下换掉，点击就丢了（表现为「缩量按钮首击无反应」）
// 修复单 P2-2：内容真的变了还是会被换掉。改数字后第一下点「就这一篮，付钱」，顺序是
// pointerdown → mousedown → 输入框 blur（这里触发 change→重绘，按下的节点被摘走）→ mouseup → pointerup → click：
// mousedown 落在一个已经离开文档树的节点上，浏览器就不再补 click，首击于是凭空消失，二击才执行（不重复扣款）。
// 按住 [data-act] 期间不重绘，抬手后补一次；click 已经跑完就顺带被换屏覆盖，不留旧账。
function refreshForecast() {
  const f = previewBasket(state, picksFromDraft(), state.PriceTier).forecast;
  if (pressedBtn) { refreshQueued = true; return f; }
  const detail = document.getElementById('marketDetail');
  if (detail) {
    const html = marketDetailHtml(f);
    if (detail.innerHTML !== html) detail.innerHTML = html;
  }
  const foot = document.getElementById('marketFoot');
  if (foot) {
    const html = marketFootHtml(f);
    if (foot.innerHTML !== html) foot.innerHTML = html;
  }
  syncShelfForecast(f);
  return f;
}

// 复现单 236307a 线索一之二：六个分类抬头的「试算今天能出」和卡底「小计」都在上面两个容器之外，
// 只有整屏重绘才跟着换算式走 —— 打字调数量时，抬头说 1 碗、吸底条说 2 碗（走查记的是 11 与 16）。
// 这里只改文字与「在用」那一圈描边，不换节点：换节点会把正在打字的那一格连同光标一起换掉（预检必修④那条教训）。
function syncShelfForecast(f) {
  if (qtyBad.size) return;   // 驳回态：抬头那一眼跟着整块换掉的驳回话走，不摆半个算式配套的数
  const bowls = f.capped.toFixed(0);
  app.querySelectorAll('[data-fc-bowls]').forEach(el => { el.textContent = bowls; });
  for (const el of app.querySelectorAll('input[data-qty]')) {
    const sku = el.closest('.sku');
    if (!sku) continue;
    const q = draft[el.dataset.qty] || 0;
    sku.classList.toggle('on', q > 0);
    const sub = sku.querySelector('.subtotal b');
    if (sub) {
      const line = f.plan.lines.find(l => l.sku === el.dataset.qty);
      sub.textContent = y(line ? line.cost : 0);
    }
  }
}

let pressedBtn = null;     // 这一只手按住的那个按钮（只在按下到抬起之间有意义）
let refreshQueued = false; // 按住期间被推迟的重绘

function startPress(e) {
  pressedBtn = e.target.closest('[data-act]');
}

function endPress() {
  pressedBtn = null;
  if (!refreshQueued) return;
  // 抬起这一刻不能直接重绘：click 还没派发，换掉节点等于把这一击又吞一次。留到本回合事件全跑完再补。
  setTimeout(() => {
    const q = refreshQueued;
    refreshQueued = false;
    if (q && !pressedBtn) refreshForecast();
  }, 0);
}

function act(host) {
  const d = host.dataset;
  switch (d.act) {
    case 'new': {
      startNew(Number(document.getElementById('seedbox')?.value) || (Date.now() % 100000));
      // 开场动画（task-opening-cinematic）：新档首播一次。startNew 已经把玩家落在现行第一天那一屏，
      // 这一层只是盖在它上面，播完/跳过都把它摘掉、露出来的还是那一屏——流程代码一个字没改。
      // 「继续上一局」不播：那是老档，不是新档首播。
      if (introShouldPlay()) showIntro();
      return;
    }
    case 'continue': return resume();
    case 'toMarket': draft = defaultDraft(); return go('market');
    case 'setqty': draft[d.qty] = round01(Number(d.value) || 0); return go('market');
    case 'submit': return submitDraft();
    case 'shrink': return shrinkToAffordable();
    case 'facility': buyFacility(state, d.fac); return go('shop');
    case 'buyTool': buyTool(state, d.tool); return go('shop');
    case 'taste': tastingPick = Number(d.n) || 0; return go('lock');
    case 'scale': scalePick = d.on === '1'; return go('lock');
    case 'sellTool': sellBackTool(state, d.tool); return go('shop');
    case 'price': pricePick = d.price; return go('lock');
    case 'pack': packingPick = d.pack; return go('lock');
    case 'flavor': flavorPick[d.dim] = Math.max(0, Math.min(5, flavorPick[d.dim] + Number(d.delta))); return go('lock');
    case 'additive': additivePick = d.add; return go('lock');
    case 'prepLevel': prepPick[Number(d.station)] = d.level; sfx('prep'); return go('prep');   // 备菜一格 = chop/knife 随机二选一
    case 'wake': wakePick = !wakePick; return go('prep');
    case 'prepDone': return commitPrepDraft();
    case 'env': return toggleEnv(d.n);                       // 夜晚信箱：拆封 / 压平（只动会话态，不动留言本体）
    case 'open': return openShop();
    case 'cook': return cook();
    case 'bstart': return startBlanch(d.cust);
    case 'bpull': return pullBlanch(d.cust);
    case 'evening': sfx('cash'); return afterEvening();   // ⑤ 结算屏确认 = 收银
    case 'mute': setMuted(!isMuted()); return render();   // 音频单：一键全关（BGM+SFX），偏好存独立键
    case 'intro': return showIntro({ replay: true });     // 开场动画：「我的」页重看，重看不改播看状态（本来就已播过）
    case 'choose': return resolvePending(d.choice);
    case 'next': return newDay();
    case 'sellout': return retireShop();
    case 'quit': return quitShop();
    case 'upgrade': return buyNextTier();
    case 'restart': clearSave(); return startNew((Date.now() % 100000) + 1);
    // 「我的」里的清除：不可逆，落回开屏前先问一句——问的是屏上的按钮，不是系统弹窗
    // （原生 confirm() 在托管页的 iframe 里会被吞掉：弹窗不开、直接返回 false，点了等于没点）
    case 'clear':
      if (!clearArmed) { clearArmed = true; return render(); }
      clearSave();
      go('boot');
      // 续件要落在 go() 之后删：go 里那次 saveFlow 会原样把它写回来，先删等于没删
      localStorage.removeItem(FLOW_KEY);
      return undefined;
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
  // 裁定 63a2ec8 ⑫：批准的脏档兜底只有这一处、只有这一种兜法。真机存档写坏 / 写一半时 today.scenario 会缺，
  // 晨间屏一读到它就崩。缺 → 按「当日尚未 beginDay」处理，走引擎自己的入口（newDay = 第 1–2 步）重跑，不新造行为。
  if (!state.today || !state.today.scenario) return newDay();
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
  orders = []; gramsBy = {}; pendingEvent = null; draft = {};   // 昨天的亲手单、待选事件、组篮草稿不带进今天
  envState = {};                                                // 昨晚的信封重新封口（视觉批 I 第三件：这是会话态，不是账）
  blanchBy = {};                                                                // 昨天的熟度读数同样不带进今天
  beginDay(state);                          // 第 1 步：晨间结转
  syncProdPicks();
  preEvent = morningPreEvent(state, rng);   // 第 2 步：晨间情报（采购前公布，无分支）
  // 情报条配音（全覆盖单挂载口径「挂 newDay 抽取点」）：抽中才播、当天只播一次。
  // 刻意不挂采购屏那张面板的渲染处——那一块随每次交互重绘（选品、滑杆、切屏都重画），挂上去就重播（盘点 §6.2）。
  // 出声与出声成败都不挡 go('morning')：音频只负责出声，画面照原时序走。
  if (preEvent) playVoice(voiceIntroLines(preEvent.id, state));
  saveGame(state);
  return go('morning');
}

function defaultDraft() {
  // 附录 D.1 的默认值只是界面初值：照昨天卖掉的斤数起，卖断货的那天得自己往上加
  // 实测问题 #7：初值按 0.1 斤出（1.476 斤不像买菜）；汤底按份出整数
  const out = {};
  for (const c of SOLID_CATS) {
    // spec-event-pool-6 §二.3：今天市场层不收的那一档，草稿也不给它预填（货架上根本没有这一行的按钮）
    if (c === state.today.delist) continue;
    out[c + 1] = round01(state.YesterdaySoldJinByCat?.[c] || 0);
  }
  out.SP1 = Math.round(state.YesterdaySoup || 0);
  return out;
}

// 二审复 §二.3：付不齐时给一个**由玩家点**的「按购买力缩量」——把草稿篮按等比缩到刚好可提交，
// 缩完仍停在草稿里，玩家还能再改，改完必须自己点「就这一篮，付钱」。正本禁的是「系统自动减量成交」，
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
  // 真机修复单 f39f692：点结算这一枪先把屏上每一格重读一遍，篮子由「此刻格子里的数」决定。
  // 有一格认不出来就原地驳回（不走 go：整屏重绘会把那行字洗成 0，玩家看不见自己错在哪一格）
  if (syncDraftFromInputs()) { sfx('error'); return refreshForecast(); }   // 接入单 594b908：失败/被拒边（单上「原包只有成功边」那个缺口）
  const r = submitBasket(state, picksFromDraft(), rng);   // 第 3 步：组篮 + 支付
  if (!r.ok) { sfx('error'); return go('market'); }       // 付不齐、超柜量同样是被拒
  qtyBad.clear();               // 成交了：上一轮的读不出的登记不带进下一屏
  sfx('buy');                 // ④ 确认采购（付得成才响）
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
    sfx('stamp');                              // 接入单 594b908：定版价落定（六开关一锁、全天照这一套卖，就这一下）
  }
  // 预检必修③：滑杆开局一律空碗（0 克）。原来预填成顾客的要量，核心操作被架空；
  // 顾客要多少仍写在滑杆标签与双读数里，抓多少由玩家自己定。
  if (!orders.length) {                                        // 断点回来不重抽（抽卡会推进随机流）
    pendingEvent = drawEvent(state, 'morning', rng);           // 第 6 步：晨间事件（先亮出来才让玩家选）
    if (pendingEvent) sfx('pop');                              // 接入单 594b908：事件/消息弹出用独立的 pop，不再借点按那一声
    orders = drawHandOrders(state, rng);                       // 第 7 步的亲手单先亮单子
    gramsBy = Object.fromEntries(orders.map(o => [o.customerId, Object.fromEntries(o.lines.map(l => [l.cat, 0]))]));
    okRef = {};
    // 晨间配音（全覆盖单「晨间类事件挂晨间抽卡处的新挂点」，形状照 afterEvening 一模一样的那条 §6.1）：
    // 写在 !orders.length 守卫里面 ⇒ 与「回来不重抽」同一条命，刷新/切后台回来不重播出场句，也别挪到守卫外面。
    // 常客拍点句并进同一次 playVoice：那一支进来先 stopVoice，分两次调用会把前一段掐掉，并成一队才按「事件在前、常客在后」逐句播。
    playVoice([...voiceIntroLines(pendingEvent ? pendingEvent.id : null, state), ...regularVoiceLines()]);
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
// 视觉批 I 第二件：把原先写死在判定式子里的两枚比例请成名字，值一字未改（0.98 = 足称带、1.1 = 该捏回那一道），
// 好让进度轨的色带和判定读同一个数——一个判定两处口径正是 F8 那轮的教训，此处不留第二份。
// FULL_SHARE 只出现在 enough 与色带左沿，OVER_SHARE 只出现在 hintWanted 与色带右沿，§30 有针逐字钉这两枚值与出现次数。
const FULL_SHARE = 0.98;
const OVER_SHARE = 1.1;
// 轨道的几何：满幅 = 顾客要的克数 × 1.25。它只决定「画面最右那一边画到哪儿」，不参与任何判定（谁也没读它做取舍）。
// 不这样留白的话，98%–110% 那一带正好压在轨道最右沿，色带细成一看不见的缝。
const TRACK_SPAN = 1.25;
// 整百 tick 的那一枚「百」：秤面上的数跨过去响一声，方向上下都算（克数往下掉过整百同样是「过了一格」）。
const TICK_EVERY = 100;
let grab = null;
let pinch = null;

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
  grab = { cust: el.dataset.cust, cat: el.dataset.cat, el, t0: performance.now(), last: performance.now(), acc: 0, timer: 0,
    g0: Number((gramsBy[el.dataset.cust] || {})[el.dataset.cat] || 0) };
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
  refreshOrder(g.cust);
  // ② 抓菜落袋（音频单）：这一口真落了克才出声，指针被系统收走或空放不算
  const gave = Number((gramsBy[g.cust] || {})[g.cat] || 0);
  if (gave > g.g0) {
    sfx('grab');
    // 视觉批 I 第二件·松手顿帧 + 第一件·出餐浮字：都只挂在「这一口真落了克」那一条既有分支上，
    // 空放与指针被收走那一趟依旧什么都不放。浮字锚在数字出现的那一行（你称 X 克 所在的那一排）。
    if (fxOn()) {
      settleBubble(g.cust);
      showFloats(app, [{ in: document.getElementById(`lv-${g.cust}-${g.cat}`)?.parentElement, text: `${gave} 克` }]);
    }
  }
}

function startPinch(e, el) {
  if (grab || pinch || e.button > 0) return;
  e.preventDefault();
  try { el.setPointerCapture?.(e.pointerId); } catch { /* 同上 */ }
  el.classList.add('on');
  pinch = { cust: el.dataset.cust, cat: el.dataset.cat, el, t0: performance.now(), last: performance.now(), acc: 0, flow: false, timer: 0,
    total0: orderTotal(el.dataset.cust) };
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
  usePinchHint();
  refreshOrder(p.cust);
  // 顿帧同一条规矩也挂在捏回收手这一格：只要这一趟真动了克就定一下（与抓菜共用同一个判据形状，不新造判定）
  if (fxOn() && orderTotal(p.cust) !== p.total0) settleBubble(p.cust);
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
  // 真机修复单 f39f692：秤面不许写出柜里没有的货。封顶 = 柜量 − 别单已称走的部分，
  // 引擎那侧 takeStock 本来就按柜量扣（多称的部分收不到钱、只记一笔分量嘀咕），
  // 补上这一道是把「屏上能按出来的数」和「柜里真有的数」钉成同一个数。
  const ceiling = gramsCeilingFor(state, gramsBy, cust, cat);
  const before = orderTotal(cust);
  const next = Math.round((gramsBy[cust]?.[cat] || 0) + delta);
  gramsBy[cust][cat] = Math.min(ceiling, Math.max(0, next));
  // 视觉批 I 第二件·整百 tick：这一桌的总克数跨过一格整百，响一声轻的。
  // 挂在这一支是刻意选的——轻点、按住连加、长按捏出、键盘单击四条路全走这里，写一处就是写全部；
  // 封顶挡掉的那一截（before === after）天然不响，不需要第二条规矩。
  // 声音走 audio.js 的 weighTick：素材还是现成音效池里点按那一件（tap-A-softclick），不新录、不外找，
  // 只是不在 main.js 里直写那条通用点按的边（裁定 d619ed6 的「只剩一个入口」那根针照旧成立）。
  const after = orderTotal(cust);
  if (Math.floor(after / TICK_EVERY) !== Math.floor(before / TICK_EVERY)) weighTick();
}

function orderTotal(cust) {
  if (!gramsBy[cust]) return 0;
  const o = orders.find(x => x.customerId === cust);
  return (o ? o.lines : []).reduce((s, l) => s + Number(gramsBy[cust][l.cat] || 0), 0);
}

// 顾客这一单要的总克数：原先在 orderCard、refreshOrder 里各写一遍同样的 reduce，现在进度轨是第三处引用，
// 收成一支点——三处读同一支，不派生出口径
function orderWant(cust) {
  const o = orders.find(x => x.customerId === cust);
  return o ? o.lines.reduce((s, l) => s + l.grams, 0) : 0;
}

// 秤面读数、大字气泡、进度轨游标：屏上那三格「同一个数」由这一支笔一起写。
// shown 是给人看的那一个（高速段带跳读），real 是这一桌真正的总克数（游标跟真值走，不跟着抖，
// 否则色带会被抖成「进带又出带」，看着像判定在晃）。
function paintGram(cust, shown, real) {
  for (const id of ['rd-', 'gramb-']) {
    const el = document.getElementById(id + cust);
    if (el) el.textContent = shown;
  }
  const gauge = document.getElementById('wg-' + cust);
  const want = orderWant(cust);
  if (gauge && want > 0) gauge.style.setProperty('--p', `${(Math.min(1, real / (want * TRACK_SPAN)) * 100).toFixed(2)}%`);
}

// 秤面跳读的 ±3 克抖动只加在显示上，落进结算的是实际克数；刹车区传 false，显示真值
function jitterScale(cust, jitter) {
  const total = orderTotal(cust);
  paintGram(cust, String(jitter ? Math.round(total + (Math.random() * 6 - 3)) : total), total);
}

// 捏回提示的判定：从未捏过、且任一品类已 ≥ 该行目标的 110%（这一枚比例与进度轨色带右沿同一个数）
function hintWanted(o) {
  if (state.pinchHintUsed) return false;
  const g = gramsBy[o.customerId] || {};
  return o.lines.some(l => Number(g[l.cat] || 0) >= l.grams * OVER_SHARE);
}

// 「正好」：这一行自己称到的数与目标差 ≤ max(1 克, 目标 1%) 就在**这一行**点一下（只做呈现，不改判定）。
// 预检反馈 F5（0366bd6）：徽标原先挂在秤面总读数旁，判定的是单行落点、看起来却像整单已准（总重 125/300 也亮），
// 与签发规格（signoff-weighing-finestep 的「当前项落点达标」）对不上；那一版把标记搬回它判的那一行，文案一字不改。
// 修复单 P2-4：徽标跟着「当前行」走，切到下一单时先前称准那一行的徽标就没了——同一把判定现在每行各自留着自己的徽标，
// 手移到别处不收；行内的数被改出带外，那一行的徽标随数退场。判定带与阈值一个字没动。
function exactNow(cust, cat) {
  const target = lineTarget(cust, cat);
  const got = Number(gramsBy[cust]?.[cat] || 0);
  return got > 0 && Math.abs(got - target) <= Math.max(1, target * 0.01);
}

// 每条已锁行各自一格徽标：称重后逐行对着带内/带外翻 hidden
// 追补单三第 1 条：由藏到亮那一枚做一次弹跳。判定式子与显隐规则一个字没动，只多加一个 class；
// 与 sfx('exact') 同一次调用里发生（同刻），逐行各自触发——同一轮里几行同时进带就各弹各的。
function refreshExact() {
  let hit = false;
  for (const o of orders) for (const l of o.lines) {
    const el = document.getElementById(`ex-${o.customerId}-${l.cat}`);
    if (!el) continue;
    const shown = !el.hidden;                       // 刷新前这一枚亮不亮
    el.hidden = !exactNow(o.customerId, l.cat);     // 判定式子一字未动（P2-4 口径）
    if (shown !== true && !el.hidden) {
      hit = true;                                   // 由藏到亮 = 正好那一下
      el.classList.remove('pop');
      void el.offsetWidth;                          // 不强制这一帧重排，第二次进带就看不到第二段弹跳
      el.classList.add('pop');
    }
  }
  if (hit) sfx('exact');   // ③ 称「正好」正反馈叮声
}

// 松手顿帧（视觉批 I 第二件）：大字气泡自己顶一下再回弹。挂在「这一口真落了克」那一条既有分支上，
// 判定、克数、封顶一个字不动；摘 class 交给 animationend，这一层不留计时器（同追补单三的手法）。
function settleBubble(cust) {
  const el = document.getElementById('gramb-' + cust);
  if (!el) return;
  el.classList.remove('settle');
  void el.offsetWidth;                     // 不强制这一帧重排，连按两次只有第二段动
  el.classList.add('settle');
  el.onanimationend = () => el.classList.remove('settle');
}

// 短斤带（<90%）行内提示的口径：这一行进过碗、松手后仍不足。0 克是「还没称」不是「这一口下去了」，不提示。
// 预检反馈 F8（0366bd6）：原来还额外豁免「刚松手的那一行」，于是六品类里谁能看到红字，取决于玩家最后放了哪一行——
// 同屏两人同为 50/100 克，一个有红字一个没有。豁免撤掉后规则对六品类一致：满足条件必出。
function flagText(cust, l, got) {
  if (!(got > 0 && got < l.grams * 0.9)) return '';
  return `${CAT[l.cat].name}这一口下去就短了`;
}

// 真机修复单 f39f692（Orange 20261104）：没进单的品类不许在秤上凭空长出克数。
// 柜里这一样是 0 克 → 这一行的「抓」按钮从一开始就是死的（不是藏起来：藏了玩家不知道少了哪一格）；
// 被别单称完 → 同一枚 gramsCeilingFor 判，与 addGrams 的封顶同一个数，两处不许各说各话。
const grabDead = (cust, cat) => Number(gramsBy[cust]?.[cat] || 0) >= gramsCeilingFor(state, gramsBy, cust, cat);

// 行内那一行字：先说「柜里没有 / 柜里的称完了」，再走原来的短斤提示。渲染与实时刷新共用这一支（同 F8 的教训：一处一个口径就会同屏不一致）
function rowNote(cust, l, got) {
  const have = stockGrams(state, l.cat);
  if (have <= 0) return `「${CAT[l.cat].name}」柜里没有这一样 · 这一口称不出`;
  if (got >= gramsCeilingFor(state, gramsBy, cust, l.cat)) return `「${CAT[l.cat].name}」柜里就 ${have} 克，已经称完了`;
  return flagText(cust, l, got);
}

// 实测反馈 #1/#2：这一屏一律用「克」，秤面读数带单位；顾客要的与实际称的两个数必须同时在屏上
function refreshOrder(cust) {
  const o = orders.find(x => x.customerId === cust);
  const g = gramsBy[cust];
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const total = orderTotal(cust);
  const want = orderWant(cust);
  paintGram(cust, String(total), total);
  // 预检应修⑦：秤面主读数保持克（真实秤就是这么读），斤换算常驻角标——买菜论斤、称重论克本就是真实口径
  setText('rj-' + cust, `${(total / GRAMS_PER_JIN).toFixed(2)} 斤`);
  setText('sum-' + cust, `顾客要 ${want} 克 · 你称 ${total} 克`);
  const enough = want > 0 && total / want >= FULL_SHARE;
  const sc = document.getElementById('sc-' + cust);
  // 视觉批 I：这一枚 ok 是全场唯一的「进带」位（判定式子一字未动）。它同时点亮三处呈现——
  // 秤面反色、气泡描边转青绿、色带点亮一档；三处都只吃这一枚 class，不出第四个口径。
  document.getElementById('oc-' + cust)?.classList.toggle('ok', enough);
  if (sc) {
    sc.classList.toggle('ok', enough);
    // 足称那一刻：真机震一下（浏览器/无震动接口的环境自动跳过），音效素材后补
    if (enough && !okRef[cust]) {
      navigator.vibrate?.(10);
      // 「夸」泡：由藏到亮这一次才冒（松手定格与长按捏出的每一跳都走这里，翻回来再翻过去才算第二次）
      if (fxOn()) showBubbles(app, [{ cust, text: praiseSay() }]);
    }
  }
  okRef[cust] = enough;
  // 捏回教学：只在「松手定格」后判（refreshOrder 不在按住途中调用），任一品类 ≥110% 且从未捏回才露
  // 长按捏出的每一跳也会走到这里：正在捏的时候不提示「去捏」
  const hint = document.getElementById('hint-' + cust);
  if (hint) hint.hidden = !!pinch || !hintWanted(o);
  const fx = [];
  for (const l of o.lines) {
    const got = Number(g[l.cat] || 0);
    setText(`lv-${cust}-${l.cat}`, `你称 ${got} 克`);
    // 行内那一句（短斤嘀咕 / 柜里没有 / 已经称完了）的前后态直接从 DOM 读，不另立一份记录：
    // 空 → 有字 = 这一口刚短下去（冒「抱怨」泡）；抓按钮 活 → 死 = 这一样柜里刚称完（冒「卖断」浮字）。
    const flag = document.getElementById(`flag-${cust}-${l.cat}`);
    const wasFlagged = !!flag?.textContent;
    const note = rowNote(cust, l, got);
    if (flag) flag.textContent = note;
    if (!wasFlagged && note) {
      if (fxOn() && flagText(cust, l, got)) showBubbles(app, [{ cust, text: grumbleSay() }]);
    }
    // 分段步长写在按钮上：当前这行离目标多远，按钮就写对应的 ±5 / ±1
    const step = stepFor(cust, l.cat);
    setText(`tap-${cust}-${l.cat}`, `轻点 +${step} 克`);
    setText(`pn-${cust}-${l.cat}`, `捏出 −${step} 克`);
    // 真机修复单 f39f692：柜量见底（含被别单称完）当场把这一行的「抓」断电，与 addGrams 的封顶同一次判定
    const gb = document.getElementById(`gb-${cust}-${l.cat}`);
    if (gb) {
      const wasAlive = !gb.disabled;          // 前后态直接从 DOM 读，不另立一份记录（视觉批 I：这一跳就是「柜里刚称完」）
      gb.disabled = grabDead(cust, l.cat);
      if (fxOn() && wasAlive && gb.disabled) fx.push({ in: gb.parentElement, text: note });
    }
    const pn = document.getElementById(`pn-${cust}-${l.cat}`);
    if (pn) pn.disabled = got <= 0;
  }
  if (fx.length) showFloats(app, fx);
  refreshExact();
}

// 视觉批 I 的总闸：动效只在营业屏（weigh）那一屏放，别的屏连节点都不生成。
// 降级屏（prefers-reduced-motion）与切后台（fx-paused 同一判据）也走这一格——单上「不许糊屏」在低配机上的落点。
const fxOn = () => phase === 'weigh' && !reduceMotion();

// 进这一屏那一刻，每一桌把单子自己念一遍（点单泡）。信号源就是亲手单本身（碗数 + 品类名），不引新词。
// 「催」挂第一桌：现成字段只有 state.YesterdaySoldOut 这一枚当日布尔位（出摊页那句红字同一个字段），
// 它说不出「哪一桌在催」，也不许为这一泡新造一桌一计数——单上红线：信号只许映射现成字段。
// 它排在最前，于是同屏上限那一格先被「催」占掉一席，剩下的一席给第一桌以外的下一张单子（上限与取舍见 feedfx）。
function mountOrderSay() {
  if (!fxOn() || !orders.length) return;
  const cands = orders.map(o => ({ cust: o.customerId, text: orderSay(o) }));
  if (state.YesterdaySoldOut) cands.unshift({ cust: orders[0].customerId, text: rushSay() });
  showBubbles(app, cands);
}

function cook() {
  stopAllBlanch();
  runDay(state, orders, gramsBy, rng, blanchBy);   // 第 7 步：营业（烫煮开关关着时 blanchBy 一格都没有，信号档逐字等于过称档）
  nightSettle(state, rng);                 // 第 8–9 步：账目与暗线
  saveGame(state);
  return go('settle');
}

function afterEvening() {
  if (pendingEvent) return go(phase);        // 已经抽出来了，重复点「打烊」不再二次抽卡
  pendingEvent = eveningDraw(state, rng);  // 第 10 步抽取
  // 事件出场＝配音出场（挂载单 voice-qc-mount-20261105 第一条：按序号逐句播）。11-05 那批九条目标事件全是 timing:'evening'，
  // 当时晨间没有挂载对象；全覆盖批（e2a6293）把三条晨间事件挂到了 openShop 的抽卡点，两处读同一张 VOICE_INTRO。
  // 出声与出声成败都不挡这一句 go：正文和选项照原时序渲染，音频只负责出声。
  if (pendingEvent) { sfx('pop'); playVoice(voiceIntroLines(pendingEvent.id, state)); return go(phase); }   // 停在弹层等玩家选（接入单 594b908：弹出走独立的 pop）
  return finishNight(null);
}

function resolvePending(choice) {
  const ev = pendingEvent;
  pendingEvent = null;
  stopVoice();   // 卡片一落定，这一段对白就收：扩写演完落回原选择点，出场句不许越过玩家的点选往后播
  if (ev.timing === 'morning') {
    const picked = resolveChoice(state, ev, choice);   // 第 6 步当场入账
    // 结果句的晨间那一支（全覆盖单 §6.3：在 resolveChoice 之后、saveGame 之前取一次 today 的两处原文落点认句）。
    // 补遗 §一：同一拍再认「玩家实际点下的那个选项」——没原文可认的那一类（★18 句）就以 action id 为键，两条键法共用这一处调用。
    // 认不出＝当没这句；出声与否都不改 go(phase) 的时序。
    playVoice(voiceResultLines(ev.id, resultTexts(state), picked.action ? picked.action.id : null));
    saveGame(state);
    return go(phase);
  }
  return finishNight(choice, ev);           // 第 10–12 步在选择之后一次走完
}

// ev 显式传入：晚间事件要等玩家点选才落地，抽到的那张不能在中途被清空
function finishNight(choice, ev = pendingEvent) {
  const res = nightClose(state, rng, ev || null, choice ?? null);
  pendingEvent = null;
  saveGame(state);
  // 结果句挂在选择落地之后（挂载单「按结果原文落点挂，不许顺序乱播」）。11-05 那批只有检查两条有结果句，
  // 键取的是 inspection.js 刚写进 today.notes 的判定原文；全覆盖批把查找集合扩成 notes + forcedComments（§6.3），
  // 键改从 choice.event.id 取——两条检查事件的 judgment.id 本来就是同一个 id，行为一字未变，日常事件因此才认得到句。
  // 补遗 §一：第三个参数是玩家点下的选项 id，专吃「选完没有结果文字」那一类（★18 句），同事件选别的选项不出声。
  const evening = res && res.evening ? res.evening.choice : null;
  if (evening) playVoice(voiceResultLines(evening.event.id, resultTexts(state), evening.action ? evening.action.id : null));
  return go('night');
}

// 附录 G.4 把三个主动结局挂在三个不同动作上，界面照它分三个入口：
// 「盘下对面铺子」= 置办面板里 门面→双店 那一笔（#3/#4 判在钱出去之前）、「把摊子盘出去」= #5、「不干了」= #6
function retireShop() {
  const e = judgeRetire(state);            // 判空即过：入口本只在 NP/达标时出现，真不达标就什么也不发生
  if (!e) return go('night');
  sfx('level');                            // ⑥ 盘店 jingle（真成了结局才响）
  state.EndingId = e;
  saveGame(state);
  return go('end');
}

function quitShop() {
  sfx('level');
  state.EndingId = ENDING.MEDIOCRE;        // #6 是随时出口，不设门槛（§六「玩家随时可点不干了」）
  saveGame(state);
  return go('end');
}

function buyNextTier() {
  const price = TIERS_STALL[state.Tier - 1].upgradePrice;
  if (!price || state.Cash < price) return go('shop');
  sfx('level');                            // ⑥ 升级 jingle（钱够、真升了才响）
  // 门面 → 整街双店这一笔就是正文 §六 说的"盘下对面铺子"：#3/#4 判在付钱当刻，判空即过、只升档
  if (state.Tier === 5) {
    const e = judgeBuyout(state);
    if (e) {
      state.EndingId = e;
      saveGame(state);
      return go('end');
    }
  }
  upgradeStall(state);
  saveGame(state);
  return go('shop');
}

// 修复单 P2-1（凡扣款必有行）：固定支出与人工在收摊那一屏逐行列着，账本这张「逐日账」只有净额一列，
// 拿它回头加一遍就差这两笔（第 1 天也在这张表上核过账）。数一格没新增——把当日扣的两笔与试吃净额写在同一格里。
const deductCell = r => {
  const parts = [];
  if (r.fixedCents) parts.push(`固定支出 −${y(r.fixedCents)}`);
  if (r.laborCents) parts.push(`人工 −${y(r.laborCents)}`);
  if (r.tastingNetCents) parts.push(`试吃净额 ${r.tastingNetCents > 0 ? '+' : '−'}${y(Math.abs(r.tastingNetCents))}`);
  return parts.length ? `<div class="muted">${parts.join(' · ')}</div>` : '';
};

// 视觉批 I 第三件：今晚的留言壳子换成信封三态。正文一个字没改，条数、出现条件、底部按钮与流程顺序全照旧。
// 未读 = 封口只露一行标题（标题取法见 feedfx 的 envelopeTitle，只截显示用的那一行）；
// 点开 = 拆封展开全文（正文仍走已签的 .comment 那一层皮）；再点一下 = 压平置后（硬阴影撤掉、排到队尾）。
// 「置后」只动同一批留言在屏上的先后，不动 t.comments 本身——那是引擎的账，呈现层不碰。
function envList(comments) {
  const key = i => envKey(state.Day, i);
  const row = (c, i) => {
    const st = envState[key(i)];
    const open = st === 'open';
    const say = envelopeTitle(c.text);
    // 小修单 task-ui-fix-20261106 第一项：展开态里标题与正文归一后全等 ⇒ 标题行不再渲染，只留正文那一份。
    // 判重只发生在 open 这一格——封口与压平两态正文是藏着的，屏上只有标题那一行，本来就只有一份。
    // 正文长于标题的长留言两者不相等，标题 + 正文原样照旧（判据是 feedfx 的 isSameSay，这里不另立口径）。
    return `<button class="env${open ? ' open' : st === 'read' ? ' read' : ''}" data-act="env" data-n="${i}">
      ${open && isSameSay(say, c.text) ? '' : `<span class="envt">${esc(say)}</span>`}
      <span class="envbody comment${c.kind === 'hot' ? ' hot' : ''}"${open ? '' : ' hidden'}>${esc(c.text)}</span></button>`;
  };
  const idx = envOrder(comments.map((_, i) => envState[key(i)]));
  return idx.map(i => row(comments[i], i)).join('');
}

// 拆封 / 压平：只有这一格会话态，写完立刻重绘这一屏。不落存档、不落 localStorage、不进引擎字段。
function toggleEnv(n) {
  const k = envKey(state.Day, Number(n) || 0);
  envState[k] = envState[k] === 'open' ? 'read' : 'open';
  return go('night');
}

// ── 画面 ─────────────────────────────────────────────────
const VIEWS = {
  boot() {
    return `${sceneImg('business', '学校小吃街的三轮车摊', 'hero')}
      <div class="panel accent">
      <h1>先把规矩<br>立住！</h1>
      <p class="muted">学校小吃街麻辣烫摊 · M1 样段</p>
      <div class="stack" style="margin-top:14px">
        <input type="text" id="seedbox" placeholder="种子（同种子复现同一局）" value="${Date.now() % 100000}" />
        <button class="go" data-act="new">开新档</button>
        ${loadGame() ? '<button class="ghost" data-act="continue">继续上一局</button>' : ''}
      </div></div>
      <div class="panel"><p class="muted">开局 ${y(START_CASH_CENTS)} 元；老李他们给 ${y(START_CREDIT_CAP_CENTS)} 元货款额度，卖了再给钱；三轮车每天固定支出 ${y(TIERS_STALL[0].fixedCost)} 元；
        新摊子头三天没人认得你，一天比一天有人来，第四天才算站稳。卖断货是看得见的信号，第二天买多少你说了算。</p></div>`;
  },

  // 瘦身单 task-morning-trim-20261104（店主 2026-11-04 点选）：「今晨结转」整卡撤销——
  // 现金、欠着两行与顶栏重复（顶栏本来就挂现金／欠款／可赊），删掉，出摊页不留第二份；
  // 昨日结算收成一行入口「昨日结转 ▸」，点击进账本看日报全文，行内不带数字摘要（防两处口径打架）；
  // 明日预报并入下面这张天气卡，「人气·开业客流 ×0.4」那类乘数从界面消失，改由词句表说人话。
  // 裁定 `f6a8ebf` §三.4 把同一把尺子伸到 boot 教学屏：那三个乘数一并改人话，与天气词句同语域（全界面零系数到此封口）。
  // 街面价签、柜里还剩本单不动。批 E 的语义图标与同色底衬照旧，只是不再摆重复数。
  morning() {
    const sc = state.today.scenario;
    const talk = weatherTalk(sc, state);
    return hud() + `
      ${steamScene('stall', '三轮车摊位')}
      <div class="panel">
        <div class="row"><h2>今日天气</h2><span class="tag">${weatherIcon(sc.weather.id)}${calendarIcon(sc.calendar.id)}${sc.label}</span></div>
        ${talk.length ? `<p class="muted">${talk.join('')}</p>` : ''}
        <p class="muted">明日 ${state.today.forecast}</p>
        ${state.DailyReports.length ? '<p><button class="mini ghost" data-nav="ledger">昨日结转 ▸</button></p>' : ''}
      </div>
      ${streetPanel()}
      <div class="panel warn"><h3>${icon('s-stock')}柜里还剩</h3>
        <div class="row">${ALL_CATS.map(c => `<span class="muted">${CAT[c].name}<br><b class="chip num">${(c === 'SP' ? state.StockSoup : state.StockSolid[c]).toFixed(2)}</b>${c === 'SP' ? ' 份' : ' 斤'}</span>`).join('')}</div>
        ${state.YesterdaySoldOut ? '<p class="negv">昨天卖断过货。今天这一样多备一手。</p>' : ''}</div>
      ${preEvent ? `<div class="panel good"><h3>晨间情报</h3>
        <img class="inlineart" src="${eventArt(preEvent.id)}" alt="" />
        <p class="text">${esc(preEvent.text)}</p>
        <p class="muted">市场页的标价已经按这个变了。</p></div>` : ''}
      <button class="go" data-act="toMarket">去市场</button>`;
  },

  market() {
    const { forecast } = previewBasket(state, picksFromDraft(), state.PriceTier);
    return hud() + `
      ${sceneImg('market', '市场采购')}
      ${ALL_CATS.map(cat => shelfRow(cat, forecast)).join('')}
      <div id="marketDetail">${marketDetailHtml(forecast)}</div>
      <div id="marketFoot" class="stickfoot">${marketFootHtml(forecast)}</div>`;
  },

  // 预检反馈 F11（signoff-f11-tabbar）：设施货架与摊位升级从市场页底部拆出来，成整屏页。
  // 任何 hub 时点都「看得见」，但买与升的操作时点一个字没动——采购窗口之外一律置灰并给一句世界内的理由。
  // 批 B：六档逐行上图之后，页首那张借来的营业图撤了（施工单：撤留自决，但不许再挂营业图充数）。
  shop() {
    return hud() + `${facilityRow()}`;
  },

  // 「我的」只做存档状态只读 + 重开 + 清除 + 版本号。旧红线：Rep/Risk/C/H/L/Q 的数字一律不进这一屏，
  // 所以 grid2 五格全是顶栏本来就摆着的量，不做成属性面板。
  // 红线修订（工单 task-wind-panel-20261104，店主 2026-11-04 签）：档位可以进面板，数字、计数器名、精确涨跌值仍永远不许进；
  // 获批出口只有页首这张「摊口风向」，本屏其余各处与结算屏、出摊 hub 一样按旧规矩，不许顺手扩散（回归 §25 钉引用点唯一）。
  // 批 C（task-ui-fidelity-batch C 项）：下半屏那片空白用画面填——陈实立绘 + 当前档位形态图（随档切换，复用 B 的六档图）。
  // 填版只填画面：数据项一格没加、条与箭头一个没添。
  me() {
    return hud() + windCard(state) + `<div class="panel">
      <h2>我的摊子</h2>
      <div class="meband">
        <img class="mechar" src="./img/chenshi.webp" alt="陈实" decoding="async" />
        <img class="metier" src="./img/tier-${state.Tier}.webp" alt="${state.tierName}" decoding="async" />
      </div>
      <div class="grid2">
        <div><div class="muted">营业天数</div><div class="num">${state.Day} 天</div></div>
        <div><div class="muted">摊位</div><div class="num">${state.tierName}</div></div>
        <div><div class="muted">现金</div><div class="num ${state.Cash < 0 ? 'negv' : ''}">${y(state.Cash)} 元</div></div>
        <div><div class="muted">欠着</div><div class="num">${y(state.DebtSupplier)} 元</div></div>
        <div><div class="muted">可赊</div><div class="num">${y(creditAvailable(state))} 元</div></div>
      </div>
      <p class="muted">存档存在这台设备的这个浏览器里，换浏览器或清浏览器数据就带不走。规则版本 ${SAVE_VERSION}。</p>
      <div class="row" style="margin-top:10px">
        <button class="ghost" data-act="mute">${isMuted() ? '声音：关' : '声音：开'}</button>
        <button class="ghost" data-act="intro">重看开场</button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="ghost" data-act="restart">重摆一个摊</button>
        <button class="ghost" data-act="clear" ${clearArmed ? 'style="border-color:var(--tomato);color:var(--tomato)"' : ''}>${clearArmed ? '确认清除？' : '清除存档'}</button>
      </div>
      ${clearArmed ? '<p class="negv">再点一次就清：这一局的账（浏览器里那份也一起）没了，回到开屏。</p>' : ''}
      <p class="muted">片头曲：Rubber Nod，作者 ziniyeons，可商用</p>
      <p class="muted credit">Music: “Rubber Nod” by ziniyeons (niftyshelf.com/music/rubber-nod)</p>
    </div>`;
  },

  prep() {
    const used = prepGridUsed(state, prepPick, wakePick);
    const budget = prepBudget(state);
    const over = used > budget;
    const washSkipped = prepPick[0] === '跳过';
    return hud() + `${sceneImg('stall', '开卖前的备菜')}
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
      ${over ? '<p class="negv">工时不够，这一套备不下来——先挪一格，或者把早起那格勾掉。</p>' : ''}
      <button class="go" style="margin-top:12px" data-act="prepDone" ${over ? 'disabled' : ''}>备完 · 去定版</button>
    </div>`;
  },

  lock() {
    const sc = state.today.scenario;
    const mix = CLIENT_MIX[sc.calendar.id] || CLIENT_MIX.normal;
    const crowd = Object.entries(mix).sort((a, b) => b[1] - a[1])[0][0];
    const showAdditive = additiveUnlocked(state);
    return hud() + `${sceneImg('pricing', '开门前定版')}
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
      <div class="row pickrow">${['bag', 'normal', 'thermal'].map(id => `<button class="${packingPick === id ? 'sel' : 'ghost'}" data-act="pack" data-pack="${id}">
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
      <button class="go" style="margin-top:14px" data-act="open">掀帘子，开门</button>
    </div>`;
  },

  weigh() {
    // 小修单 task-ui-fix-20261106 第四项：晨间这一弹原先整屏换掉出餐站，底页（场景图 + 亲手单）一个节点都没建，
    // .55 墨蓝遮罩直接压到奶油 body 上（theme.css:20/470），blend 出来就是店主截图里「顶栏之下大半屏平灰空面」。
    // 晚间那一支在预检反馈 F6（0366bd6）已改成「先把账排在屏上、弹层作覆盖层追加」，所以对照样本只晨间灰空。这里同一味：
    // 底页先落，弹层追加。遮罩本身一个字没动（不透明度与层级与各弹层现行口径本来就同一枚），也不是把灰底换个颜色。
    const overlay = pendingEvent ? eventOverlay() : '';
    return hud() + `${sceneImg('weighing', '出餐站过称', 'hero')}
      <div class="panel accent">
      <div class="row"><h2>出餐站 · 亲手单 ${orders.length} 单</h2>
        <span class="whoimg"><img class="face" src="./img/chenshi.webp" alt="陈实" /><b>陈实 · 掌秤</b></span></div>
      <p class="muted">先亮单子，再过称。轻点一下添一小撮，一下几克写在单子右边；想多要点就按住不松，松手定格；抓多了捏出一点。这一屏只用克，一碗标准 ${GRAMS_PER_JIN} 克，秤上是多少就收多少。${state.blanchOn ? '过完称，碗下烫锅。' : ''}</p>
      <div class="stack" style="margin-top:10px">${orders.map(orderCard).join('')}</div>
      <button class="go" style="margin-top:14px" data-act="cook">下锅 · 开卖</button>
    </div>${overlay}`;
  },

  // 批H（工单 task-ui-polish-20261105 第 7 条）：结算屏改三段——① 净利大字最先并放大，② 紧随一条藏青播报行，
  // ③ 收支明细收成「进账 / 出账」两组折叠（`<details>` 原生展开，不引 JS、不加计时器）。
  // 每一行的字与数都从原来那行搬过来，一个字段没重算；播报行只读明账，暗线一个数字一档话都不进（§28 钉）。
  settle() {
    const r = dailyReport(state);   // 当日报表此刻还在 today 上，DailyReports 末尾是昨天的，不能取
    const t = state.today;
    // F7：卖断文案把当日 T 一起带出来——「买 12 份卖 11 碗还报卖断」在 T>1 的日子是对的，看不见 T 就成了玩家嘴里的 bug
    // 复现单 `task-repro-20261105` 第一项：名单在**拼装源头**按基名归并，红字行与播报 soldout 句读同一份，不各拼一份。
    const out = mergeSelloutNames(t.soldOutCats.map(c => CAT[c].name),
      t.soupSoldOut ? `汤底（每碗耗 ${t.scenario.T} 份）` : null);
    // 预检反馈 F6（0366bd6）：晚间事件弹层原先整屏换掉这张账，事件日就从「打烊」那一刻起再也看不到净额行。
    // 账目与事件各回各位：先把账排在屏上，弹层作为覆盖层追加，玩家点完分支照样落第 10–12 步。
    const overlay = pendingEvent ? eventOverlay() : '';
    const { inCents, outCents } = inoutTotals(r);
    const prevBest = state.DailyReports.length
      ? Math.max(...state.DailyReports.map(x => x.revenueCents)) : null;
    const bc = broadcastLine({ ...r, inCents, outCents, soldOutText: out.join('、') }, prevBest);
    return hud() + `${sceneImg('settlement', '收摊结算', 'settle')}
      <div class="panel">
      <h2>收摊账目</h2>
      <div class="netplate"><span class="netk">经营净额</span>
        <b class="netv">${signRoll(r.netOpsCents)}</b>
        <span class="muted">卖出 ${r.bowls} 碗 / ${r.J.toFixed(2)} 斤${t.deltaJ ? `（秤上按 ${t.J_bill.toFixed(2)} 斤收的钱）` : ''}</span></div>
      <div class="bcast">${esc(bc.text)}</div>
      <details class="grp">
        <summary><span>进账</span><b class="num">+${y(inCents)}</b></summary>
        <table>
          <tr><td>流水</td><td class="r num"><span class="roll" data-c="${r.revenueCents}">${y(r.revenueCents)}</span></td></tr>
          ${t.tastingPortions ? `<tr><td>试吃 ${t.tastingPortions} 份 · 每份 1 元</td><td class="r num">${sign(t.tastingIncomeCents)}</td></tr>` : ''}
        </table>
      </details>
      <details class="grp">
        <summary><span>出账</span><b class="num">−${y(outCents)}</b></summary>
        <table>
          <tr><td>食材成本（卖掉的才算）</td><td class="r num">−${y(t.ingredientCents)}</td></tr>
          <tr><td>${PACKING_NAMES[state.PackingTier]} · ${r.bowls} 碗 × ${PACKING[state.PackingTier].toFixed(2)} 元</td><td class="r num">−${y(t.packingCents)}</td></tr>
          ${t.additiveCents ? `<tr><td>${ADDITIVE[state.AdditiveTier].goods || '添加剂'}</td><td class="r num">−${y(t.additiveCents)}</td></tr>` : ''}
          <tr><td>隔夜报损</td><td class="r num">${sign(-r.writeoffCents)}</td></tr>
          <tr><td>固定支出</td><td class="r num">−${y(r.fixedCents)}</td></tr>
          ${r.laborCents ? `<tr><td>人工 · 小豆日结</td><td class="r num">−${y(r.laborCents)}</td></tr>` : ''}
          ${t.tastingPortions ? `<tr><td>样品食材（今天从柜里出，不另掏现金）</td><td class="r num">−${y(t.tastingCostCents)}</td></tr>` : ''}
        </table>
      </details>
      <p class="muted netchk">进账 ${y(inCents)} − 出账 ${y(outCents)} = 经营净额 ${y(r.netOpsCents)} 元。</p>
      <table class="carry">
        <tr><td>今晚自动还款</td><td class="r num">${y(t.repaidCents || 0)}</td></tr>
        <tr><td>现金</td><td class="r num ${state.Cash < 0 ? 'negv' : ''}"><span class="roll" data-c="${state.Cash}">${y(state.Cash)}</span></td></tr>
        <tr><td>还欠</td><td class="r num">${y(state.DebtSupplier)}</td></tr>
      </table>
      ${out.length ? `<p class="negv" style="margin-top:8px">今天这些卖断了：${out.join('、')}。</p>` : ''}
      <p class="muted">经营净额 = 销售毛利 − 隔夜报损 − 固定支出 − 人工 + 试吃净额，与账本「逐日账」那一项同一个式子、同一个数。</p>
      ${t.tastingConvert ? `<p class="muted">试吃尝过的人里有 ${t.tastingConvert} 位明天算回头熟客。</p>` : ''}
      ${(t.handRefused || 0) > 0 ? '<p class="negv">有亲手单没接住（超出当天能出的碗数）。</p>' : ''}
      ${t.spillBowls ? `<p class="muted">外带漏洒 ${t.spillBowls} 碗。</p>` : ''}
      ${t.deferredBowls ? `<p class="muted">锅出到头了：熟客有 ${t.deferredBowls} 碗当天没排上${t.regLost ? `，走了 ${t.regLost} 位。` : '，留到明天。'}</p>` : ''}
      <button class="go" style="margin-top:12px" data-act="evening">打烊 · 过一遍今晚的事</button>
    </div>${overlay}`;
  },

  night() {
    const t = state.today;
    const dry = state.StockSoup <= 0 && SOLID_CATS.every(c => state.StockSolid[c] <= 0);
    return hud() + `${sceneImg('night', '打烊后的今晚')}
      ${state.Cash < 0 ? `<div class="panel accent">
        <h3 class="kind-bad">现金已经见底</h3>
        <p>现在是连负第 ${state.NegativeCashStreak}/3 天${state.NegativeCashStreak >= 3 ? '' : `——再连负 ${3 - state.NegativeCashStreak} 天就收摊（破产）。`}</p>
        ${dry ? '<p class="muted">柜里没汤底、也没剩货：明天这锅开不起来，先想办法把现金填回来。</p>' : ''}
      </div>` : ''}
      <div class="panel">
      <h2>今晚的留言</h2>
      ${t.comments.length ? envList(t.comments)
        : '<p class="muted">今晚没人说话。摊布明儿还得洗。</p>'}
      ${t.reserveResult ? `<p class="muted">社团那单预订${t.reserveResult.delivered ? '按数出满了。' : '没出满。'}</p>` : ''}
    </div>
      ${t.notes.length ? `<div class="panel"><h3>今晚记下的</h3>
        ${t.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}
        ${t.eventAssetLoss ? `<p class="muted">柜里销毁的货按成本记 ${y(t.eventAssetLoss)}，现金没动。</p>` : ''}</div>` : ''}
    ${state.EndingId ? `<div class="panel accent"><h2 class="kind-bad">${ENDING_NAMES[state.EndingId]}</h2>
      <p>这一局到这儿。剩下的就是你那张进货单。</p>
      <button class="go" style="margin-top:10px" data-nav="ledger">看进货单</button></div>`
      // #6「不干了」是随时出口、不设门槛；#5「把摊子盘出去」按 §六 只在 净赚 ≥300,000 且 C ≥5 时才出现（G.4 补一句"C<5 时入口不出现"）
    : `<div class="row"><button class="ghost" data-act="next">开第 ${state.Day + 1} 天</button>
        <button class="ghost" data-act="quit">不干了</button>
        ${state.C >= 5 && state.NP >= RETIRE_NP_CENTS ? '<button class="ghost" data-act="sellout">把摊子盘出去</button>' : ''}</div>`}`;
  },

  // 批 D（task-ui-fidelity-batch D 项）：进货单每行配一枚 SKU 缩略图（复用市场那张 2×2 拼版的同一格，不另出图），
  // 逐日账的经营净额加色块底衬（文字色本就走 .pos/.negv，这里只是让正负在密表里一眼分得开）。
  // 排版批 L1（task-mobile-layout-batch-20261102）：八列表在 360px 下每格被压成一列单字，整张表改堆叠行——
  // 第一排 = 缩略图 + 品名 + 大号金额，第二排 = 来源·数量·单价·现金/赊·票 的小字元信息。
  // 撤掉表头后，原先靠表头表意的三格（单价 / 现金·赊 / 票）把字段名就近写回行内；数与口径一个字没动。
  ledger() {
    const p = replayPage(state);
    const byDay = {};
    for (const row of p.purchases) (byDay[row.day] = byDay[row.day] || []).push(row);
    const days = Object.keys(byDay).sort((a, b) => a - b);
    return hud() + `<div class="panel">
      <div class="row"><h2>进货单</h2><button class="mini ghost" data-nav="back">返回</button></div>
      ${days.length ? days.map(d => `<h3 style="margin-top:10px">第 ${d} 天</h3>
        <div class="lrows">${byDay[d].map(purchaseRow).join('')}</div>`).join('')
        : '<p class="muted">还没买过东西。头一天的单子都这样，比脸干净。</p>'}
      <hr /><h3>逐日账</h3>
      <div class="lrows">${p.reports.map(dayRow).join('')}</div>
      <p class="muted" style="margin-top:8px">对账：现金 ${y(p.bridge.cash)} · 账面 ${y(p.bridge.bridge)} · 差 ${y(p.bridge.diff)}
        ${p.bridge.ok ? '（平）' : '（不平，报开发）'}</p>
      <p class="muted">经营净额这一项不只减报损：还扣了当日固定支出与人工（小豆在场才结），并把试吃的份钱减样品成本算了进去——这三笔就写在净额下面。要连着流水、包装一起逐行看，每天收摊那屏都列全了。</p>
    </div>${state.EndingId ? endPanel(p) : ''}`;
  },

  end() {
    return endPanel(replayPage(state), true);
  },
};

const ENDING_NAMES = { 1: '翻车', 2: '破产', 3: '规矩立住', 4: '烧心大王', 5: '金盆洗手', 6: '平庸收摊' };

// ── 动画单（task-event-motion-20261102）+ 追补单二（task-event-motion-add-wang-20261103）：呈现标签 → class。
// 两张表只喂呈现层，不参与任何判定。FX_CLASS 的键就是 events.js 里那枚 motion 字段；theme.css 里同名的待遇是唯一的消费方。
// 前四键 = 通用四模板；后四键 = 王老板线专属（fx-wang 是所有专属行共用的跳段标记，第二枚才选待遇）。
const FX_CLASS = {
  bad: 'fx-bad', good: 'fx-good', person: 'fx-person', calm: 'fx-calm',
  wang_intro: 'fx-wang fx-wang-intro',   // 初见：全场微暗 + 形象图慢推近，落定后才出正文
  wang_copy: 'fx-wang fx-wang-copy',     // 山寨：自家摊与山寨摊双图左右对开 + 一次轻震
  wang_deal: 'fx-wang fx-wang-deal',     // 收购：合同纸面落桌 + 盘店价读数放大 + 按钮延后
  wang_press: 'fx-wang fx-wang-press',   // 其余王老板线：同一压场语法（微暗 + 慢推近）
};
// 结局待遇：#3 规矩立住 / #5 金盆洗手 = 单上写明的「结局屏专属排面」（金光 + 主体升入）；
// #1 #2 #4 走坏消息模板，#6 走中性模板，都不给专属。
const FX_ENDING = {
  [ENDING.RULES]: 'fx-end', [ENDING.RETIRE]: 'fx-end',
  [ENDING.CRASH]: 'fx-bad', [ENDING.BANKRUPT]: 'fx-bad', [ENDING.HEARTBURN]: 'fx-bad',
  [ENDING.MEDIOCRE]: 'fx-calm',
};
// 逐字蹦字：正文切成「一个字一个 span」，序号交给 CSS 的 --i 算延迟。字一个不改，只动呈现。
const typedHtml = text => [...text].map((ch, i) => `<span class="ch" style="--i:${i}">${esc(ch)}</span>`).join('');

// 预检反馈 F1（0366bd6）：这一列原先只有「有 / 无」两态，把手气没抽中、本来就不给票、自制不进取数三种情况全塌成了「无」。
// 于是外购全带票的日子，结局屏按口径算出的覆盖率是 100%（自制两边都不进），玩家拿明细自己除却得到 90%——
// 数没错，是这一列把口径说反了。自制行从此单列「自制·不计」，与外购无票分开。
// 进货行的缩略图 = 市场货架同一张 2×2 拼版的同一格（品类决定哪张表、货源档决定哪一格），不另出一批小图。
// 认不出货或认不出档的行不画空格——宁可少一格图，也不给一行挂错卖相。
const buyThumb = r => {
  const s = SKU_BY_ID[r.sku];
  if (!s || !SKU_SHEET[r.cat] || !TIER_CELL[s.tier]) return '';
  return `<i class="thumb" data-cell="${TIER_CELL[s.tier]}" style="background-image:url(./img/${SKU_SHEET[r.cat]}.webp)"></i>`;
};
// 净额色块：文字色与数一律还是 sign() 那一档给的（正青绿 / 负番茄红），这里只加一层同色底衬，不新增任何判定
const netChip = c => `<span class="chip${c > 0 ? ' pos' : c < 0 ? ' neg' : ''}">${sign(c)}</span>`;

// 排版批 L1：表头撤了，字段名就近写回行内（票这一格仍按 F1 的三态：自制单列，不与「无票」混为一谈）
const ticketText = r => SKU_BY_ID[r.sku]?.receipt === 'excluded' ? '自制·不计' : `票 ${r.hasReceipt ? '有' : '无'}`;
// 元信息一格一段：段内不许折行，段与段之间整段换行——宁可两行放完，也不许任何一格被压成单字竖排
const metaSeg = (t, cls) => `<span class="seg${cls ? ' ' + cls : ''}">${t}</span>`;

const purchaseRow = r => `<div class="lrow">
  <div class="lrowtop">${buyThumb(r)}<span class="lname">${CAT[r.cat].name}</span><b class="lamt num">${y(r.cost)}</b></div>
  <div class="lmeta">${metaSeg(r.supplier)}${metaSeg(`${r.qty}${r.unit}`)}
    ${metaSeg(`${r.unitPrice.toFixed(2)}/${r.unit}`)}${metaSeg(`现金 ${y(r.cash)} / 赊 ${y(r.credit)}`)}
    ${metaSeg(ticketText(r), SKU_BY_ID[r.sku]?.receipt === 'excluded' ? 'muted' : '')}</div></div>`;

const dayRow = r => `<div class="lrow">
  <div class="lrowtop"><span class="lname">第 ${r.day} 天</span><b class="lamt num">${netChip(r.netOpsCents)}</b></div>
  <div class="lmeta">${metaSeg(`流水 ${y(r.revenueCents)}`)}${metaSeg(`成本 ${y(r.cogsCents)}`)}${metaSeg(`报损 ${y(r.writeoffCents)}`)}
    ${metaSeg(`事件账 ${sign(r.eventNetCents)}`)}${metaSeg(`现金 ${y(r.cash)}`)}${metaSeg(`欠款 ${y(r.debt)}`)}</div>
  ${deductCell(r)}</div>`;

function shelfRow(cat, forecast) {
  const all = SKUS_BY_CAT[cat];
  const list = all.filter(s => skuAvailable(state, s, rng));
  // §七 采购呈现：强哥线开了但今天这一类他没带——只给一句话，不标价、不留能扣钱的按钮
  const absent = all.some(s => s.tier === 6) && state.today.qianggeCats && !list.some(s => s.tier === 6);
  const have = cat === 'SP' ? state.StockSoup : state.StockSolid[cat];
  // spec-event-pool-6 §二.3 断货日：这一档四家全下架（skuAvailable 已经把按钮都挡了），
  // 空货架得说清为什么空、以及柜里的货照常卖
  const delist = state.today.delist === cat
    ? '<span class="muted">今天全档下架 · 柜里的照卖</span>' : '';
  // 预检反馈 F7（0366bd6）：每碗耗汤份数 T 是与天气同级的情境参数（不是暗线），看不见就会拿 1 份/碗直算，
  // 于是「买 12 份卖 11 碗却报卖断」看起来就是 bug。T 进市场汤底行，也算得清那碗数从哪儿被封顶。
  const soupT = cat === 'SP' ? ` · 每碗耗 ${state.today.scenario.T} 份` : '';
  return `<div class="panel"><div class="row shelfhead"><h3>${CAT[cat].name}${cat === 'SP' ? '（份）' : '（斤）'}</h3>
      <span class="muted">柜里 ${have}${cat === 'SP' ? ' 份' : ''}${soupT} · 试算今天能出 <span data-fc-bowls>${forecast.capped.toFixed(0)}</span> 碗</span>${delist}</div>
    <div class="shelf">${list.map(s => skuCard(cat, s, forecast)).join('')}${absent ? absentCard(cat) : ''}</div></div>`;
}

function absentCard(cat) {
  return `<div class="sku absent"><div class="skumain">
    <div class="skuimg" style="background-image:url(./img/${SKU_SHEET[cat]}.webp)"></div>
    <div class="skubody"><div class="src">强哥</div><div class="desc">今天强哥没带这个</div></div>
  </div></div>`;
}

// 排版批 L3（task-mobile-layout-batch-20261102 + 例图）：三列窄卡改纵排宽卡——图左、名与大号单价在右、描述随后，
// 步进器占满卡底一整行（输入框给到两位小数 + 内边距的宽度）。
// 机制护栏照旧：三家可混买，每张卡留自家步进器，数量 >0 就入篮汇总；红框只是「这一张在用」，不是单选互斥。
// 卡底那个小计取的是本篮计划里这一行的既有数（plan.lines 的 cost，与「就这一篮，付钱」扣的钱同源），不另起一套算法。
function skuCard(cat, s, forecast) {
  const price = effectivePrice(state, s);
  const q = draft[s.sku] || 0;
  const line = q > 0 && forecast.plan.lines.find(l => l.sku === s.sku);
  const ticket = s.receipt === 'auto' ? '<span class="tag ticket">带票</span>'
    : s.receipt === 'excluded' ? ''
      : s.receipt === 'none' ? '<span class="tag nodoc">无票</span>' : '<span class="tag nodoc">票看手气</span>';
  const step = cat === 'SP' ? 1 : 0.5;
  // 机制单 `c152b37`：低价（清仓摊）卡面固定带一句规矩味警告——解锁是账逼出来的，不是奖励。
  // 本单只改闸门与出场，价格/品质/带票/赊购这些既有代价一字不动。
  const cheapWarn = s.tier === 3 ? `<div class="desc negv">${esc(CHEAP_TIER_WARNING)}</div>` : '';
  return `<div class="sku ${q > 0 ? 'on' : ''}${qtyBad.has(s.sku) ? ' bad' : ''}">
    <div class="skumain">
      <div class="skuimg" data-cell="${TIER_CELL[s.tier]}" style="background-image:url(./img/${SKU_SHEET[cat]}.webp)" role="img" aria-label="${CAT[cat].name} · ${s.supplier}"></div>
      <div class="skubody">
        <div class="src">${s.supplier}</div>
        <div class="price num">${price.toFixed(2)}<span class="muted">/${s.unit}</span></div>
        <div class="desc">${esc(s.desc)}</div>${cheapWarn}
        <div>${s.credit ? '<span class="tag credit">可赊</span>' : '<span class="tag cash">只收现金</span>'} ${ticket}
          ${cat === 'SP' ? '<span class="tag due">隔夜全损</span>' : s.keep ? '<span class="tag keep">能留明天</span>' : '<span class="tag due">当天清</span>'}</div>
      </div>
    </div>
    <div class="qty">
      <button class="mini" data-act="setqty" data-qty="${s.sku}" data-value="${round01(Math.max(0, q - step))}">−</button>
      <input type="number" min="0" step="${step}" value="${round01(q)}" data-qty="${s.sku}" />
      <button class="mini" data-act="setqty" data-qty="${s.sku}" data-value="${round01(q + step)}">＋</button>
      ${line ? `<span class="subtotal num muted">小计 <b class="num">${y(line.cost)}</b></span>` : ''}
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
    <button class="mini" data-act="shrink">照手上的钱缩一缩</button>`;
}

// 实测问题 #3：附录 C 的 capped = min(需求侧估计, 这一篮能出)，只印一个数会让玩家以为「今天就只有这么多生意」。
// 需求侧与可供侧同时摆出来，缺口就是明天该多买多少——两个数都是引擎算好的公开项，界面不另立口径
// 复现单 236307a 线索一：差额必须是「屏上那两个数相减」，不是那两个数底下的浮点相减。
// capped 落在需求侧时是小数（min 的第一项就是 estBowls + 试吃加碗），原样进句子就成「差 0.029232665123752 碗」。
function forecastBar(f) {
  const need = Math.round(f.estBowls);
  const can = Number(f.capped.toFixed(0));
  const gap = need - can;
  return `<div class="forecast"><div class="k">试算（只看明账）${f.lowConfidence ? ' <span class="low">头一天没有昨日实卖，客流侧按开业基础量估</span>' : ''}</div>
    <div class="grid3" style="margin-top:8px">
      <div><div class="k">按今天客流要</div><div class="v num">${need} 碗</div></div>
      <div><div class="k">这一篮只够出</div><div class="v num">${Math.round(f.supplyBowls)} 碗</div></div>
      <div><div class="k">预计能出</div><div class="v num">${can} 碗</div></div>
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
      <button class="go" data-act="submit">就这一篮，付钱</button>
      ${basketSplit(plan)}
      <p class="muted" style="margin-top:6px">现钱够就全走现钱；现钱不够的那一截才自动挂到熟人账上（只走带信用关系的正经货，${y(creditAvailable(state))} 元额度以内）。</p></div>`;
  }
  return `<div class="panel accent">
    <p class="negv">这一篮付不齐：现钱要出 ${y(plan.cashUsed)}，手上 ${y(Math.max(0, state.Cash))}；可赊 ${y(creditAvailable(state))} 只走熟人正经货（汤底和别家货只收现金）。柜里的钱不会自己变多。整篮驳回，不自动减量——点「照手上的钱缩一缩」那一颗。</p>
    ${basketSplit(plan)}
    <div class="row" style="margin-top:8px">
      <button class="ghost" data-act="shrink">照手上的钱缩一缩</button>
      <button class="go" data-act="submit" disabled>就这一篮，付钱</button>
    </div>
    <p class="muted" style="margin-top:6px">缩量只改草稿里的数字，改完还得你自己点「就这一篮，付钱」。</p></div>`;
}

// 真机修复单 f39f692（Orange 20261104）：有一格读不出数（type=number 的 badInput：屏幕上留着字、控件里值是中空），
// 这一屏就不摆「把那一格少算掉的那篮」——屏上写着 3 斤、合计按 218.02 算，那正是本单要修的劈叉在界面上的另一半。
// 试算与吸底条一起换成同一句话（引擎的「整篮驳回，不自动减量」在界面上的落点）；
// 首挂与实时刷新共用下面这两支，同一屏不许两套话（F8 的教训：一个判定两处口径，屏幕上就会自己跟自己打架）。
const marketDetailHtml = f => (qtyBad.size ? badBasketPanel() : forecastBar(f) + buyPanel(f));
const marketFootHtml = f => (qtyBad.size ? badBasketStrip() : footStrip(f));

function badBasketPanel() {
  const who = [...qtyBad].map(k => `「${CAT[SKU_BY_ID[k].cat].name}」`).join('、');
  return `<div class="panel accent">
    <p class="negv">${who} 填的数认不出来：那一格屏幕上还有字，可这个数读不进来。点进红框那一格，清空、重填一遍——认不出来这一篮点不动，也不会撇下它照其余的买。</p>
    <button class="go" data-act="submit" disabled>就这一篮，付钱</button></div>`;
}

function badBasketStrip() {
  return `<span>这一篮 <b>—</b> 元</span><span>${qtyBad.size} 格的数认不出来 · 重填那一格才点得动</span>`;
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

// UI-05 说的「未解锁显示解锁条件文案」：条件式来自附录 D.3 的「解锁条件」列，这里只把它翻成玩家读得懂的一句中性话，
// 不预告事件内容、不写后果数值（红线：不许出现道德评语、不许把暗线摆到面板上）
const UNLOCK_HINT = {
  fac_prepay: '要先遇上一笔当面赊账的事。',
  fac_taste: '二手餐车摆起来以后才有这一角。',
  fac_display: '要先有一本立得住的账。',
  fac_cert: '要先让检查的人上门看过一回。',
  fac_contract: '要先有人来挖小豆。',
  fac_sign: '满 45 个营业日才刻得动。',
  JI_SCALE: '固定摊位摆起来以后杂货摊才上这一杆秤。',
};

// UI-05 上段：六档、当前高亮、下一档价与升级按钮。档名与价在附录 G.5:609（赊购额另见 D.1:52）与 ui-spec 换算表里，
// 基础销量那一列属 3.1 可见清单之外（它只在留言与情境里以体感出现），所以这一段不印数字，只印档名与价。
// 批 B（task-ui-fidelity-batch B 项 / mockup 10）：六档由「挤成一行小字」改为逐行上图——
// 每行 = 形态图 + 档名 + 一句描述 + 芥末黄价格胶囊 + 升级按钮（番茄红），当前档红框 + 「当前」标，未达档锁标置灰。
// 可点的按钮仍然只有「下一档」那一颗，条件仍是采购窗口内 + 现金够：本批只换皮，操作时点一个字没动。
const TIER_BLURB = {
  1: '车斗摆得下一台冷柜，收摊就骑走——破的是车况，不是货。',
  2: '车厢改出来的货台，漆面补过几处，冷柜多出一层。',
  3: '靠墙一台两米冷柜，灶台另起一台，两台之间留得出地面。',
  4: '学校后门租下的凹间：瓷砖墙、吊灯，冷柜进了屋，灶还在门外。',
  5: '整间门面、玻璃门脸，灶有了自己的隔间，门口摆得下桌凳。',
  6: '街角两间打通：两块牌面、两台大柜、两口灶，两头都是你的。',
};
function tierBlock() {
  const nextPrice = TIERS_STALL[state.Tier - 1].upgradePrice;
  const next = state.Tier < 6 ? TIERS_STALL[state.Tier] : null;
  const closed = !buyWindowOpen();
  // 第五档往第六档那一笔就是正文 §六 说的"盘下对面铺子"（60,000 与升双店价同值同原则，见换算表第 16 行）
  const label = state.Tier === 5 ? '盘下对面铺子' : '升级';
  return `<h3 style="margin-top:0">摊位</h3>
    ${TIERS_STALL.map(t => {
    const cur = t.level === state.Tier;
    const isNext = !!next && t.level === state.Tier + 1;
    const priceCents = t.level > 1 ? TIERS_STALL[t.level - 2].upgradePrice : null;
    const mark = cur ? '当前' : t.level < state.Tier ? '旧档' : isNext ? '' : '未达';
    return `<div class="tierrow${cur ? ' cur' : ''}${isNext ? ' next' : ''}${t.level > state.Tier && !isNext ? ' lock' : ''}">
        <img class="tierimg" src="./img/tier-${t.level}.webp" alt="${t.name}" decoding="async" />
        <div class="tierbody">
          <div class="row tight"><b>${t.name}</b>${mark ? `<span class="tierstate">${mark}</span>` : ''}</div>
          <p class="muted">${TIER_BLURB[t.level]}</p>
          <div class="row tight">
            ${priceCents ? `<span class="pill num">${priceCents / 100} 元 · 一次性</span>` : '<span class="pill">起步就有</span>'}
            ${isNext ? `<button class="up" data-act="upgrade" ${closed || state.Cash < nextPrice ? 'disabled' : ''}>${label}</button>` : ''}
          </div>
          ${isNext ? `<p class="muted reason">${closed ? '今天已经收摊，明早开市再升。'
      : state.Cash < nextPrice ? `现金不够，还差 ${(nextPrice - state.Cash) / 100} 元。` : ''}</p>` : ''}
        </div></div>`;
  }).join('')}${next ? '' : '<p class="muted">往上没有档了——这条街两个铺子都是你的，你已经是这条街的摊主了。</p>'}`;
}

// 批 B：设施七件各配一枚小图标（语义照 mockup 10——牌 / 试吃碗 / 展示柜 / 证件墙 / 合同 / 招牌字 / 秤）。
// 价格、解锁条件、置灰条件、按钮文案全部照现口径，一个字段没动；价改挂芥末黄胶囊，与摊位那一列同一件皮。
const FAC_ICON = { JI_SCALE: 'fac_scale' };
// 正文 3.6 / 附录 D.3：六件设施 + 杂货摊器具一件。UI-05 要"未解锁显示解锁条件文案"，所以七件全列、
// 没解锁的那几件挂着档名与那句条件话、按钮置灰。显多秤是器具：不进 Facilities、不计 L（附录 E 实现约束第 2 条）。
function facilityRow() {
  const facs = Object.values(FACILITIES);
  const tools = Object.values(TOOLS);
  // 预检反馈 F11：这一屏改成整屏页后，任何 hub 时点都进得来。看得见，但操作时点照旧——
  // 采购窗口（第 3 步提交前）之外一律置灰，理由写成世界内的一句话。
  const closed = !buyWindowOpen();
  return `<div class="panel warn"><h3>小店置办</h3>${closed ? '<p class="muted">今天已经收摊——这里只看得见图。要动钱，等明早开市一并置办。</p>' : ''}${tierBlock()}<hr />
    ${facs.map(f => {
    const owned = state.Facilities.includes(f.id);
    const open = isFacilityUnlocked(state, f.id);
    return `<div class="facrow${owned ? ' owned' : ''}${open ? '' : ' lock'}">${icon(FAC_ICON[f.id] || f.id)}
      <div class="facbody"><div class="row tight"><b>${f.name}</b>${owned ? '<span class="tierstate">已置办</span>' : ''}</div>
        <p class="muted">${open ? `${FACILITY_BLURB[f.id] || ''} <span class="pill num">${f.price / 100} 元 · 一次性</span>` : UNLOCK_HINT[f.id] || ''}</p>
        <button data-act="facility" data-fac="${f.id}" ${owned || !open || state.Cash < f.price || closed ? 'disabled' : ''}>${owned ? '已置办' : '买下'}</button></div></div>`;
  }).join('')}
    ${tools.map(t => {
    const owned = ownsTool(state, t.id);
    const open = evalCondition(t.unlock, state);
    return `<div class="facrow${owned ? ' owned' : ''}${open ? '' : ' lock'}">${icon(FAC_ICON[t.id] || t.id)}
      <div class="facbody"><div class="row tight"><b>${t.name}</b>${owned ? '<span class="tierstate">已上秤</span>' : ''}</div>
        <p class="muted">${open
      ? `杂货摊有卖：<span class="pill num">${t.price / 100} 元买、${t.sellBack / 100} 元卖回</span>（第 3 步按半价回收）。
              装上后散客那一层的计费斤数按 ×${SCALE_AUTO_MUL} 记账，开关在开门前定版、当日锁定。`
      : UNLOCK_HINT[t.id] || ''}</p>
      <span class="row tight">${owned ? `<button class="ghost" data-act="sellTool" data-tool="${t.id}" ${closed ? 'disabled' : ''}>卖回</button>` : ''}
        <button data-act="buyTool" data-tool="${t.id}" ${owned || !open || state.Cash < t.price || closed ? 'disabled' : ''}>${owned ? '已上秤' : '买下'}</button></span></div></div>`;
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


// ── 正文 3.11 烫煮（ui-spec UI-09）：§八 排期收口把这条划成「开关式实现（在建时默认关闭）」，开关 = state.blanchOn（初值取 CONFIG.blanch，与 laborOn / competitionOn 同构）。
// 关着时 blanchBlock() 直接返回空串：不渲染一格、不起一个计时器、不掷一个随机，亲手单还是 M1 那一步。
// 开着时每单两击（下碗 / 夹出）、熟度条自己匀速扫 BLANCH.sweepSec 秒——离正文 :210 的「每单操作 ≤20 秒」还有余量；
// 操作量总账按正文 :356 走玩家计时数据（0×0 视口测不了人体时长），不自作削减。
function blanchBlock(o) {
  if (!state.blanchOn) return '';
  const cust = o.customerId;
  const v = blanchBy[cust];
  const judged = judgeBlanch(v);
  const zoneW = BLANCH.greenHigh - BLANCH.greenLow;
  return `<div style="margin-top:10px">
    <div style="display:flex;align-items:center;gap:8px">
      <span class="muted">烫锅</span>
      <span style="position:relative;flex:1;height:16px;border:2px solid var(--ink);background:var(--paper)">
        <i style="position:absolute;top:0;bottom:0;left:${BLANCH.greenLow}%;width:${zoneW}%;background:var(--teal);opacity:.35"></i>
        <i style="position:absolute;top:0;bottom:0;left:${BLANCH.center - BLANCH.centerBand}%;width:${BLANCH.centerBand * 2}%;background:var(--mustard);opacity:.55"></i>
        <i id="bf-${cust}" style="position:absolute;top:0;bottom:0;left:0;width:${v ?? 0}%;background:var(--ink);opacity:.5"></i>
      </span>
      <span class="num" id="bw-${cust}" style="min-width:3.5em">${judged ? esc(judged.label) : ''}</span>
    </div>
    <div class="row" style="margin-top:6px">
      <button id="bs-${cust}" data-act="bstart" data-cust="${cust}" ${v === undefined ? '' : 'disabled'}>下碗 · 熟度条自己扫</button>
      <button id="bp-${cust}" data-act="bpull" data-cust="${cust}" disabled>夹出</button>
    </div>
    <p class="muted">绿区里夹出算这一单烫到了，正中间那一线记「最佳+」；早了是夹生，晚了是烫老。不夹它就等于没烫，这一只碗只管眼前这一单。</p>
  </div>`;
}

function stopBlanch(cust) {
  const run = blanchRun[cust];
  if (run) cancelAnimationFrame(run.raf);
  delete blanchRun[cust];
}

function stopAllBlanch() {
  for (const cust of Object.keys(blanchRun)) stopBlanch(cust);
}

function startBlanch(cust) {
  if (!state.blanchOn || blanchBy[cust] !== undefined || blanchRun[cust]) return;
  const t0 = performance.now();
  const step = () => {
    const run = blanchRun[cust];
    if (!run) return;
    const v = blanchValueAt((performance.now() - t0) / 1000);
    const fill = document.getElementById('bf-' + cust);
    if (fill) fill.style.width = `${v}%`;
    if (v >= 100) { delete blanchRun[cust]; return; }   // 扫满停在满格等玩家夹：夹出来就是烫老，不夹就是没烫
    run.raf = requestAnimationFrame(step);
  };
  blanchRun[cust] = { t0, raf: requestAnimationFrame(step) };
  const pull = document.getElementById('bp-' + cust);
  if (pull) pull.disabled = false;                       // 碗没下锅，「夹出」在牌面上就是死的（引擎侧同样拦）
  const start = document.getElementById('bs-' + cust);
  if (start) start.disabled = true;                      // 一根条只许一次：要重来得先夹出来
}

function pullBlanch(cust) {
  const run = blanchRun[cust];
  if (blanchBy[cust] === undefined && !run) return;   // 碗没下过锅，夹不出东西
  const v = run ? blanchValueAt((performance.now() - run.t0) / 1000) : blanchBy[cust];
  stopBlanch(cust);
  blanchBy[cust] = v;
  saveFlow();
  const judged = judgeBlanch(v);
  const fill = document.getElementById('bf-' + cust);
  if (fill) fill.style.width = `${v}%`;
  const word = document.getElementById('bw-' + cust);
  if (word && judged) {
    word.textContent = judged.label;
    if (judged.band === 'best') navigator.vibrate?.(10);   // 与足称同一记手感反馈，素材后补
  }
  for (const id of ['bs-', 'bp-']) {
    const el = document.getElementById(id + cust);
    if (el) el.disabled = true;
  }
}

// 正文 5.4：常客只在亲手单出场，不设选项、不给奖励清单——所以台词是一行读的字，按钮一个都不给。
// 进度取 RegularStory 的那一格（附录 F.5 :442 第 12 步 +1），今天上过几次单都是同一句：抽单在先、推进在打烊后。
function regularChatter(o) {
  const slot = REGULAR_SLOTS.indexOf(o.customerId);
  const line = slot >= 0 ? regularLine(o.customerId, state.RegularStory[slot]) : null;
  if (!line) return '';
  return `<p class="muted" style="margin:6px 0 0">${esc(line)}</p>`;
}

// 常客拍点句的配音（全覆盖单「挂常客拍点文本落点，按拍序播」）：取的是同一批文本——regularChatter 往卡片里
// 写的那一行灰字，就是 voice.js 那张表的键，认的是原文而不是拍次序号。
// 落点选在 openShop 抽单那一刻（上面那一队），不选 orderCard 的渲染处：卡片每次交互都重绘（抓菜、滑杆、切屏都重画），
// 挂渲染点同一句一天里能重播几十遍，与情报条那条「挂抽取点不挂渲染点」同一个理由（盘点 §6.2）。
function regularVoiceLines() {
  const out = [];
  for (const o of orders) {
    const slot = REGULAR_SLOTS.indexOf(o.customerId);
    if (slot < 0) continue;                                  // c04 毕老师那条线正文留空：没有文本落点，也就没有出声
    out.push(...voiceRegularLines(o.customerId, regularLine(o.customerId, state.RegularStory[slot])));
  }
  return out;
}

// 进度轨的三条线全是现成的数：带沿 = 已签的两个比例（足称 0.98 / 该捏回 1.1），
// 满幅 = TRACK_SPAN（纯几何，只决定尺子画多长，不参与任何判定）。
// 带子与判定读同一枚常量，不派生第四个口径（预检反馈 F8 的教训：一处一个口径就会同屏不一致）。
function gaugeVars(cust, gave) {
  const want = orderWant(cust);
  const p = want > 0 ? Math.min(1, gave / (want * TRACK_SPAN)) * 100 : 0;
  return `--band:${(FULL_SHARE / TRACK_SPAN * 100).toFixed(2)}%;--band2:${(OVER_SHARE / TRACK_SPAN * 100).toFixed(2)}%;--p:${p.toFixed(2)}%`;
}

function orderCard(o) {
  const g = gramsBy[o.customerId];
  const gave = o.lines.reduce((s, l) => s + Number(g[l.cat] || 0), 0);
  const want = orderWant(o.customerId);
  // 进带位在模板里就算出来：CSS 的「气泡描边转青绿」与「色带点亮」两条吃的是卡片上那一枚 .ok，
  // 只等 refreshOrder 补挂的话，换屏/读档重绘那一刻就会出现「秤面反色在、另两处不在」的同屏不一致（F8 同一类）。
  const ok = gave > 0 && gave / want >= FULL_SHARE;
  return `<div class="panel ordercard${ok ? ' ok' : ''}" id="oc-${o.customerId}" style="box-shadow:3px 3px 0 var(--ink-2);background:var(--cream)">
    <div class="cust"><div class="ava ava-${o.customerId}" style="background-image:url(${AVA_SHEET})" role="img" aria-label="${esc(o.name)}"></div>
      <div><h3>${esc(o.name)}</h3><span class="muted">${esc(o.role)} · ${o.bowls} 碗</span></div>
      <span class="bub" id="bub-${o.customerId}" aria-hidden="true"></span></div>
    ${regularChatter(o)}
    <div class="scale${ok ? ' ok' : ''}" id="sc-${o.customerId}" style="margin:8px 0">
      <img src="./img/scale.webp" alt="电子秤" />
      <div class="readout num"><span id="rd-${o.customerId}">${gave}</span><span class="u">克</span>
        <span class="jin" id="rj-${o.customerId}">${(gave / GRAMS_PER_JIN).toFixed(2)} 斤</span></div>
    </div>
    <div class="gramrow">
      <span class="grambub num" id="gramb-${o.customerId}">${gave}</span>
      <span class="weigauge" id="wg-${o.customerId}" style="${gaugeVars(o.customerId, gave)}" aria-hidden="true"><i class="band"></i><i class="mark"></i></span>
    </div>
    <div class="pinchhint" id="hint-${o.customerId}" ${hintWanted(o) ? '' : 'hidden'}>抓多了？点「捏出一点」往回捏</div>
    <div class="dual num muted" id="sum-${o.customerId}">顾客要 ${want} 克 · 你称 ${gave} 克</div>
    ${o.lines.map(l => `<div class="grabrow">
      <button class="grab" id="gb-${o.customerId}-${l.cat}" data-grab data-cust="${o.customerId}" data-cat="${l.cat}"${grabDead(o.customerId, l.cat) ? ' disabled' : ''}>
        <span class="skuimg bowlchip" id="ch-${o.customerId}-${l.cat}" data-cell="tl" style="background-image:url(./img/${SKU_SHEET[l.cat]}.webp)"></span>
        <span class="grabname">${CAT[l.cat].name}<b class="want">要 ${l.grams} 克</b><span class="step" id="tap-${o.customerId}-${l.cat}">轻点 +${stepFor(o.customerId, l.cat)} 克</span></span>
      </button>
      <div class="grabfoot">
        <span class="gavecell"><span class="num gave" id="lv-${o.customerId}-${l.cat}">你称 ${g[l.cat]} 克</span><span class="exact" id="ex-${o.customerId}-${l.cat}" ${exactNow(o.customerId, l.cat) ? '' : 'hidden'}>正好</span></span>
        <button class="pinch" id="pn-${o.customerId}-${l.cat}" data-pinch data-cust="${o.customerId}" data-cat="${l.cat}"${Number(g[l.cat] || 0) <= 0 ? ' disabled' : ''}>捏出 −${stepFor(o.customerId, l.cat)} 克</button>
      </div></div>
    <div class="muted kind-bad" id="flag-${o.customerId}-${l.cat}">${rowNote(o.customerId, l, Number(g[l.cat] || 0))}</div>`).join('')}
    ${blanchBlock(o)}
  </div>`;
}

function streetPanel() {
  // 正文 3.13：每天清晨玩家能看见三家的价签与昨日排队长度；四摊的 P 属传闻层，不进面板（3.1 豁免条）
  if (!competitionOn(state)) return '';
  const rows = streetBoard(state).map(r =>
    `<span class="muted">${esc(r.name)}<br><b class="chip num">${r.price.toFixed(1)}</b> 元/斤 · ${r.queue}</span>`).join('');
  return `<div class="panel"><h3>${icon('s-tag')}街面价签</h3><div class="row">${rows}</div>
    <p class="muted">价是人家自己挂出来的，排队是人自己站出来的。</p></div>`;
}

function eventOverlay() {
  const ev = pendingEvent;
  const acts = (ev.actions || []).length
    ? (ev.actions || []).map(a => {
      // 正文 :169「分支可用性写死」+ ui-spec UI-11：前置未满足 / 现金不足只置灰，按钮不藏起来
      const avail = isActionAvailable(state, a);
      const afford = isActionAffordable(state, a);
      const net = (a.open || []).reduce((s, o) => s + (o.cash || 0), 0);
      const after = state.Cash + net;
      const owed = (a.open || []).reduce((s, o) => s + (o.cash && o.cash < 0 ? -o.cash : 0), 0);
      const hint = !avail ? '（现在办不了）' : !afford ? `（现金不够，还差 ${y(owed - state.Cash)}）` : net && after < 0 ? `（现金要变 ${y(after)}）` : '';
      return `<button ${avail && afford ? '' : 'disabled'} data-act="choose" data-choice="${a.id}">${esc(a.label)}${hint}</button>`;
    }).join('')
    : '<button data-act="choose">知道了</button>';
  // E.6 的销毁决策要在点下去之前看得见数额：无票货按成本记多少，全从自己那张进货单的「票」列推出来
  const risk = ev.scoreCheck === 'big' ? ticketlessCostCents(state) : 0;
  // 入场待遇（动画单）：motion 标签在这里被读的唯一一次，只为拼一个 class；读不到标签就没有待遇，
  // 走 .overlay > .event 那条基础淡入。抽取 / 结果 / 计数一律不碰这个字段（红线见 events.js 文件头）。
  const fx = FX_CLASS[ev.motion] || '';
  // 追补单二：王老板线四套专属的三个开关。暗角是「全屏」节点，只给压场那两套（初见 / 其余）——
  // 山寨与收购各有自己的语法（对开双图 / 落桌纸面），单上没写暗角就不加。
  const wash = fx.includes('fx-bad') || fx.includes('fx-wang-intro') || fx.includes('fx-wang-press');
  const dual = fx.includes('fx-wang-copy');
  const deal = fx.includes('fx-wang-deal');
  // 暗角挂在遮罩上、卡片之外，卡片自带 z-index:1 压在它上面——正文该亮的还是亮的。
  // 金光与纸屑在卡片内，靠卡片的 overflow:hidden 裁边；纸屑封顶四片。
  return `<div class="overlay ${fx}"><div class="event">
    ${dual ? `<div class="dual"><img class="art" src="${OWN_STALL_ART}" alt="" /><img class="art" src="${eventArt(ev.id)}" alt="" /></div>`
      : `<img class="art" src="${eventArt(ev.id)}" alt="" />`}
    <div class="body"><span class="who">${esc(ev.kind)} · ${ev.timing === 'evening' ? '打烊后' : '清早'}</span>
      <p class="text">${fx === 'fx-person' ? typedHtml(ev.text) : esc(ev.text)}</p>
      ${deal ? `<p class="dealprice"><span class="muted">盘下对面铺子</span><b class="num">${y(BUYOUT_PRICE_CENTS)} 元</b></p>` : ''}
      ${risk ? `<p class="muted">按成本记，无票的货是 ${y(risk)}——销毁不动现金，动的是柜里的货。</p>` : ''}
      <div class="acts">${acts}</div></div>
    ${fx === 'fx-good' ? '<span class="sweep"></span><i class="cf"></i><i class="cf"></i><i class="cf"></i><i class="cf"></i>' : ''}
  </div>${wash ? '<div class="fxwash"></div>' : ''}</div>`;
}

function endPanel(p, standalone) {
  const r = p.reveal;
  // 预检反馈 F2（0366bd6）：累计净赚与逐日经营净额合计对不上，差的正是事件账——口径没错（附录 B 就这么定义），
  // 缺的是把这一层换算摆在卡片上。下面这行只做加法还原，不新增任何数。
  const opsSum = p.reports.reduce((s, x) => s + x.netOpsCents, 0);
  const evSum = p.reports.reduce((s, x) => s + x.eventNetCents, 0);
  // 结局待遇（动画单）：单上写的是「结局屏专属」，所以只有专门的结局屏（standalone）上待遇，
  // 账本页里那张附带的副本不挂——否则每翻一次账本都重演一遍，就成了循环动画。
  const fx = standalone ? (FX_ENDING[p.endingId] || '') : '';
  return (standalone ? hud() : '') + `<div class="panel accent ${fx}">
    <h2 class="kind-bad">结局：${ENDING_NAMES[p.endingId]}</h2>
    ${p.endingId === ENDING.MEDIOCRE ? `<p class="text">${esc(quitBlurb(state))}</p>` : ''}
    <div class="grid2">
      <div><div class="muted">营业天数</div><div class="big num">${p.days}</div></div>
      <div><div class="muted">累计净赚</div><div class="big num ${r.NP < 0 ? 'negv' : 'pos'}">${y(r.NP)}</div></div>
      <div><div class="muted">票据覆盖率</div><div class="num">${(r.ReceiptRate * 100).toFixed(1)}%</div></div>
      <div><div class="muted">最大单日出菜</div><div class="num">${r.Wmax} 斤</div></div>
    </div>
    <p class="muted">累计净赚 ${y(r.NP)} = 逐日经营净额合计 ${sign(opsSum)} + 事件账合计 ${sign(evSum)}。罚款、赔礼、涨薪这些当天就记进净赚；买摊位的钱与欠供应商的账不算在这里。</p>
    <hr /><p class="muted">这一路一共 ${p.purchases.length} 笔进货，逐笔在上面的进货单里。</p>
    <button class="go" style="margin-top:10px" data-act="restart">换个买法重开</button>
    ${fx === 'fx-end' ? '<span class="sweep"></span>' : ''}
  </div>`;
}

// 预检应修⑧ + 复验 #24 + 修复单 P2-3：开局这一批预取不能再挤成一团。
// 家底：场景头图九张 1.55 MB、SKU 拼版与头像表 0.78 MB、事件卡 0.31 MB。过去三样全在模块执行这一刻一起发出去，
// 玩家最先要看的「备菜 / 结算」两张就排在同一批里慢慢落地——进屏先见一大块空框，图才姗姗出来。
// 现在两件事：① 场景清单按玩家真会走到的先后排，HTML 侧那串 preload 同步改序（备菜/结算紧跟开屏图），两头不空；
// ② 事件卡挪到首帧图落地（window load）之后再暖——晨间情报最快也在第 2 天清早、晚间事件在打烊后，几分的路赶得上；
//    弹层与情报条的框在图没到时是同框细条纹（theme.css），不会再读成「图坏了/裁切没修」。
// 图片响应是 no-cache（本地预览与静态托管都按 304 回），所以要留住解码结果：
// 暖过的 Image 必须一直挂在模块作用域，否则被回收后 <img> 再取会重走一次网络，首帧仍空。
const warmedImgs = [];
const warm = file => { const im = new Image(); im.src = `./img/${file}`; warmedImgs.push(im); return im; };
(function preloadScenes() {
  const list = ['business', 'stall', 'settlement', 'market', 'pricing', 'weighing', 'night',
    'chenshi', 'scale', 'avatars', 'sku-mb', 'sku-mt', 'sku-vg', 'sku-bf', 'sku-ns', 'sku-sp'];
  list.forEach(n => warm(`${n}.webp`));
})();
// 事件卡与六档形态图都排在首屏之后取（批 B 新增的 tier-1…6 共约 480KB，与事件卡同一批）：
// 首屏那一帧的取图量维持修复单 P2-3 之后的水位，不让新素材把场景头图挤回收。
// 文件名自带后缀（成品 webp 与剪影 svg 混装），清单从 EVENT_ART 直接取，免得两处对不上。
addEventListener('load', () => {
  Object.values(EVENT_ART).concat([EVENT_NO_ART]).forEach(f => warm(f));
  TIERS_STALL.forEach(t => warm(`tier-${t.level}.webp`));
}, { once: true });
// 绑定挂在 window 上：模块级 const 若无人引用，打包后可能只剩调用、数组被丢，解码结果又被回收
window.guijuWarm = warmedImgs;

render();
