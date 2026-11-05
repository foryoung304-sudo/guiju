// 特殊事件配音挂载表（挂载单 voice-qc-mount-20261105.md，Orange 签入 e21520c）。
// 台词正本 = 冻结稿 voice-events-script-20261104.md（49 句逐字对齐，谁的声音照稿面声线表）；
// 成品 = public/audio/vo_<事件>_<序号>.ogg 平铺，文件名与稿面「文件」列一字不差。
// 这一层只做「哪几条、按什么顺序、在什么条件下出声」的纯选择：不含数值、不碰 actions/暗线/随机流，
// 也不碰 DOM——能在 node 里直接 import 跑（§七十八那三根回归针钉的就是这一层）。
// 出声与点按推进由 src/ui/audio.js 执行；「缺文件＝静默跳过那一句」也在那一层，
// 所以补录的 vo_poach_02 到位那天不必改这张表：它在表里占着 02 的位置，文件没到就自动被跳过（01→03→04→05）。
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
    { f: 'vo_poach_02', who: '陈实' },            // 小豆。（补录句中：文件没到就按挂载单的缺文件口径跳过，01→03→04→05）
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
