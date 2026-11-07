// 「差 X 碗」形状探针（发版单 §九十 三 ＋ 裁定单 44905ca §三 的「给公网包补一枚针」）
// 走查在 236307a 读到过「差 0.029232665123752 碗」：那一行的旧算式是 need − capped，而 capped 落在需求侧（min 的第一项
// = estBowls + 试吃加碗）时本身就是小数，原样进句子就把浮点摆上货架。§九十一 把它改成「屏上那两个数相减」
// （can = Number(capped.toFixed(0))，gap = need − can），本探针钉的就是这个形状。
// 为什么是离线探针而不是联网检查：公网包是 dist 的逐字节镜像（发版后已做 187 件全量回读），
// 而这一行的洞在数值侧，与打包无关——按仓内既有探针口径（probe-voice-mount 同款），不 import 呈现层、不联网、不写任何存档键。
// 走法：300 种子 × 10 天 × 三条玩家线（照昨日卖 / ×1.6 补货 / ×2.5 宽裕），每天真把 1× 那一篮买进去（submitBasket），
// 否则次日「照昨日卖」的预填全是 0，第 2 天起一篮都组不出来——头一版就这么只扫到 900 篮、10 天里走了 1 天。
// 实测 5,805 篮（其余组合当日预填为 0，跳过）。
// 逐篮按「屏上口径」与「旧口径」各渲一次，断言屏上口径的长小数 0 例；另报旧口径漏了几例，用来确认这个扫法确实撞得到需求侧那一支（扫不到就该翻红，不能默默绿）。
// 复跑：node probe-gap-shape.js（全绿 exit 0，任一条翻红 exit 1）
import { newGame } from './src/engine/state.js';
import { makeRng } from './src/engine/rng.js';
import { beginDay, morningPreEvent, previewBasket, submitBasket, lockTradingDay, morningEvent, runDay, closeDay } from './src/engine/day.js';
import { drawHandOrders } from './src/engine/weigh.js';
import { SKU_BY_ID } from './src/data/skus.js';
import { SOLID_CATS } from './src/data/constants.js';

const raw = x => String(x);
// 「长小数」判据与走查读数同一条：非整数，且小数部分超过 4 位（4.900000095367432 这一类才算，2.5 这种一位小数不算）
const leaky = x => typeof x === 'number' && !Number.isInteger(x) && raw(x).replace(/^-?\d*\./, '').length > 4;
const round01 = x => Math.round(x * 10) / 10;
const chooseFor = ev => ev.actions[0].id;

let baskets = 0, shownLeak = 0, oldLeak = 0, demandBound = 0, gapRows = 0;
const worst = [];

for (let s = 0; s < 300; s++) {
  const st = newGame(20261107 + s * 977);
  for (let d = 0; d < 10; d++) {
    const rng = makeRng(st);
    beginDay(st); morningPreEvent(st, rng);
    let buy1 = null;
    for (const mult of [1, 1.6, 2.5]) {
      const picks = st.Day === 1
        ? SOLID_CATS.map(c => ({ sku: SKU_BY_ID[c + 1], qty: round01(4 * mult) })).concat([{ sku: SKU_BY_ID.SP1, qty: Math.round(12 * mult) }])
        : SOLID_CATS.filter(c => c !== st.today.delist)
          .map(c => ({ sku: SKU_BY_ID[c + 1], qty: round01((st.YesterdaySoldJinByCat?.[c] || 0) * mult) }))
          .concat([{ sku: SKU_BY_ID.SP1, qty: Math.round((st.YesterdaySoup || 0) * mult) }])
          .filter(p => p.qty > 0);
      if (!picks.length) continue;
      if (mult === 1) buy1 = picks;
      const f = previewBasket(st, picks, st.PriceTier).forecast;
      const need = Math.round(f.estBowls);
      const can = Number(f.capped.toFixed(0));          // 屏上那一眼的两个数（§九十一 之修）
      const gapNew = need - can;
      const gapOld = need - f.capped;                    // 旧算式，只为确认这一扫仍撞得到小数
      baskets++;
      if (Math.abs(f.capped - (f.estBowls + f.convertBowls)) < 1e-9) demandBound++;
      if (gapNew > 0) gapRows++;
      if (gapNew > 0 && leaky(gapNew)) {
        shownLeak++;
        if (worst.length < 5) worst.push(`种子 ${20261107 + s * 977} 第 ${st.Day} 天 ×${mult}：「差 ${raw(gapNew)} 碗」`);
      }
      if (gapOld > 0 && leaky(gapOld)) oldLeak++;
    }
    // 钱真花出去（只买 1× 那一条，同界面一天只提交一篮）：不进货就没库存，第 2 天起「照昨日卖」全是 0，
    // 后面 9 天一次都试不到——前一头扫出来只有 900 篮，就是这么漏的。
    if (buy1) submitBasket(st, buy1, rng);
    lockTradingDay(st, { priceTier: st.PriceTier });
    morningEvent(st, rng, chooseFor);
    runDay(st, drawHandOrders(st, rng), o => Object.fromEntries(o.lines.map(l => [l.cat, Math.round(l.grams)])), rng);
    closeDay(st, rng, chooseFor);
  }
}

console.log(`篮数 ${baskets}｜卡在需求侧（capped 是小数的那一支）${demandBound} 例｜「差 X 碗」这一行出现 ${gapRows} 例`);
console.log(`屏上口径 need − can 的长小数：${shownLeak} 例（断言 0）`);
console.log(`旧口径 need − capped 的长小数：${oldLeak} 例（这一支只是对照：它 >0 才说明这个扫法仍撞得到小数，针有牙）`);
if (worst.length) { console.log('屏上口径漏样：'); worst.forEach(w => console.log('  ' + w)); }

const fails = [];
if (shownLeak !== 0) fails.push('「差 X 碗」在屏上口径下仍会印长小数');
if (demandBound === 0) fails.push('这一扫一次都没落在需求侧那一支上（样本失效，针没牙——换成能撞到的量再来）');
if (oldLeak === 0) fails.push('旧口径也一例不漏（同上：这个扫法已验不到那枚洞，别把绿当过）');
if (fails.length) { fails.forEach(f => console.log('红：' + f)); process.exit(1); }
console.log('✓ 「差 X 碗」形状全绿：屏上口径 0 例长小数，且这一扫确实撞得到旧口径的那枚洞');
