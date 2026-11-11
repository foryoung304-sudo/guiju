# 甲组四条读码结论 · 入仓正本（2026-11-11）

授权：`guiju-playtest-fixbatch-addendum-20261110.md` 裁定 12（Orange 2026-11-11 签收时下达）——
「甲组四条结论原文目前只在对话里——本批内把结论落成仓内文件或 delta 登记节，结论是后续裁定的依据，不许只活在聊天记录里。
若入仓结论与第 9–11 条所依据的事实不符，对应裁定自动重开、先停手回报。」

落法：下面「一」节是 2026-11-10 甲组只读回报的**原文逐字入仓**（含当时的行号与链接，一律不追改——行号是那个时点的坐标，
追改就等于把历史读数改成今天的读数）。「二」节是入仓时点的**时点注记与订正**，与原文分开摆，谁也不覆盖谁。
裁定 9／10／11 所依据的事实逐条核对结果在「三」节。

---

## 一、原文（2026-11-10 甲组只读回报，逐字未改）

甲组四条读码结论（只读，未提交、未改任何数）：

### 甲0 版本标注 — 既不是渲染滞后，也不是线上包错版，是**两根不同的轴**

- 屏上那行唯一渲染点：[main.js:1262](file:///E:/taptap/guiju/game/src/ui/main.js#L1262)「规则版本 `${SAVE_VERSION}`」，值来自 [constants.js:3](file:///E:/taptap/guiju/game/src/data/constants.js#L3) `= 'v4.9.3-cal.2'`。
- 这个字段是**存档兼容键**，不是正文版号：[state.js:13](file:///E:/taptap/guiju/game/src/engine/state.js#L13) 写入、[state.js:151](file:///E:/taptap/guiju/game/src/engine/state.js#L151) 载入闸（不等且不在 `MIGRATABLE_SAVE_VERSIONS` 就拒载）、[state.js:202](file:///E:/taptap/guiju/game/src/engine/state.js#L202) 迁移后升版；[test_regression.js:359](file:///E:/taptap/guiju/game/test_regression.js#L359) 有针钉着。
- 正本标题本身就是 v4.9.3：[design-doc-v4.9.2.md:1](file:///E:/taptap/guiju/design-doc-v4.9.2.md#L1)「完整策划案 **v4.9.3**」。「v4.9.4」是**字面同步批的批名**（[signoff-r14-adoption-20261101.md:15](file:///E:/taptap/guiju/signoff-r14-adoption-20261101.md#L15)、[signoff-v494-text-items-20261102.md:1](file:///E:/taptap/guiju/signoff-v494-text-items-20261102.md#L1)），落法是 append-only 注记，标题没升。
- 历史上文案批明确不跟版号：`f359a31`「SAVE_VERSION没跟(本批只改文案一格)」、`8d78f15`「SAVE_VERSION一字未动(v4.9.3-cal.2)」。
- **结论**：标注没错、包也没错。要让它显示 v4.9.4 就得动存档兼容键（老档会拒载或走迁移），那是结构改动，不在本单授权内 ⇒ 只回报，不改判、不改标注。

### 甲1 汤底耗量 — 按碗 × T 份；`soupSoldOut` 是**上限触顶**不是物理见底

| 问 | 读码结论 | 出处 |
|---|---|---|
| ①怎么耗 | 每碗 **T 份**，无「按克」、无锅损一格 | [ops.js:160](file:///E:/taptap/guiju/game/src/engine/ops.js#L160) `takeStock(state,'SP', Math.min(state.StockSoup, bowls*sc.T), consumed)` |
| ①T 取值 | **只取天气段**：晴/阴 1.0、雨 1.4、高温 0.8 | [scenario.js:54](file:///E:/taptap/guiju/game/src/data/scenario.js#L54) `T: weather.T` |
| ①`soupSoldOut` | `D_eff = min(D, StockSoup/T × soupHalf)`，`D_eff < D` 即置真 ⇒ **可售上限触顶**；柜里可能还剩汤（实扣只到 `bowls×T`） | [ops.js:57-59](file:///E:/taptap/guiju/game/src/engine/ops.js#L57) |
| ②界面口径 | 按**份**公示，且 T 已可见：汤底行「柜里 N 份 · 每碗耗 T 份」 | [main.js:1527](file:///E:/taptap/guiju/game/src/ui/main.js#L1527)；SKU 单位「份」[skus.js:37-40](file:///E:/taptap/guiju/game/src/data/skus.js#L37) |
| ③拿盆将就次日 ×0.5 | **次日屏零公示**：`soupHalf` 在整个 `src/ui/` 零命中；[day.js:323](file:///E:/taptap/guiju/game/src/engine/day.js#L323) 只把它写进日报快照，界面没读。卡面也只有「拿盆将就」四个字 | [events.js:419](file:///E:/taptap/guiju/game/src/data/events.js#L419) |

顺手发现一处**死字段**（不改，只登记）：`CALENDAR.holiday.T = 0.8`（[scenario.js:13](file:///E:/taptap/guiju/game/src/data/scenario.js#L13)）从来没被读过，`scenarioOf` 只取 `weather.T`。假期汤底耗量按天气走，不按校历走。

⇒ 丙8 会在**选择当场**补上「明儿汤底只能出一半的碗」这一句；**次日屏是否也要公示**属新增需求，待裁定，本单不顺手加。

### 甲2 赵大妈「记账」−54 但欠款 0.00 — **设计上就没有顾客应收**，不是写入断链

- 分支本体：[events.js:38-40](file:///E:/taptap/guiju/game/src/data/events.js#L38) `record → open:[{cash:-5400}], hidden:[]`；`settle_now → open:[{nextDayTrafficMult:0.85}]`。
- 全 `src/` 对 `receivable / 应收 / 顾客欠 / CustomerDebt` **零命中** ⇒ 引擎没有这一格。顶栏「欠款」读的是 `state.DebtSupplier`（[main.js:222](file:///E:/taptap/guiju/game/src/ui/main.js#L222)），只记供应商货款。
- **结论**：现金 −54 是真账（事件账即时扣），欠款 0.00 也是真账（没有应收系统）。缺陷在**文案**：卡面「先记到账上」＋按钮「记账」让玩家以为会挂一笔欠款。属改词不改账，归丙组/待裁，甲组只定性。

### 甲3 需求规模 — 旧口径「约 90 碗/天」错在把 **BaseSales 输入值当成碗数**

主公式 [ops.js:26-27](file:///E:/taptap/guiju/game/src/engine/ops.js#L26)：
`D0 = BaseSales × ramp × trafficTotal × priceCoef × (0.75+Rep×0.005) × F × next_day_traffic_mult × d0_buff_mult`
之后 [ops.js:49-60](file:///E:/taptap/guiju/game/src/engine/ops.js#L49)：`D_pre = D0×S + 熟客N_R_want + event_reserve_bowls + 试吃转化` → `D = D_pre×event_demand_mult` → **汤底封顶** `D_eff = min(D, StockSoup/T×soupHalf)` → **产能截断**（斤/日）→ [ops.js:159](file:///E:/taptap/guiju/game/src/engine/ops.js#L159) `bowls = roundJin(J_solid/avgJin)`。

| 档位 | BaseSales 输入 | 关键乘子（平日稳态） | 折算碗数区间（D0） |
|---|---|---|---|
| 三轮车 | 90 | ramp 1.0（首 3 天 0.4/0.6/0.8）· traffic 1.0（开学 1.3 / 雨 0.9）· 亲民 1.15 · F 1.0 · 口碑项 0.85→1.25 · avgJin 1.0 | **94–110**（爬坡期 41–95） |
| 二手餐车 | 180 | 同上 | 186–211 |
| 固定摊位 | 320 | 同上 | 330–368 |
| 后门档口 | 550 | 同上 | 563–619 |
| 小吃街门面 | 900 | 同上 | 921–1013 |
| 整街双店 | 1500 | 同上（终点档） | 1535–1689 |

我自己复核了算式：`90×1.15×0.85 = 88.0`（Rep 20）、`×1.0 = 103.5`（Rep 50）、`×1.25 = 129.4`（Rep 100）⇒ 表里 94–110 对应 Rep 30–62 的实测漂移带，量级成立。`TIERS_STALL` 实为 **6 档**（5 个升级价＋终点双店），单上「五档」按升级价数。

**旧口径错在哪一句**：正文**没有**逐字「约 90 碗/天」。源头是 [reanchor-spec-20261031.md:6](file:///E:/taptap/guiju/reanchor-spec-20261031.md#L6)「目标体量（**斤/日 ≈ 碗/日**）：开局首日 40–50、三轮车**稳态 90–120**」＋ [final-calibration-20261031.md:10](file:///E:/taptap/guiju/final-calibration-20261031.md#L10) 的 BaseSales 输入 `90/180/320/550/900/1500`（**无「碗」单位**）被口头读成「每天约 90 碗」，丢了 ramp、定价系数、口碑项与篮子/汤底/现金截断。[design-doc-v4.9.2.md:137](file:///E:/taptap/guiju/design-doc-v4.9.2.md#L137) 自己也把「基础销量 90 × 开学周 1.3 × 爬坡首日 0.4 ≈ 46.8」直接当碗算——那是**首日满篮近似**，不是日常口径。

**店主实测 9–32 碗＝被截断后的实卖，不是需求**：需求 D0 爬坡期 41–95、稳态 94–110；实卖被汤底份数（D1 买 16 份 → 封顶 16 碗）、产能与现金夹到 9–32。两者不是一个量，**公式没错，旧口径那句话错**。正文冻结，未改一字。

---

甲组结案。乙5 里与甲1 相撞的那一小块（`basketSupply` 是否吃 `soupHalf ×0.5` 与情境 T）现在解锁，我接着做丙8。

---

## 二、入仓时点的时点注记与订正（2026-11-11，Yellow；原文一字未动，注记另摆）

原文里的行号是 2026-11-10 甲组读码那一刻的坐标。此后 §一百零四（乙5，`01bf633`）与 §一百零五（丙组，`5cfffeb`）
两批已落地，下面三处坐标或事实随之移动。**不追改原文**，只在这里对照：

| 原文那一处 | 甲组时点（2026-11-10） | 入仓时点（2026-11-11 HEAD） | 性质 |
| --- | --- | --- | --- |
| 甲0「屏上那行唯一渲染点 main.js:1262」 | `main.js:1262` | `main.js:1281`（丙组加了升档二次确认等件，行号下移） | 坐标移动，事实不变 |
| 甲0「要让它显示 v4.9.4 就得动存档兼容键」 | 当时界面只有 `SAVE_VERSION` 一个来源，该推论成立 | **裁定 9 已另立独立展示串** `DISPLAY_VERSION = 'v4.9.4'`（`constants.js`），界面改读它，`SAVE_VERSION` 一字未动 ⇒ 该推论的前提（只有一个来源）已被裁定拆掉 | **订正**：不是事实不符，是裁定新增了一条机制。依据＝裁定 9 本身 |
| 甲1③「次日屏零公示：`soupHalf` 在整个 `src/ui/` 零命中」 | 成立 | **已不成立**：§一百零四 乙5 在 `main.js` 试算面板补了「昨晚拿盆将就了：今儿汤底只能出一半的碗…」那一行；§一百零五 丙8 在 `choice-note.js:42` 补了当场那一行「明儿汤底只能出一半的碗」 | **时点差**：甲组读码在前、乙5/丙8 落地在后。裁定 10 的要求（双公示扩到全部次日惩罚）因此是**延伸**而非补空白，本批照落 |

甲1 顺手登记的那处死字段（`CALENDAR.holiday.T = 0.8` 从未被读）在 HEAD 仍然成立，本批未动、继续挂着。
甲3 的六档折算表与「公式没错、旧口径那句话错」的定性在 HEAD 仍然成立（`ops.js` 主公式与 `TIERS_STALL` 六档一字未动）。

## 三、裁定 12 的自动重开条件逐条核对

裁定 12：「若入仓结论与第 9–11 条所依据的事实不符，对应裁定自动重开、先停手回报。」逐条核：

- **裁定 9（版本标注）**所依据的事实＝`SAVE_VERSION` 是冻结的存档兼容键、界面版本标注读的是它。
  甲0 原文逐条证实（`state.js:13/151/202` 三处用途 + 渲染点）。入仓时点复核：`SAVE_VERSION` 仍为 `'v4.9.3-cal.2'`，
  `state.js` 那三处用途未动，既有三枚针（`test_regression.js:360 / :2568` 等）仍钉着原值。**无不符 ⇒ 不重开。**
  甲0 那句「就得动存档兼容键」是**推论**不是事实，且已被裁定 9 的新机制取代，按「二」节订正登记。
- **裁定 10（次日双公示）**所依据的事实＝次日生效的惩罚在次日屏上看不见。甲1③ 原文与这个前提**一致**（都指零公示），
  两者之间无不符 ⇒ **不重开**。HEAD 上 `soupHalf` 已有两处公示，是甲组读码之后由乙5/丙8 补的（「二」节已注记时点差）；
  裁定 10 把双公示扩到全部次日惩罚，本批按字面落地。
- **裁定 11（「记账」改词）**所依据的事实＝引擎没有顾客应收这一格、现金 −54 是真账、缺陷在文案。
  甲2 原文证实，入仓时点复核：全 `src/` 对 `receivable / 应收 / 顾客欠 / CustomerDebt` 仍零命中，
  `evt_d_001` 两支 `open` 逐字未动（`record → cash −5400`、`settle_now → nextDayTrafficMult 0.85`），
  顶栏「欠款」仍读 `state.DebtSupplier`。**无不符 ⇒ 不重开。**
  但入仓时点新查出一条原文没记的约束：这一事件的**结果文案只活在配音里**（`vo_tab_04`「账本上多了一行：赵大妈，串一把，五十四…」），
  出场那句「后生，先记到账上」也已录成 `vo_tab_02`（11-08 到货），两件都在 sha 台账与冻结稿里钉着。
  改词因此不是纯文本改动 ⇒ 按裁定 11 自己的流程走「Yellow 拟稿、回报附改前改后全文、店主一眼回签」，
  本批**只拟稿不落地**，配音重录与冻结稿改字的授权另请。拟稿全文见 delta §一百零七。