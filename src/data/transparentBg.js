// ============================================================
// transparentBg.js — モンスター画像の市松（透過焼き込み）背景を実行時に透明化する
//  ・配布webpは透過が無く、灰色の市松模様が背景に焼き込まれている。
//  ・四隅から flood fill して「明るい低彩度（＝市松）」の連結領域だけ透明にする。
//    モンスターは太い濃いアウトラインで囲まれているので、内部の白目などは消えない。
//  ・URLごとに1回だけ処理して dataURL をキャッシュ（図鑑で同じ画像を多数使うため）。
// ============================================================

const ready = new Map();    // url -> dataURL（処理済み）
const pending = new Map();  // url -> Promise<dataURL>

// 市松背景っぽいか：明るい(>=150)かつ低彩度(max-min<=32)
function isBg(d, o) {
  const r = d[o], g = d[o + 1], b = d[o + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx >= 150 && mx - mn <= 32;
}

function process(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const W = img.naturalWidth, H = img.naturalHeight;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const im = ctx.getImageData(0, 0, W, H);
        const d = im.data;
        const seen = new Uint8Array(W * H);
        const st = [];
        for (let i = 0; i < W; i++) { st.push(i, (H - 1) * W + i); }
        for (let j = 0; j < H; j++) { st.push(j * W, j * W + W - 1); }
        while (st.length) {
          const p = st.pop();
          if (seen[p]) continue;
          seen[p] = 1;
          const o = p * 4;
          if (!isBg(d, o)) continue;
          d[o + 3] = 0; // 透明化
          const px = p % W, py = (p / W) | 0;
          if (px > 0) st.push(p - 1);
          if (px < W - 1) st.push(p + 1);
          if (py > 0) st.push(p - W);
          if (py < H - 1) st.push(p + W);
        }
        ctx.putImageData(im, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** 透過化した dataURL を返す（同期で取れれば dataURL、未処理なら Promise）。 */
export function transparentBg(url) {
  if (!url) return null;
  if (ready.has(url)) return ready.get(url);
  if (pending.has(url)) return pending.get(url);
  const p = process(url)
    .then((dataUrl) => { ready.set(url, dataUrl); pending.delete(url); return dataUrl; })
    .catch(() => { ready.set(url, url); pending.delete(url); return url; }); // 失敗時は元画像
  pending.set(url, p);
  return p;
}
