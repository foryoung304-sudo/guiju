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
