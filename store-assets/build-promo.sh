#!/usr/bin/env bash
# 商店页宣传片：与游戏内开场动画同一套素材、同一节拍、同一种推镜（theme.css fxIntroPush 的 1.04→1.13 + ±1.2% 纵向漂移）。
# 字幕带与落版照 UI 口径排字（CSS 390 宽 × 720/390=1.846 放大），图上不留字那条规矩只管画，字由这里排。
# 用法：bash store-assets/build-promo.sh      （重出图后重跑这一条即可，六镜源图直接读 game/public/img）
set -euo pipefail
cd "$(dirname "$0")/.."
IMG=game/public/img
BGM=game/public/audio/bgm-shijing.wav
W=_promo
FF=${FFMPEG:-ffmpeg}
$FF -version >/dev/null
mkdir -p "$W" && rm -f "$W/list.txt"

FPS=30
SRC=(intro-01-street intro-02-neighbours intro-03-dusk intro-04-phone intro-05-sign business)
MS=(8000 7000 7000 8000 7500 7500)

# 一镜一段：先放大四倍再 zoompan（缩到 720 才不抖），每镜头 420ms 从墨色淡入 = 游戏里旧镜瞬时归零、新镜 fxIntroFade 叠在 .intro 墨底上
for i in 0 1 2 3 4 5; do
  n=$((i + 1))
  f=$(( ${MS[$i]} * FPS / 1000 ))
  last=$(( f - 1 ))
  if [ "$n" = "6" ]; then
    PRE="scale=720:1440:flags=lanczos,crop=720:1280:0:100,scale=2160:3840:flags=lanczos"   # business 是 1:2，cover 进 9:16 先裁上下，取景窗照 object-position: center 62%
  else
    PRE="scale=2160:3840:flags=lanczos"
  fi
  VF="$PRE,zoompan=z='1.04+0.09*on/$last':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+0.012*ih*(2*on/$last-1)':d=$f:s=720x1280:fps=$FPS,fade=t=in:st=0:d=0.42:color=0x1b2a4a,format=yuv420p"
  $FF -y -loglevel error -i "$IMG/${SRC[$i]}.webp" -vf "$VF" -frames:v $f -c:v libx264 -preset slow -crf 20 -an "$W/f$n.mp4"
  printf "file 'f%s.mp4'\n" "$n" >> "$W/list.txt"
done

# 字幕带顶边：2 行 = 1126，镜4 三行 = 1079（4px 番茄红上边 + 墨底 rgba(27,42,74,.86)，padding 26/30 按比例放大）
B2="x=0:y=1126:w=720:h=150:color=0x1b2a4a@0.86:t=fill"; L2="x=0:y=1126:w=720:h=4:color=0xe24b33:t=fill"
B3="x=0:y=1079:w=720:h=197:color=0x1b2a4a@0.86:t=fill"; L3="x=0:y=1079:w=720:h=4:color=0xe24b33:t=fill"
VF=""
for r in "0 8 $B2 $L2" "8 15 $B2 $L2" "15 22 $B2 $L2" "22 30 $B3 $L3" "30 37.5 $B2 $L2" "37.5 45 $B2 $L2"; do
  set -- $r
  VF="$VF,drawbox=$3:enable='between(t,$1,$2)',drawbox=$4:enable='between(t,$1,$2)'"
done
# 落版锁版：.lock top:16% = 205，盒 408×95（26px 字放大后 48px + padding 26），2px 番茄红边框放大成 4px
VF="$VF,drawbox=x=156:y=205:w=408:h=95:color=0x1b2a4a@0.62:t=fill:enable='gte(t,37.5)',drawbox=x=156:y=205:w=408:h=95:color=0xe24b33:t=4:enable='gte(t,37.5)'"
VF="${VF#,},ass=store-assets/subs.ass,format=yuv420p"

$FF -y -loglevel error -f concat -safe 0 -i "$W/list.txt" -stream_loop 2 -i "$BGM" \
  -filter_complex "[0:v]$VF[v];[1:a]afade=t=out:st=43.2:d=1.8[a]" \
  -map "[v]" -map "[a]" -t 45 -c:v libx264 -preset slow -crf 23 -c:a aac -b:a 128k -movflags +faststart \
  store-assets/store-promo-720x1280.mp4
$FF -hide_banner -i store-assets/store-promo-720x1280.mp4 2>&1 | grep -E "Duration|Stream"
