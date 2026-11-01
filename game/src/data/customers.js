// 附录 H.1 具名顾客表：基权 / 碗数 / 点单模板（标准克数）
export const CUSTOMERS = [
  { id: 'c01', name: '郑磊', role: '备考学生', weight: 20, bowls: 1, order: { MB: 125, VG: 100, NS: 100 }, line: true },
  { id: 'c02', name: '何秀', role: '加班的程序员', weight: 18, bowls: 1, order: { MB: 125, MT: 100, BF: 75 }, line: true },
  { id: 'c03', name: '孙奶奶', role: '给孙子带饭', weight: 15, bowls: 2, order: { MB: 250, VG: 200, BF: 75, NS: 175 }, line: true },
  { id: 'c04', name: '毕老师', role: '减肥中的老师', weight: 12, bowls: 1, order: { VG: 200, BF: 150, NS: 100 }, line: true },
  { id: 'c05', name: '小刘', role: '测评号', weight: 10, bowls: 1, order: { MB: 125, MT: 100, VG: 100, NS: 100 } },
  { id: 'c06', name: '赵大妈', role: '老街坊', weight: 8, bowls: 1, order: { MB: 125, MT: 100 } },
  { id: 'c07', name: '周哲', role: '体育生', weight: 12, bowls: 2, order: { MB: 250, MT: 200, NS: 200 }, blunt: true },
  { id: 'c08', name: '吴爷', role: '本地大爷', weight: 5, bowls: 1, order: { MT: 100, BF: 100, VG: 100 } },
];
export const CUSTOMER_BY_ID = Object.fromEntries(CUSTOMERS.map(c => [c.id, c]));

// 附录 H.1 抽取口径：熟客（R > 0 时）与常客线 A–D 的权重 = 基权 ×（1 + P ÷ 200），其余顾客用基权。
// 样段落地：常客线四位（c01–c04）走 boost，其余走基权。
export function handOrderWeight(customer, P) {
  return customer.weight * (customer.line ? 1 + P / 200 : 1);
}

// ── 正文 5.4 常客线的「最低实现」（§八 排期收口：上线必需 = 3 位有台词、无完整故事弧）──
// 取材只走 5.4 给的四条生活线本身（备考 / 加班 / 给孙子带饭 / 减肥），一句近况、不给选项、不给奖励清单；
// 合规三条照 §九 执行：不写具体年龄与年级、不涉自伤表述、不许出现"要不要用便宜料"式提问或给选择贴道德标签。
// 正文 §〇.2 把「常客故事线的逐条推进文案」登记为未定项 → 下列九句是 agent 自撰、待店主审；
// c04 毕老师按"3 位有台词"的额度留空（首更补齐全量时再写），留空不等于没有进度：RegularStory[3] 照推进。
export const REGULAR_LINES = {
  c01: [
    '从自习室逃出来一趟，脑门上还记着没背完的那页。',
    '剩的书不多了，先来一碗顶着，回去接着啃。',
    '等考完那趟我要连着来三天，你把汤给我留着。',
  ],
  c02: [
    '上线推到今晚了，我这顿也算在公司门口解决。',
    '我们组今儿来了三个，碗都在你这儿拼的。',
    '工位上那袋餐盒是你家的，他们说比食堂近。',
  ],
  c03: [
    '孙子今儿没跟来，我替他尝一口，回去给他带一份。',
    '他妈说别老吃外头的，可他嘴里就认你家这一口。',
    '天凉了，我让他穿厚点再来，顺手多带个盒。',
  ],
};

// 台词随进度走：RegularStory 是"这位常客来过几回"的计数（附录 F.5 :442，第 12 步 +1），
// 到顶就停在最后一句——不回卷、不沉默，因为"故事讲完"属完整故事弧，那是首更的活（已登记待裁）。
export function regularLine(customerId, progress) {
  const lines = REGULAR_LINES[customerId];
  if (!lines) return null;
  const i = progress < 0 ? 0 : progress >= lines.length ? lines.length - 1 : progress;
  return lines[i];
}

// 附录 E.10 约束第 3 条：RegularStory[4] 四个槽固定给常客线 A–D（c01–c04），别的剧情人物不占槽
export const REGULAR_SLOTS = ['c01', 'c02', 'c03', 'c04'];

