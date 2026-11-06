import sys, json
import numpy as np
from PIL import Image
from collections import deque

def skin_mask(a):
    r = a[..., 0].astype(int); g = a[..., 1].astype(int); b = a[..., 2].astype(int)
    return (r > 190) & (g > 130) & (g < 225) & (b > 90) & (b < 195) & (r - b > 45) & (r - g > 12) & (g - b > 12)

def blobs(m, minpx=400):
    H, W = m.shape
    seen = np.zeros((H, W), bool)
    out = []
    idx = np.argwhere(m)
    for y, x in idx:
        if seen[y, x]:
            continue
        q = deque([(int(y), int(x))]); seen[y, x] = True
        pix = []
        while q:
            cy, cx = q.popleft(); pix.append((cy, cx))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if len(pix) >= minpx:
            out.append(pix)
    out.sort(key=len, reverse=True)
    return out

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im); H, W = a.shape[:2]
    cw = (H * 4) // 3; cw -= cw % 2; x0 = (W - cw) // 2; x1 = x0 + cw
    m = skin_mask(a)
    print(f"\n=== {path.split('/')[-1]}  {W}x{H}  keep x{x0}..{x1} ({cw}px, {(W-cw)*100//W}% width lost)")
    for i, p in enumerate(blobs(m)[:6]):
        xs = [q[1] for q in p]; ys = [q[0] for q in p]
        inb = sum(1 for q in p if x0 <= q[1] < x1)
        print(f"  blob{i} {len(p):6d}px bbox x{min(xs)}-{max(xs)} y{min(ys)}-{max(ys)} ({max(xs)-min(xs)+1}x{max(ys)-min(ys)+1}) in-keep {100*inb//len(p)}%  out-left {max(0,x0-min(xs))} out-right {max(0,max(xs)-x1+1)}")
