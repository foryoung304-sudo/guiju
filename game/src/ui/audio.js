// 上线版最小音频包（施工单 task-audio-min-20261102）：1 条 BGM 文件 + 6 条 SFX 程序合成 + 12 件真实录音（接入单 594b908）。
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
const RATE = { tap: 60, grab: 90, exact: 120, buy: 200, cash: 300, level: 400,
  pop: 150, error: 200, paper: 400, stamp: 300, coin: 150, prep: 90 };

// ── 真实录音音效包（接入单 task-sfx-pack-20261104，Orange `594b908`；逐文件许可与实测在 AUDIO-LICENSES.md 音效包一节）──
// 单上挂载表：结算到账→cha-ching｜单笔收款→coin｜称重正好→confirm｜点按→tap｜事件弹出→pop｜失败被拒→error（新补）｜
// 备菜→chop/knife 随机二选一｜营业锅声→boil-loop（循环垫底）｜王老板递信封翻账本→paper｜定版落定→stamp｜升档盘店→bell。
// 三条纪律：合成 6 件一条不删（文件没取到、没解出来就回落合成，绝不让游戏哑）；静音键统管这一层也一样；
// 「随机二选一」只用 Math.random，绝不碰引擎的 rng 流——两轨基线因此逐字节不动。
const SFX_FILES = {
  tap: 'sfx-tap', exact: 'sfx-confirm', cash: 'sfx-cha-ching', level: 'sfx-bell',
  pop: 'sfx-pop', error: 'sfx-error', coin: 'sfx-coin', paper: 'sfx-paper', stamp: 'sfx-stamp',
};
const PREP_FILES = ['sfx-chop', 'sfx-knife'];   // 备菜：每次现抽一枚，两声都要在场
const BOIL_FILE = 'sfx-boil-loop';
// 一次性文件共用一支推子 0.265，两个锚点都是仓里已签的读数，不另造标准：
// 包内最响的一件（sfx-chop 峰值 0 dBFS）过完 FILE×SFX×MASTER 得 0.203 满幅 = 六件合成里最响的抓菜那个数；
// 最轻的一件（sfx-error −5.9 dBFS）得 0.103 ≈ 签过的点按 0.1069。十二件因此全落在已签的 0.097–0.203 这一带里，
// 包内部的相对轻重照 Orange 归一过的成品，我不动。
const FILE_TRIM = 0.265;
// 锅声是循环，不能吃一次性那支推子（连着一整屏响，等响度比单发高出一截就盖住 BGM）。
// BOIL_TRIM 0.184 = 出链综合 −35.9 LUFS，比 BGM 出链（成品实测 −16.0 LUFS 过 0.5×0.9 总线 = −31.9）低 4 个 LU：垫底、不遮曲。
// 扳柄就这一格：真机嫌听不见往 0.28 抬，嫌盖过 BGM 往 0.12 压，终判归店主耳朵。
const BOIL_TRIM = 0.184;

let ctx = null, master = null, bgmBus = null, sfxBus = null, bgmSrc = null, bgmBuf = null, bgmRaw = null, bgmWanted = false;
let bgmFail = null;   // 解码失败的原因只留给自检读数，不上画面（坏文件不能又一次哑着过验收）
let fileBufs = {}, fileFail = {}, fileWanted = new Set();   // 12 件真实录音：解好的缓冲 / 失败原因 / 已发起的取件
let boilSrc = null, boilWanted = false;                     // 锅声循环的开关位与当前那一条源
let muted = localStorage.getItem(PREF_KEY) === '1';
let gestured = false, last = {};

const ready = () => !!ctx && !muted;

// 解码只在真上下文里做：为了解码单独再开一个 AudioContext 会白占一格（移动端上下文数量有限）
function decodeBgm() {
  if (!ctx || !bgmRaw || bgmBuf) return;
  ctx.decodeAudioData(bgmRaw.slice(0)).then(buf => { bgmBuf = buf; playBgm(); }).catch(e => { bgmFail = String(e && e.message || e); });
  bgmRaw = null;
}

// 12 件录音一共约 200 KB，都在首次动手之后与 BGM 同一批取（同一批并发、每件一次，不按需拖慢第一次出声）；
// 每件的成功/失败各自记账：坏文件不许像当年那次 WAV 头一样「哑着过验收」，读数进 audioStatus
const ALL_FILES = [...Object.values(SFX_FILES), ...PREP_FILES, BOIL_FILE];
function loadFiles() {
  if (!ctx) return;
  for (const name of ALL_FILES) {
    if (fileBufs[name] || fileWanted.has(name)) continue;
    fileWanted.add(name);
    fetch(`./audio/${name}.ogg`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(b => ctx.decodeAudioData(b))
      .then(buf => {
        fileBufs[name] = buf;
        if (name === BOIL_FILE && boilWanted) startBoil();   // 缓冲比开关晚到：到了就补起
      })
      .catch(e => { fileFail[name] = String(e && e.message || e); });
  }
}

// 单发一件：命中缓冲就放，没命中返回 false，由调用方回落到程序合成（同一条边绝不响两声）
function playFile(name) {
  const buf = fileBufs[name];
  if (!buf) return false;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = FILE_TRIM;
  src.connect(g); g.connect(sfxBus); src.start();
  return true;
}

// 锅声循环：只在营业那几屏（称重）响，别的屏一律收掉；与 BGM 一样受静音键与切后台管
function startBoil() {
  const buf = fileBufs[BOIL_FILE];
  if (!boilWanted || boilSrc || !buf || !ready() || ctx.state === 'suspended') return;
  boilSrc = ctx.createBufferSource();
  boilSrc.buffer = buf; boilSrc.loop = true;
  const g = ctx.createGain(); g.gain.value = BOIL_TRIM;
  boilSrc.connect(g); g.connect(sfxBus); boilSrc.start();
}
function stopBoil() {
  if (!boilSrc) return;
  try { boilSrc.stop(); } catch {}
  boilSrc.disconnect(); boilSrc = null;
}
export function setBoil(on) {
  boilWanted = !!on && !muted;
  if (boilWanted) startBoil(); else stopBoil();
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

// 移动端自动播放策略：BGM、录音 SFX 与上下文都只在玩家第一次动手之后建（单上行为规矩第 1 条）；
// 静音态下连文件都不取，省一截流量
function openAll() { loadBgm(); loadFiles(); }
export function armAudio() {
  if (gestured) return;
  gestured = true;
  if (muted) return;
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume().then(openAll, () => {});
  else openAll();
}

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  localStorage.setItem(PREF_KEY, muted ? '1' : '0');
  if (muted) { stopBgm(); stopBoil(); boilWanted = false; if (ctx) ctx.suspend(); }
  else if (ensure()) {
    if (ctx.state === 'suspended') ctx.resume().then(openAll, () => {});
    else openAll();
  }
}

// 切后台/锁屏自动暂停，回前台恢复（已静音就不恢复）
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) { if (!muted) ctx.suspend(); }
  else if (!muted && gestured) ctx.resume().then(() => { playBgm(); startBoil(); }, () => {});
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

// ── 程序合成 6 件（音频单 task-audio-min-20261102）：接入单 594b908 之后它们是兜底位——
// 对应边有录音就先放录音，取不到/解不开才回落这一层；单上没给文件的抓菜与采购两声照旧只用合成。
// （AUDIO-LICENSES.md 里自制与第三方逐件分列注明）──
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
const FILE_EDGES = new Set([...Object.keys(SFX_FILES), 'prep']);
export function sfx(name) {
  if (muted || (!VOICES[name] && !FILE_EDGES.has(name))) return;
  if (!ctx && !gestured) return;
  if (!ctx) ensure();
  if (!ctx || ctx.state === 'suspended') return;
  const now = Date.now();
  if (last[name] && now - last[name] < RATE[name]) return;
  last[name] = now;
  try {
    // 备菜 = chop/knife 随机二选一（用 Math.random，绝不碰引擎的 rng 流）；
    // 其余先放录音，缓冲没到就回落到程序合成——同一条边绝不响两声，也绝不哑
    if (name === 'prep') playFile(PREP_FILES[Math.random() < 0.5 ? 0 : 1]);
    else if (!playFile(SFX_FILES[name]) && VOICES[name]) VOICES[name]();
  } catch {}
}

// 回报与自检用的实时读数（不写进任何画面）
export function audioStatus() {
  return { available: !!ctx, state: ctx ? ctx.state : 'none', muted, gestured,
    bgmLoaded: !!bgmBuf, bgmPlaying: !!bgmSrc, bgmFail, master: MASTER, bgmBus: BGM_GAIN, sfxBus: SFX_GAIN,
    cue: MOTION_CUE, bgmSeconds: bgmBuf ? +bgmBuf.duration.toFixed(3) : null,
    // 录音包 12 件：取到几件、哪几件解不开、锅声在不在跑（当年那次「坏文件全程哑」的教训：必须有读数）
    sfxFilesReady: Object.keys(fileBufs).length, sfxFilesTotal: ALL_FILES.length,
    sfxFileFail: Object.keys(fileFail).length ? fileFail : null,
    boilPlaying: !!boilSrc, boilWanted, fileTrim: FILE_TRIM, boilTrim: BOIL_TRIM,
    boilSeconds: fileBufs[BOIL_FILE] ? +fileBufs[BOIL_FILE].duration.toFixed(3) : null };
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
