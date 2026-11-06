// 视觉批 I 第一、三件的呈现层（工单 task-ui-visual-20261105）：顾客气泡、金色浮字、夜晚信封。
// 护栏照上一批那两块呈现层（卖断归并、结算播报）的规格立：零引擎 import、不写 state 一个字、
// 不掷随机、不留计时器，引擎对它全盲——它只把「已经算好的字段」翻成画面上的动静。
// 文案与信号一一对得上现成来源（白名单逐条写在下面每个函数上，回归针 §30 钉住）：新造句子与新计数器都不许从这里长出来。
// 消散交给 CSS 动画自己摘节点（animationend），JS 这一层一个 setTimeout 都不留——掉帧与残留都由样式那一格管。
import { COMMENT_POOLS } from '../data/comments.js';
import { CAT } from '../data/constants.js';

// 单上写死的两个上限：同屏气泡 2、同屏浮字 3。只这一处定义，调密度改这两格（店主真机嫌挤时的第一调法）
export const BUBBLE_MAX = 2;
export const FLOAT_MAX = 3;

// ── 四类气泡的文案源（工单「文案只许取自现成台词池/现成信号」）────────────────────
// 点单：单子自己那格（附录 H.1 具名顾客表的 bowls 与 order 模板 → 亲手单里的 o.bowls / o.lines），不引台词池。
// 夸 / 抱怨：取 portion 池按下标直取的那两句——就是 comments.js:27–28 在 signalFullCount / signalShortCount 时抽的同一对，
//           引擎在结算那一晚说什么，秤前这一刻就说什么；下标直取、不掷随机（与那两行同一规矩）。
// 催：soldout 池第 2 句，判据用现成的 state.YesterdaySoldOut（出摊页那句「昨天卖断过货」同一个字段）。
export const orderSay = order => `${order.bowls} 碗 · ${order.lines.map(l => CAT[l.cat].name).join('、')}`;
export const praiseSay = () => COMMENT_POOLS.portion[1];
export const grumbleSay = () => COMMENT_POOLS.portion[2];
export const rushSay = () => COMMENT_POOLS.soldout[1];

// 一桌一泡 + 同屏上限：纯函数，先到的占位、越界的丢弃（工单要回报的取舍 = 丢弃，不排队：
// 排队会让同一句话在玩家早就看完这一单之后才冒出来，读起来像屏幕自己坏了）。
export function takeBubbles(cands, room = BUBBLE_MAX) {
  const seen = new Set();
  const out = [];
  for (const c of cands) {
    if (seen.has(c.cust)) continue;
    if (out.length >= room) break;
    seen.add(c.cust);
    out.push(c);
  }
  return out;
}

// 浮字同理：到上限就丢后面的（节流不许糊屏，单上原话）
export function takeFloats(cands, room = FLOAT_MAX) {
  return cands.slice(0, Math.max(0, room));
}

export const visibleBubbles = root => root.querySelectorAll('.bub.on').length;
export const visibleFloats = root => root.querySelectorAll('.float').length;

// 挂一只气泡：文本进那一桌自己的槽位（#bub-顾客号），动画跑完自己收干净，槽位留在原地等下一次。
// 摘掉 .on 就是「消散完了」——上面那两个 visible* 计数读的就是这一枚 class，不留第二套账。
// 重挂同一格要先摘 class 再强制排一次，否则 CSS 认不出这是「新一轮动画」，第二句就看不见动。
export function showBubbles(root, cands) {
  const room = Math.max(0, BUBBLE_MAX - visibleBubbles(root));
  for (const c of takeBubbles(cands, room)) {
    const el = root.querySelector('#bub-' + c.cust);
    if (!el || !c.text) continue;
    el.textContent = c.text;
    el.classList.remove('on');
    void el.offsetWidth;                    // 不强制这一帧重排，同一句第二次就不重播（追补单三同一手法）
    el.classList.add('on');
    el.onanimationend = () => { el.classList.remove('on'); el.textContent = ''; };
  }
}

// 挂一枚金色浮字：挂在数字出现的那一处（调用方给锚点元素），上浮 + 淡出，动画一完就把节点摘掉。
// 降级屏（reduced-motion）由调用方挡在门外：那一档压根不生成节点，不留一个动不起来的空壳。
export function showFloats(root, cands) {
  const room = Math.max(0, FLOAT_MAX - visibleFloats(root));
  for (const f of takeFloats(cands, room)) {
    const host = f.in;
    if (!host || !f.text) continue;
    const el = document.createElement('span');
    el.className = 'float num';
    el.textContent = f.text;
    host.appendChild(el);
    el.onanimationend = () => el.remove();
  }
}

// ── 第三件：夜晚信箱的信封三态 ────────────────────────────────
// 未读 = 封口只露一行标题；点开 = 拆封展开全文；收好 = 压平置后。三态全在这一张表里，
// 键是「第几天:第几条」——它是画面状态，绝不进 saveFlow 那一坨，也绝不进引擎存档字段（单上红线，§30 有针）。
export const envKey = (day, i) => `${day}:${i}`;

// 标题取法（单上要求回报）：现版留言没有标题字段，所以取正文首句 = 第一个句末标点之前的那一段；
// 首句短到不成话（「还行吧。」那一类）就整条上标题，别截出一截没头没尾的字。超长才按 TITLE_MAX 收，
// 收的只是显示用的标题行——留言本体一个字没动，展开读的还是原文。
const TITLE_MAX = 20;
export function envelopeTitle(text) {
  const cut = String(text).split(/[。！？；…]/)[0].trim();
  const one = cut.length >= 6 ? cut : String(text).trim();
  return one.length > TITLE_MAX ? one.slice(0, TITLE_MAX) : one;
}

// 「标题这一行和正文是不是同一句」的判据（小修单 task-ui-fix-20261106 第一项）：
// 归一 = 去首尾空白 + 去尾部句末标点，两边都归一后逐字全等才算重复。标点集合与上面 envelopeTitle
// 切首句用的是同一枚（再加 ASCII 的 . ! ?），两处口径不许分家——标题本来就是从正文里切出来的，
// 差异常常就是那一个句号。判的是显示用的那一行，正文本体一个字没动。
const TAIL_PUNCT = /[。！？；…,.!?]+$/;
export const isSameSay = (title, body) => String(title).trim().replace(TAIL_PUNCT, '').trim()
  === String(body).trim().replace(TAIL_PUNCT, '').trim();

// 「已读压平置后」的读序：纯函数，输入每条留言当前的态，输出该按哪个下标顺序画。
// 排序只发生在这一张显示用的索引表上，引擎那份 comments 数组一个字的顺序都没动。
export function envOrder(states) {
  const idx = states.map((_, i) => i);
  return [...idx.filter(i => states[i] !== 'read'), ...idx.filter(i => states[i] === 'read')];
}
