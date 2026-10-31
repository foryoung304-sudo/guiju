// 附录 A 事件表 Schema + 附录 E 逐字段样例（M1 只上四条：E.1 赵大妈赊账 / E.2 严队长占道 / E.3 菜价上涨 / E.5 社团聚餐大单）
// effect 用声明式 op，引擎按 timing 落到对应步号入账；数值全部照附录 E 原文，未新增。

// 回签审复 §一.1（20261031）：三条坏事事件全部后置到第 3 天之后——这是定稿 §四「压力后置」与本稿第 5 行
// 出货惯例③「负面机制在第 3 天之后才解锁」的完整实现，不是新数值。菜价上涨把 condition 与 must_fire
// 双双钉在 Day>=7（定稿只挪了 must_fire、condition 留在 Day>=3，第 3 天随机抽到即打穿开学周）。
export const EVENTS = [
  {
    id: 'evt_d_001',
    pool: 'daily',
    timing: 'evening',
    kind: '坏事',
    weight: 10,
    condition: '!HAS?fac_prepay & Day>=3',
    cooldown: 2,
    text: '赵大妈插队抓了一把串，抹嘴就说"后生，先记到账上"。斜对面王老板抬了下眼皮。',
    actions: [
      { id: 'record', label: '记账', cooldown: 2, open: [{ cash: -5400 }], hidden: [] },
      { id: 'settle_now', label: '当场要钱', cooldown: 3, open: [{ nextDayTrafficMult: 0.85 }], hidden: [] },
    ],
    effect_hidden: [],
    weight_shift: null,
    branch: null,
    must_fire: null,
  },
  {
    id: 'evt_d_002',
    pool: 'daily',
    timing: 'morning',
    kind: '坏事',
    weight: 9,
    condition: 'Tier>=1 & Day>=3',
    cooldown: 4,
    text: '严队长站在出线半米的筐旁边，只说三句话："摊子出线了。""规定是规定。""要么罚，要么改。"',
    actions: [
      { id: 'fine', label: '罚款 150', open: [{ cash: -15000 }], hidden: [] },
      { id: 'rectify', label: '免费整改', open: [{ eventDemandMult: 0.6 }], hidden: [] },
    ],
    effect_hidden: [],
    weight_shift: null,
    branch: null,
    must_fire: null,
  },
  {
    id: 'evt_d_011',
    pool: 'daily',
    timing: 'morning_pre',
    kind: '中性',
    weight: 8,
    condition: 'Day>=7',
    cooldown: 6,
    text: '批发市场门口贴了张手写告示：青菜、丸子，今日涨四成。',
    actions: [],
    open: [{ priceMultToday: { cats: ['MB', 'VG'], mult: 1.4 } }],
    effect_hidden: [],
    weight_shift: null,
    branch: null,
    // 定稿 §四.1 + 回签审复 §一.1：condition 与 must_fire 双双 Day>=7，开学周（1–5 天）不再叠涨价
    must_fire: { from: 7, to: 9, note: '第 7–9 天内必触发 1 次，强制选中跳过权重' },
  },
  {
    id: 'evt_d_031',
    pool: 'daily',
    timing: 'evening',
    kind: '好事',
    weight: 6,
    condition: 'Day>=4',
    cooldown: 7,
    text: '学生会来订下周社团聚餐的麻辣烫，十五碗，先付定金。',
    actions: [
      { id: 'accept', label: '接单', open: [{ deposit: { bowls: 15, rate: 0.2 } }, { reserveBowls: 15 }], hidden: [{ Rep: 1, when: 'reserve_delivered' }, { Rep: -1, when: 'reserve_partial' }] },
      { id: 'refuse', label: '接不下', open: [], hidden: [] },
    ],
    effect_hidden: [],
    weight_shift: null,
    branch: null,
    // 回签审复 §五：M1 事件池好事只有这一条，改成 Day 4–6 保底必触发 =「赚钱周 + 保底大单 1 次」；
    // 「7 天内 3 次大正反馈」的全量口径自 M2 事件池齐备后生效
    must_fire: { from: 4, to: 6, note: '第 4–6 天内必触发 1 次，强制选中跳过权重' },
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));

// 抽取门（正文 3.14 第 10 步 / 附录 G.2）：样段无特殊事件，只走日常池 55% 门
export const DRAW_GATE = { special: 0.35, daily: 0.55 };
