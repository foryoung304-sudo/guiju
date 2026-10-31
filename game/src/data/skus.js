import { QUALITY_BY_TIER } from './constants.js';

// 附录 D.1：字段顺序 = CSV 列顺序 sku, 品类, 档, 货源, 单价, 单位, 品质, 带票, 可赊购, 隔夜规则, 界面描述要点
export const SKUS = [
  { sku: 'MB1', cat: 'MB', tier: 1, supplier: '老李肉摊', price: 24, unit: '斤', q: QUALITY_BY_TIER[1], receipt: 'auto', credit: true, keep: false, desc: '现打的，案板上还带着筋；老李给你塞一张手写票据' },
  { sku: 'MB2', cat: 'MB', tier: 2, supplier: '批发市场', price: 15, unit: '斤', q: QUALITY_BY_TIER[2], receipt: 'draw', credit: false, keep: false, desc: '冷冻品牌丸，包装袋印着保质期，剪开了口' },
  { sku: 'MB3', cat: 'MB', tier: 3, supplier: '清仓摊', price: 10.5, unit: '斤', q: QUALITY_BY_TIER[3], receipt: 'none', credit: false, keep: false, desc: '无标散装，泡沫箱里泡着；生产日期那行看不清' },
  { sku: 'MB6', cat: 'MB', tier: 6, supplier: '强哥', price: 7.5, unit: '斤', q: QUALITY_BY_TIER[6], receipt: 'none', credit: false, keep: false, desc: '强哥自己搅的，颜色比别家白；"这批特殊价，别问"' },
  { sku: 'MT1', cat: 'MT', tier: 1, supplier: '老李肉摊', price: 22, unit: '斤', q: QUALITY_BY_TIER[1], receipt: 'auto', credit: true, keep: false, desc: '当日凌晨的分切肉，红白分明，摊上挂着当日牌' },
  { sku: 'MT2', cat: 'MT', tier: 2, supplier: '批发市场', price: 14, unit: '斤', q: QUALITY_BY_TIER[2], receipt: 'draw', credit: false, keep: false, desc: '冷鲜肉，真空袋，颜色偏淡' },
  { sku: 'MT3', cat: 'MT', tier: 3, supplier: '清仓摊', price: 9.5, unit: '斤', q: QUALITY_BY_TIER[3], receipt: 'none', credit: false, keep: false, desc: '临期清仓，标签上日期是手写的，最后一位看不清' },
  { sku: 'MT6', cat: 'MT', tier: 6, supplier: '强哥', price: 6.5, unit: '斤', q: QUALITY_BY_TIER[6], receipt: 'none', credit: false, keep: false, desc: '碎肉边角，按桶算；"绞一绞谁能吃出来"' },
  { sku: 'VG1', cat: 'VG', tier: 1, supplier: '菜农直供', price: 6, unit: '斤', q: QUALITY_BY_TIER[1], receipt: 'auto', credit: true, keep: false, desc: '早上五点地里拔的，根上还带泥和水' },
  { sku: 'VG2', cat: 'VG', tier: 2, supplier: '批发市场', price: 4, unit: '斤', q: QUALITY_BY_TIER[2], receipt: 'draw', credit: false, keep: false, desc: '一筐一筐码得整齐，叶尖有点发黄' },
  { sku: 'VG3', cat: 'VG', tier: 3, supplier: '清仓摊', price: 3, unit: '斤', q: QUALITY_BY_TIER[3], receipt: 'none', credit: false, keep: false, desc: '"隔夜处理菜"——把黄叶择干净了再摆出来' },
  { sku: 'VG6', cat: 'VG', tier: 6, supplier: '强哥', price: 2.0, unit: '斤', q: QUALITY_BY_TIER[6], receipt: 'none', credit: false, keep: false, desc: '散装统货，烂帮子混在里面，得自己择' },
  { sku: 'BF1', cat: 'BF', tier: 1, supplier: '豆腐坊', price: 10, unit: '斤', q: QUALITY_BY_TIER[1], receipt: 'auto', credit: true, keep: true, desc: '手工豆皮，一张一张揭的，豆子味闻得到' },
  { sku: 'BF2', cat: 'BF', tier: 2, supplier: '批发市场', price: 6.5, unit: '斤', q: QUALITY_BY_TIER[2], receipt: 'draw', credit: false, keep: true, desc: '机制豆制品，尺寸一模一样' },
  { sku: 'BF3', cat: 'BF', tier: 3, supplier: '清仓摊', price: 4.5, unit: '斤', q: QUALITY_BY_TIER[3], receipt: 'none', credit: false, keep: false, desc: '散装菌菇，产地不明，纸箱是别人家的' },
  { sku: 'BF6', cat: 'BF', tier: 6, supplier: '强哥', price: 2.8, unit: '斤', q: QUALITY_BY_TIER[6], receipt: 'none', credit: false, keep: false, desc: '碎豆渣压的块，泡水里涨得很快' },
  { sku: 'SP1', cat: 'SP', tier: 1, supplier: '自家后厨', price: 1.2, unit: '份', q: QUALITY_BY_TIER[1], receipt: 'excluded', credit: false, keep: false, desc: '牛骨头今早熬上的，锅里看得见浮油；一熬就是一整天' },
  { sku: 'SP2', cat: 'SP', tier: 2, supplier: '批发市场', price: 0.8, unit: '份', q: QUALITY_BY_TIER[2], receipt: 'draw', credit: false, keep: false, desc: '品牌料包，撕开倒进去，一包兑一锅' },
  { sku: 'SP3', cat: 'SP', tier: 3, supplier: '清仓摊', price: 0.4, unit: '份', q: QUALITY_BY_TIER[3], receipt: 'none', credit: false, keep: false, desc: '摊上挂着"老汤"牌子的桶装汤底，桶壁有旧油垢，没日期' },
  { sku: 'SP6', cat: 'SP', tier: 6, supplier: '强哥', price: 0.25, unit: '份', q: QUALITY_BY_TIER[6], receipt: 'none', credit: false, keep: false, desc: '强哥自己兑的浓汤宝，一勺能推半条街的香' },
  { sku: 'NS1', cat: 'NS', tier: 1, supplier: '粉坊', price: 5, unit: '斤', q: QUALITY_BY_TIER[1], receipt: 'auto', credit: true, keep: true, desc: '手工粉，切得不齐，煮久了也不浑汤' },
  { sku: 'NS2', cat: 'NS', tier: 2, supplier: '批发市场', price: 3.5, unit: '斤', q: QUALITY_BY_TIER[2], receipt: 'draw', credit: false, keep: true, desc: '机制粉面，一捆一捆规格统一' },
  { sku: 'NS3', cat: 'NS', tier: 3, supplier: '清仓摊', price: 2.5, unit: '斤', q: QUALITY_BY_TIER[3], receipt: 'none', credit: false, keep: false, desc: '陈货粉面，袋子封口被人拆开过，颜色发暗' },
  { sku: 'NS6', cat: 'NS', tier: 6, supplier: '强哥', price: 1.8, unit: '斤', q: QUALITY_BY_TIER[6], receipt: 'none', credit: false, keep: false, desc: '断粉、碎面，装编织袋按斤称' },
];

export const SKU_BY_ID = Object.fromEntries(SKUS.map(s => [s.sku, s]));
export const SKUS_BY_CAT = Object.fromEntries(['MB', 'MT', 'VG', 'BF', 'NS', 'SP'].map(c => [c, SKUS.filter(s => s.cat === c)]));

// 单碗食材成本（附录 D.5，未取整）：正经 15.30 / 平价 9.825 / 特价 6.70 / 特供 4.605
const BOWL_SHARE = { MB: .25, MT: .2, VG: .2, BF: .15, NS: .2 };
export function bowlIngredientCost(tier) {
  const solid = Object.entries(BOWL_SHARE)
    .reduce((sum, [cat, w]) => sum + SKU_BY_ID[cat + tier].price * w, 0);
  return solid + SKU_BY_ID['SP' + tier].price;
}
