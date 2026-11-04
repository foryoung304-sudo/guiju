# 回声包（Orange）：昨日回声事件 ×3 —— 并入文案批 content-batch-text-20261104（店主 2026-11-04 批）

## 口径

- 目的只有一个：让玩家亲眼看见「昨天的行为 → 今天找上门」的因果，治系统无耦合的体感。
- condition 里的信号名是**语义占位**（YesterdaySoldOut / YesterdayWasteHigh / PriceRaisedYesterday）：Yellow 负责映射到现成信号（结算日报/状态里已有的售罄、损耗、价格记录）；**映射不上的回报 Orange，不许新造计数器**。
- 回声要可靠：触发条件成立时权重压高（18–20），别让玩家攒了因却等不到果；冷却 2–3 天防连刷。
- 效果量级照文案批总口径；二段连锁（如「再断货就翻脸」）本批不做，靠留言池现有 soldout 句承接，明写在此防误解。

## 三条

**evt_d_051 蹲点的**（回声·售罄）motion: person｜timing: morning｜weight 20｜condition: 昨日售罄（拟名 YesterdaySoldOut）｜cooldown 3
text：昨天排到跟前没吃上的那个学生，今儿带着俩同学，提前十分钟就站在摊前等你开火。
actions：
- 先给他们下：open [{ eventDemandMult: 1.15 }]，hidden [{ Rep: 1 }]（他们还会招呼路人）
- 排队都一样：open [{ forcedComment: '他耸耸肩排到队尾去了，倒也没走。' }]（规矩脸本脸）

**evt_d_052 老李减量**（回声·损耗）motion: person｜timing: morning｜weight 18｜condition: 昨日损耗偏高（拟名 YesterdayWasteHigh，阈值 Yellow 按日报数据定）｜cooldown 3
text：老李今早挑着担子先绕到你摊上：「昨天见你剩了不少，今儿少拿点？我按老主顾价再让半成——下周我那新地先紧着谁，可就不好说了。」
actions：
- 少拿点：open [{ priceMultToday: { cats: ['VG', 'BF'], mult: 0.95 } }]（「下周紧别人」是话术逗子，不落机制，明记）
- 照常拿：open [{ forcedComment: '老李把担子一挑：「成，是个过日子的。」' }]，hidden [{ Rep: 1 }]

**evt_d_053 月供**（回声·涨价）motion: person｜timing: evening｜weight 18｜condition: 昨日定价较前日上调（拟名 PriceRaisedYesterday）｜cooldown 3
text：赵大妈端着碗没急着走：「后生，你这价又往上挪了。我吃的不是麻辣烫，是月供。」
actions：
- 这碗算我的：open [{ cash: -1200 }]，hidden [{ Rep: 2 }]
- 规矩不能动：open [{ nextDayTrafficMult: 0.95 }, { forcedComment: '赵大妈把碗一放：「行，你有规矩。」——听不出是夸还是损。' }]

## 接入

与文案批同批挂载、同批回归；三条信号映射结果逐条回报（映射到哪个现成字段/日报格），映射不上的一条不许硬凑，退回 Orange 改文案绕开。
