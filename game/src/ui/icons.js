// UI 还原度补齐批（task-ui-fidelity-batch-20261102）：图标全部走内联 SVG，不做位图。
// 理由三条，都在口径里：① ui-spec §五 要「选项卡 5 图标 × 三态」，三态是换色（未选墨蓝 / 选中奶油 / 夜间奶油），
// 用 currentColor 一份描边路径就够，位图要么出三套文件要么用滤镜糊；② STYLE-FLATPLUS 禁渐变与写实光影，
// 纯色描边正好是这套语言的极简端；③ 图标要跟按钮的 2px 墨线同粗细，只有矢量能锁住 stroke-width。
// 每个图标 = 24×24 网格内的一段路径，stroke=currentColor、fill=none，粗细由 .ic 的 stroke-width 统一给。

const BODY = {
  // ── 底部选项卡五项（语义照 mockup 12：三轮车摊 / 菜篮 / 账本票据 / 扳手 / 人像）──
  'tab-stall': '<path d="M3 11h10v5H3z"/><path d="M7 11V7h4"/><circle cx="6" cy="18.5" r="2"/><circle cx="15.5" cy="18.5" r="2"/><path d="M13 16.5h0"/><path d="M8 4.5h6"/><path d="M11 4.5V7"/>',
  'tab-market': '<path d="M5 10h14l-1.5 9h-11z"/><path d="M8 10a4 4 0 0 1 8 0"/><path d="M9 13.5v3M15 13.5v3"/>',
  'tab-ledger': '<path d="M5 3.5h11a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  'tab-shop': '<path d="M14.5 6.5a3.5 3.5 0 0 0-4.8 4.3L4 16.5 7.5 20l5.7-5.7a3.5 3.5 0 0 0 4.3-4.8L14 10l-2-2z"/>',
  'tab-me': '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',

  // ── 设施七件（附录 D.3 + 显多秤器具）──
  'fac_prepay': '<path d="M4 4h16"/><path d="M12 4v3"/><rect x="6" y="7" width="12" height="9" rx="1"/><path d="M9 11h6"/>',
  'fac_taste': '<path d="M4 12h16c0 4.4-3.6 7-8 7s-8-2.6-8-7z"/><path d="M14 4.5l2.5 5.5"/><path d="M9 8.5l1-4"/>',
  'fac_display': '<rect x="3.5" y="6" width="17" height="13"/><path d="M3.5 10.5h17M3.5 15h17"/><path d="M7 6V4h10v2"/>',
  'fac_cert': '<rect x="3.5" y="4" width="7.5" height="6.5"/><rect x="13" y="4" width="7.5" height="6.5"/><rect x="3.5" y="13.5" width="7.5" height="6.5"/><path d="M13 16h7.5M13 19h5"/>',
  'fac_contract': '<rect x="5" y="3.5" width="14" height="17"/><path d="M8.5 8h7M8.5 12h7"/><path d="M8.5 16.5l2 2 4.5-4.5"/>',
  'fac_sign': '<rect x="3" y="5" width="18" height="8" rx="1"/><path d="M12 13v7M8 20h8"/><path d="M6.5 9h11"/>',
  'fac_scale': '<rect x="4" y="11" width="16" height="8" rx="1"/><rect x="8.5" y="4" width="7" height="5"/><path d="M7 15h6"/>',

  // ── 状态类小图标（天气四态 / 校历四态 / 人气 / 价签 / 库存 / 欠款）──
  'w-sunny': '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  'w-cloudy': '<path d="M7.5 18h9.5a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.5 1.6A3.2 3.2 0 0 0 7.5 18z"/>',
  'w-rain': '<path d="M7.5 14h9.5a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.5 1.6A3.2 3.2 0 0 0 7.5 14z"/><path d="M8 17l-1 3M13 17l-1 3M18 17l-1 3"/>',
  'w-heat': '<path d="M14 13.5V5.5a2 2 0 1 0-4 0v8a4 4 0 1 0 4 0z"/><path d="M12 9v5.5"/><path d="M17 6l2-1M17 10l2 1M19 8h-2"/>',
  'c-school': '<rect x="3.5" y="5" width="17" height="15" rx="1"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="M12 12.5l3.5 1.8-3.5 1.7z"/>',
  'c-normal': '<rect x="3.5" y="5" width="17" height="15" rx="1"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="M9 14.5h6"/>',
  'c-exam': '<rect x="3.5" y="5" width="17" height="15" rx="1"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="M9.5 12.5l2.5 2 2.5-2M12 14.5V18"/>',
  'c-holiday': '<rect x="3.5" y="5" width="17" height="15" rx="1"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="M9 17a3 3 0 0 1 6 0z"/>',
  's-people': '<circle cx="9" cy="8.5" r="2.8"/><path d="M4 18a5 5 0 0 1 10 0"/><circle cx="17" cy="9.5" r="2.2"/><path d="M14.5 18a4 4 0 0 1 6.5-3.2"/>',
  's-tag': '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
  's-stock': '<path d="M4 8h16v11H4z"/><path d="M4 8l2.5-4h11L20 8"/><path d="M12 8v11M4 13.5h16"/>',
  's-debt': '<path d="M6 3.5h9l3.5 3.5v13H6z"/><path d="M9.5 9.5h5M9.5 13h5"/><path d="M9.5 16.5h3"/>',
};

// 图标一律 aria-hidden：旁边的文字（档名、标签名、价签）才是给读屏的内容，图标只是重复装饰
export const icon = (name, cls = '') => {
  const body = BODY[name];
  if (!body) return '';
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + `${body}</svg>`;
};

// 天气与校历的图标按当日情境的 id 取（scenario.js 的 weather.id / calendar.id），
// 认不出来的 id 回落到中性件，不因为将来加天气就把这一屏写成 undefined
export const weatherIcon = id => icon(BODY[`w-${id}`] ? `w-${id}` : 'w-cloudy');
export const calendarIcon = id => icon(BODY[`c-${id}`] ? `c-${id}` : 'c-normal');
