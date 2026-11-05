// 配音挂载层的离线走查（挂载单 voice-qc-mount-20261105，Orange `e21520c`）
// audio.js 整层是浏览器 API，跑不进回归回路，所以 §27 那三根针钉的是源码形状。这个探针补上另一头：
// 把 localStorage / document / AudioContext / fetch 四样按最小形状垫掉，真把 src/ui/audio.js 叫起来走三段——
// ① 缺文件那一句自动跳过（vo_poach_02 未补录＝现成的这一档）② 点按＝跳当前句进下一句 ③ 静音时零播零取件。
// 只垫呈现层：不 import 引擎、不碰随机流、不写任何存档键，因此与两轨基线无关。
// 复跑：node probe-voice-mount.js（三段全绿 exit 0，任一段翻红 exit 1）
const started = [], fetched = [];
let mutedPref = '0';
const LINE_MS = 40;                       // 假件的一句「播完」时长：真机一句两三秒，这里只要相对快慢可辨
const failNames = ['vo_poach_02'];        // 仿真 Orange 的读数：这一句补录没到，取件必 404

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
const { voiceIntroLines, voiceResultLines } = await import('./src/data/voice.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const voFetched = () => fetched.filter(u => u.includes('vo_'));
const heard = () => started.filter(Boolean);

// ── ① 缺文件＝静默走纯文字：poach 表里五句，02 取不到 ⇒ 实际出声必须 01→03→04→05，不报错、不停在半路 ──
playVoice(voiceIntroLines('evt_s_poach', { Rep: 50 }));
await wait(LINE_MS * 8);
const seq1 = heard().join(' → ');
const c1 = seq1 === 'vo_poach_01 → vo_poach_03 → vo_poach_04 → vo_poach_05'
  && voFetched().includes('./audio/vo_poach_02.ogg')
  && audioStatus().voiceFail.vo_poach_02 === 'HTTP 404 vo_poach_02';

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

// ── ③ 静音统管：中途按下立刻收声且不追播；静音态 playVoice 整段不播、连文件都不取；结果句同一条路 ──
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
await wait(LINE_MS * 4);
stopVoice();
await wait(LINE_MS * 2);
const c3 = atMute === 1 && afterMute === 1 && voFetched().length === take0
  && heard().length === 1 && audioStatus().voiceLeft === 0;

console.log(`① 缺文件走纯文字：实际出声 [${seq1}]｜02 那一次取件 404 已记进读数 voiceFail=${JSON.stringify(audioStatus().voiceFail)}｜队列剩 ${audioStatus().voiceLeft} 句 ⇒ ${c1 ? '过' : '不过'}`);
console.log(`② 点按推进：点前出声 ${atTap} 句，点后半拍（${LINE_MS / 2}ms）已出声 ${early} 句（不等第一句播完）｜整段 [${seq2}] 与表内句序 ${c2 ? '一致（不重不漏）' : '对不上'} ⇒ ${c2 ? '过' : '不过'}`);
console.log(`③ 静音统管：中途按下静音时出声 ${atMute} 句、静音后再没加过（${afterMute} 句）｜静音态取件增量 ${voFetched().length - take0} 次、队列剩 ${audioStatus().voiceLeft} 句 ⇒ ${c3 ? '过' : '不过'}`);
console.log(`\n判语：${c1 && c2 && c3 ? '三段全过 ⇒ 挂载层按单执行（逐句播／点按推进／缺文件静默／静音统管）' : '有段翻红 ⇒ 停手再报'}`);
process.exit(c1 && c2 && c3 ? 0 : 1);
