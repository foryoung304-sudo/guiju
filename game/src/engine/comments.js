import { COMMENT_POOLS } from '../data/comments.js';

const pick = (rng, pool) => pool[rng.int('comment', pool.length)];

// 正文 3.14 第 12 步 + 3.4 配比：每晚 2–3 条，按 ①强制 → ②Q 越线（至多 1 条）→ ③熟客/常客 → ④普通经营反馈 填充
export function buildComments(state, rng) {
  const t = state.today;
  const out = [];
  const seen = new Set();
  const push = (kind, text) => {
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push({ kind, text });
  };

  // ① 强制信号：事件写的固定文案先占位（附录 E.7/E.8/E.10「结算页留言位多一条（① 类强制信号）」，不掷随机）；
  // 再是风险到阈值必须有传闻（正文 3.4 Risk ≥40 → 传闻类留言）
  for (const text of t.forcedComments) push('forced', text);
  if (state.Risk >= 40) push('forced', pick(rng, COMMENT_POOLS.rumor));

  // ② 品质信号：只在 Q ≥80 / Q <40 越线时入池，且每次结算至多 1 条
  if (!t.QZeroSales && state.Q >= 80) push('quality', pick(rng, COMMENT_POOLS.qualityGood));
  else if (!t.QZeroSales && state.Q < 40) push('quality', pick(rng, COMMENT_POOLS.qualityBad));

  // ③ 熟客 / 常客互动 + 当日过称结果（分量嘀咕、足称夸奖都是这一层）
  if (t.shortWeighCount > 0) push('regular', COMMENT_POOLS.portion[2]);
  else if (t.fullWeighCount > 0) push('regular', COMMENT_POOLS.portion[1]);
  else if (state.R > 0) push('regular', pick(rng, COMMENT_POOLS.regular));

  // ④ 普通经营反馈填满到 2–3 条
  const count = 2 + (rng.chance(0.5, 'comment') ? 1 : 0);
  const fillers = [];
  if (t.soldOutCats.length) fillers.push(pick(rng, COMMENT_POOLS.soldout));
  if (t.spillBowls > 0) fillers.push(pick(rng, COMMENT_POOLS.packing));
  if (t.priceChanged) fillers.push(pick(rng, COMMENT_POOLS.price));
  if (t.scenario.weather.id === 'rain') fillers.push(pick(rng, COMMENT_POOLS.weather));
  if (!t.QZeroSales && state.Q >= 40 && state.Q < 60) fillers.push(pick(rng, COMMENT_POOLS.qualityMid));
  fillers.push(pick(rng, COMMENT_POOLS.taste));
  fillers.push(pick(rng, COMMENT_POOLS.portion));
  fillers.push(pick(rng, COMMENT_POOLS.price));
  for (const text of fillers) {
    if (out.length >= count) break;
    push('normal', text);
  }
  state.CommentLog.push({ day: state.Day, comments: out.map(c => c.text) });
  t.comments = out;
  return out;
}
