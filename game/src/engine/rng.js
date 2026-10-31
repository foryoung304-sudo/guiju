import { SUBSTREAMS } from '../data/constants.js';

// 正文 3.14 命名子流制：子流键 = hash(主种子, 子流名, 天数)，同日多次抽取按子流内序号 k 递增派生。
// 全案禁止种子之外的随机函数。
function hashU32(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function randAt(seed, stream, day, k) {
  return hashU32(`${seed}|${stream}|${day}|${k}`) / 4294967296;
}

export function makeRng(state) {
  if (!state.streamCounter) state.streamCounter = Object.fromEntries(SUBSTREAMS.map(s => [s, 0]));
  const at = (stream, day, k) => randAt(state.seed, stream, day, k);
  return {
    float(stream, day = state.Day) {
      const key = `${stream}:${day}`;
      const k = state.streamCounter[key] ?? 0;
      state.streamCounter[key] = k + 1;
      return at(stream, day, k);
    },
    // 建档时预生成整张循环表用的定点抽取，不占每日子流计数
    pinned(stream, day, k) { return at(stream, day, k); },
    int(stream, n, day = state.Day) { return Math.floor(this.float(stream, day) * n); },
    chance(p, stream, day = state.Day) { return this.float(stream, day) < p; },
    pickWeighted(items, weightFn, stream, day = state.Day) {
      const weights = items.map(weightFn);
      const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
      if (total <= 0) return null;
      let r = this.float(stream, day) * total;
      for (let i = 0; i < items.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    pickWeightedWithoutRepeats(pool, weightFn, count, stream) {
      const chosen = [];
      const candidates = pool.slice();
      for (let i = 0; i < count && candidates.length; i++) {
        const picked = this.pickWeighted(candidates, weightFn, stream);
        if (!picked) break;
        chosen.push(picked);
        candidates.splice(candidates.indexOf(picked), 1);
      }
      return chosen;
    },
  };
}

export function newSeed(rand = Math.random) {
  return Math.floor(rand() * 4294967295) >>> 0;
}
