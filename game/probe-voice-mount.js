// 配音挂载层的离线走查（挂载单 voice-qc-mount-20261105，Orange `e21520c`；全覆盖段照挂载单 voice-qc-mount-full-20261106，Orange `e2a6293`）
// audio.js 整层是浏览器 API，跑不进回归回路，所以 §27 那几根针钉的是源码形状。这个探针补上另一头：
// 把 localStorage / document / AudioContext / fetch 四样按最小形状垫掉，真把 src/ui/audio.js 叫起来走四段——
// ① 逐句播与缺文件跳句（本批的现成缺件 = 待重录的两句；poach_02 已到货，这一档改验「自动接上」）
// ② 点按＝跳当前句进下一句 ③ 全覆盖三处新挂载：晨间并队、结果句两种键法（原文落点 ＋ 补遗 §一 的选项键）、常客认原文不认序号 ④ 静音时零播零取件。
// 只垫呈现层：不 import 引擎、不碰随机流、不写任何存档键，因此与两轨基线无关。
// 复跑：node probe-voice-mount.js（四段全绿 exit 0，任一段翻红 exit 1）
const started = [], fetched = [];
let mutedPref = '0';
const LINE_MS = 40;                       // 假件的一句「播完」时长：真机一句两三秒，这里只要相对快慢可辨
const failNames = ['vo_tab_02', 'vo_monthly_02'];   // 单上写明本批没到货的两句（赵大妈那两条读音偏了，待重录），取件必 404

globalThis.localStorage = { getItem: () => mutedPref, setItem: v => { mutedPref = v; } };
globalThis.document = { addEventListener: () => {}, hidden: false };

// 最小形状的 AudioContext：出声就登记「放的是哪一句」，播完按 onended 自动接下一句（真机上就是这一条链）
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.sampleRate = 48000; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createBufferSource() {
    const s = { buffer: null, onended: null, loop: false, connect() {}, disconnect() {},
      start() { started.push(s.buffer && s.buffer.name); setTimeout(() => s.onended && s.onended(), LINE_MS); },
      stop() { s.onended = null; } };
    return s;
  }
  decodeAudioData(buf) { return Promise.resolve(buf); }
  suspend() { this.state = 'suspended'; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 1 }, connect() {} }; }
}
globalThis.window = { AudioContext: FakeCtx };
globalThis.fetch = url => {
  fetched.push(url);
  const name = String(url).replace('./audio/', '').replace('.ogg', '');
  return failNames.includes(name)
    ? Promise.reject(new Error(`HTTP 404 ${name}`))
    : Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve({ name }) });
};

const { playVoice, advanceVoice, stopVoice, audioStatus, setMuted } = await import('./src/ui/audio.js');
const { voiceIntroLines, voiceResultLines, resultTexts, voiceRegularLines } = await import('./src/data/voice.js');
const { REGULAR_LINES } = await import('./src/data/customers.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const voFetched = () => fetched.filter(u => u.includes('vo_'));
const heard = () => started.filter(Boolean);

// ── ① 逐句播 + 缺文件静默跳句 ─────────────────────────────────────────────
// poach 五句：补录件到货即自动接成 01→02→03→04→05（表一字未动 ⇒ 11-05 那条「占号」纪律当场验收）。
// tab 三句里 02 缺件 ⇒ 实际出声 01→03；monthly 两句里 02 缺件 ⇒ 实际出声只剩 01（单上「跳句播法」那两档）。三档一次跑完，不报错、不停在半路。
playVoice(voiceIntroLines('evt_s_poach', { Rep: 50 }));
await wait(LINE_MS * 8);
const seqPoach = heard().join(' → ');
started.length = 0;
playVoice(voiceIntroLines('evt_d_001', {}));            // tab：出场三句，02 待重录
await wait(LINE_MS * 8);
const seqTab = heard().join(' → ');
started.length = 0;
playVoice(voiceIntroLines('evt_d_053', {}));            // monthly：出场两句，02 待重录
await wait(LINE_MS * 8);
const seqMonthly = heard().join(' → ');
const fail = audioStatus().voiceFail || {};
const c1 = seqPoach === 'vo_poach_01 → vo_poach_02 → vo_poach_03 → vo_poach_04 → vo_poach_05'
  && seqTab === 'vo_tab_01 → vo_tab_03' && seqMonthly === 'vo_monthly_01'
  && fail.vo_tab_02 === 'HTTP 404 vo_tab_02' && fail.vo_monthly_02 === 'HTTP 404 vo_monthly_02'
  && !fail.vo_poach_02 && voFetched().includes('./audio/vo_poach_02.ogg');

// ── ② 点按＝跳当前句进下一句：第一句还在播（40ms）时第 8ms 点一下，第二句必须立刻起，且整段不重不漏 ──
const flag = voiceIntroLines('evt_s_flag', { Rep: 70 });
started.length = 0;
playVoice(flag);
await wait(LINE_MS / 5);
const atTap = heard().length;
advanceVoice();
await wait(LINE_MS / 2);                       // 早于第一句的自然播完（40ms）就该听到第二句
const early = heard().length;
await wait(LINE_MS * 8);
const seq2 = heard().join();
const c2 = atTap === 1 && early >= 2 && seq2 === flag.join();

// ── ③ 全覆盖三处新挂载（e2a6293）──────────────────────────────────────────
// 3a 晨间并队：openShop 那一处把「晨间事件出场句 + 常客拍点句」并成一次 playVoice（分两次调用会被后一次的 stopVoice 掐掉前一段）。
//     这里按同一形状拼队：老李两句在前、常客两句在后，逐句播出的就是这个顺序。
const morningQ = [...voiceIntroLines('evt_d_052', {}), 'vo_c01_01', 'vo_c02_01'];
started.length = 0;
playVoice(morningQ);
await wait(LINE_MS * 12);
const seq3a = heard().join();
const c3a = seq3a === morningQ.join();

// 3b 结果句两种键法（补遗 §一）：note 行认 notes / forcedComments 两处引擎落点的原文，各认到一句；
//     数据里没有原文的那条（evt_d_002 的「罚款 150 / 免费整改」）note 路径一句不出——认不出＝当没这句，不报错、不猜档。
//     pick 行认玩家点下的 action id：正选出声、同事件错选零声（顺序轮播在结构上就没有入口）。
const st = { today: { notes: ['今日已立账'],
  forcedComments: ['老李把担子一挑：「成，是个过日子的。」', '他数了数，又数了数，不好意思地把钱收回去了。'] } };
const texts = resultTexts(st);
const laoli = voiceResultLines('evt_d_052', texts);
const change = voiceResultLines('evt_d_044', texts);
const none = voiceResultLines('evt_d_002', texts);
const finePicked = voiceResultLines('evt_d_002', texts, 'fine');
const fineOther = voiceResultLines('evt_d_002', texts, 'rectify');
const tabPicked = voiceResultLines('evt_d_001', texts, 'settle_now');
const c3b = texts.length === 3 && laoli.join() === 'vo_laoli_04' && change.join() === 'vo_change_04' && none.length === 0
  && finePicked.join() === 'vo_fine_05' && fineOther.join() === 'vo_fine_06' && tabPicked.join() === 'vo_tab_05';

// 3c 常客认原文不认序号：表里的键就是 customers.js 那一行灰字本身，十五拍逐拍对上；
//     对不上（含正文留空的 c04、以及没有文本的场合）＝没这句，不猜。
const regHit = ['c01', 'c02', 'c03'].every(id =>
  REGULAR_LINES[id].every((line, i) => voiceRegularLines(id, line).join() === `vo_${id}_0${i + 1}`));
const c3c = regHit && voiceRegularLines('c04', '随便一句').length === 0 && voiceRegularLines('c01', '').length === 0;

// ── ④ 静音统管（放最后一段：setMuted(false) 会去取 BGM 与 12 件录音，最小形状的假件经不起那一趟，这一段只验「静音这一侧」）──
// 中途按下立刻收声且不追播；静音态 playVoice 整段不播、连文件都不取；结果句同一条路。
started.length = 0;
playVoice(flag);
await wait(LINE_MS / 5);
setMuted(true);
const atMute = heard().length;
await wait(LINE_MS * 8);
const afterMute = heard().length;
const take0 = voFetched().length;
playVoice(voiceIntroLines('evt_s_promo', { Rep: 60 }));
playVoice(voiceResultLines('evt_s_insp', ['检查不合格：封条贴上摊名了。']));
playVoice(voiceResultLines('evt_d_002', texts, 'fine'));        // 选项键那一类同一条路：静音态零播零取件
playVoice(voiceRegularLines('c01', REGULAR_LINES.c01[0]));
await wait(LINE_MS * 4);
stopVoice();
await wait(LINE_MS * 2);
const c4 = atMute === 1 && afterMute === 1 && voFetched().length === take0
  && heard().length === 1 && audioStatus().voiceLeft === 0;

console.log(`① 逐句播／缺文件跳句：poach [${seqPoach}]（补录件已接上）｜tab [${seqTab}]｜monthly [${seqMonthly}]｜缺件读数 ${JSON.stringify(fail)} ⇒ ${c1 ? '过' : '不过'}`);
console.log(`② 点按推进：点前出声 ${atTap} 句，点后半拍（${LINE_MS / 2}ms）已出声 ${early} 句（不等第一句播完）｜整段 [${seq2}] 与表内句序 ${c2 ? '一致（不重不漏）' : '对不上'} ⇒ ${c2 ? '过' : '不过'}`);
console.log(`③ 全覆盖：3a 晨间并队 [${seq3a}]${c3a ? '＝事件在前、常客在后' : '（顺序对不上）'}｜3b 原文键两处落点各认到一句 laoli=[${laoli}] change=[${change}]，无原文那条 out=[${none}]；选项键 fine=[${finePicked}] rectify=[${fineOther}] tab-settle=[${tabPicked}]（正选出声、错选换句）｜3c 常客 15 拍认原文 ${regHit ? '全对' : '有串'} ⇒ ${c3a && c3b && c3c ? '过' : '不过'}`);
console.log(`④ 静音统管：中途按下静音时出声 ${atMute} 句、静音后再没加过（${afterMute} 句）｜静音态取件增量 ${voFetched().length - take0} 次、队列剩 ${audioStatus().voiceLeft} 句 ⇒ ${c4 ? '过' : '不过'}`);
console.log(`\n判语：${c1 && c2 && c3a && c3b && c3c && c4 ? '四段全过 ⇒ 挂载层按单执行（逐句播／点按推进／缺文件静默／全覆盖三处新挂载／静音统管）' : '有段翻红 ⇒ 停手再报'}`);
process.exit(c1 && c2 && c3a && c3b && c3c && c4 ? 0 : 1);
