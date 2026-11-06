// 特殊事件配音挂载表（挂载单 voice-qc-mount-20261105.md，Orange 签入 e21520c）。
// 台词正本 = 冻结稿 voice-events-script-20261104.md（49 句逐字对齐，谁的声音照稿面声线表）；
// 成品 = public/audio/vo_<事件>_<序号>.ogg 平铺，文件名与稿面「文件」列一字不差。
// 这一层只做「哪几条、按什么顺序、在什么条件下出声」的纯选择：不含数值、不碰 actions/暗线/随机流，
// 也不碰 DOM——能在 node 里直接 import 跑（§七十八那三根回归针钉的就是这一层）。
// 出声与点按推进由 src/ui/audio.js 执行；「缺文件＝静默跳过那一句」也在那一层，
// 所以补录的 vo_poach_02 到位那天不必改这张表：它在表里占着 02 的位置，文件没到就自动被跳过（01→03→04→05）。
// ⇒ 2026-11-06 全覆盖批到货，这一条机制第一次被验证：表里 02 那一行一字未动，文件进仓那天自动接成 01→02→03→04→05。
// 全覆盖批（挂载单 voice-qc-mount-full-20261106.md，Orange 签入 e2a6293）在本表里加三张：
// VOICE_INTRO 加 14 条日常事件 + 4 条晨间情报的出场句；VOICE_RESULT 加六条有原文锚点的结果句；VOICE_REGULAR 是新的一张常客表。
// 纪律照旧：这一层依旧纯选择——不含数值、不碰 actions/暗线/随机流/DOM，两带（sweep / m3）因此必须继续逐字节等于 r16。
import { evalCondition } from '../engine/dsl.js';

// 出场句：按稿面序号排。when 用 DSL 条件式（与 evt_s_return 的 auto_branch 同一支 evalCondition 判，不另起一套口径）；
// 卡片挂载这一刻的 Rep 与 resolveChoice 里 auto_branch 取档那一刻的 Rep 是同一个数（暗线 {R:15} 在取档之后才落），
// 所以「赢档专属」这句在出场时就能定，不必等玩家点。
export const VOICE_INTRO = {
  evt_s_pricewar: [
    { f: 'vo_pricewar_01', who: '旁白' },        // 斜对面连夜换了横幅，字比我家的价目牌还大。
    { f: 'vo_pricewar_02', who: '王老板' },      // 小陈！同料半价，尝过再讲！
    { f: 'vo_pricewar_03', who: '陈实' },        // 王叔，您那「同料」，跟我的「同料」，是一个料吗？
    { f: 'vo_pricewar_04', who: '王老板' },      // 嗨，牌子嘛，写小了谁看得见。
    { f: 'vo_pricewar_05', who: '陈实' },        // 行。那我的牌子也不改——它字小，它站得直。
  ],
  evt_s_return: [
    { f: 'vo_return_01', who: '旁白' },          // 价格战打完那晚，收摊的时候，队伍里多了几张熟脸。
    { f: 'vo_return_02', who: '街坊', when: 'Rep>=50' },                  // （留言·赢档）刷到小刘那帖了，专门绕过来的——真不烧心。
    { f: 'vo_return_03', who: '街坊', when: 'Rep>=30 & Rep<50' },         // （留言·中档）这家好像也没那么干净。
    { f: 'vo_return_04', who: '街坊', when: 'Rep>=50' },                  // （赢档专属）绕了一圈，还是你这口汤对味。
    { f: 'vo_return_05', who: '陈实', when: 'Rep>=50' },                  // （赢档专属）回来就行。秤还是那杆秤。
  ],
  evt_s_poach: [
    { f: 'vo_poach_01', who: '旁白' },            // 对面给小豆开了两倍工钱。消息传到摊上，小豆一声不吭，眼睛只看锅。
    { f: 'vo_poach_02', who: '陈实' },            // 小豆。（11-06 批补录件已到，五句齐全；11-05 单里的「跳过 02」口径按全覆盖单撤销）
    { f: 'vo_poach_03', who: '旁白' },            // 小豆把漏勺攥得更紧了，还是不说话。
    { f: 'vo_poach_04', who: '陈实' },            // 想去，我不拦。想留，咱把账算明白了再干。
    { f: 'vo_poach_05', who: '旁白' },            // 锅里的汤咕嘟一声，替他回答了一半。
  ],
  evt_s_promo: [
    { f: 'vo_promo_01', who: '赵大妈' },          // 都往这边看！认准这辆三轮车！
    { f: 'vo_promo_02', who: '赵大妈' },          // 就这家，秤上没亏过我们。
    { f: 'vo_promo_03', who: '陈实' },            // 大妈，您这嗓门，比我雇的喇叭还响。
    { f: 'vo_promo_04', who: '赵大妈' },          // 喇叭要电费，我这嗓子，管够。
    { f: 'vo_promo_05', who: '旁白' },            // 斜对面，王老板默默把「半价」的牌子往里挪了挪。
    { f: 'vo_promo_06', who: '街坊' },            // （留言）赵大妈那一嗓子把我邻居都叫来了，队伍一下长出一截。
  ],
  evt_s_flag: [
    { f: 'vo_flag_01', who: '学生' },             // 陈哥！锦旗，班里凑钱做的！
    { f: 'vo_flag_02', who: '学生' },             // 味道不敢说，价钱从没坑过我们。
    { f: 'vo_flag_03', who: '陈实' },             // 你们这评语……前半句，能商量商量吗？
    { f: 'vo_flag_04', who: '学生' },             // 不行，这是全班投票的结果。
    { f: 'vo_flag_05', who: '陈实' },             // 行。挂墙上——挨着我家的规矩牌，它俩互相监督。
    { f: 'vo_flag_06', who: '街坊' },             // （留言）门口挂了面锦旗，字比咱家价目牌还大。
  ],
  evt_s_copycat: [
    { f: 'vo_copycat_01', who: '旁白' },          // 一早开摊，斜对面换了新招牌——跟我家的字，就差一笔。
    { f: 'vo_copycat_02', who: '街坊' },          // 诶？这队怎么排到对面去了？
    { f: 'vo_copycat_03', who: '王老板' },        // 来了就是客，站哪队不是吃。
    { f: 'vo_copycat_04', who: '陈实' },          // 王叔，客走错队您不纠正，秤走错了您纠正吗？
    { f: 'vo_copycat_05', who: '王老板' },        // ……小陈，你这嘴，是跟秤学的吧。
  ],
  evt_s_buyout: [
    { f: 'vo_buyout_01', who: '中间人' },         // 陈老板，对面那间铺子，愿意盘给你。
    { f: 'vo_buyout_02', who: '陈实' },           // 盘给我？王老板知道吗？
    { f: 'vo_buyout_03', who: '中间人' },         // 价钱咬死不动，过了这村——
    { f: 'vo_buyout_04', who: '陈实' },           // 名片挺贵吧。这字儿印得，比我规矩牌都讲究。
    { f: 'vo_buyout_05', who: '中间人' },         // 您考虑考虑。
    { f: 'vo_buyout_06', who: '陈实' },           // 放我这儿吧。它得在我锅台边上，先过一遍油烟。
    { f: 'vo_buyout_07', who: '街坊' },           // （留言）听说你要盘对面那间？那以后吃麻辣烫只用排一回队了。
  ],
  // 检查两条：出场只播 01（严队长那句原话就是卡片正文），02 起归判定结果句，见 VOICE_RESULT。
  evt_s_insp: [{ f: 'vo_insp_01', who: '旁白＋严队长' }],     // 严队长带两个人来了，翻开记录本：（严队长）查票。无票的，现在处理。
  evt_s_insp2: [{ f: 'vo_insp2_01', who: '旁白＋严队长' }],   // 严队长路过，掀开盖子看了一眼：（严队长）票据。

  // ── 配音全覆盖批（挂载单 voice-qc-mount-full-20261106，Orange 签入 e2a6293；台词正本 = voice-full-script-20261106.md）──
  // 14 条日常事件：三条晨间（002 / 051 / 052）挂 openShop 的晨间抽卡点，其余十一件随晚间弹层出场，两处都读这一张表。
  // 四条情报（timing:'morning_pre'）也住这张表：drawEvent 按 ev.timing 严格分池（engine/events.js 的 eligible），
  // 晨间抽卡与打烊抽卡两处永远读不到 morning_pre 那四行，所以「挂 newDay 抽取点、当天只播一次」不需要额外的表。
  evt_d_002: [
    { f: 'vo_fine_01', who: '旁白' },              // 严队长站在出线半米的筐旁边，只说三句话：
    { f: 'vo_fine_02', who: '严队长' },            // 摊子出线了。
    { f: 'vo_fine_03', who: '严队长' },            // 规定是规定。
    { f: 'vo_fine_04', who: '严队长' },            // 要么罚，要么改。
  ],
  evt_d_051: [
    { f: 'vo_early_01', who: '旁白' },             // 昨天排到跟前没吃上的那个学生，今儿带着俩同学，提前十分钟就站在摊前等你开火。
  ],
  evt_d_052: [
    { f: 'vo_laoli_01', who: '旁白' },             // 老李今早挑着担子先绕到你摊上：
    { f: 'vo_laoli_02', who: '老李' },             // 昨天见你剩了不少，今儿少拿点？我这担子先过你这儿——下周我那新地先紧着谁，可就不说好了。
  ],
  evt_d_001: [
    { f: 'vo_tab_01', who: '旁白' },               // 赵大妈插队抓了一把串，抹嘴就说
    { f: 'vo_tab_02', who: '赵大妈' },             // 后生，先记到账上。（待重录：本批没到货，按缺文件口径跳过 ⇒ 出场实际播 01→03）
    { f: 'vo_tab_03', who: '旁白' },               // 斜对面王老板抬了下眼皮。
  ],
  evt_d_031: [
    { f: 'vo_banquet_01', who: '旁白' },           // 学生会来订下周社团聚餐的麻辣烫，十五碗，先付定金。
  ],
  evt_d_021: [
    { f: 'vo_tag_01', who: '旁白' },               // 街道的人来挂统一价目牌，要求把用料一张纸写上贴出来。
    { f: 'vo_tag_02', who: '旁白' },               // 你贴不贴，他都记一笔。
  ],
  evt_d_complaint: [
    { f: 'vo_complaint_01', who: '旁白' },         // 两个人摸黑回到摊前，说回去就肚子闹，自己也说不清是不是这碗的事。
  ],
  evt_d_pot: [
    { f: 'vo_pot_01', who: '旁白' },               // 收摊才看见汤锅底下裂了一道纹，白天就一直往下洇水。
  ],
  evt_d_blogger: [
    { f: 'vo_blogger_01', who: '旁白' },           // 小刘举着手机进门，先拍价目牌，又拍你的秤，末了坐下来把一碗粉吃完，没打断。
  ],
  evt_d_043: [
    { f: 'vo_reserve_01', who: '旁白' },           // 周哲领着一队体育生收操路过，问你能不能明儿给他们留八碗——训练完，饿得能吃下一头牛。
  ],
  evt_d_044: [
    { f: 'vo_change_01', who: '旁白' },            // 一个学生攥着零钱回来，说你少找了他五块。
    { f: 'vo_change_02', who: '旁白' },            // 旁边排队的人都停下筷子，看你。
  ],
  evt_d_045: [
    { f: 'vo_chess_01', who: '旁白' },             // 吴爷在你摊边上支了副象棋，围观的比下棋的多。
    { f: 'vo_chess_02', who: '旁白' },             // 有人看饿了，就往你这边挪一步。
  ],
  evt_d_046: [
    { f: 'vo_spoon_01', who: '旁白' },             // 忙到飞起时发现汤勺掉锅里了，捞了三回没捞着，客人们都替你数着。
  ],
  evt_d_053: [
    { f: 'vo_monthly_01', who: '旁白' },           // 赵大妈端着碗没急着走：
    { f: 'vo_monthly_02', who: '赵大妈' },         // 后生，你这价又往上挪了。我吃的不是麻辣烫，是月供。（待重录：同上，出场实际只播 01）
  ],
  evt_d_011: [{ f: 'vo_priceup_01', who: '旁白' }],   // 批发市场门口贴了张手写告示：青菜、丸子，今日涨四成。
  evt_d_stockout: [{ f: 'vo_stockout_01', who: '旁白' }],   // 粉坊机器坏了，明天没粉。
  evt_d_041: [{ f: 'vo_canteen_01', who: '旁白' }],        // 学校食堂今儿检修，窗口贴了张告示：师生请自便。
  evt_d_042: [{ f: 'vo_field_01', who: '旁白' }],          // 菜农老李包了块新地，第一筐菜先紧着老主顾，价比批发低一成。
};

// 结果句：与 inspection.js 判定结果一一对应，键 = 引擎落进 state.today.notes 的那句判定原文（挂载单「按结果原文落点挂」）。
// 认原文而不是认 band，是因为 band='rectify' / 'fine' 分不出「当场开单 / 没凑齐 / 限期整改」这三档——
// 而这三档在 inspection.js 里各有自己的一句 note，逐字与稿面台词同形。限期整改那条在 shortCashMode:'buff' 下是死支，
// 也照样占一格：哪天开关翻过去，句子自动接上，不必再动这张表。
export const VOICE_RESULT = {
  evt_s_insp: [
    { note: '检查合格，严队长的记录本合上了。', f: 'vo_insp_02' },
    { note: '检查整改：罚款 200 当场开单，明天客人少些。', f: 'vo_insp_03' },
    { note: '检查整改：罚款没凑齐，记在明天的客人头上。', f: 'vo_insp_04' },
    { note: '检查整改：限期整改。', f: 'vo_insp_05' },
    { note: '检查不合格：封条贴上摊名了。', f: 'vo_insp_06' },
  ],
  evt_s_insp2: [
    { note: '抽查过了，票据夹里没挑出错。', f: 'vo_insp2_02' },
    { note: '抽查未过：罚款 100 当场入账。', f: 'vo_insp2_03' },
    { note: '抽查未过、罚款没凑齐：严队长摆摆手，明天客人少些。', f: 'vo_insp2_04' },
  ],
  // ── 配音全覆盖批的结果句：只登记「引擎里确有这句原文」的六条 ──────────────────────────
  // 键 = events.js 那条选项 open[] 里的 forcedComment 原文（逐字，引号种类照数据），落点见 main.js 两支调用。
  // 冻结稿里另外 18 句带 ★ 的新写结果句，数据里没有任何一句原文可认（那些选项的 open[] 只有数值），
  // 按单上「不许按固定顺序猜」就不挂——已在总报里登记为待裁，Orange 补原文或改口径那天，照下面的形加行即可。
  evt_d_051: [
    { note: '他耸耸肩排到队尾去了，倒也没走。', f: 'vo_early_03' },                 // 选项「排队都一样」
  ],
  evt_d_052: [
    // 这两句录的是引号里老李的原话，数据里落的是「旁白＋引语」整条 forcedComment：键按整条认，出声只有引号那一截。
    { note: '老李把新菜往你这边又推了推：『少拿点好，菜这东西，新鲜才值钱。』', f: 'vo_laoli_03' },   // 选项「少拿点」
    { note: '老李把担子一挑：「成，是个过日子的。」', f: 'vo_laoli_04' },                        // 选项「照常拿」
  ],
  evt_d_complaint: [
    { note: '他收了东西，走的时候说了句"下回注意点"。', f: 'vo_complaint_02' },      // 选项「赔礼道歉」
  ],
  evt_d_044: [
    { note: '他数了数，又数了数，不好意思地把钱收回去了。', f: 'vo_change_04' },      // 选项「请他看价目牌」
  ],
  evt_d_053: [
    { note: '赵大妈把碗一放：「行，你有规矩。」——听不出是夸还是损。', f: 'vo_monthly_04' },   // 选项「规矩不能动」
  ],
};

// 常客拍点句（全覆盖单第五节：15 句 = 三条线 × 五拍）。键 = customers.js 的 REGULAR_LINES 那一行原文，
// 与冻结稿「台词」列逐字同形 ⇒ 认的是文本本身，不认拍次序号：哪天台词挪了位置，句子跟着文本走，不会串到别拍。
export const VOICE_REGULAR = {
  c01: [
    { note: '从自习室逃出来一趟，脑门上还记着没背完的那页。', f: 'vo_c01_01' },
    { note: '剩的书不多了，先来一碗顶着，回去接着啃。', f: 'vo_c01_02' },
    { note: '等考完那趟我要连着来三天，你把汤给我留着。', f: 'vo_c01_03' },
    { note: '考完了！睡了一天一夜，醒来就惦记你这碗。', f: 'vo_c01_04' },
    { note: '成绩还没出，但我这人先过关了——汤给我加满。', f: 'vo_c01_05' },
  ],
  c02: [
    { note: '上线推到今晚了，我这顿也算在公司门口解决。', f: 'vo_c02_01' },
    { note: '我们组今儿来了三个，碗都在你这儿拼的。', f: 'vo_c02_02' },
    { note: '工位上那袋餐盒是你家的，他们说比食堂近。', f: 'vo_c02_03' },
    { note: '项目上线了，今晚不用通宵，我慢慢吃。', f: 'vo_c02_04' },
    { note: '我把你家写进我们组的外卖清单了，第一行，标了星。', f: 'vo_c02_05' },
  ],
  c03: [
    { note: '孙子今儿没跟来，我替他尝一口，回去给他带一份。', f: 'vo_c03_01' },
    { note: '他妈说别老吃外头的，可他嘴里就认你家这一口。', f: 'vo_c03_02' },
    { note: '天凉了，我让他穿厚点再来，顺手多带个盒。', f: 'vo_c03_03' },
    { note: '今儿孙子自己来的，点单点得比我还熟。', f: 'vo_c03_04' },
    { note: '他说等他挣钱了，天天请我吃你家的。', f: 'vo_c03_05' },
  ],
};

// 卡片挂载这一刻该出声的句序（缺省条件一律播；带 when 的走 evalCondition，与引擎同判）
export function voiceIntroLines(id, state) {
  const lines = VOICE_INTRO[id];
  if (!lines) return [];
  return lines.filter(l => !l.when || evalCondition(l.when, state)).map(l => l.f);
}

// 判定落地之后该出声的结果句：只在今天那条判定原文里认，认不出就当没这句（不许报错、不许猜档）
export function voiceResultLines(id, notes) {
  const map = VOICE_RESULT[id];
  if (!map || !Array.isArray(notes)) return [];
  return map.filter(m => notes.includes(m.note)).map(m => m.f);
}

// 结果句的查找集合（全覆盖单 6.3：notes + forcedComments 合并原文）。两个数组都是引擎现成落点——
// dayNote 进 notes（engine/events.js:133）、forcedComment 进 forcedComments（:135）——这里只读不写，一个字都不落回 state。
export function resultTexts(state) {
  const t = state && state.today;
  if (!t) return [];
  return [...(t.notes || []), ...(t.forcedComments || [])];
}

// 常客拍点句：这一位今天屏幕上那行灰字，对上表里哪一句就出声哪一句；对不上（含 c04 那种留空的线）＝没这句。
export function voiceRegularLines(customerId, lineText) {
  const map = VOICE_REGULAR[customerId];
  if (!map || !lineText) return [];
  return map.filter(m => m.note === lineText).map(m => m.f);
}
