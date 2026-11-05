// 结算屏第二段那条播报（工单 `task-ui-polish-20261105` 第 7 条）。
// 三条护栏：① 只读已经落在当日报表上的明账，不新增计数器、不写回状态、不碰任何判定与数值；
// ② 句子里只许出现钱数与品类名——暗线（Rep / Risk / C / H / L / Q 的数与档位）一个字不许进这一层；
// ③ 择句纯由当日事实决定，同一副账必然同一句：变体按 `state.Day` 取，不用随机、不用计时器。
// 引擎层（src/engine/*、src/data/events.js、src/sim.js）对本文件零引用，回归 §28 钉着这条。
const yuan = c => (c / 100).toFixed(2);   // 与 main.js 的 y() 同一串字；这里自带一份，只为不把整块呈现层依赖拖进模块图

// 四类信号（工单点名的四条起步），数组顺序就是主导优先级——照单上的行文顺序，不自扩。
// 判据里唯一一个新数：报损占流水三成。这是版面判据（决定这一句说谁说那句），不进结算、不进档、不进存档。
const WASTE_SHARE = 0.3;

export const BROADCAST_KINDS = ['record', 'soldout', 'waste', 'flat'];

export const BROADCAST_POOL = {
  // 今日流水比开摊以来最高的一天还高（第一天没有「上一笔」可比，不吹这个牛）
  record: [
    { t: r => `今天流水 ${yuan(r.revenueCents)} 元，把之前最好的一天比下去了。` },
    { t: r => `收了 ${yuan(r.revenueCents)} 元——开张到今天，就今天最多。别飘，明儿照样早起。` },
    { t: r => `今天这杆秤走了 ${yuan(r.revenueCents)} 元，是这段日子的新数。` },
  ],
  // 有品类卖断（沿用现版那一串卖断名，含汤底那格）
  soldout: [
    { t: r => `卖断了：${r.soldOutText}。卖断不是赢，是少卖。` },
    { t: r => `${r.soldOutText}先见底，后头来的客人只能看别人吃。` },
    { t: r => `今天断在 ${r.soldOutText}。明天这一样多备一手。` },
  ],
  // 报损占到当日流水的三成以上
  waste: [
    { t: r => `今天报损 ${yuan(r.writeoffCents)} 元。柜里的货不会自己走完。` },
    { t: r => `${yuan(r.writeoffCents)} 元倒掉了——比省下来的那点工时贵。` },
    { t: r => `报损 ${yuan(r.writeoffCents)} 元，占今天流水的三成还多。备菜那三站，明天挪一挪。` },
  ],
  // 头三条一条没踩着：平平无奇。句子只报数，不许在亏本的日子说「账没红」。
  flat: [
    { t: r => `今天进 ${yuan(r.inCents)} 元，出 ${yuan(r.outCents)} 元，净额 ${yuan(r.netOpsCents)} 元。` },
    { t: r => `一个平常日子，账上没大事。进出两笔都在下面两格里。` },
    { t: r => `收摊。摊子还在，明儿接着干。` },
  ],
};

// 当日事实 → 一句。rep 里除了报表那些格，调用方还会把 inCents / outCents（两组合计）挂上来，
// 「平平无奇」那一类要说进出的数。这里只负责认信号、抽变体，不另起一套算法。
export function broadcastLine(rep, prevBestCents) {
  const kind =
    (prevBestCents !== null && rep.revenueCents > prevBestCents) ? 'record'
      : rep.soldOutText ? 'soldout'
        : (rep.writeoffCents > 0 && rep.writeoffCents >= rep.revenueCents * WASTE_SHARE) ? 'waste'
          : 'flat';
  const pool = BROADCAST_POOL[kind];
  const i = ((rep.day % pool.length) + pool.length) % pool.length;
  return { kind, text: pool[i].t(rep) };
}

// 折叠两组的合计口径（进 − 出 = 净利）。取的全是 dailyReport 已经落好的格，COGS 用引擎那一格
// （`ledger.js:28` 那条恒等式＝食材＋包装＋添加剂，屏上那三行加起来必然就是它，回归 §28 逐日核）；
// 这里只做加总，不改任何一个数，也不额外造一份算法。
export function inoutTotals(r) {
  const inCents = r.revenueCents + (r.tastingIncomeCents || 0);
  const outCents = r.cogsCents + r.writeoffCents + r.fixedCents + r.laborCents + (r.tastingCostCents || 0);
  return { inCents, outCents };
}
