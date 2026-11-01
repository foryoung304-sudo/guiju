// 附录 A 事件表 Schema + 附录 E 逐字段样例。日常四条来自 M1（E.1/E.2/E.3/E.5），
// 特殊两条来自 M2 第四批（E.8 回流 / E.9 价格战）；E.4 evt_d_021 与 E.6/E.7/E.9 余两行/E.10 在第五批续表。
// effect 用声明式 op，引擎按 timing 落到对应步号入账；数值全部照附录 E 原文 + 已签勘误，未新增。

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
  {
    // 附录 E.9 价格战（三天）。正文 3.13 红线：竞争只许通过价格、排队、传闻影响客流，
    // 玩家的应对只有定价与篮子 → 两个分支不写任何差异化数值（E.9 的 effect_open 原文也只有一句「写 PricewarDays = 3」），
    // 跟不跟价由玩家次日的价签自己体现。分支差异若要给钱，须店主先定数，不在代码里替正文发明。
    id: 'evt_s_pricewar',
    pool: 'special',
    timing: 'evening',
    kind: '坏事',
    weight: 9,
    condition: 'RivalSuppressedDays>=5 & Rep>=40',
    cooldown: 30,
    text: '斜对面挂出横幅"同料半价，尝过再讲"。王老板不上门，只挂牌子。',
    actions: [
      { id: 'follow', label: '跟价', open: [{ pricewarDays: 3 }], hidden: [] },
      { id: 'hold', label: '不跟价', open: [{ pricewarDays: 3 }], hidden: [] },
    ],
    effect_hidden: [],
    // E.9「第三日末把 evt_s_return 的 weight 置 100，持续到该事件触发或满 7 天过期」：
    // shift 于本场结算时写入（正文 5.3「事件结算后立即生效」），而 evt_s_return 的 condition 带 PricewarDays == 0，
    // 三日倒计时走到 0 正是第三日末 → 拉满的那一眼和能抽到的那一天是同一晚。
    weightShift: { target: 'evt_s_return', weight: 100 },
    branch: null,
    must_fire: null,
  },
  {
    // 附录 E.8 回流名场面：价格战的结果而不是剧情奖励 → weight=0，只有 evt_s_pricewar 的 shift 拉满才可能抽到。
    // 玩家不做选择，按 Rep 自动分版（resolveChoice 走 auto_branch，命中第一条即该档）。
    id: 'evt_s_return',
    pool: 'special',
    timing: 'evening',
    kind: '好事',
    weight: 0,
    condition: '!EVT?evt_s_return & EVT?evt_s_pricewar & PricewarDays == 0',
    // 「cooldown = 每次价格战重新武装一次」→ 0 日；但 condition 首项 !EVT?evt_s_return 是原文照录，
    // 两条读法在本局互不兼容（已登记回报），实现按 condition 为准：一局只回流一次。
    cooldown: 0,
    text: '价格战结束那晚，排队的人里出现了几张很久没见的脸。',
    actions: [],
    auto_branch: [
      { cond: 'Rep>=50', open: [{ d0Buff: { mult: 1.20, days: 5 } }, { forcedComment: '刷到小刘那帖了，专门绕过来的——真不烧心。' }], hidden: [{ R: 15 }, { L: 1 }] },
      { cond: 'Rep>=30', open: [{ d0Buff: { mult: 0.95, days: 3 } }, { forcedComment: '这家好像也没那么干净。' }], hidden: [{ R: 3 }] },
      // <30 王老板赢：熟客存量 R 一律不动（正文 3.4 保底承诺优先），改成「新客 7 日不进 + R 增长冻结 7 日」
      { cond: 'true', open: [{ d0Buff: { mult: 0.85, days: 7 } }, { rFrozenDays: 7 }], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));

// 抽取门（正文 3.14 第 10 步 / 附录 G.2）：特殊池 35% 门在前、日常池 55% 门在后；竞争层关掉时特殊池恒空，
// 一次概率都不掷（drawEvent 的 soft.length 短路），已签发的 M1 带因此与接竞争层之前逐字节同轨
export const DRAW_GATE = { special: 0.35, daily: 0.55 };
