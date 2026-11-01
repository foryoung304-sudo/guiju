export const SAVE_VERSION = 'v4.9.2-cal.2';
// 裁定 9a959bd §一：M2 首个可玩构建升版，列在此的旧档不作废、按迁移规则带入（RiskShort 补 0，不溯及既往）
export const MIGRATABLE_SAVE_VERSIONS = ['v4.9.2-cal.1'];
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

// 定稿 §二：价格梯度上移，只动三个价，客流系数与口碑减半规则原样保留
export const PRICE_TIERS = {
  qinmin: { id: 'qinmin', name: '亲民价', perJin: 19.2, coef: 1.15 },
  standard: { id: 'standard', name: '标准价', perJin: 26.8, coef: 1.0 },
  signature: { id: 'signature', name: '招牌价', perJin: 32.2, coef: 0.85, coefRep50: 0.925, examMult: 0.75 },
};

// 定稿 §一 + 修订记录 R6：赊购额度两档改六档阶梯（约各档日货款 4 成，依据正本「熟人信用随生意长」）
export const TIERS_STALL = [
  { level: 1, name: '三轮车', baseSales: 90, fixedCost: 7500, capacity: 130, workGrid: 4, creditCap: 60000, upgradePrice: 105000 },
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

// 附录 JI_SCALE 显多秤与结局判定用的量纲（ui-spec §一换算表：盘店价 60,000 / 金盆洗手 300,000 / 烧心 Wmax 210 斤）
export const BUYOUT_PRICE_CENTS = 6000000;
export const RETIRE_NP_CENTS = 30000000;
export const HEARTBURN_WMAX_JIN = 210;

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
  competition: false,
  // 正文 3.12 生产链前段：M2 接线（备菜工时与产能修正、调味台 M_base、添加剂三档、打包三档）
  prep: true,
  flavor: true,
  labor: false,
  capacityTruncation: true,
  packingTier: 'normal',
  additiveTier: 'none',
};
