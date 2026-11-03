// 开场动画（施工单 task-opening-cinematic-20261102 / 规格 spec-opening-cinematic-20261102）。
// 纯呈现层：不 import 引擎、不算账、不碰 state，也不碰 SAVE_VERSION 与存档结构——
// 播看状态走独立 storage 键（与音频单那条静音键同一个路子），撤掉 = 删本文件 + main.js 里三处引用 + theme.css 那一块。
// 字幕逐字照规格修订版（回归里逐字钉住，一字不许自改）。
import { sfx } from './audio.js';

const INTRO_KEY = 'guiju-m1-intro';   // '1' = 已播过；独立键，不进存档
const SKIP_MS = 1000;                 // 单上：开播 1 秒后才给跳过

// 六镜，停留时长合计正好 45,000ms（单上「约 45 秒」）。第 6 镜复用现行场景头图 business.webp，不另出图。
export const INTRO_SHOTS = [
  { art: 'intro-01-street', ms: 8000, alt: '县城老街清晨，家里的麻辣烫摊冒着热气，少年在摊边帮忙',
    text: '陈实家的麻辣烫摊，在县城老街上支了十几年。摊子不大，规矩挺大。' },
  { art: 'intro-02-neighbours', ms: 7000, alt: '乡邻熟客围坐在摊边吃',
    text: '街坊四邻吃惯了这口。不亏，也不富——每个月都差一点点就富了。' },
  { art: 'intro-03-dusk', ms: 7000, alt: '收摊时分，父母慢下来的背影',
    text: '只是他爸的腰先提出了退休，他妈的眼睛跟着附议。' },
  { art: 'intro-04-phone', ms: 8000, alt: '夜里陈实刷手机，屏幕那头是排长队的小吃街',
    text: '他在手机上看见：大学城的小吃街一到饭点就排长队——大学生对麻辣烫的爱，比早八坚定多了。' },
  { art: 'intro-05-sign', ms: 7500, alt: '从老摊上摘下那块规矩牌子，擦净装包',
    text: '钱大半留给家里。走的时候他只带走一样东西：老摊上那块规矩牌子，一条都没改。' },
  { art: 'business', ms: 7500, alt: '大学城小吃街清晨，三轮车摊支起来，牌子挂上',
    text: '摊子是新的，规矩还是老规矩。第一条：先把规矩立住。', title: '先把规矩立住！' },
];

export const introSeen = () => localStorage.getItem(INTRO_KEY) === '1';
export const introShouldPlay = () => !introSeen();
export const introOpen = () => !!el;

// 一套小闹钟：整块随页面隐藏起停（与热气 / 滚数同一条「切后台就钉住」的规矩）。
// close() 先清队列再摘节点，所以不会有悬着的计时器回来动已经不存在的 DOM。
let el = null, idx = 0, clock = [];
function arm(fn, ms) {
  const t = { fn, ms, at: Date.now() + ms };
  t.id = setTimeout(() => { if (drop(t)) fn(); }, ms);
  clock.push(t);
}
function drop(t) { const i = clock.indexOf(t); if (i < 0) return false; clock.splice(i, 1); return true; }
function halt() { clock.forEach(t => clearTimeout(t.id)); clock = []; }
function snooze() { for (const t of clock) { clearTimeout(t.id); t.left = Math.max(0, t.at - Date.now()); } }
function wake() {
  for (const t of clock) {
    const left = t.left ?? t.ms;
    t.at = Date.now() + left;
    t.id = setTimeout(() => { if (drop(t)) t.fn(); }, left);
  }
}

const shotNode = (s, i) =>
  `<img class="shot${i === 0 ? ' on' : ''}" src="./img/${s.art}.webp" alt="${s.alt}" data-i="${i}"
    style="--ms:${s.ms}ms" decoding="${i === 0 ? 'sync' : 'async'}" fetchpriority="${i === 0 ? 'high' : 'low'}" />`;

export function showIntro(opts = {}) {
  if (el) return;                                      // 幂等：已经在播就不叠第二层
  if (opts.replay !== true) localStorage.setItem(INTRO_KEY, '1');   // 一开播就算播过：中途关页面也不重播
  idx = 0;
  el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '开场动画');
  el.innerHTML = `<div class="shots">${INTRO_SHOTS.map(shotNode).join('')}</div>
    <div class="sub"><p class="line"></p></div>
    <div class="lock" hidden><b>${INTRO_SHOTS[INTRO_SHOTS.length - 1].title}</b><span>第一条：先把规矩立住</span></div>
    <button class="skip" data-i="skip" hidden>跳过</button>
    <span class="hint">轻点继续</span>`;
  document.body.appendChild(el);        // 挂在 body 上：render() 换 #app 内容时不会把它一起擦掉，两边互不干扰
  const shots = [...el.querySelectorAll('.shot')];
  const line = el.querySelector('.line');
  const lock = el.querySelector('.lock');
  const paint = i => {
    shots.forEach((n, k) => n.classList.toggle('on', k === i));
    line.textContent = INTRO_SHOTS[i].text;
    // 重挂必需：CSS 只对 class 变化起动画，不强制一次重排就复用旧动画实例（与徽标弹跳同一条）
    line.classList.remove('in'); void line.offsetWidth; line.classList.add('in');
    lock.hidden = !INTRO_SHOTS[i].title;
  };
  function close() { halt(); document.removeEventListener('visibilitychange', onVis); el.remove(); el = null; }
  const advance = () => {
    if (idx + 1 >= INTRO_SHOTS.length) return close();
    idx += 1; paint(idx); arm(advance, INTRO_SHOTS[idx].ms);
  };
  const onVis = () => { if (document.hidden) snooze(); else wake(); };
  el.addEventListener('click', e => {
    sfx('tap');                                    // 与全站同一声「点击」，不新造音
    if (e.target.closest('[data-i="skip"]')) return close();
    halt();
    if (idx + 1 >= INTRO_SHOTS.length) return close();   // 最后一镜点下去就是收尾，落回现行第一天那一屏
    idx += 1; paint(idx); arm(advance, INTRO_SHOTS[idx].ms);   // 点一下重新给满这一镜的停留，不被上一镜的余量催走
  });
  paint(0);
  document.addEventListener('visibilitychange', onVis);
  arm(() => { el.querySelector('.skip').hidden = false; }, SKIP_MS);
  arm(advance, INTRO_SHOTS[0].ms);
}
