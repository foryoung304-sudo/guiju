// 上线版最小音频包（task-audio-min-20261102）：BGM 由本脚本程序合成，写成无缝循环的 WAV 文件。
// 为什么不用现成曲目：单上授权红线只许 CC0/公共领域且要逐个登记来源；合成件零第三方素材、零授权风险，
// 也保得住「≤2MB、无缝循环、底噪位音量」三条硬指标。旋律动机是写死的音序，不是采样。
// 重跑：node tools/make-bgm.js  →  public/audio/bgm-shijing.wav
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;          // 44.1kHz
const BPM = 120;
const BARS = 8;
const BEAT = 60 / BPM;     // 0.5s
const LOOP = Math.round(SR * BEAT * 4 * BARS);   // 8 小节 = 16.000s，整数采样 ⇒ 无缝循环
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'bgm-shijing.wav');

// D 宫五声（宫商角徵羽）：D E F# A B — 市井小调的五声骨架，不用半音，听起来才像街头而非电子乐
const SCALE = [62, 66, 69, 71, 74, 77, 79, 81, 83];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

// 8 小节的动机：每小节 16 分音符一格一档，数字是 SCALE 下标，null 是空
const MOTIF = [
  [0, null, 2, null, 4, null, 2, null, 3, null, 2, 0, null, 4, null, null],
  [1, null, 3, null, 5, null, 3, null, 4, null, 3, 1, null, null, null, null],
  [2, null, 4, null, 6, null, 4, null, 5, null, 4, 2, null, 3, null, null],
  [4, null, 3, null, 2, null, 1, null, 0, null, 1, 2, null, null, null, null],
  [0, null, 2, null, 4, null, 6, null, 5, null, 4, null, 3, null, 2, null],
  [1, null, 2, null, 4, null, 3, null, 2, null, 1, null, 0, null, null, null],
  [3, null, 4, null, 5, null, 7, null, 6, null, 5, 4, null, 3, null, null],
  [4, null, 2, null, 1, null, 0, null, 2, null, 1, null, 0, null, null, null],
];
// 低音：每小节根音/五音各两下（一拍一下，落在 1、3 拍）
const BASS = [0, 4, 2, 0, 0, 4, 3, 0].map(i => SCALE[i] - 12);

const buf = new Float64Array(LOOP);
// 圆周累加：任何音的尾巴超出循环点就折回开头，循环处不会出现「切一刀」
const add = (at, samples, scale) => {
  for (let i = 0; i < samples.length; i++) buf[(at + i) % LOOP] += samples[i] * scale;
};
const env = (t, decay) => Math.exp(-t / decay) * (1 - Math.exp(-t / 0.0015));

// 弹弦（扬琴/琵琶感）：基音 + 三个泛音，泛音衰减更快，起振极短
function pluck(freq, dur, decay) {
  const n = Math.round(SR * dur), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = env(t, decay);
    out[i] = e * (Math.sin(2 * Math.PI * freq * t)
      + 0.42 * Math.sin(2 * Math.PI * freq * 2 * t)
      + 0.18 * Math.sin(2 * Math.PI * freq * 3 * t + 0.4)
      + 0.07 * Math.sin(2 * Math.PI * freq * 4.01 * t));
  }
  return out;
}
// 低音：正弦 + 一点二次泛音，拖得比弹弦长，撑住律动
function bass(freq, dur, decay) {
  const n = Math.round(SR * dur), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = env(t, decay);
    out[i] = e * (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(2 * Math.PI * freq * 2 * t));
  }
  return out;
}
// 沙锤：噪声过一阶高通（差分）后 30ms 衰减，只在后半拍轻轻扫
// 噪声走固定种子 xorshift32，不用 Math.random：那玩意每跑换一个文件，公网重发哈希就对不上，
// 别人重跑一次还会把已签的资产悄悄换掉
let s32 = 0x2f6e2b1f;
const rnd = () => { s32 ^= s32 << 13; s32 ^= s32 >>> 17; s32 ^= s32 << 5; return (s32 >>> 0) / 4294967296; };
function shaker(dur) {
  const n = Math.round(SR * dur), out = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    out[i] = (w - prev) * env(i / SR, dur / 3);
    prev = w;
  }
  return out;
}
// 木鱼：两个共鸣正弦快速衰减，第 4、8 小节收一下拍
function woodblock(dur) {
  const n = Math.round(SR * dur), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = env(t, dur / 4);
    out[i] = e * (Math.sin(2 * Math.PI * 1050 * t) + 0.6 * Math.sin(2 * Math.PI * 1620 * t));
  }
  return out;
}

const SIXTEENTH = BEAT / 4;
for (let bar = 0; bar < BARS; bar++) {
  for (let step = 0; step < 16; step++) {
    const idx = MOTIF[bar][step];
    if (idx === null) continue;
    add(Math.round(SR * (bar * 4 * BEAT + step * SIXTEENTH)), pluck(hz(SCALE[idx]), 0.42, 0.10), 0.34);
  }
  for (const beat of [0, 2]) {
    add(Math.round(SR * (bar * 4 * BEAT + beat * BEAT)), bass(hz(BASS[bar]), 0.9, 0.34), 0.30);
  }
  // 后半拍的沙锤：只在 2、3 的后半，别铺满，铺满就吵
  for (const beat of [1.5, 3.5]) {
    add(Math.round(SR * (bar * 4 * BEAT + beat * BEAT)), shaker(0.05), 0.10);
  }
  if (bar === 3 || bar === 7) {
    add(Math.round(SR * (bar * 4 * BEAT + 3.5 * BEAT)), woodblock(0.12), 0.16);
  }
}

// 统一增益上限：整条底噪位归一到峰值 0.30（BGM 是底噪位，不是主角）
let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const g = 0.30 / peak;
let sum2 = 0, clamped = 0;
const pcm = Buffer.alloc(LOOP * 2);
for (let i = 0; i < LOOP; i++) {
  let v = buf[i] * g;
  if (Math.abs(v) > 0.98) clamped++;
  v = Math.max(-0.98, Math.min(0.98, v));
  sum2 += v * v;
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}
const rms = Math.sqrt(sum2 / LOOP);
// 循环缝：末样本与首样本的跳变（圆周累加构造上应当很小，这里量出来留档）
const last = pcm.readInt16LE((LOOP - 1) * 2) / 32767, first = pcm.readInt16LE(0) / 32767;

const header = Buffer.alloc(44);
// 44 字节 canonical WAV 头，字段偏移一个都不能串位：16=Subchunk1Size / 20=Format / 22=Channels /
// 24=SampleRate / 28=ByteRate / 32=BlockAlign / 34=Bits / 40=DataSize。
// 上一版把 1 写进了 18（那是 Subchunk1Size 的高位字节）→ size 变 65552、Channels 留 0，
// Chrome 直接 decodeAudioData 失败、BGM 在真机上全哑，而运行时的 catch 把它吞得一声不响。
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22); header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);

mkdirSync(dirname(OUT), { recursive: true });
const file = Buffer.concat([header, pcm]);
writeFileSync(OUT, file);

// 自己写自己读一遍：头错了就当场非零退出，不让「生成成功」替坏文件背书
function verify(buf) {
  const s = (o, n) => buf.slice(o, o + n).toString('ascii');
  const u16 = o => buf.readUInt16LE(o), u32 = o => buf.readUInt32LE(o);
  const want = { '0:RIFF': s(0, 4) === 'RIFF', '4:filesize-8': u32(4) === buf.length - 8, '8:WAVE': s(8, 4) === 'WAVE',
    '12:fmt': s(12, 4) === 'fmt ', '16:size=16': u32(16) === 16, '20:PCM': u16(20) === 1, '22:mono': u16(22) === 1,
    '24:rate': u32(24) === SR, '28:byterate': u32(28) === SR * 2, '32:blockalign': u16(32) === 2, '34:bits': u16(34) === 16,
    '36:data': s(36, 4) === 'data', '40:datasize': u32(40) === pcm.length };
  const bad = Object.entries(want).filter(([, ok]) => !ok).map(([k]) => k);
  if (bad.length) { console.error('WAV header BAD at ' + bad.join(', ')); process.exit(1); }
  return bad.length;
}
verify(file);

let outPeak = 0;
for (let i = 0; i < LOOP; i++) outPeak = Math.max(outPeak, Math.abs(pcm.readInt16LE(i * 2) / 32767));
console.log(JSON.stringify({
  out: OUT, seconds: +(LOOP / SR).toFixed(3), bytes: 44 + pcm.length,
  headerFields: { format: header.readUInt16LE(20), channels: header.readUInt16LE(22), sampleRate: header.readUInt32LE(24), byteRate: header.readUInt32LE(28), blockAlign: header.readUInt16LE(32), bits: header.readUInt16LE(34), fmtSize: header.readUInt32LE(16) },
  peak: +outPeak.toFixed(3),
  rms: +rms.toFixed(4), clampHits: clamped,
  seam: { first: +first.toFixed(4), last: +last.toFixed(4), jump: +(last - first).toFixed(4) },
}, null, 2));
