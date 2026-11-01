// spec-event-pool-6 第 4 / 6 条的「近 3 日」入池条件载体。
// 正本只给了窗口长度和读法（近 3 日出现任一 / 近 3 日平均），没给存储字段 → 按附录 F.6 的滚动窗口惯例
// 落一个只存三个营业日的小账（Recent3），第 12 步随 DailyReports 一起滚；当日那格不进存档，
// 从 state.Q / today.purchases / AdditiveTier 现读（同一份事实不许存两处，各飘各的）。
// 窗口口径 = 当日 + 前两个营业日：晚间事件抽在第 10 步，此时第 8 步的 Q 已经落地，「当日」正在窗口里。
const WINDOW = 3;

export function todaySignal(state) {
  const t = state.today || {};
  return {
    day: state.Day,
    q: state.Q || 0,
    // 「用了特价或特供料」看的是当日实际进的那一篮（附录 F.6 today.purchases 就是它）
    cheap: (t.purchases || []).some(l => l.tier === 3 || l.tier === 6),
    add: state.AdditiveTier === 'more',
  };
}

export function windowOf(state) {
  const done = Array.isArray(state.Recent3) ? state.Recent3 : [];
  return done.slice(-(WINDOW - 1)).concat([todaySignal(state)]);
}

// 第 12 步（nightClose，与 DailyReports 同一处滚存）：今天过完才成为「历史」
export function pushRecent(state) {
  if (!Array.isArray(state.Recent3)) state.Recent3 = [];
  state.Recent3 = state.Recent3.concat([todaySignal(state)]).slice(-WINDOW);
  return state.Recent3;
}
