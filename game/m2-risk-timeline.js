// M2 首项 R5：短斤 Risk 时点复核（输入口径 = 签复 b48ec8e §三 第 11 条「豁免」）
// 正本 3.4 锚点：3 单/日全短斤 = +1.5 Risk/日 → 约 27 天到 Risk 40（例行检查入池线）、约 47 天到 Risk 70（大检查硬触发线）。
// ① 逐日增量：证明 Rep ≥60 之后增量仍是 +1.5/日；② 实报到 40 / 70 的日子与锚点对账；
// ③ 新旧口径逐日对照（旧口径下短斤线被 −2 完全中和）；④ 策略③ 的 Risk 破 70 门（M3）。
// 种子固定，同种子可复现。

import { simulate as simRaw, REF_STRATEGIES } from './src/sim.js';
import { applyShadow } from './src/engine/shadow.js';

// M1 口径：本脚本对的是已签发的 Risk/卖断货天数锚（签复 b48ec8e §三、裁定 0137f58 ④），
// 那些锚跑在 M1 构建（无小豆人工、无竞争分流，正文 3.5:141；事件池按 §八 M1 行 = 只有日常四条）
// → 三样一起关才复现得出来，M2 在场口径的时点另在文末单独报，不替换锚。
// eventScope:'m1' 这一项是本批加的：Risk 爬过 40 / 70 之后例行与大检查都会改 Risk（清至 40 / 30），
// 让 M2 事件池进来就会把锚点的落点日子挪掉，所以锚段必须先关池。
const simulate = (seed, days, strat, closer, opts) =>
  simRaw(seed, days, strat, closer, { labor: false, competition: false, eventScope: 'm1', ...opts });

const SEEDS = [7979, 36832, 20261031];
const SHORT_LINE = { name: '短斤线 全正经 + 标准价 + 天天短斤', tier: 1, price: 'standard', weigh: 0.85,
  yieldAll: true, buyFacilities: false, upgrade: false, buyout: false };
const firstDayAt = (log, th) => log.find(d => d.Risk >= th)?.day ?? null;

// 抵扣看的是昨日收盘的 Rep（3.14 第 9 步里 Risk 在 Rep 更新之前结算）
const stepsAfterRep60 = log => log
  .map((d, i) => (i > 0 && log[i - 1].Rep >= 60 ? +(d.Risk - log[i - 1].Risk).toFixed(2) : null))
  .filter(v => v !== null);

console.log('=== ① 三轮车档（3 单/日）短斤线：Risk 累积与锚点对账 ===');
for (const seed of SEEDS) {
  const { log } = simulate(seed, 60, SHORT_LINE);
  const rep60 = log.findIndex(d => d.Rep >= 60);
  const steps = [...new Set(stepsAfterRep60(log))];
  console.log(`seed ${seed}  Rep 首破 60 = 第 ${rep60 + 1} 天  此后逐日 Risk 增量 = ${steps.join('/')}（锚 3 × 0.5 = 1.5）`);
  console.log(`          Risk≥40 = 第 ${firstDayAt(log, 40)} 天  Risk≥70 = 第 ${firstDayAt(log, 70)} 天`
    + `  Risk=100 = 第 ${firstDayAt(log, 100)} 天  60 天内结局 = ${log.at(-1).ending || '未触发'}`);
}

console.log('\n=== ② 会升档的短斤线：固定摊位（level 3）起 4 单/日 ===');
for (const seed of SEEDS) {
  const { log } = simulate(seed, 60, { ...SHORT_LINE, name: '短斤 + 升档', upgrade: true });
  const i = log.findIndex(d => d.tier >= 3);
  const step4 = i > 0 ? +(log[i].Risk - log[i - 1].Risk).toFixed(2) : null;
  console.log(`seed ${seed}  进固定摊位 = 第 ${i + 1} 天  当日 Risk 增量 = ${step4}（4 × 0.5 = 2.0）`
    + `  Risk≥40 = 第 ${firstDayAt(log, 40)} 天  Risk≥70 = 第 ${firstDayAt(log, 70)} 天`);
}

console.log('\n=== ③ 单元对照：全正经 Q=95、3 单短斤、Rep 恒 ≥60（黑心 0、不掺）逐日推进 ===');
// 同一套入账量两条规则各推 60 天：旧口径 = 短斤项与 −2 直接相抵；新口径 = −2 只吃可抵扣池，短斤进保护池
let ded = 0, prot = 0, old = 0, dayNew40 = null, dayOld40 = null;
for (let d = 1; d <= 60; d++) {
  ded = Math.max(0, ded - 2);
  prot = Math.min(100, prot + 1.5);
  const neu = Math.min(100, ded + prot);
  old = Math.max(0, Math.min(100, old + 1.5) - 2);
  if (dayNew40 === null && neu >= 40) dayNew40 = d;
  if (dayOld40 === null && old >= 40) dayOld40 = d;
  if (d === 60) console.log(`  第 60 天：新口径 Risk = ${neu.toFixed(1)}（保护池 ${prot.toFixed(1)} + 可抵扣 ${ded.toFixed(1)}）  旧口径 Risk = ${old.toFixed(1)}`);
}
console.log(`  到 Risk 40：新口径 第 ${dayNew40} 天  旧口径 ${dayOld40 === null ? '60 天内到不了（短斤线被 −2 完全中和）' : '第 ' + dayOld40 + ' 天'}`);
{
  const s = {
    today: { J: 10, consumed: [{ qty: 10, batch: { cat: 'MB', q: 95 } }] },
    Q: 0, C: 0, H: 0, Risk: 0, RiskShort: 0, Rep: 70, R: 0, P: 50, L: 0, Wmax: 0, ReceiptRate: 1,
    ReceiptWindow: [], Facilities: [], AdditiveTier: 'none', R_frozen_days: 0, BaseSales: 90, risk_100_pending: false,
    // M2 生产链接线后，Q 的算式要读备菜档与配方匹配度：探针按「三项将就 + 默认方子」补齐
    Prep: ['将就', '将就', '将就'], M_base: 0.867,
  };
  applyShadow(s, { shortOrders: 3, spillBowls: 0 });
  console.log(`  引擎单日实测（原料 Q=95，三项将就 + 默认方子 → 当日 Q=${s.Q.toFixed(2)}；3 单短斤、Rep 70）：Risk = ${s.Risk.toFixed(2)}  其中分量作假池 = ${s.RiskShort.toFixed(2)}`);
}

console.log('\n=== ④ 参考策略③（全特价 + 多掺 + 亲民）：M3 门 = Risk 第 40 天内破 70 ===');
for (const seed of SEEDS) {
  const { log } = simulate(seed, 120, REF_STRATEGIES.ref3, 'headless', { additive: 'more' });
  console.log(`seed ${seed}  Risk≥40 = 第 ${firstDayAt(log, 40)} 天  Risk≥70 = 第 ${firstDayAt(log, 70)} 天`
    + `  首结局 = ${log.at(-1).ending || '未触发'}（第 ${log.at(-1).day} 天）  存活 ${log.length} 天`);
}
