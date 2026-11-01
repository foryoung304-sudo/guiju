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

export function readVar(name, s) {
  if (name === 'FacilityF') return s.F;
  // 附录 E.10 的 `count(Facilities)>=2`：本 DSL 的词法器不认函数调用（附录 A 只定义 `!` `&` `|` `>=`… 与 HAS?/EVT? 两种探针），
  // 故按施工口径落一个只读别名。count 取附录 F.5 的 Facilities 元素个数——JI_SCALE 是器具、不在其中（E.10 约束第 2 条）。
  if (name === 'FacilityCount') return s.Facilities.length;
  return s[name];
}
