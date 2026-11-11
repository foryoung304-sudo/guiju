// v4.9.3 整合批：只并文书（附录 F 的 31 键 + 三条勘误 + §〇.1 标签收口），一个已签数值没动 ⇒ 版号升 v4.9.3、
// 定稿轮次沿用 cal.2（后缀 `-cal.N` 的含义是 M1 数值定稿轮次，见附录 F.1，本轮次未开启）
export const SAVE_VERSION = 'v4.9.3-cal.2';
// 裁定 9（2026-11-11 Orange，补条追加）：上面那条是**冻结的存档兼容尺**，一字不动（改了等于废玩家存档）；
// 界面上的版本标注改读这条独立展示串，今后正本升版只动它、不动 SAVE_VERSION。回归有一枚针钉死上面那条原值。
export const DISPLAY_VERSION = 'v4.9.4';
// 裁定 9a959bd §一：M2 首个可玩构建升版，列在此的旧档不作废、按迁移规则带入（RiskShort 补 0，不溯及既往）
// v4.9.3 把 cal.2 也列进来：那一段存档字段已全（各批只加不改），照旧逐键补初值续档、不作废
export const MIGRATABLE_SAVE_VERSIONS = ['v4.9.2-cal.2', 'v4.9.2-cal.1'];
// 附录 F.3 / G.5 的量纲按 final-calibration-20261031 第一节+第三节重锚：现金 600、供应商额度 600（三轮车期），一律以分存整数
export const START_CASH_CENTS = 60000;
export const START_CREDIT_CAP_CENTS = 60000;

export const CAT = {
  MB: { id: 'MB', name: '丸子', unit: '斤', share: 0.25, grams: 125, qWeight: 1.5, solid: true },
  MT: { id: 'MT', name: '鲜肉', unit: '斤', share: 0.20, grams: 100, qWeight: 1.0, solid: true },
  VG: { id: 'VG', name: '青菜', unit: '斤', share: 0.20, grams: 100, qWeight: 1.0, solid: true },
  BF: { id: 'BF', name: '豆制品/菌菇', unit: '斤', share: 0.15, grams: 75, qWeight: 1.0, solid: true },
  NS: { id: 'NS', name: '粉面', unit: '斤', share: 0.20, grams: 100, qWeight: 1.0, solid: true },
  SP: { id: 'SP', name: '汤底', unit: '份', share: 0, grams: 0, qWeight: 1.5, solid: false },
};
export const SOLID_CATS = ['MB', 'MT', 'VG', 'BF', 'NS'];
export const ALL_CATS = ['MB', 'MT', 'VG', 'BF', 'NS', 'SP'];

export const TIER = { 1: '正经', 2: '平价', 3: '特价', 6: '特供' };
export const QUALITY_BY_TIER = { 1: 95, 2: 68, 3: 35, 6: 22 };

// 机制单 `c152b37` 的两条出场文案。**都不进 COMMENT_POOLS**——池长就是随机流消耗量，加一条等于动数值（§六十一 那条口径）。
// ① 递话：撞线当晚那条「① 类强制留言」（events.js 同款通道，不掷随机、第 12 步排在概率类信号之前）。单上要求「不许静默上架」，
//    所以门开的那一晚必须有这一句话在场；后半句留刺归它自己。
// ② 卡面警告：解锁之后每一张清仓摊卡都带这一行（规矩味，不摆暗线数值：品质分与风险都是看不见的那面）。
export const CHEAP_UNLOCK_CUE = '老陈探头扫了一眼我这几天的账：「城东有摊清仓货，去晚了只剩泡沫箱。」说完就走，十米外回头补一句——「别说是我讲的。」';
export const CHEAP_TIER_WARNING = '这条路是账逼出来的：省下的每一分，都会在票上、秤上或检查里找回来。';

// 定稿 §二：价格梯度上移，只动三个价，客流系数与口碑减半规则原样保留
export const PRICE_TIERS = {
  qinmin: { id: 'qinmin', name: '亲民价', perJin: 19.2, coef: 1.15 },
  standard: { id: 'standard', name: '标准价', perJin: 26.8, coef: 1.0 },
  signature: { id: 'signature', name: '招牌价', perJin: 32.2, coef: 0.85, coefRep50: 0.925, examMult: 0.75 },
};

// 定稿 §一 + 修订记录 R6：赊购额度两档改六档阶梯（约各档日货款 4 成，依据正本「熟人信用随生意长」）
// 修订记录 R11（源 signoff-m3-round2-rulings-20261101 ①）：档 2 升级价 1,050 → 800 元，即时对代码生效；
// 正文与附录 G.5 的文本按签发口径在下一次整合时改字，那段期间正本里的 1,050 是旧值、以本格为准。
// R11 注脚（同步完成注销，2026-11-02，与定稿那条同口径）：上一行的「下一次整合时改字」已经办完——正文「摊位线」那行、
// 附录 D–H 的 F 表 Tier 行与 G.5 四列行、定稿第一节「升级价（五档）」那行都落的是 800（v4.9.4 字面同步 + 收口批），
// 本格与正本现在同一个价。上面两行按 append-only 留着不删，这一行不是待办，别再往上挂 TODO。
export const TIERS_STALL = [
  { level: 1, name: '三轮车', baseSales: 90, fixedCost: 7500, capacity: 130, workGrid: 4, creditCap: 60000, upgradePrice: 80000 },
  { level: 2, name: '二手餐车', baseSales: 180, fixedCost: 13500, capacity: 260, workGrid: 4, creditCap: 150000, upgradePrice: 450000 },
  { level: 3, name: '固定摊位', baseSales: 320, fixedCost: 24000, capacity: 460, workGrid: 5, creditCap: 250000, upgradePrice: 1350000 },
  { level: 4, name: '后门档口', baseSales: 550, fixedCost: 42000, capacity: 790, workGrid: 5, creditCap: 400000, upgradePrice: 2700000 },
  { level: 5, name: '小吃街门面', baseSales: 900, fixedCost: 78000, capacity: 1300, workGrid: 6, creditCap: 650000, upgradePrice: 6000000 },
  { level: 6, name: '整街双店', baseSales: 1500, fixedCost: 144000, capacity: 2160, workGrid: 6, creditCap: 1000000, upgradePrice: null },
];

export const PACKING = { bag: 0, normal: 0.3, thermal: 0.6 };
export const PACKING_SPILL = { bag: 0.12, normal: 0.04, thermal: 0.005 };
export const TAKEAWAY_SHARE = { base: 0.4, rain: 0.7 };
// 正文 3.11：打包三档（常驻决策，第 5 步定版）
export const PACKING_NAMES = { bag: '塑料袋', normal: '普通餐盒', thermal: '保温餐盒' };

// 正文 3.12 备菜（第 4 步）：三站覆盖六品类，认真 2 格 / 将就 1 格 / 跳过 0 格，
// 品质按 3.4 修正（认真 +10 / 将就 0 / 跳过 −8）只进当日 Q，产能按连乘（1.05 / 1.0 / 0.90）
export const PREP_STATIONS = [
  { id: 'wash', name: '洗切', cats: ['VG', 'BF', 'NS'], qGroup: 0 },
  { id: 'marinate', name: '腌渍', cats: ['MT', 'MB'], qGroup: 1 },
  { id: 'soup', name: '吊汤', cats: ['SP'], qGroup: 2 },
];
export const PREP_LEVELS = [
  { id: '认真', grid: 2, q: 10, cap: 1.05 },
  { id: '将就', grid: 1, q: 0, cap: 1.0 },
  { id: '跳过', grid: 0, q: -8, cap: 0.90 },
];
export const WAKE_EARLY_GRID = 1;          // 早起占 1 格工时，换 3.10 晨采好货必到 + 免当日 30% 涨价
export const WASH_SKIP_WRITEOFF_MUL = 1.2; // 跳过洗切 → 青菜 / 豆制品菌菇 / 粉面 隔夜报损额外 +20%

// 正文 3.12 / 附录 D.2 添加剂（调料摊，摊位 ≥ 二手餐车解锁）：成本是象征性的，真实代价全在 Q/C/Risk。
// 鲜味留言等效只进口味留言表现，不进 M_base、Q 与销量；Q/C/Risk 增量只在当日有实际售出时产生（附录 G.1 零销量例外）
export const ADDITIVE = {
  none: { id: 'none', name: '不掺', goods: null, pitch: '只用当天熬的汤', q: 0, perBowl: 0, c: 0, risk: 0, umami: 0, unlockTier: 1 },
  less: { id: 'less', name: '少掺', goods: '增香粉', pitch: '一勺香满街', q: -4, perBowl: 0.1, c: 0.3, risk: 2, umami: 1, unlockTier: 2 },
  more: { id: 'more', name: '多掺', goods: '回味膏', pitch: '后劲足，回头客多', q: -8, perBowl: 0.2, c: 0.6, risk: 3, umami: 2, unlockTier: 2 },
};
export const ADDITIVE_TIER_MIN = 2;

// 正文 3.12 调味台：客群构成按情境四行（加总 100%），偏好向量（辣，麻，鲜）；
// 情境改偏好时先钳制 0–5 再算匹配，m_base = 1 −（三维距离）/15，M_base = Σ 占比 × m_base
export const CLIENT_MIX = {
  normal: { 学生: 0.55, 老师: 0.15, 大爷: 0.15, 其他: 0.15 },
  exam: { 学生: 0.70, 老师: 0.10, 大爷: 0.10, 其他: 0.10 },
  holiday: { 学生: 0.25, 老师: 0.15, 大爷: 0.35, 其他: 0.25 },
  school: { 学生: 0.65, 老师: 0.10, 大爷: 0.10, 其他: 0.15 },
};
export const CLIENT_PREF = { 学生: [4, 3, 3], 老师: [2, 1, 4], 大爷: [3, 2, 5], 其他: [3, 3, 3] };
export const FLAVOR_DIMS = ['spicy', 'numbing', 'umami'];
export const FLAVOR_DIM_NAMES = { spicy: '辣', numbing: '麻', umami: '鲜' };
export const FLAVOR_DEFAULT = { spicy: 3, numbing: 2, umami: 3 };

export const FACILITIES = {
  fac_prepay: { id: 'fac_prepay', name: '先钱后货牌', price: 15000, unlock: 'EVT?evt_d_001', m1: true },
  fac_taste: { id: 'fac_taste', name: '试吃一元角', price: 36000, unlock: 'Tier>=2', m1: false },
  fac_display: { id: 'fac_display', name: '用料上墙展示柜', price: 120000, unlock: 'EVT?evt_d_021', m1: false },
  fac_cert: { id: 'fac_cert', name: '证件墙 + 明厨亮灶', price: 270000, unlock: 'seen_routine_inspection == true', m1: false },
  fac_contract: { id: 'fac_contract', name: '员工正式合同', price: 450000, unlock: 'EVT?evt_s_poach', m1: false },
  fac_sign: { id: 'fac_sign', name: '招牌规矩字', price: 90000, unlock: 'BizDays>=45', m1: false },
};

// 附录 D.3：显多秤是杂货摊器具（固定摊位后上架），不进 Facilities 集合、不计 L（附录 E evt_s_promo 约束第 2 条明写）
// unlock 用 DSL 的档位数值：附录原文写「Tier >= 固定摊位」，DSL 词法器不认汉字标识符，按表内档位序号 = 3 落
export const TOOLS = {
  JI_SCALE: { id: 'JI_SCALE', name: '显多秤', shop: '杂货摊', price: 78000, sellBack: 39000, unlock: 'Tier>=3' },
};
// 附录 D.3 + 正文 3.14 第 7h 步：自动层计费斤数 ×1.08，差额 ΔJ = 自动层实际斤数 × 0.08 计流水不计 COGS
export const SCALE_AUTO_MUL = 1.08;
export const SCALE_DELTA_J_SHARE = 0.08;
export const SCALE_C_PER_JIN = 0.05;      // C/H += ΔJ × 0.05
export const SCALE_RISK_PER_JIN = 0.3;    // Risk += ΔJ × 0.3（裁定 9a959bd §三：与亲手短斤同进分量作假池）

// 正文 3.5 / 附录 F.7 `LaborCost` 行 + D.3 `fac_contract` 行：小豆在场日结 60 元（三轮车—档口）/ 90 元（门面—双店），
// 合同后 120 元（覆盖不分档）；在场同时给 工时 +1 格（F.5 `WorkGridUsed` 行）与 全摊产能 ×1.10（G.2 第 7 步产能式，合同 ×1.15 覆盖不叠加）
export const LABOR = {
  perDay: 6000, highTierPerDay: 9000, contractPerDay: 12000, highTierFrom: 5,
  capMul: 1.10, contractCapMul: 1.15, gridBonus: 1,
  // 附录 E.9 evt_s_poach「让他走 → 产能 ×0.90 …… 14 日后回来」：被挖走的缺席比请假的缺席多一条产能惩罚
  //（正文 :137 的「小豆请假一天」只写「既不计人工也不给产能加成」，没有惩罚项）。两种成因共用 `XiaodouAbsentDays`，
  // 由 `PoachedAway` 区分；「14 日后回来」按第 1 步递减的现行口径 = 缺席 13 个营业日、第 14 日在场，已登记回报。
  poachedCapMul: 0.90,
  // 勘误批 signoff-v492-audit-errata-20261031 b 项：涨薪留住的加薪 +5 元/日 → **+15 元/日**（E.9 :305 的旧字面 −600/+500 分作废）
  raisePerDay: 1500,
};

// 正文 3.6 注 / 附录 D.5：试吃份数 n ∈ 3–6（第 5 步定版、不掷随机）；一份 = 0.3 碗的料；1 元/份；转化 = floor(n ÷ 3)
export const TASTING = { min: 3, max: 6, bowlSharePerPortion: 0.3, incomeCentsPerPortion: 100, convertPer: 3 };

// ── 正文 3.13 常驻竞争 + 附录 G.3 / G.5 四摊常数（M2 第四批接线；全部照原文，未新增数值）──
// G 基准价 26.8 = 标准价档（v4.9.2 R9 随价梯度上移）；跟价带 19.2 / 28.9；
// 价格战带原写下界 15.8 → 17.0（R9 已签）、上界 26.8 → 28.9（勘误批 signoff-v492-audit-errata-20261031 c 项：与跟价带上界一致）
export const COMPETITION = {
  priceBase: 26.8, gBand: [0.70, 1.30],
  shareBase: 0.25, sBand: [0.6, 1.4], inertiaBand: [0.85, 1.15],
  rivalStartPrice: 22.8, rivalP: 55, rivalPLow: 30, rivalLowDays: 5, rivalMissPct: 0.04,
  followCoef: 0.92, followBand: [19.2, 28.9],
  warCoef: 0.78, warBand: [17.0, 28.9],
  // 三日倒计时与「>=5 天 + Rep>=40」的门槛写在 `data/events.js` 的两行里（E.9 原文照录），
  // 这里不再放一份——同一个已签数放两处就会各飘各的
  // 第 100 天起单调加压防死局（正文 3.4 / §九 / 附录 F.6 `RivalAttrBoostWeeks`）：每周 ×1.03，只作用于王老板的吸引力
  boostFromDay: 100, boostEveryDays: 7, boostWeekMul: 1.03,
  // 5.3 价格战触发式的份额门槛（RivalSuppressedDays 的计数定义在正文 3.13，份额取第 7b 步实际值）
  suppressSelfShare: 0.30, suppressRivalShare: 0.20, warRepGate: 40,
};
// 四摊同式（A_i = P_i × G_i × 排队惯性_i × 分流系数_i）：本摊与王老板分流系数恒 1.0
// 两家间接竞品的 P 是常数、无生成规则、不吃加压（正文 §〇.1 第 9 条待签，默认按 42 / 36 执行）
export const RIVAL_INDIRECT = [
  { id: 'zhachuan', name: '炸串大姐', price: 18.8, p: 42, divert: { sunny: 1.15, cloudy: 1.15, rain: 0.8, heat: 1.0 } },
  { id: 'liangpi', name: '凉皮叔', price: 15.8, p: 36, divert: { sunny: 1.0, cloudy: 1.0, rain: 1.0, heat: 1.3 } },
];

// ── 附录 E.6 / E.9 两条检查事件共用的判定表（正文 :315 / :316 为权威；M2 第五批接线）──
// Score = 票据覆盖率 × 60 + 设施分（证件墙 25 / 用料展示柜 10，可加总）+ 销毁比例 × 15 − Risk × 0.3
// 三处「现金不足」走法分属两条事件、两个数（×0.6/1 日 是整改本 effect、×0.7/2 日 是大检查的待签兜底、
// ×0.8/2 日 是例行检查的已签兜底），不是一个数抄三遍，故逐个写死、不做派生。
export const INSPECTION = {
  facScore: { fac_cert: 25, fac_display: 10 },
  // 大检查（evt_s_insp）三档：≥55 通过 / 35–55 整改 / <35 直接进结局 #1
  passAt: 55, rectifyAt: 35,
  rectifyFineCents: 20000, rectifyRep: -2,
  riskAfterPass: 30, riskAfterRectify: 40,
  rectifyBuff: { mult: 0.6, days: 1 },
  // §〇.1 第 8 条待签（附录 E.6 :239 明写「默认按前者施工、开关做成一处常量」）：
  // 'buff' = 现金不足 200 时改 d0_buff ×0.7 持续 2 日、不扣负；'greyout' = 不扣钱也不给 buff（整改档不可选）
  shortCashMode: 'buff',
  shortCashBuff: { mult: 0.7, days: 2 },
  // 例行检查（evt_s_insp2）：同式、门槛 ≥40；未过罚款 = 勘误批 a 项 50 → **100 元**（E.9 :283 / 正文 :315 的旧字面作废）
  routinePassAt: 40, routineFineCents: 10000, routineRep: -1,
  routineShortCashBuff: { mult: 0.8, days: 2 },
};

// ── 正文 3.11 烫煮手感参数（v4.9 估值起步、M2 真机调，§〇.1 回签第 7 条）──
// 五个数全部照原文照录：熟度条 0→100 匀速扫过全程 4.0 秒、绿区 55–78（即 2.2–3.12 秒）、
// 中心 66.5 的 ±3 以内记「最佳+」。本批只做「开关式实现」（§八 排期收口：上线必需 = 建在代码里、默认关闭；
// 开启与真机调参在首更），开关是 CONFIG.blanch。
export const BLANCH = {
  sweepSec: 4.0,
  greenLow: 55, greenHigh: 78,
  center: 66.5, centerBand: 3,
};

// 附录 G.4（:590–592 是分/斤原式）+ ui-spec §一换算表：盘店价 60,000 / 金盆洗手 300,000 / 烧心 Wmax 210 斤
export const BUYOUT_PRICE_CENTS = 6000000;
export const RETIRE_NP_CENTS = 30000000;
export const HEARTBURN_WMAX_JIN = 210;
// 附录 G.4 第 6 行的变体门槛：「街坊会想你的摊」要 NP ≥ 9,000,000 分（90,000 元，v4.9.2 随量纲重锚由 30,000 上调）且 Rep ≥ 60
export const QUIT_VARIANT_NP_CENTS = 9000000;
export const QUIT_VARIANT_REP = 60;

export const SUBSTREAMS = ['weather', 'supply', 'price', 'rival', 'event_morning_pre', 'event_morning',
  'event_evening', 'comment', 'regular', 'receipt', 'packing'];

export const ENDING = { CRASH: 1, BANKRUPT: 2, RULES: 3, HEARTBURN: 4, RETIRE: 5, MEDIOCRE: 6 };

export const CONFIG = {
  sampleDays: 10,
  // 定稿 3.11 / 签复 signoff-m1-accepted-20261031：M1 样段裁 2 单属范围限定，M2 起恢复 3 单/日，
  // 固定摊位（level 3）档起 4 单/日
  handOrdersPerDay: 3,
  handOrdersTierFull: 3,
  handOrdersPerDayFull: 4,
  // 正文 3.13 / 3.14 第 7b：M2 第四批接线。已签发的 M1 带（3.5:141「无竞争（S ≡ 1）」）由 harness 传 competition:false 复现
  competition: true,
  // 正文 3.11 烫煮：§八 排期收口把「开关式实现（在建时默认关闭）」划进上线必需、把「开启与真机调参」划进首更，
  // 故本批建完即关。关的时候一格动画都不起、一个随机都不掷，亲手单还是「抓菜过称 → 下锅」两步里的前一步。
  blanch: false,
  // 正文 3.12 生产链前段：M2 接线（备菜工时与产能修正、调味台 M_base、添加剂三档、打包三档）
  prep: true,
  flavor: true,
  // 正文 3.5 / 3.12 人工线：M2 第三批接线（小豆在场 +1 格工时、产能 ×1.10/×1.15、日结 60·90·120）
  labor: true,
  // 事件范围：正文 §八 M1 行把「特殊事件、完整事件池」整体划进「明确不做（全部 M2 接入）」，
  // 所以复现已签发的 M1 带时必须只放行 M1 的那四条日常行（与 labor:false / competition:false 同一条理由）。
  // 'm1' = 只认 data/events.js 里 ship='M1' 的行；'full' = 全池（M2 构建的默认）。
  eventScope: 'full',
  // 改判单 task-frontload-d3-20261104（Orange 2026-11-04，店主亲口澄清）：特殊事件池的触发起始日 = D3。
  // 是**时间闸**，不是逐日排片：D3 起各条按自己既有的条件、概率门与权重入池竞争，D3 之前整池不触发；
  // 不点名钉死某条事件或某个人物（旧稿的 D1 赵大妈必达／D2 常客首单／D3 王老板保底三条作废）。
  specialFirstDay: 3,
  // 机制单 task-cheap-unlock-20261104（`c152b37`，店主点子、口径由 Orange 定）＋ 修订单 `2e1e113` ＋ 裁定汇总 `f6a8ebf` §四（v2）：
  // 低价（清仓摊 tier 3）从「开局可选」改「绝境解锁」；闸门 = **累计经营净额**（每日 `netOpsCents` 累加，账本现成口径，见 ledger.js 第 8 步），
  // 一次解锁、永久保留。单上原话「用累计经营净额不用现金余额：升档花钱不算亏，不许误触」⇒ 这一格只读经营净额，投资/升档/事件账都不进这个和。
  // 累计支 −180 ⇒ **−120**：`f6a8ebf` §四 原话「累计支 ≤ −120 落地」，数字是她钉的，不是我挑的。
  // 单日支：v2 原本要在 {0, −20, −40} 里挑一档，`probe-cheap-unlock-v2.js` 实测三档全不过——通过线三条里 ① 普通日零命中、② 砸穿日仍可达两关都过，
  // 栽在 ③「稳线（mid/ref3）首周全日零命中」：那几天全是**砸穿日**（报损压过毛利，最浅的一天也有 −88 元），跟固定支出脱钩脱不掉。
  // 想让 ③ 归零得把线放到 ≤−250，而那早已不是「单日做砸」是「单日崩盘」⇒ 按单上预授权只落累计支，带数字回报（`f6a8ebf` §四 末句）。
  // 裁定 `077733c` §三 把这条**正式关闭**：低价解锁现行形状钉死为「D3 时间闸 + 累计 −120，单日支不存在」；≤−250 只留观察记录，首更再议才许重开。
  cheapUnlockNetOpsCents: -12000,
  // 裁定 §四「解锁检查自 D3 晚起才跑」：与 `specialFirstDay` 同节奏（压力开闸那天），D1–D2 不触发由此变成**结构保证**而不是概率结论。
  // v1 的失败正出在这里：−60 的单日线被 D1 那种零事件卡、现金还剩 460 的普通开业日照穿——那是开业成本地板，不是「惨」。
  cheapUnlockFirstDay: 3,
  capacityTruncation: true,
  packingTier: 'normal',
  additiveTier: 'none',
};
