// 卖断名单的归并口径（复现单 `task-repro-20261105` 第一项，Orange `3ac1907`）。
// 只归并已经摆在屏上的字面：不读引擎、不写状态、不算账、不碰判定 —— 名单本身是呈现层的产物。
// 病灶：`CAT.SP.name`「汤底」与 F7 那句带 T 的注记是同一件东西的两种字面，`new Set` 去不掉（字面不同），
// 于是红字行与播报句都念成「汤底、汤底（每碗耗 1 份）」。同一基名只留一条，两种说法里留信息量大的那条。
export function mergeSelloutNames(catNames, soupLabel) {
  const list = [];
  for (const s of [...catNames, ...(soupLabel ? [soupLabel] : [])]) {
    const base = s.split('（')[0];
    const at = list.findIndex(x => x.split('（')[0] === base);
    if (at < 0) list.push(s);
    else if (s.length > list[at].length) list[at] = s;
  }
  return list;
}
