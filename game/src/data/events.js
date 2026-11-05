// 附录 A 事件表 Schema + 附录 E 逐字段样例。建表时 18 行：M1 四行（E.1 evt_d_001 / E.2 evt_d_002 / E.3 evt_d_011 /
// E.5 evt_d_031）、M2 第四批两行（E.8 evt_s_return / E.9 evt_s_pricewar）、M2 第五批六行（E.4 evt_d_021 立账 /
// E.6 evt_s_insp 大检查 / E.7 evt_s_flag 锦旗 / E.9 evt_s_insp2 例行检查与 evt_s_poach 挖角 / E.10 evt_s_promo 宣传队）、
// M2 第八批六行（spec-event-pool-6：山寨摊 / 收购邀约 / 粉坊断货 / 吃坏肚子 / 汤锅裂了 / 测评号探店）。
// 文案批 content-batch-text-20261104（店主 2026-11-04 批）再 +6 日常（041–046），回声包 content-batch-echo-20261104 再 +3
// （051 / 052 / 053；052 曾按「假按钮」退回，`f6a8ebf` §一按丙改写后入池）⇒ 现表 27 行。
// effect 用声明式 op，引擎按 timing 落到对应步号入账；数值全部照附录 E 原文 + 已签勘误 + 店主签发的那份 spec +
// 两批 Orange 拟值，未新增。
// 计数（spec §三 验收口径 + 文案批总口径）：坏 12 / 好 8 / 中 7 = 27 条；日常池 18 条 = 坏 7 / 好 5 / 中 6（文案批那一句的
// 「入池后日常池 15 条」是只算它自己 +6 的口径，回声三条再补 3 条；special 池 9 条不参与本批）。

// 回签审复 §一.1（20261031）：三条坏事事件全部后置到第 3 天之后——这是定稿 §四「压力后置」与本稿第 5 行
// 出货惯例③「负面机制在第 3 天之后才解锁」的完整实现，不是新数值。菜价上涨把 condition 与 must_fire
// 双双钉在 Day>=7（定稿只挪了 must_fire、condition 留在 Day>=3，第 3 天随机抽到即打穿开学周）。
//
// ── 呈现标签 `motion` 的红线（施工单 task-event-motion-20261102 + 追补单二 task-event-motion-add-wang-20261103）──
// 每行一枚 `motion` 只服务一件事：入场待遇选哪个模板（person 人物 / bad 坏消息 / good 好事横财 / calm 中性悬念），
// 或选哪一套王老板线专属（wang_intro 初见 / wang_copy 山寨 / wang_deal 收购 / wang_press 压场）。
// **只许呈现层读**——抽取（drawEvent / weightOf / must_fire）、结果结算（applyOpen / applyHidden / resolveChoice）、
// 计数与存档里任何一处拿它做判定，即判红。选它的规则也写在人话里：具名人物到场为主 → person；否则按 kind 落
// bad / good / calm；王老板组五图所映射的五行（EVENT_ART 里 event-wang-*.webp 那五条）一律摘出模板、逐条专属。
// M1 四条（001/002/011/031）刻意一人一格，让玩家一趟流程就能把四种待遇各看一遍。
// 本字段不参与任何 equals / 序列化 / 随机消耗，故 sweep 与 m3 必须继续对 r14 逐字节同。
// 注：18 条全打标，但 timing='morning_pre' 的两条（011 / stockout）走晨间情报条、不经过事件弹层，
// 入场待遇只落在其余 16 条弹层事件与 6 个结局屏上——情报条要不要也来一套，属未下达的口径，不自作。
export const EVENTS = [
  {
    id: 'evt_d_001',
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'bad',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'calm',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'good',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'wang_intro',   // 专属（追补单二）：王老板线初见 = 全场微暗 + 形象图慢推近，落定后才出正文
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
    motion: 'wang_press',   // 专属（追补单二）：王老板线压场语法 = 微暗 + 慢推近（不再走 good 模板）
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
    motion: 'calm',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'wang_press',   // 专属（追补单二）：王老板线压场语法 = 微暗 + 慢推近（原 person 蹦字待遇从这条撤走）
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
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
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
    motion: 'good',   // 呈现标签：只许呈现层读（红线见文件头）
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
  {
    // spec-event-pool-6 §一.1（正文 5.3 原文照录，不新增数）：软触发过 35% 门、一次性。
    // 效果只动「排队惯性」这一格（3.13 既有参数）：山寨摊存续 5 日内本摊惯性封顶 1.0，份额再高也不涨，
    // 应对仍是定价与品质 → 不写现金、不写 Rep/Risk、不碰 S 的钳位带。无竞争层时 S ≡ 1，本条无数值落点（已登记回报）。
    // 文案 agent 自撰（正本 5.3 只给了「王老板改名蹭名气」这一句事实），待店主审。
    id: 'evt_s_copycat',
    motion: 'wang_copy',   // 专属（追补单二）：山寨 = 自家摊与山寨摊双图左右对开 + 一次轻震（震法复用坏消息件）
    pool: 'special',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 7,
    condition: 'Rep>=70 & Tier>=3 & !EVT?evt_s_copycat',
    cooldown: 999,
    text: '王老板把招牌换了，字跟你家只差一笔，连价目牌都照着做。有人端着碗走错了队，他也不纠正。',
    actions: [],
    open: [{ copycatDays: 5 }],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // spec-event-pool-6 §一.2：纯演出。目标墙「盘下对面铺子」（§六 #3 那一笔）早就在界面上，本条只是把它可见化，
    // 不是执行前置 → 除了留言不写任何机械效果，不设分支、不设报价数值（48,000 元这个门槛是「累计净赚」的读数，不扣钱）。
    // 单按钮确认型（actions 空 → 界面只出「知道了」），文案 agent 自撰。
    id: 'evt_s_buyout',
    motion: 'wang_deal',   // 专属（追补单二）：收购 = 合同纸面落桌式入场 + 盘店价读数放大 + 按钮延后可跳
    pool: 'special',
    ship: 'M2',
    timing: 'evening',
    kind: '中性',
    weight: 6,
    condition: 'NP>=4800000 & !EVT?evt_s_buyout',
    cooldown: 999,
    text: '有人递过来一张名片，说对面那间铺子愿意盘给你，价钱咬死不动，说完就走了。',
    actions: [],
    open: [{ forcedComment: '听说你要盘对面那间？那以后吃麻辣烫只用排一回队了。' }],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // spec-event-pool-6 §二.3（晨间情报、第 2 步、采购前公布 → 情报价值就在「今天能囤」）：
    // 次日粉坊 NS 全档下架 = 市场层落点（skuAvailable 认这一格），柜里已有的照卖、不冻结；
    // 缺口由第 7 步的 ω/Ω 拆分与 7f 单轮溢出吸收，不新造缺货系统。早起「晨采好货必到」只保菜农 / 老李正经货，
    // 不覆盖粉坊（3.12 口径本就如此，两条不冲突）。文案走 5.2 示例原句。
    id: 'evt_d_stockout',
    motion: 'bad',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'morning_pre',
    kind: '坏事',
    weight: 7,
    condition: 'Day>=5',
    cooldown: 9,
    text: '粉坊机器坏了，明天没粉。',
    actions: [],
    open: [{ delistNextDay: 'NS' }],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // spec-event-pool-6 §二.4。入池两条路（正本 5.2 原注「归因暧昧，可能不是你」）：
    // 近 3 日出了品质问题 → weight 7；什么都没出 → baseWeight 1 的罕见路。weightOf 认 weightCond / baseWeight 两个新键。
    // 罕见路仍带 Day>=3 这一格地板：定稿 §四「压力后置」+ 回签审复 §一.1「负面机制在第 3 天之后才解锁」是已签口径，
    // spec 的「无条件」读成「无品质条件」，不读成「可以第 1 天就来一条坏事」（此解已登记回报）。
    // 赔礼分支的置灰按 spec 明写「照事件通则」落 gate:'afford'；硬扛分支的 Risk +8 走保护池那条清算顺序（裁定 9a959bd §二，applyHidden 已实现）。
    // 次日 D0 ×0.92 走已签的 next_day_traffic_mult 单发通道（与 evt_d_001「当场要钱」×0.85 同一格，第 7a 步读完即复位）。
    id: 'evt_d_complaint',
    motion: 'bad',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 7,
    weightCond: 'MinQ3<45 | Cheap3 | AddMore3',
    baseWeight: 1,
    condition: 'Day>=3',
    cooldown: 7,
    text: '两个人摸黑回到摊前，说回去就肚子闹，自己也说不清是不是这碗的事。',
    actions: [
      { id: 'apologize', label: '赔礼道歉（−260）', gate: 'afford', open: [{ cash: -26000 }, { forcedComment: '他收了东西，走的时候说了句"下回注意点"。' }], hidden: [{ Rep: -2 }] },
      { id: 'deny', label: '硬扛不认', open: [{ nextDayTrafficMult: 0.92 }], hidden: [{ Risk: 8 }, { Rep: -5 }] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // spec-event-pool-6 §二.5：weight 低、冷却 10。两条分支都不记账外的账：
    // 补锅 = 一次性现金 −180（明账）；将就 = 次日汤底可售份数上限 ×0.5，
    // 挂在 3.14 第 7c-2 步那条 soupCapBowls 封顶上（同一格封顶、只是乘个数），不新造库存或损耗系统。
    // 「花钱补锅」按事件通则置灰（v4.9.3 整合批：店主对第八批回报 ⑤ 的裁定 = 补上）。掏不起时另一颗「拿盆将就」恒可选、
    // 不花钱，故不构成"两个都付不起的死局选项"（正文 3.5 / 3.7）。与 E.2 罚款 150、E.9 涨薪 1,800、本行赔礼 260 同一道门、同一侧（只在界面）。
    // spec 原文是「无条件」，这里仍留 Day>=3 一格地板：定稿 §四「压力后置」+ 回签审复 §一.1 是正文级口径
    // （「负面机制在第 3 天之后才解锁」，M1 三条坏事行就是照它钉的），批内简报不覆盖它；要按字面第 1 晚就能裂锅，把本行 condition 改回 'true' 即可（已登记回报）。
    id: 'evt_d_pot',
    motion: 'bad',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 5,
    condition: 'Day>=3',
    cooldown: 10,
    text: '收摊才看见汤锅底下裂了一道纹，白天就一直往下洇水。',
    actions: [
      { id: 'patch', label: '花钱补锅（−180）', gate: 'afford', open: [{ cash: -18000 }], hidden: [] },
      { id: 'improvise', label: '拿盆将就', open: [{ soupHalfNext: true }], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // spec-event-pool-6 §二.6（品质门槛事件、纯奖励向）：Q 不够根本不入池，没有惩罚版。
    // 错位不重叠：宣传队是 ×1.15 / 4 日（特殊池、Rep 门槛），本条 ×1.10 / 3 日（日常池、Q 门槛），都不给 R、不给 L。
    // Rep +5 属暗线 → effect_hidden；D0 乘数属明账（次日客流）→ open 里的 d0Buff（E 表前 :127 的合并规则：新值乘入、天数取最大）。
    // 出场人物用附录 H c05「小刘（测评号，口碑扩音器）」，文案从他的探店口吻写、不影射任何真实测评账号（正文 :372 红线）。
    id: 'evt_d_blogger',
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '好事',
    weight: 6,
    condition: 'AvgQ3>=65 & Tier>=2',
    cooldown: 14,
    text: '小刘举着手机进门，先拍价目牌，又拍你的秤，末了坐下来把一碗粉吃完，没打断。',
    actions: [],
    open: [{ d0Buff: { mult: 1.10, days: 3 } }],
    effect_hidden: [{ Rep: 5 }],
    weightShift: null,
    branch: null,
    must_fire: null,
  },

  // ── 文案批 content-batch-text-20261104（Orange 拟值、店主 2026-11-04 批）：日常池 +6，专补好与中 ──
  // 总口径四条：不新造系统（九条新行只用已签的 op，见下「接入」节）、效果量级压在先例带内
  // （现金 −5…−260 元 / Rep ±1…5 / Risk +4…8 / 客流乘数 0.85–1.25 / d0Buff ×1.10–1.15）、
  // 坏事 condition 一律 Day>=3 起（定稿 §四「压力后置」+ 回签审复 §一.1，与本批 046 同一格地板）、
  // weight/cooldown 可由 Yellow 按池平衡微调但效果量级不许超带。
  // cash 字段与全表同量纲＝分：单上「−500」即 5 元、「−1200」即 12 元（与 evt_d_001 的 -5400＝54 元同一条尺）。
  {
    // 文案批一.1（好事）：客流乘数 1.25 是本批上界，与已签的 evt_d_002「免费整改」0.6 同一格（event_demand_mult，第 7 步读）。
    id: 'evt_d_041',
    motion: 'good',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'morning_pre',
    kind: '好事',
    weight: 6,
    condition: 'Day>=6',
    cooldown: 12,
    text: '学校食堂今儿检修，窗口贴了张告示：师生请自便。',
    actions: [],
    open: [{ eventDemandMult: 1.25 }],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 文案批一.2（中性）：与 evt_d_011 涨价条镜像——同 op、同 timing（morning_pre 是采购前唯一能落 priceMultToday 的时点），一涨一跌。
    id: 'evt_d_042',
    motion: 'calm',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'morning_pre',
    kind: '中性',
    weight: 7,
    condition: 'Day>=4',
    cooldown: 8,
    text: '菜农老李包了块新地，第一筐菜先紧着老主顾，价比批发低一成。',
    actions: [],
    open: [{ priceMultToday: { cats: ['VG'], mult: 0.9 } }],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 文案批一.3（好事）：照 evt_d_031 同构（deposit 定金 + reserveBowls 预订，次日 resolvePendingReserve 按成交碗数判交付）。
    // 单上标注的 hidden `when:'reserve_delivered'/'reserve_partial'` 与 031 一样是留痕写法：
    // 带 when 的两条在 resolveChoice 里被过滤掉，实际 ±1 Rep 由 resolvePendingReserve 那一格给（同一份事实只落一处）。
    id: 'evt_d_043',
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '好事',
    weight: 6,
    condition: 'Day>=4',
    cooldown: 10,
    text: '周哲领着一队体育生收操路过，问你能不能明儿给他们留八碗——训练完，饿得能吃下一头牛。',
    actions: [
      { id: 'accept', label: '留八碗', open: [{ deposit: { bowls: 8, rate: 0.2 } }, { reserveBowls: 8 }], hidden: [{ Rep: 1, when: 'reserve_delivered' }, { Rep: -1, when: 'reserve_partial' }] },
      { id: 'refuse', label: '接不下', open: [], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 文案批一.4（中性）：两分支同量级——补钱 −5 元（本批现金下界）与一句 forcedComment（① 类强制留言，已签通道）。
    id: 'evt_d_044',
    motion: 'calm',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '中性',
    weight: 7,
    condition: 'Day>=3',
    cooldown: 7,
    text: '一个学生攥着零钱回来，说你少找了他五块。旁边排队的人都停下筷子，看你。',
    actions: [
      { id: 'make_up', label: '补给他（−5）', open: [{ cash: -500 }], hidden: [{ Rep: 2 }] },
      { id: 'show_board', label: '请他看价目牌', open: [{ forcedComment: '他数了数，又数了数，不好意思地把钱收回去了。' }], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 文案批一.5（中性）：由他摆 = 次日客流 ×1.10，落在已签的 next_day_traffic_mult 单发通道（与 evt_d_001「当场要钱」×0.85、
    // evt_d_complaint「硬扛」×0.92 同一格，第 7a 步读完即复位）。劝他挪挪 = 无效果（单上原文）。
    id: 'evt_d_045',
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '中性',
    weight: 6,
    condition: 'Day>=5',
    cooldown: 9,
    text: '吴爷在你摊边上支了副象棋，围观的比下棋的多。有人看饿了，就往你这边挪一步。',
    actions: [
      { id: 'allow', label: '由他摆', open: [{ nextDayTrafficMult: 1.10 }], hidden: [] },
      { id: 'ask_move', label: '劝他挪挪', open: [], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 文案批一.6（坏事·轻）：买新勺 −12 元走已签的 gate:'afford'（只在界面置灰，事件通则）；消毒将就 Risk +4 = 本批 Risk 下界
    // （先例带 +4…+8，evt_d_complaint 硬扛那条是 +8）。Day>=3 地板照压力后置。
    id: 'evt_d_046',
    motion: 'bad',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 5,
    condition: 'Day>=3',
    cooldown: 9,
    text: '忙到飞起时发现汤勺掉锅里了，捞了三回没捞着，客人们都替你数着。',
    actions: [
      { id: 'buy_new', label: '买把新的（−12）', gate: 'afford', open: [{ cash: -1200 }], hidden: [] },
      { id: 'sanitize', label: '消毒将就', open: [], hidden: [{ Risk: 4 }] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },

  // ── 回声包 content-batch-echo-20261104（店主 2026-11-04 批，并入文案批同批挂载）──
  // 目的只有一条：把「昨天的行为 → 今天找上门」摆在玩家眼前。condition 用的是**已结算的现成事实**，
  // 一条都不新造计数器（映射表与逐条回报写在 delta §七十一）。
  // 权重压在单上的 18–20（因攒住了果必须来），冷却 3 日防连刷。
  {
    // 回声一：昨日售罄 = state.YesterdaySoldOut（day.js:242 现成字段，单上拟名与本名逐字相同）。
    id: 'evt_d_051',
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'morning',
    kind: '好事',
    weight: 20,
    condition: 'YesterdaySoldOut',
    cooldown: 3,
    text: '昨天排到跟前没吃上的那个学生，今儿带着俩同学，提前十分钟就站在摊前等你开火。',
    actions: [
      { id: 'serve_first', label: '先给他们下', open: [{ eventDemandMult: 1.15 }], hidden: [{ Rep: 1 }] },
      { id: 'queue', label: '排队都一样', open: [{ forcedComment: '他耸耸肩排到队尾去了，倒也没走。' }], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 回声二：昨日损耗偏高（`f6a8ebf` §一按丙落地）。原单的效果 op 是 `priceMultToday`，只管采购价、而采购在第 3 步就关门了
    // ⇒ 那颗「少拿点」是假按钮（登记见 delta §七十一），−5% 就此作废；丙案换成表里已在带的通道：`forcedComment` ＋ `hidden [{ Rep: 1 }]`，
    // `timing` 保持 `morning`、两颗按钮保住。「下周我那新地先紧着谁」仍是话术逗子，不落机制。
    // 判据的量纲是**分**（`dsl.js` 的只读别名读 DailyReports 最后一格，一格都不新存）；40 元这道线自定，分布实测在 `probe-evt052-waste.js`。
    // 裁定 `077733c` §五：半成已作废 ⇒ 卡面不许许诺不兑现的东西，「我按老主顾价再让半成」改「我这担子先过你这儿」，扣住「他先绕到你摊上」这个前提。
    id: 'evt_d_052',
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'morning',
    kind: '中性',
    weight: 18,
    condition: 'YesterdayWasteHigh >= 4000',
    cooldown: 3,
    text: '老李今早挑着担子先绕到你摊上："昨天见你剩了不少，今儿少拿点？我这担子先过你这儿——下周我那新地先紧着谁，可就不好说了。"',
    actions: [
      { id: 'take_less', label: '少拿点', open: [{ forcedComment: '老李把新菜往你这边又推了推：『少拿点好，菜这东西，新鲜才值钱。』' }], hidden: [{ Rep: 1 }] },
      { id: 'take_normal', label: '照常拿', open: [{ forcedComment: '老李把担子一挑：「成，是个过日子的。」' }], hidden: [] },
    ],
    effect_hidden: [],
    weightShift: null,
    branch: null,
    must_fire: null,
  },
  {
    // 回声三：昨日定价较前日上调 = 昨日／前日两个售价读数比大小（都从 DailyReports 现读，dsl.js 的只读别名，不落盘）。
    // 「规矩不能动」那支的次日客流 ×0.95 落在 next_day_traffic_mult 同一格（带内 0.85–1.25）。
    id: 'evt_d_053',
    motion: 'person',   // 呈现标签：只许呈现层读（红线见文件头）
    pool: 'daily',
    ship: 'M2',
    timing: 'evening',
    kind: '坏事',
    weight: 18,
    condition: 'PriceRaisedYesterday',
    cooldown: 3,
    text: '赵大妈端着碗没急着走："后生，你这价又往上挪了。我吃的不是麻辣烫，是月供。"',
    actions: [
      { id: 'treat', label: '这碗算我的（−12）', open: [{ cash: -1200 }], hidden: [{ Rep: 2 }] },
      { id: 'hold_price', label: '规矩不能动', open: [{ nextDayTrafficMult: 0.95 }, { forcedComment: '赵大妈把碗一放：「行，你有规矩。」——听不出是夸还是损。' }], hidden: [] },
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
