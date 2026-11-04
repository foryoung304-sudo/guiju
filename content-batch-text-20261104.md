# 文案批（Orange）：上线前补肉——日常事件 +6 / 常客弧收尾 / 留言池扩容（店主 2026-11-04 批）

## 总口径

- 纯文案批：不新造系统、不动已签数值带。事件的效果量级全部压在现有先例带内（现金 −5…−260、Rep ±1…5、Risk +4…8、客流乘数 0.85–1.25、d0Buff ×1.10–1.15）。
- 压力后置照旧：坏事 condition 一律 Day>=3 起。
- 本表数值字段为 Orange 拟值；Yellow 对池平衡与 DSL 合法性后可微调 weight/cooldown，**效果量级不许超带**；某 op 与 timing 不合时换等价通道并回报，不许静默删效果。
- 本批入池后 sweep/m3 预期漂移：照裁定一先例处置——量漂移、写因、结局可达性翻类停手再报。

## 一、日常事件 +6（拟入 events.js，pool:'daily'，ship 标本批）

**evt_d_041 食堂检修**（好事）motion: good｜timing: morning_pre｜weight 6｜condition: Day>=6｜cooldown 12
text：学校食堂今儿检修，窗口贴了张告示：师生请自便。
open：[{ eventDemandMult: 1.25 }]（当日客流，情报条呈现）

**evt_d_042 菜农直供**（中性）motion: calm｜timing: morning_pre｜weight 7｜condition: Day>=4｜cooldown 8
text：菜农老李包了块新地，第一筐菜先紧着老主顾，价比批发低一成。
open：[{ priceMultToday: { cats: ['VG'], mult: 0.9 } }]（与 evt_d_011 涨价条镜像，一涨一跌）

**evt_d_043 体育生包圆**（好事）motion: person｜timing: evening｜weight 6｜condition: Day>=4｜cooldown 10
text：周哲领着一队体育生收操路过，问你能不能明儿给他们留八碗——训练完，饿得能吃下一头牛。
actions：
- 留八碗：open [{ deposit: { bowls: 8, rate: 0.2 } }, { reserveBowls: 8 }]，hidden [{ Rep: 1, when: 'reserve_delivered' }, { Rep: -1, when: 'reserve_partial' }]（照 evt_d_031 同构）
- 接不下：无效果

**evt_d_044 找错钱**（中性）motion: calm｜timing: evening｜weight 7｜condition: Day>=3｜cooldown 7
text：一个学生攥着零钱回来，说你少找了他五块。旁边排队的人都停下筷子，看你。
actions：
- 补给他：open [{ cash: -500 }]，hidden [{ Rep: 2 }]
- 请他看价目牌：open [{ forcedComment: '他数了数，又数了数，不好意思地把钱收回去了。' }]

**evt_d_045 吴爷摆棋**（中性）motion: person｜timing: evening｜weight 6｜condition: Day>=5｜cooldown 9
text：吴爷在你摊边上支了副象棋，围观的比下棋的多。有人看饿了，就往你这边挪一步。
actions：
- 由他摆：open [{ nextDayTrafficMult: 1.10 }]
- 劝他挪挪：无效果

**evt_d_046 汤勺失踪**（坏事·轻）motion: bad｜timing: evening｜weight 5｜condition: Day>=3｜cooldown 9
text：忙到飞起时发现汤勺掉锅里了，捞了三回没捞着，客人们都替你数着。
actions：
- 买把新的（−12）：gate afford，open [{ cash: -1200 }]
- 消毒将就：hidden [{ Risk: 4 }]

入池后日常池 15 条：坏 6 / 好 4 / 中 5（原 9 条为坏 5 / 好 2 / 中 2，本批专补好与中）。

## 二、常客线收尾（customers.js REGULAR_LINES 追加，纯数组、零代码改动）

现状：c01–c03 各 3 句近况，regularLine 到顶钳在最后一句。本批给每人补第 4、5 拍（转 + 合），让三条线有头有尾；c04 毕老师按已签口径留空，首更补，不在本批。

- **c01 郑磊**（备考线）：
  4.「考完了！睡了一天一夜，醒来就惦记你这碗。」
  5.「成绩还没出，但我这人先过关了——汤给我加满。」
- **c02 何秀**（加班线）：
  4.「项目上线了，今晚不用通宵，我慢慢吃。」
  5.「我把你家写进我们组的外卖清单了，第一行，标了星。」
- **c03 孙奶奶**（带饭线）：
  4.「今儿孙子自己来的，点单点得比我还熟。」
  5.「他说等他挣钱了，天天请我吃你家的。」

合规照 §九：不写具体年龄年级、无自伤表述、无道德标签提问。

## 三、留言池扩容（comments.js 各池追加，守文件头硬规范）

- qualityGood +2：「丸子一咬就弹牙，我跟室友打赌，输了都认。」／「这汤鲜得不讲理，我是端着碗喝完的。」
- qualityBad +2：「今儿这碗吃着有点飘，像没睡醒。」／「回去路上肚子咕噜了一阵，说不上来。」（暧昧归因，不指认）
- qualityMid +2：「中规中矩，填饱肚子没问题。」／「跟昨天一个味，稳。」
- taste +2：「辣度刚好卡在我出汗的边上。」／「麻得嘴唇直跳舞，跳完还想再来一碗。」
- portion +2：「秤星我盯着呢，你没手抖。」／「这碗沉，端着就有底气。」
- price +2：「比上学期贵了点，但我还在吃，你细品。」／「这价钱还能陪我到毕业，够意思。」
- soldout +1：「我掐着点来的还是没了，你家是不是藏着一半菜单？」
- packing +1：「盒子到宿舍还是热的，盖子这次跟我很熟。」（呼应池内旧句）
- regular +2：「老板，我的口味你比我妈记得都清。」／「毕业前我得把菜单吃个遍，还剩两样。」
- rumor +2：「街口那家新来的，排队的人都走到你家队尾了。」／「有人把你家价目牌拍下来发群里了，配文就俩字：良心。」
- weather +1：「天一凉，你这摊跟被窝一样有号召力。」

合计 +19 句，池总量约翻倍，重播感主要靠这批压。

## 四、给 Yellow 的接入要点

落点：events.js 追加 6 行（motion 按文件头规则已标）、customers.js 三个数组各 +2、comments.js 各池 +句。回归针：新 id 在场 + REGULAR_LINES 长度 5 + 留言池计数。SAVE_VERSION 不动。四道门照旧，sweep/m3 漂移按总口径办。
