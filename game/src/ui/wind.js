// 「摊口风向」卡的派生与渲染。工单 `task-wind-panel-20261104`：这一屏是目前唯一获批的暗线档位化出口。
// 三条护栏写死在这里：只读已结算状态（不落盘、不新增计数器、SAVE_VERSION 不动）、只出词表里的档位词、
// 渲染结果里一个数字都不许有——分档线活在 `data/wind.js` 的映射里，绝不进 DOM（回归 §25 逐条钉）。
import { WIND_ROWS } from '../data/wind.js';
import { readVar } from '../engine/dsl.js';

// 四行的事实源全部是现成格：Rep / Risk 直接读，出品走事件池那同一个 `AvgQ3` 别名（工单「与 blogger 条件的 AvgQ3 同窗」，
// 近三日窗在 recent.js / dsl.js 里已经有一份，不在这里重算第二份），熟客是 RegularStory 四槽进度合计。
const windValue = (src, state) => {
  // 窗口恒含当日那一格，而 Q 在第 8 步才落地 ⇒ 白天看到的就是「过夜才变」的那句（工单刷新口径）。
  if (src === 'AvgQ3') return readVar('AvgQ3', state);
  if (src === 'RegularSum') return state.RegularStory.reduce((a, b) => a + b, 0);
  return state[src];
};

// 三档：低于下界 / 两界之间 / 达到上界。没有第四态——新档开局 Rep 20、Q 常量 50、Risk 0、常客 0，
// 四行自然落在「还没传开 / 稳当 / 多是生面孔 / 松」，不需要额外的空状态。
export function windBandIndex(value, thresholds) {
  const [lo, hi] = thresholds;
  return value < lo ? 0 : value < hi ? 1 : 2;
}

export function windCard(state) {
  return `<div class="panel">
    <h2>摊口风向</h2>
    <div class="lrows">${WIND_ROWS.map(row => {
      const band = row.bands[windBandIndex(windValue(row.src, state), row.thresholds)];
      return `<div class="lrow"><div class="lrowtop"><span class="lname">${row.dim}</span><b class="lamt">${band.word}</b></div><div class="muted">${band.line}</div></div>`;
    }).join('')}</div>
  </div>`;
}
