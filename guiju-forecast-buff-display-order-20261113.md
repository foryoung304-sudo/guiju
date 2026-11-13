# 试算提振显示单（2026-11-13 夜 · Orange 读码定罪后下单，店主已拍板「修」）

## 背景与定罪依据

二局公网代打（70 天）走查发现：提振生效日（小刘视频、吴爷下棋、赵大妈宣传队等）试算明显偏离实卖。Orange 亲读代码定罪：

- 结算 `engine/ops.js` 的 D0 乘了 `state.d0_buff_mult`（数日型提振/余波，附录 E.10 合并规则，量级约 ±15%）；
- 试算 `engine/ledger.js` 全文不读 `d0_buff`——标准式（ratioEst / baseEst）与显示式（displayEstBowls）均无此项。
- 后果：提振窗口**首日**显示低估（玩家少备货）、**末日**高估且链上无法点名拉低项；`nextDayNotes` 对 d0<1 的「已经算进去了」在窗口首日并不成立（持续期靠昨日实卖锚带入、大致成立）。

## 裁定：标准侧冻结，只修显示层

- `estBowls` / `ratioEst` / `baseEst` **逐字不动**——sim、两带与既有针的口径不许漂。
- 修法照显示层既有先例（案 1 地板、乙 5、补条事件乘数）：只动 display 一侧与链上文案，判定与结算零触碰。

## 改动面（只许这四处，多一处即越界）

1. **engine/ops.js**：在 D0 落数处旁加一行被动记录 `t.d0Buff = state.d0_buff_mult;`（与 `t.rampCoef = ramp` 同性质：只记录当日第 7 步实际所乘之值，不参与任何计算；D0 公式逐字不动）。注意 ops 内第 7 步会递减天数并在到期时把 mult 归 1——记录的必须是**归 1 之前**的值。
2. **engine/day.js**：第 12 步存档字段滚动处（`YesterdayD0` 同段）加 `state.YesterdayD0Buff = state.today.d0Buff ?? 1;`。新字段在老档缺省 1（按既有 Yesterday* 字段的缺省惯例落读档处），**SAVE_VERSION 不动**。
3. **engine/ledger.js**（`forecastBasket` 显示侧）：
   - `buffToday = state.d0_buff_mult || 1`；ratioForm 时 `buffDelta = buffToday / (state.YesterdayD0Buff || 1)`，非 ratioForm 时 `buffDelta = buffToday`。
   - `displayEstBowls` 在现有计算（灾难门地板 / 卖断托底的取舍）**完成之后**乘 `buffDelta`；灾难门判定仍用未乘的原值，不许动判定顺序与口径。
   - `displayDemand = displayEstBowls + reserveBowls` 结构不变——buff 只乘估算分量、不乘预定（与结算同构：ops 里 buff 只乘 D0，不乘预定与熟客层）。
   - `parts` 增 `buff: buffDelta`（只读派生，供界面翻人话；乘数原值不进界面，沿全界面零系数红线）。
   - 标准返回（estBowls / standard.*）逐值不变。
4. **ui/forecast-chain.js**：
   - `PULL_TALK` 增 `buff: '提振的劲儿过了'`；`PULL_ORDER` 在 `nextDay` 之后、`event` 之前插入 `'buff'`。
   - bonus 段：`parts.buff > 1` 时加一句 `提振的劲儿还在`（与事件加成 / 预定同段并列，沿既有 join 格式）。
   - `nextDayNotes`：d0_buff<1 那句先核对新口径（修后窗口首日靠 delta、持续期靠锚，两段都已算入，原句应成立）；若实现中发现仍对不上，在回报里写明，**不许自行改词**。
   - 文案两句（`提振的劲儿还在` / `提振的劲儿过了`）为 Orange 定稿，照落，不许改字。

## 针单（新增针，逐条可复现，不许空跑）

1. 提振首日（昨 buff=1、今 1.15）：display.estBowls = 原显示值 ×1.15（浮点尾差除外）；同条件标准 estBowls 逐值不变。
2. 提振持续日（昨=今=1.15）：buffDelta=1，display 与原口径逐值一致。
3. 提振末日（昨 1.15、今 1）：display = 原显示值 ÷1.15；且 display < 昨日实卖时，链文本点名含「提振的劲儿过了」。
4. 余波侧（buff 0.85）首日 / 末日同构各一针。
5. 非 ratioForm（首日 / 无昨日）且 buff 生效：display = baseEst 显示值 ×buffToday。
6. 老档（存档内无 YesterdayD0Buff 字段）读入不炸，buff 按昨=1 处理。
7. 记录针：第 7 步后 `state.today.d0Buff` 等于当日 D0 实际所乘之值——含窗口末日情形（当日仍乘 1.15、步内 mult 已归 1，记录必须是 1.15）。
8. 链文案针：buff 首日链 bonus 段含「提振的劲儿还在」；持续日链上不出现该句（delta=1 不许误报）。
9. **两带 diff 0**、全针绿；针数增量对现行基线（640 针 / r17）如实登记。

## 护栏

- 不碰结算公式、事件数据、价格、金额、结局判定、SAVE_VERSION；不碰 sim 对 estBowls 的读取。
- dist 构建后**不许自行发布**：落地回报 → Orange 读仓验收 → 店主点头才发版。

## 回报格式

逐条对针单报绿/红、针数前后、两带结果、dist 指纹；另附提振窗口三日（首 / 中 / 末）试算面板链文本各一行（逐字抄屏上那条链）。
