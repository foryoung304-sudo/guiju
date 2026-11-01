import { SKU_BY_ID } from '../data/skus.js';
import { SOLID_CATS, FACILITIES, TIERS_STALL, TOOLS } from '../data/constants.js';
import { toCents, roundJin, addToCostPool } from './state.js';
import { evalCondition } from './dsl.js';

// 市场标价 = D.1 单价 × PriceIndex × 情境供应端联动 × 当日事件涨幅（只改价，不改品质/带票/赊购/隔夜规则）
export function effectivePrice(state, sku) {
  let p = sku.price * state.PriceIndex;
  for (const mod of state.today.priceMods) {
    if (mod.wakeWaived && state.WakeEarly) continue;   // 3.12 早起：免当日 30% 晨采涨价
    if (modMatches(mod, sku)) p *= mod.mult;
  }
  const evMult = state.today.priceMultToday[sku.cat];
  if (evMult) p *= evMult;
  // 标价取两位小数：账面必须能被 单价 × 斤数 复算（附录 B 账目可核）
  return Math.round(p * 100) / 100;
}

function modMatches(mod, sku) {
  if (mod.cat && mod.cat !== sku.cat) return false;
  if (mod.tier && mod.tier !== sku.tier) return false;
  return true;
}

// 附录 D.1 第 2 条：第六档的唯一购买门 = Day >= 8 & C >= 3；上架品类由 supply 子流抽 2–4 个
export function skuAvailable(state, sku, rng) {
  // spec-event-pool-6 §二.3「明天没粉」：市场层落点，下架品类四档一起不收（今日第 2 步的晨间情报就是为这一格留的囤货窗口）。
  // 排在第六档抽取之前且不掷随机 → 断货日与非断货日走同一条 supply 流，已签带的随机轨不漂。
  // 只挡买、不挡卖：柜里已有的照常在第 7 步出菜。
  if (state.today.delist && sku.cat === state.today.delist) return false;
  if (sku.tier !== 6) return true;
  if (!evalCondition('Day>=8 & C>=3', state)) return false;
  if (!state.today.qianggeCats) {
    const n = 2 + rng.int('supply', 3);
    const pool = SOLID_CATS.concat(['SP']).slice();
    const picked = [];
    for (let i = 0; i < n && pool.length; i++) picked.push(pool.splice(rng.int('supply', pool.length), 1)[0]);
    state.today.qianggeCats = picked;
  }
  return state.today.qianggeCats.includes(sku.cat);
}

export function lineCostCents(state, sku, qty) {
  return toCents(effectivePrice(state, sku) * qty);
}

// 把玩家填的组篮（{sku, qty}）换算成带标价与总额的明细行；界面与无头模拟共用同一条换算
export function buildBasket(state, picks) {
  return picks.filter(p => p.qty > 0).map(p => {
    const sku = p.sku.sku ? p.sku : SKU_BY_ID[p.sku];
    const unitPrice = effectivePrice(state, sku);
    const qty = roundJin(p.qty);
    return { sku: sku.sku, cat: sku.cat, tier: sku.tier, supplier: sku.supplier,
      unit: sku.unit, qty, unitPrice, cost: toCents(unitPrice * qty) };
  });
}

// 正文 3.14 第 3 步支付顺序：先扣现金，不足部分自动走赊购（仅熟人正经货）；
// 现金与额度同时不足则本篮不可提交（不自动减量、不超额度）
export function planPayment(state, basket) {
  const creditAvail = Math.max(0, state.CreditCap - state.DebtSupplier);
  // 现金为负时可用现金按 0 计：负余额是「已经欠着」，不能反过来把欠的数额算进赊购额度，
  // 否则连空篮都会被判付不齐（3.14 第 3 步要能过），而赊购线本身是熟人额度、与现金无关
  const cashAvail = Math.max(0, state.Cash);
  const eligibleTotal = basket.reduce((sum, l) => sum + (SKU_BY_ID[l.sku].credit ? l.cost : 0), 0);
  const total = basket.reduce((sum, l) => sum + l.cost, 0);
  const creditUsed = Math.min(eligibleTotal, creditAvail, Math.max(0, total - cashAvail));
  const cashNeeded = total - creditUsed;
  const shortfallCents = cashNeeded > cashAvail ? cashNeeded - cashAvail : 0;
  // 逐笔拆分与总额同源：先按行分摊赊购额（只摊给可赊购的正经货行），剩下的才是现金
  let creditLeft = creditUsed;
  let cashLeft = cashNeeded;
  const lines = basket.map(l => {
    const canCredit = SKU_BY_ID[l.sku].credit;
    const useCredit = canCredit ? Math.min(l.cost, creditLeft) : 0;
    creditLeft -= useCredit;
    const payCash = l.cost - useCredit;
    cashLeft -= payCash;
    return { ...l, cash: payCash, credit: useCredit };
  });
  return { total, creditUsed, cashUsed: total - creditUsed, shortfallCents, lines,
    submittable: shortfallCents === 0 && cashLeft === 0 && creditLeft === 0 };
}

export function commitPurchase(state, plan, rng) {
  for (const line of plan.lines) {
    const sku = SKU_BY_ID[line.sku];
    const hasReceipt = sku.receipt === 'auto' ? 1 : sku.receipt === 'none' ? 0
      : rng.chance(0.5, 'receipt') ? 1 : 0;
    state.Batches.push({
      cat: sku.cat, sku: sku.sku, tier: sku.tier,
      qty: roundJin(line.qty), unit: sku.unit, q: sku.q,
      costPerUnit: effectivePrice(state, sku), hasReceipt, day: state.Day,
    });
    if (sku.receipt !== 'excluded') {
      const slot = state.ReceiptWindow[(state.Day - 1) % 30];
      slot.total += line.cost;
      slot.withTicket += hasReceipt ? line.cost : 0;
    }
    addToCostPool(state, sku.cat, line.cost);
    state.today.purchasedJin[sku.cat] = roundJin(state.today.purchasedJin[sku.cat] + line.qty);
    state.PurchaseLedger.push({
      day: state.Day, sku: sku.sku, cat: sku.cat, tier: sku.tier, supplier: sku.supplier,
      qty: roundJin(line.qty), unit: sku.unit, unitPrice: effectivePrice(state, sku),
      cost: line.cost, cash: line.cash, credit: line.credit, hasReceipt,
    });
  }
  state.Cash -= plan.cashUsed;
  state.DebtSupplier += plan.creditUsed;
  state.today.purchases = plan.lines;
  recomputeStock(state);
}

export function recomputeStock(state) {
  for (const c of SOLID_CATS) state.StockSolid[c] = roundJin(state.Batches.filter(b => b.cat === c).reduce((s, b) => s + b.qty, 0));
  state.StockSoup = roundJin(state.Batches.filter(b => b.cat === 'SP').reduce((s, b) => s + b.qty, 0));
}

// 附录 B：成本取当日加权均价（新购与留存混合，逐品类各算各的）
export function stockAvgCost(state, cat) {
  const list = state.Batches.filter(b => b.cat === cat);
  const qty = list.reduce((s, b) => s + b.qty, 0);
  if (qty <= 0) return 0;
  return list.reduce((s, b) => s + b.qty * b.costPerUnit, 0) / qty;
}

export function takeStock(state, cat, amount, taken = []) {
  const list = state.Batches.filter(b => b.cat === cat && b.qty > 0);
  let need = roundJin(amount);
  for (const b of list) {
    if (need <= 0) break;
    const use = roundJin(Math.min(b.qty, need));
    b.qty = roundJin(b.qty - use);
    need = roundJin(need - use);
    taken.push({ batch: b, qty: use });
  }
  state.Batches = state.Batches.filter(b => b.qty > 0);
  recomputeStock(state);
  return roundJin(amount - need);
}

// 界面只读这一条：D.3 的「解锁条件」列原样交给 DSL，界面不许自己判 Tier / EVT / BizDays
export function isFacilityUnlocked(state, id) {
  return evalCondition(FACILITIES[id].unlock, state);
}

export function buyFacility(state, facId) {
  const fac = FACILITIES[facId];
  // 解锁条件在引擎这一侧也过一次门：正文 3.6「证件墙干净线买不到」是有意的，只把检查放在界面上等于没放
  if (!fac || state.Cash < fac.price || state.Facilities.includes(facId)) return false;
  if (!evalCondition(fac.unlock, state)) return false;
  state.Cash -= fac.price;
  state.NetInvestSpent += fac.price;
  state.Facilities.push(facId);
  state.L = Math.min(10, state.L + 1);
  state.F = Math.min(1.10, 1 + 0.05 * (state.Facilities.includes('fac_display') ? 1 : 0)
    + 0.05 * (state.Facilities.includes('fac_cert') ? 1 : 0));
  return true;
}

export function creditAvailable(state) {
  return Math.max(0, state.CreditCap - state.DebtSupplier);
}

// 附录 D.3 + 正文 3.14 第 3 步：杂货摊器具与设施同一条支付口径（即时扣现金、单列净投资、不进经营净额），
// 差别只在器具不 +L、不进 Facilities（附录 E evt_s_promo 约束第 2 条）
export function ownsTool(state, id) {
  return state.Tools.includes(id);
}

export function buyTool(state, id) {
  const tool = TOOLS[id];
  if (!tool || state.Tools.includes(id) || state.Cash < tool.price) return false;
  if (!evalCondition(tool.unlock, state)) return false;
  state.Cash -= tool.price;
  state.NetInvestSpent += tool.price;
  state.Tools.push(id);
  return true;
}

// 附录 D.3 卖回列（390 = 半价，正文 3.14 第 3 步「显多秤卖回在本步回收半价现金」）；
// 净投资列随之回冲（附录 F.7 `NetInvestSpent` = 设施/升级 −卖回回收）；秤一卸，当日开关即落回卸下档
export function sellBackTool(state, id) {
  const tool = TOOLS[id];
  if (!tool || !state.Tools.includes(id)) return false;
  state.Tools = state.Tools.filter(t => t !== id);
  state.Cash += tool.sellBack;
  state.NetInvestSpent -= tool.sellBack;
  if (id === 'JI_SCALE') state.ScaleShowOn = false;
  return true;
}

// 小店置办·摊位升级（3.14 第 3 步：投资支出即时扣现金、单列、不进经营净额）
// 附录 F：CreditCap 与基础销量/固定支出/产能在换档当刻改；附录 G.5：换档当刻爬坡置 3 重新起算
export function upgradeStall(state) {
  const price = TIERS_STALL[state.Tier - 1].upgradePrice;
  if (!price || state.Cash < price) return false;
  state.Cash -= price;
  state.NetInvestSpent += price;
  const cfg = TIERS_STALL[state.Tier];
  state.Tier += 1;
  state.tierName = cfg.name;
  state.BaseSales = cfg.baseSales;
  state.FixedCost = cfg.fixedCost;
  state.CreditCap = cfg.creditCap;
  state.CapacityBase = cfg.capacity;
  state.RampDays = 3;
  return true;
}

// 附录 G.5 爬坡：换档当刻 RampDays 置 3，第 1/2/3 天 ×0.4 / ×0.6 / ×0.8，第 4 天起 1.0（RampDays 归零）
const RAMP_TABLE = { 3: 0.4, 2: 0.6, 1: 0.8 };
export function rampCoef(state) {
  return RAMP_TABLE[state.RampDays] ?? 1.0;
}
