# TapTap 商店素材定版交付（2026-11-17，Orange）

三件套均为定版，替换后台里的旧稿（旧拼贴宣传图、旧图标全部作废）：

| 文件（解码后） | 用途 | 规格 |
|---|---|---|
| guiju-icon-v6.png | 游戏图标 | 1024×1024，满方无圆角 |
| guiju-promo-logo-v11.png | 宣传图 16:9 槽 | 1920×1080 |
| guiju-promo-logo-v12b-1x1.png | 宣传图 1:1 槽 | 1440×1440 |

## 为什么是 .b64

Orange 的 GitHub 通道只收 UTF-8 文本，PNG 原文件推不上来，故以 base64 文本交付。
解码（在本目录执行）：

```bash
for f in *.png.b64; do base64 -d "$f" > "${f%.b64}"; done
```

解码后逐个验 sha256，必须与下表一致，不一致先停手回报：

- guiju-icon-v6.png — 82fc982c4574560dea8e4cc683a81a1ee60f5d3d31c170433bed5156f697529b
- guiju-promo-logo-v11.png — 3c62920087055db4404722f13cfb82e7635e6d23e4665f01e29cc3d206d28674
- guiju-promo-logo-v12b-1x1.png — dd53ff627056f961ae1dcde51b12a6d3d1ede3989e41c19100227c77348bac7f

验过后可删 .b64 文件。

## 换完要做的

1. 三张图分别换进后台对应槽位，替换掉旧稿。
2. 商店简介里带上 BGM 署名句：Music: "Rubber Nod" by ziniyeons (niftyshelf.com/music/rubber-nod)
3. 换完回三张后台截图（图标槽、宣传图两槽各一张）供 Orange 核对。
