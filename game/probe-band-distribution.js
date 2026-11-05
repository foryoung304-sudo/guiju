// 裁定汇总 `077733c` §一（验收口径自 r16 起改定）的复跑件：`node probe-band-distribution.js [旧带] [新带]`。
// 新口径三条件——参考① 众数结局不变、存活 ≥3/5、六结局可达性集合不变 ⇒ 算过；种子级翻类只登记死因链，不再单独触发停手。
// 它只读两份 m3 带的【H】与【六结局可达性总表】两段文本，不碰任何在数代码、不重算、不落新格。
// 默认比对 r15（上一版已签）↔ r16（本次升签）；下一次换基线时把两个文件名当参数传进来即可。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const [oldFile = 'm3-out-r15.txt', newFile = 'm3-out-r16.txt'] = process.argv.slice(2);
const read = f => readFileSync(join(HERE, f), 'utf8').replace(/\r/g, '');

// 【H】里「参考① 全正经 + 标准价」那五行：`种子 20261031：…　· 首结局 = 规矩立住（实得 规矩立住@38）`
// 只从【H】这一段起读——【议题三】里也有一组参考① 行，但那是 `首结局 X @ 第 N 天` 的老写法，别混。
const ref1 = src => {
  const h = (src.split('【H】')[1] || '').split('参考②')[0];
  const rows = [...h.matchAll(/种子 (\S+)\s*：.*?实得 (\S+?)@(\d+)/g)].map(m => ({ seed: m[1], ending: m[2], day: Number(m[3]) }));
  if (rows.length !== 5) throw new Error(`参考① 只读到 ${rows.length} 行（应为 5）⇒ 带的版式变了，先改本件再判`);
  return rows;
};
// 总表逐行：`  ✓ #1 翻车　　　　落地 37 次｜…` / `  ⊘ #5 金盆洗手　　落地 0 次（…）` / `  ✓ #6 …无头合成式落地 0 次…界面轨记账 15 场`
const reach = src => {
  const block = (src.match(/【六结局可达性总表】([\s\S]*?)\n\n/) || [])[1] || '';
  const rows = block.split('\n').filter(l => /#\d/.test(l)).map(l => {
    const m = l.match(/([✓⊘✗])\s*#(\d)\s*(\S+)/);
    const n = (l.match(/(\d+) 次/) || [])[1];
    return m ? { mark: m[1], id: `#${m[2]}`, name: m[3], n: Number(n) } : null;
  }).filter(Boolean);
  if (rows.length !== 6) throw new Error(`总表只读到 ${rows.length} 格（应为 6）⇒ 带的版式变了，先改本件再判`);
  return rows;
};

const A = read(oldFile), B = read(newFile);
const LA = ref1(A), LB = ref1(B), RA = reach(A), RB = reach(B);
const isAlive = r => r.ending !== '破产';   // 「存活」按裁定原话的算术：3/5 = 非破产那几颗
const modeOf = rows => {
  const c = {};
  for (const r of rows) c[r.ending] = (c[r.ending] || 0) + 1;
  const top = Math.max(...Object.values(c));
  const winners = Object.keys(c).filter(k => c[k] === top);
  return { dist: Object.entries(c).map(([k, v]) => `${k}×${v}`).join('＋'), ending: winners.join('/'), tie: winners.length > 1 };
};
// 可达性集合 = 打过 ✓ 的结局（#6 那格按裁定⑤ 走界面轨记账，计数与无头合成式两轨不混读，但 ✓/⊘ 本身就是「可达集合」的口径）
const landed = rows => rows.filter(r => r.mark === '✓').map(r => r.id).sort();

const ma = modeOf(LA), mb = modeOf(LB);
const sa = landed(RA), sb = landed(RB);
const c1 = !mb.tie && ma.ending === mb.ending;
const c2 = LB.filter(isAlive).length / LB.length >= 3 / 5;
const c3 = sa.join(' ') === sb.join(' ');

console.log(`比对｜旧带 ${oldFile} → 新带 ${newFile}`);
console.log(`\n参考① 旧：${ma.dist}（众数 ${ma.ending}｜存活 ${LA.filter(isAlive).length}/${LA.length}）`);
console.log(`参考① 新：${mb.dist}（众数 ${mb.ending}｜存活 ${LB.filter(isAlive).length}/${LB.length}）${mb.tie ? '　⚠ 新带众数出现并列' : ''}`);
for (const r of LB) {
  const o = LA.find(x => x.seed === r.seed);
  const flip = o && o.ending !== r.ending;
  console.log(`  种子 ${r.seed}：${o ? `${o.ending}@${o.day}` : '—'} → ${r.ending}@${r.day}${flip ? '　【翻类：只登记死因链】' : (o && o.day !== r.day ? '　【落点漂移】' : '')}`);
}
console.log(`\n六结局落地次数 旧：${RA.map(r => `${r.id}=${r.n}`).join(' ')}｜新：${RB.map(r => `${r.id}=${r.n}`).join(' ')}`);
console.log(`落地集合 旧：${sa.join(' ')}｜新：${sb.join(' ')}`);
console.log(`\n判据① 众数结局不变：${c1 ? '过' : '不过'}（${ma.ending} → ${mb.ending}）`);
console.log(`判据② 存活 ≥3/5：${c2 ? '过' : '不过'}（${LB.filter(isAlive).length}/${LB.length}）`);
console.log(`判据③ 可达性集合不变：${c3 ? '过' : '不过'}`);
console.log(`\n判语：${c1 && c2 && c3 ? '三条全过 ⇒ 按分布成立，不停手（种子级翻类照旧登记死因链）' : '有判据翻 ⇒ 停手再报'}`);
