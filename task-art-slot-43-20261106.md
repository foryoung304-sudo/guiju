# 工单：事件图槽改 4:3 + B 档 18 张新图接入（task-art-slot-43-20261106）

下单：Orange，2026-11-06。店主已裁定：图槽改高（4:3）、新图按 4:3 出、画风锚 = 库内主流平涂风（参照 business / event-002 / event-zhaodama / event-wang-poach；event-031 的细密画风是异类，不许当锚）。
素材状态：Orange 已出 4 张样张并经店主签（early / promo / monthly / pot），其余 14 张批量生产中；全批齐后压包经店主转交 zip，本单在素材到手后执行。

## 一、图槽改比例（呈现层）

- `.event .art`（theme.css:474）与 `.inlineart`（theme.css:725）：`aspect-ratio: 5 / 2` → `4 / 3`。
- `.dual .art`（山寨对开，A 档专用）**不动**，它有自己的对开构图。
- 改后在真机口径复核图槽尺寸：390 档弹层槽应 ≈366×275、情报槽 ≈330×248；与 `art-gap-list-20261106.md` §三的公式对不上就回报，别硬接。
- 卡片总高随之变高：检查 390×844 下弹层（标题 + 图 + 正文 + 选项）不溢出、不滚屏；溢出就回报 Orange，不许自行缩图或删正文行。

## 二、A 档 9 张裁切验（先于发版回报）

现有 9 张 A 档是 5:2，进 4:3 槽 cover 会裁掉约 47% 宽度。逐张自检并回报一张表：每张裁后主体是否完整、关键信息（横幅、锦旗、人物脸）是否被切。**任何一张裁后不可用就停住回报**，Orange 按 4:3 重出那张，不许 Yellow 自行拉伸或换构图糊弄。

## 三、B 档 18 张接入

- 映射只改 `src/ui/main.js:46-53` 的 `EVENT_ART` 表：9 处换值（专用剪影 → 新 webp）、9 处补键（现走兜底的那九行），口径照 `art-gap-list-20261106.md` §四。回落件 `EVENT_NO_ART` 留着不删。
- 文件名（与配音短名同词根）：event-early / laoli / tab / banquet / tag / complaint / pot / blogger / reserve / change / chess / spoon / monthly / priceup / stockout / canteen / field / promo .webp（promo 替 event-sil-promo.svg；insp 两张见下）。
- evt_s_insp / evt_s_insp2 的新图也在本批：event-insp.webp / event-insp2.webp 换掉两枚 sil svg。
- 9 枚专用剪影 svg 换完即成孤儿件：确认无引用后从 public 移出（预热清单从 EVENT_ART 取值，改表自动生效）；兜底 svg 保留。
- 压缩口径照 A 档现役：单张 ≤50 KB（现役 27.6–48.4 KB），Orange 交的是 1792×1344 原图，Yellow 压到槽位够用的分辨率（长边 1098 足够覆盖桌面 496 的 2 倍余量，可再议）与质量，别把原图整张塞进包。

## 四、门与带

四道门全过；sweep / m3 两带逐字节 = r16；SAVE_VERSION 不动；零数值零判定改动。发版前把 A 档裁切表 + 改后图槽真机读数（或 dist 预览读数）回报 Orange，Orange 过目后按常驻授权发版、云端回读。
