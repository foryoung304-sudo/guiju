// 附录 A 事件表 Schema + 附录 E 逐字段样例，本表 12 行：M1 四行（E.1 evt_d_001 / E.2 evt_d_002 / E.3 evt_d_011 /
// E.5 evt_d_031）、M2 第四批两行（E.8 evt_s_return / E.9 evt_s_pricewar）、M2 第五批六行（E.4 evt_d_021 立账 /
// E.6 evt_s_insp 大检查 / E.7 evt_s_flag 锦旗 / E.9 evt_s_insp2 例行检查与 evt_s_poach 挖角 / E.10 evt_s_promo 宣传队）。
// effect 用声明式 op，引擎按 timing 落到对应步号入账；数值全部照附录 E 原文 + 已签勘误，未新增。

// 回签审复 §一.1（20261031）：三条坏事事件全部后置到第 3 天之后——这是定稿 §四「压力后置」与本稿第 5 行
// 出货惯例③「负面机制在第 3 天之后才解锁」的完整实现，不是新数值。菜价上涨把 condition 与 must_fire
// 双双钉在 Day>=7（定稿只挪了 must_fire、condition 留在 Day>=3，第 3 天随机抽到即打穿开学周）。
export const EVENTS = [
  {
    id: 'evt_d_001',
    pool: 'daily',
    ship: 'M1',
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
    ship: 'M1',
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
    ship: 'M1',
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
    ship: 'M1',
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
    ship: 'M2',
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
    ship: 'M2',
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
  {
    // 附录 E.4 立账：`fac_display`（用料上墙展示柜）的解锁前置，正文 3.6 引用的是这一条事件（v4.9 登记补洞）。
    // E.4 原文「两分支明账相同，暗线相同」→ 两个分支的 ops 逐字一样，差别只在玩家嘴上应一句；
    // 触发后 EventHistory 写入本 id，FACILITIES 的 unlock 'EVT?evt_d_021' 随即放行（正文 3.6 的口径）。
    id: 'evt_d_021',
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '中性',
    weight: 7,
    condition: 'Day>=10 & Tier>=2',
    cooldown: 999,
    text: '街道的人来挂统一价目牌，要求把用料一张纸写上贴出来。你贴不贴，他都记一笔。',
    actions: [
      { id: 'register', label: '登记', open: [{ dayNote: '今日已立账' }], hidden: [{ Rep: 2 }] },
      { id: 'skip', label: '不登记', open: [{ dayNote: '今日已立账' }], hidden: [{ Rep: 2 }] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 附录 E.6 卫生大检查（硬触发：条件满足当晚必来，不走 35% 门也不走权重，weight=100 是原文照录）。
    // 流程写死（正文 v4.8）：通知 → 玩家销毁决策 → 公式判定，同一晚走完；判定式与三档门槛在 engine/inspection.js
    // （Score = 覆盖率×60 + 设施分 + 销毁比例×15 − Risk×0.3；≥55 通过 / 35–55 整改 / <35 → §六 结局 #1）。
    // 排在 evt_s_flag 之前：同一晚两条硬触发都达标时取数组里的前一条（正文只写「同日至多 1 个特殊事件」，未给两硬触发的先后，已登记回报）。
    id: 'evt_s_insp',
    pool: 'special',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 100,
    hard: true,
    condition: 'Risk>=70 | C>=8',
    cooldown: 30,
    scoreCheck: 'big',
    text: '严队长带两个人来了，翻开记录本："查票。无票的，现在处理。"',
    actions: [
      { id: 'destroy', label: '销毁全部无票库存', open: [{ destroyUnticketed: true }], hidden: [] },
      { id: 'keep', label: '不销毁', open: [], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 附录 E.9 例行检查（小）：软触发过 35% 门、同 Score 式但门槛 ≥40（正文 :315 与 E.9 :282 同口径）。
    // 未过罚款按勘误批 a 项落 **100 元**（INSPECTION.routineFineCents），E.9 :283 / 正文 :315 的旧字面 50 作废；
    // 现金不足走 D0 ×0.8 持续 2 日的兜底（同批 a 项明写「不变」）。首次触发写 seen_routine_inspection → fac_cert 上架。
    // E.9「出示票据（默认） / 支吾（无收益，只有台词）」：两分支同账，台词原文不在附录里（属文案 agent 的活，已登记回报）。
    id: 'evt_s_insp2',
    pool: 'special',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 8,
    condition: 'Risk>=40',
    cooldown: 12,
    scoreCheck: 'routine',
    text: '严队长路过，掀开盖子看了一眼："票据。"',
    actions: [
      { id: 'show', label: '出示票据', open: [], hidden: [] },
      { id: 'mumble', label: '支吾', open: [], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 附录 E.9 小豆被挖角。三个数按勘误批 b 项落：现金 **−1,800**、每日加薪 **+15 元**（= 1500 分，持续到本局结束）、
    // 「让他走」= 缺席 14 日 + 产能 ×0.90 + 工时那一格随在场一起消失（正文 :137 的「请假」只退加成、没有这条惩罚，故用 PoachedAway 区分成因）。
    // 「签合同」分支写的是 `requires: 'HAS?fac_contract'`，而 fac_contract 的解锁条件正是 EVT?evt_s_poach ——
    // 两条互为前置，一局只触发一次的挖角永远买不到合同 → 该分支按原文照实现、死锁本身已登记回报。
    id: 'evt_s_poach',
    pool: 'special',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 7,
    condition: 'Tier>=3 & EVT?evt_s_pricewar',
    cooldown: 999,
    text: '对面给小豆开了两倍工钱。小豆不说话，等你先开口。',
    actions: [
      { id: 'raise', label: '涨薪留住（−1,800）', gate: 'afford', open: [{ cash: -180000 }, { wageRaise: 1500 }], hidden: [] },
      { id: 'contract', label: '签合同', requires: 'HAS?fac_contract', open: [], hidden: [] },
      // 「让他走」给 Rep 减分、涨薪不给加分（E.9 表后的对称原则：暗线只记你对街坊做了什么，不记工资单）
      { id: 'let_go', label: '让他走', open: [{ xiaodouAbsentDays: 14, poached: true }], hidden: [{ Rep: -2 }] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 附录 E.10 赵大妈宣传队。d0_buff 按 E 表前 :127 的通用合并规则「新值乘入、天数取最大」（E.10 :325 的
    // 「写 d0_buff_mult=1.15」是单写成因的写法，与回流档可叠加时以乘入为准——已登记回报）。
    // 不写 RegularStory（E.10 约束第 3 条：四个槽固定给常客线 A–D，赵大妈是 c06 人物、不占槽）。
    // count(Facilities) 在 DSL 里没有函数调用，走 readVar 的只读别名 FacilityCount（附录 F.5 的 Facilities 元素个数，显多秤不计数）。
    id: 'evt_s_promo',
    pool: 'special',
    ship: 'M2',
    timing: 'evening',
    kind: '好事',
    weight: 10,
    condition: 'Rep>=60 & FacilityCount>=2 & !EVT?evt_s_promo',
    cooldown: 999,
    text: '赵大妈领着几个老街坊晃到摊前，一边掏钱一边跟人说："就这家，秤上没亏过我们。"斜对面王老板把牌子往里挪了挪。',
    actions: [],
    open: [{ d0Buff: { mult: 1.15, days: 4 } }, { forcedComment: '赵大妈那一嗓子把我邻居都叫来了，队伍一下长出一截。' }],
    // 正文 :317 那格末尾的「effect_hidden = 0」与同行的 Rep+3/R+10/L+1 自相矛盾；按 E.10 :326 与其约束第 4 条落三项暗线
    effect_hidden: [{ Rep: 3 }, { R: 10 }, { L: 1 }],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 附录 E.7 毕业季锦旗（L 的四个名场面来源之一，硬触发、一次性）。
    // 排期归属：正文 :362 把「美食节评选与毕业季锦旗两条 L 事件」划在**首更补齐**，本批把数据行落进来但不改任何数值口径；
    // 若店主要按两刀严格切，删掉这一行即可（无引擎耦合），理由与影响写在 delta 第二十五节。
    id: 'evt_s_flag',
    pool: 'special',
    ship: 'M2',
    timing: 'evening',
    kind: '好事',
    weight: 100,
    hard: true,
    condition: 'SemesterDay>=24 & SemesterDay<=28 & Rep>=55 & !EVT?evt_s_flag',
    cooldown: 999,
    text: '一拨穿学位服的学生抬了面锦旗来："味道不敢说，价钱从没坑过我们。"',
    actions: [],
    open: [{ forcedComment: '门口挂了面锦旗，字比咱家价目牌还大。' }],
    effect_hidden: [{ Rep: 5 }, { L: 1 }],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));

// 抽取门（正文 3.14 第 10 步 / 附录 G.2）：特殊池 35% 门在前、日常池 55% 门在后；竞争层关掉时特殊池恒空，
// 一次概率都不掷（drawEvent 的 soft.length 短路），已签发的 M1 带因此与接竞争层之前逐字节同轨
export const DRAW_GATE = { special: 0.35, daily: 0.55 };
