// 上线版最小音频包（施工单 task-audio-min-20261102）：1 条 BGM 文件 + 6 条 SFX 程序合成。
// 全部走 WebAudio，不进引擎、不进随机流、不进任何时序：sweep / m3 必须逐字节同（单上红线）。
// 静音偏好存独立键，绝不动 SAVE_VERSION 与存档结构（店主测试档不能废）。
const PREF_KEY = 'guiju-m1-audio';
const BGM_URL = './audio/bgm-rubber-nod.ogg';
const MASTER = 0.9;        // 统一增益上限：所有声音最后都过这一格
const BGM_GAIN = 0.5;      // BGM 做底噪位。换曲单后新文件实测 −16.0 LUFS / 峰值 −4.80 dBFS（0.576 满幅），
                           // 过完 0.5×0.9 两条总线 = 峰值 0.259、综合 −22.9 LUFS；旧 shijing 那档实测是 0.135 / −32.1。
                           // ⇒ 这一换让 BGM 比旧档响约 9 个 LU，是换曲单写死的 −16 LUFS 目标带来的，本批没动这个增益去补齐
                           //   （补齐的扳柄就是这一格：要退回旧的读数取 0.26）。听感终判归店主真机，见 AUDIO-LICENSES 换曲批一节。
const SFX_GAIN = 0.85;
// 同一种音效的最小间隔（毫秒）：抓菜连点时不让同一声糊成一片
const RATE = { tap: 60, grab: 90, exact: 120, buy: 200, cash: 300, level: 400 };

let ctx = null, master = null, bgmBus = null, sfxBus = null, bgmSrc = null, bgmBuf = null, bgmRaw = null, bgmWanted = false;
let bgmFail = null;   // 解码失败的原因只留给自检读数，不上画面（坏文件不能又一次哑着过验收）
let muted = localStorage.getItem(PREF_KEY) === '1';
let gestured = false, last = {};

const ready = () => !!ctx && !muted;

// 解码只在真上下文里做：为了解码单独再开一个 AudioContext 会白占一格（移动端上下文数量有限）
function decodeBgm() {
  if (!ctx || !bgmRaw || bgmBuf) return;
  ctx.decodeAudioData(bgmRaw.slice(0)).then(buf => { bgmBuf = buf; playBgm(); }).catch(e => { bgmFail = String(e && e.message || e); });
  bgmRaw = null;
}

function ensure() {
  if (ctx || muted) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = MASTER; master.connect(ctx.destination);
    bgmBus = ctx.createGain(); bgmBus.gain.value = BGM_GAIN; bgmBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_GAIN; sfxBus.connect(master);
  } catch { ctx = null; return null; }   // 老 WebView 没有 WebAudio：整层静音，不影响任何玩法
  if (bgmWanted) decodeBgm();
  return ctx;
}

// 移动端自动播放策略：BGM 与上下文都只在玩家第一次动手之后建（单上行为规矩第 1 条）；
// 静音态下连文件都不取，省一截流量
export function armAudio() {
  if (gestured) return;
  gestured = true;
  if (muted) return;
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume().then(loadBgm, () => {});
  else loadBgm();
}

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  localStorage.setItem(PREF_KEY, muted ? '1' : '0');
  if (muted) { stopBgm(); if (ctx) ctx.suspend(); }
  else if (ensure()) {
    if (ctx.state === 'suspended') ctx.resume().then(loadBgm, () => {});
    else loadBgm();
  }
}

// 切后台/锁屏自动暂停，回前台恢复（已静音就不恢复）
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) { if (!muted) ctx.suspend(); }
  else if (!muted && gestured) ctx.resume().then(playBgm, () => {});
});

function loadBgm() {
  if (bgmRaw || bgmBuf || bgmWanted) return;
  bgmWanted = true;
  fetch(BGM_URL).then(r => (r.ok ? r.arrayBuffer() : null))
    .then(b => { if (b) { bgmRaw = b; decodeBgm(); } })
    .catch(() => { bgmWanted = false; });
}

function playBgm() {
  if (ready() && bgmBuf && !bgmSrc) {
    bgmSrc = ctx.createBufferSource();
    bgmSrc.buffer = bgmBuf; bgmSrc.loop = true;   // 换曲单后 = 124.5335s / 5,491,928 样本，尾首 2.2s 交叉淡化预叠成环（接缝实测见台账）
    bgmSrc.connect(bgmBus); bgmSrc.start();
  }
}
function stopBgm() { if (bgmSrc) { try { bgmSrc.stop(); } catch {} bgmSrc.disconnect(); bgmSrc = null; } }

// ── SFX：全部程序合成，零第三方素材（AUDIO-LICENSES.md 里逐条注明）──
function tone(freq, at, dur, peak, { type = 'sine', glide = 0, harmonics = [] } = {}) {
  const t0 = ctx.currentTime + at, t1 = t0 + dur;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.008, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  g.connect(sfxBus);
  const osc = ctx.createOscillator();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t1);
  osc.connect(g); osc.start(t0); osc.stop(t1 + 0.02);
  for (const [mul, amp, d2] of harmonics) {
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.linearRampToValueAtTime(peak * amp, t0 + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + d2);
    g2.connect(sfxBus);
    const o2 = ctx.createOscillator();
    o2.type = 'sine'; o2.frequency.setValueAtTime(freq * mul, t0);
    o2.connect(g2); o2.start(t0); o2.stop(t0 + d2 + 0.02);
  }
}
function noise(at, dur, peak, hp) {
  const n = Math.max(1, Math.round(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (w - prev) * (1 - i / n); prev = w;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.value = peak;
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(ctx.currentTime + at);
}

const VOICES = {
  tap: () => { tone(1850, 0, 0.03, 0.10, { type: 'triangle' }); noise(0, 0.02, 0.05, 3000); },
  grab: () => { tone(190, 0, 0.11, 0.20, { glide: 0.55 }); noise(0, 0.05, 0.07, 900); },
  exact: () => { tone(1175, 0, 0.34, 0.16, { harmonics: [[1.5, .35, .2], [2.01, .18, .14]] }); tone(1760, 0.05, 0.22, 0.08); },
  buy: () => { tone(880, 0, 0.07, 0.13); tone(1175, 0.07, 0.1, 0.12); },
  cash: () => { tone(587, 0, 0.09, 0.13); tone(740, 0.08, 0.09, 0.13); tone(880, 0.16, 0.16, 0.15, { harmonics: [[2, .3, .1]] }); noise(0, 0.16, 0.03, 4200); },
  level: () => { [294, 370, 440, 587].forEach((f, i) => tone(f, i * 0.09, 0.3, 0.13, { harmonics: [[2, .25, .12]] })); },
};

// 首次动手之前不出声（移动端自动播放策略）；上下文由这一句自己补建，不再依赖调用方先跑过 armAudio
export function sfx(name) {
  if (muted || !VOICES[name]) return;
  if (!ctx && !gestured) return;
  if (!ctx) ensure();
  if (!ctx || ctx.state === 'suspended') return;
  const now = Date.now();
  if (last[name] && now - last[name] < RATE[name]) return;
  last[name] = now;
  try { VOICES[name](); } catch {}
}

// 回报与自检用的实时读数（不写进任何画面）
export function audioStatus() {
  return { available: !!ctx, state: ctx ? ctx.state : 'none', muted, gestured,
    bgmLoaded: !!bgmBuf, bgmPlaying: !!bgmSrc, bgmFail, master: MASTER, bgmBus: BGM_GAIN, sfxBus: SFX_GAIN,
    cue: MOTION_CUE, bgmSeconds: bgmBuf ? +bgmBuf.duration.toFixed(3) : null };
}

// ── 声音标记（动画单 task-event-motion-20261102 第二条）：整块由下面的开关隔离 ──────────
// 单上要求「说撤就整条干净摘除，不留残钩」：撤 = 把 MOTION_CUE 置 false（画面立刻无声，逻辑一字不动），
// 彻底删 = 去掉这一整块 + main.js 里的 CUE_EVENT_ID / cueLast / render() 那三行与 import 里的那个名字。
// 只做一声轻咳式拟声：程序合成，不录音、不 TTS、不带一个字；走 sfxBus，所以与 BGM/SFX 共用同一个静音开关。
export const MOTION_CUE = true;
const CUE_GAP = 900;   // 同一声标记的最小间隔（毫秒），防连点/重排把它重复叠响
let cueLastAt = 0;

// 两下带气声的窄带噪声 = 「咳」的形状：快速起振、短促峰、平方衰减的尾巴，频点落在人声区但不成字
function cough(at, freq, dur, peak) {
  const n = Math.max(1, Math.round(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    const e = Math.min(1, i / (n * 0.06)) * (1 - i / n) ** 2.2;
    d[i] = (w - prev) * e; prev = w;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
  const g = ctx.createGain(); g.gain.value = peak;
  src.connect(bp); bp.connect(g); g.connect(sfxBus);
  src.start(ctx.currentTime + at);
}

const CUES = {
  // 第一下稍实，第二下更轻更闷。增益是量出来的：离线渲染回读峰值 0.1057 满幅（≈ −19.5 dBFS），
  // 与 ①「点击」的签过读数 0.1069 同一档——出场标记不该压过操作音，但也不能哑到听不到位
  // （初版照 VOICES 的量级写 0.30，实测只剩 0.0125，因为带通把噪声能量滤掉了大半）。
  grandmaCough: () => { cough(0, 620, 0.13, 2.4); cough(0.15, 500, 0.17, 1.5); },
};

export function motionCue(name) {
  if (!MOTION_CUE || !CUES[name]) return;
  if (muted || !gestured) return;      // 与 BGM 同一条规矩：玩家没动手之前不出声
  if (!ctx) ensure();
  if (!ctx || ctx.state === 'suspended') return;
  const now = Date.now();
  if (now - cueLastAt < CUE_GAP) return;
  cueLastAt = now;
  try { CUES[name](); } catch {}
}
