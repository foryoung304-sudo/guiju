// 称重手感自测（signoff-weighing-sim-ruling-20261031 口径）
// 1. 松手即定格：模拟在松手事件那一刻冻结克数，松手之后不再补量；反应延迟只表现为手按得久、松手事件发生得更晚。
// 2. 刹车速度按目标缩放：min(40 克/秒, 目标 × 20%/秒)；刹车区不变：剩余 ≤ max(30 克, 目标 15%)。
// 3. 故意早松手行在触发点冻结（不再加反应尾量），用来验证判定带：停在九成落正常带、停在八成及以下落短斤。
// 4. 精修步长分段：与目标差 > 20 克时 ±5，≤ 20 克时 ±1（补点与捏回同规则）。
// 主表按目标 ≤100 克 / >100 克分层报告，不设「不捏回中位必须回落」的门。
const CUSTOMERS = (await import('./src/data/customers.js')).CUSTOMERS;

const HOLD_DELAY = 0.15;
const FRAME = 1 / 60;
const BRAKE_RATE = 40;
const BRAKE_GRAMS = 30;
const BRAKE_SHARE = 0.15;
const BRAKE_SCALE = 0.2;
const STEP_FAR = 5;
const STEP_NEAR = 1;
const GAP_FINE = 20;

const TOP = 180;
const ramp = t => 60 + (TOP - 60) * Math.min(1, Math.max(0, (t - HOLD_DELAY) / 1));
const braking = (g, target) => {
  const rem = target - g;
  return rem > 0 && rem <= Math.max(BRAKE_GRAMS, target * BRAKE_SHARE);
};
const brakeRate = target => Math.min(BRAKE_RATE, target * BRAKE_SCALE);
const rateFor = (g, target, t) => (braking(g, target) ? brakeRate(target) : ramp(t));

// 一次按压：从按下到松手；松手事件一到就返回，之后不再加量（松手即定格）
// exact=true 用于「故意停在 X%」：玩家定义的是真实克数落点，不把秤面抖动算成提前松手
function holdTo(trigger, target, reaction, exact = false) {
  let g = 0, t = 0;
  const shown = () => (braking(g, target) ? g : g + (Math.random() * 6 - 3));   // 抖动分区
  while (t < 30) {
    t += FRAME;
    if (t > HOLD_DELAY) g += rateFor(g, target, t) * FRAME;
    if ((exact ? g : shown()) >= trigger) break;
  }
  const end = t + reaction;   // 反应延迟：手指还按着，克数继续涨到这里；松手后不加
  while (t < end) {
    t += FRAME;
    if (t > HOLD_DELAY) g += rateFor(g, target, t) * FRAME;
  }
  return g;
}

const stepFor = (g, target) => (Math.abs(target - g) > GAP_FINE ? STEP_FAR : STEP_NEAR);
const tolFor = target => Math.max(1, target * 0.01);   // 与「正好」同一容差

function playLine(target, kind, opts = {}) {
  const { pinchBack = true, releaseAt = null } = opts;
  // kind: 'naive' 新手（读数到点才松、反应慢、不预判） / 'skilled' 熟手（按自己反应时间提前松、反应快）
  const reaction = kind === 'naive' ? 0.15 + Math.random() * 0.20 : 0.09 + Math.random() * 0.10;
  const noise = kind === 'naive' ? target * (Math.random() * 0.02 - 0.01) : target * (Math.random() * 0.012 - 0.006);
  // 预判按时间算：反应多久 × 当前刹车速度，而不是固定克数——刹车速度已按目标缩放
  const anticipate = kind === 'naive' ? 0 : reaction * brakeRate(target);
  const trigger = releaseAt != null ? target * releaseAt : target + noise - anticipate;
  // 故意早松手就是「松手事件发生在触发点」，没有反应尾量；正常瞄准才把反应延迟算进按住时长
  let g = holdTo(trigger, target, releaseAt != null ? 0 : reaction, releaseAt != null);
  if (releaseAt != null || !pinchBack) return g / target;
  // 会捏回的人把落点修回容差内（分段步长 ≤20 克时 ±1，正好能落到目标上）
  for (let i = 0; i < 400; i++) {
    const gap = target - g;
    if (Math.abs(gap) <= tolFor(target)) break;
    g = Math.max(0, g + Math.sign(gap) * stepFor(g, target));
  }
  return g / target;
}

const allTargets = CUSTOMERS.flatMap(c => Object.values(c.order || {}).filter(v => v > 0));
const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)];
const strat = (label, filter) => ({ label, targets: allTargets.filter(filter) });

function run(kind, opts, targets) {
  const all = [];
  for (const target of targets) for (let i = 0; i < 2000; i++) all.push(playLine(target, kind, opts));
  const share = f => (all.filter(f).length / all.length * 100).toFixed(1) + '%';
  return {
    p5: pct(all, 0.05).toFixed(3), med: pct(all, 0.5).toFixed(3), p95: pct(all, 0.95).toFixed(3),
    band: share(r => r >= 0.98 && r <= 1.05),
    enough: share(r => r >= 0.98),
    normal: share(r => r >= 0.90 && r < 0.98),
    short: share(r => r < 0.90),
    atLeast98: share(r => r >= 0.98),
  };
}

const row = (label, r) =>
  console.log(`${label}：p5 ${r.p5}｜中位 ${r.med}｜p95 ${r.p95}｜98–105% ${r.band}｜足称 ${r.enough}｜正常 90–98% ${r.normal}｜短斤 <90% ${r.short}`);

const groups = [
  strat('目标 ≤100 克', t => t <= 100),
  strat('目标 >100 克', t => t > 100),
];

console.log('—— 瞄准 100%（松手即定格，刹车 min(40, 目标×20%/秒)）——');
for (const grp of groups) {
  console.log(`\n${grp.label}（${grp.targets.length} 行）`);
  row('熟手（会捏回）      ', run('skilled', {}, grp.targets));
  row('新手（会捏回）      ', run('naive', {}, grp.targets));
  row('熟手（完全不捏回）  ', run('skilled', { pinchBack: false }, grp.targets));
  row('新手（完全不捏回）  ', run('naive', { pinchBack: false }, grp.targets));
}

console.log('\n—— 故意早松手 sanity（松手事件触发即定格，零尾量）——');
for (const grp of groups) {
  console.log(`\n${grp.label}（${grp.targets.length} 行）`);
  for (const at of [0.90, 0.85, 0.80]) {
    const r = run('naive', { releaseAt: at }, grp.targets);
    console.log(`停在读数 ${(at * 100).toFixed(0)}%：中位 ${r.med}｜正常带 ${r.normal}｜足称(≥98%) ${r.atLeast98}｜短斤 ${r.short}`);
  }
}

console.log('\n—— 刹车区通过时间（定义不变）——');
for (const target of [...new Set(allTargets)].sort((a, b) => a - b)) {
  const zone = Math.max(BRAKE_GRAMS, target * BRAKE_SHARE);
  console.log(`目标 ${target} 克：刹车区 ${zone.toFixed(1)} 克，刹车速度 ${brakeRate(target).toFixed(1)} 克/秒 → ${(zone / brakeRate(target)).toFixed(2)} 秒`);
}

console.log('\n松手后尾量：0 克（holdTo 返回即定格，没有任何后续累加循环）。');
