// 附录 A 条件 DSL：`!` ＞ `&` ＞ `|`，同级左结合，括号覆盖；HAS?id 查设施持有，EVT?id 查事件历史。

function lex(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('()!&|'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    const two = src.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) { tokens.push({ t: two }); i += 2; continue; }
    if (c === '>' || c === '<') { tokens.push({ t: c }); i++; continue; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const m = /^[A-Za-z_][A-Za-z0-9_.?]*/.exec(src.slice(i));
    if (!m) throw new Error(`DSL 非法字符 ${c} @ ${src}`);
    tokens.push({ t: 'id', v: m[0] });
    i += m[0].length;
  }
  return tokens;
}

function parse(src) {
  const tokens = lex(src);
  let p = 0;
  const peek = () => tokens[p];
  const eat = t => { if (!peek() || peek().t !== t) throw new Error(`DSL 期望 ${t} @ ${src}`); return tokens[p++]; };
  function orExpr() {
    let left = andExpr();
    while (peek() && peek().t === '|') { p++; const right = andExpr(); left = { op: '|', left, right }; }
    return left;
  }
  function andExpr() {
    let left = unary();
    while (peek() && peek().t === '&') { p++; const right = unary(); left = { op: '&', left, right }; }
    return left;
  }
  function unary() {
    if (peek() && peek().t === '!') { p++; return { op: '!', right: unary() }; }
    return primary();
  }
  function primary() {
    if (peek() && peek().t === '(') { p++; const e = orExpr(); eat(')'); return e; }
    const node = peek();
    if (!node) throw new Error(`DSL 提前结束 @ ${src}`);
    p++;
    if (node.t === 'id' && (node.v.startsWith('HAS?') || node.v.startsWith('EVT?'))) return { probe: node.v };
    if (node.t === 'id' && (node.v === 'true' || node.v === 'false')) return { lit: node.v === 'true' };
    const opNode = peek();
    if (!opNode || ['|', '&', ')'].includes(opNode.t)) return { var: node.v };
    p++;
    const value = tokens[p++];
    if (!value || (value.t !== 'num' && value.t !== 'id')) throw new Error(`DSL 缺右值 @ ${src}`);
    return { cmp: opNode.t, left: node.v, right: value.t === 'num' ? value.v : value.v };
  }
  const tree = orExpr();
  if (p < tokens.length) throw new Error(`DSL 尾注多余 @ ${src}`);
  return tree;
}

const cache = new Map();
export function evalCondition(src, state) {
  if (!src) return true;
  if (!cache.has(src)) cache.set(src, parse(src));
  return evalNode(cache.get(src), state);
}

function evalNode(node, s) {
  if (node.op) {
    if (node.op === '!') return !evalNode(node.right, s);
    if (node.op === '&') return evalNode(node.left, s) && evalNode(node.right, s);
    if (node.op === '|') return evalNode(node.left, s) || evalNode(node.right, s);
  }
  if (node.lit !== undefined) return node.lit;
  if (node.probe) {
    // "HAS?" / "EVT?" 都是 4 个字符，id 从下标 4 起（不是 5：那样会咬掉 id 首字母）
    const [kind, id] = [node.probe.slice(0, 4), node.probe.slice(4)];
    if (kind === 'HAS?') return s.Facilities.includes(id);
    return s.EventHistory.includes(id);
  }
  if (node.var) return !!readVar(node.var, s);
  const l = readVar(node.left, s);
  const r = typeof node.right === 'number' ? node.right
    : node.right === 'true' ? true : node.right === 'false' ? false : readVar(node.right, s);
  switch (node.cmp) {
    case '>=': return l >= r;
    case '<=': return l <= r;
    case '==': return l === r;
    case '!=': return l !== r;
    case '>': return l > r;
    case '<': return l < r;
    default: throw new Error(`DSL 非法比较 ${node.cmp}`);
  }
}

import { windowOf } from './recent.js';

export function readVar(name, s) {
  if (name === 'FacilityF') return s.F;
  // 附录 E.10 的 `count(Facilities)>=2`：本 DSL 的词法器不认函数调用（附录 A 只定义 `!` `&` `|` `>=`… 与 HAS?/EVT? 两种探针），
  // 故按施工口径落一个只读别名。count 取附录 F.5 的 Facilities 元素个数——JI_SCALE 是器具、不在其中（E.10 约束第 2 条）。
  if (name === 'FacilityCount') return s.Facilities.length;
  // spec-event-pool-6 第 4 / 6 条的「近 3 日」同理：DSL 没有聚合函数，按 FacilityCount 同例落四个只读别名，
  // 门槛数字（<45 / >=65）留在数据行里，别在引擎里再藏一份。
  // 窗口恒含当日那一格（recent.js），所以四个别名不会遇到空数组。
  if (name === 'AvgQ3') { const d = windowOf(s); return d.reduce((x, y) => x + y.q, 0) / d.length; }
  if (name === 'MinQ3') return Math.min(...windowOf(s).map(d => d.q));
  if (name === 'Cheap3') return windowOf(s).some(d => d.cheap);
  if (name === 'AddMore3') return windowOf(s).some(d => d.add);
  // 回声包 content-batch-echo-20261104 的「昨日定价较前日上调」：Orange 给的拟名，按 FacilityCount / AvgQ3 同例落只读别名。
  // 事实源是已结算的 DailyReports（第 12 步滚存；晚间第 10 步抽时最后一格正是昨日），一格都不新存、计数器一个都不新造。
  // 不足两格（第 1–2 天）返回 false：没有「前日」就谈不上上调——不能拿 undefined 当 0 去比，那样第二天就会误判成涨价。
  if (name === 'PriceRaisedYesterday') {
    const r = s.DailyReports;
    if (!Array.isArray(r) || r.length < 2) return false;
    return r[r.length - 1].pricePerJin > r[r.length - 2].pricePerJin;
  }
  return s[name];
}
