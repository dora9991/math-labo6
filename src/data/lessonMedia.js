// ============================================================
// lessonMedia.js — 単元ごとの「動画＋ワークシート」素材の対応表（試作）
//  ・youtubeId : 葉一さん（とある男が授業をしてみた）の YouTube動画ID。
//      入れると Lesson 画面で埋め込み再生。空なら 19ch を別タブで開くボタンに。
//  ・pdf       : public/worksheets/ に置いたワークシートPDFのファイル名。
//      ※著作物（葉一さんのプリント等）は、許可を得たうえで置き換えること。
//        同梱しているのは差し替え用のサンプル。
//  試作は u1（正負の意味・大小）のみ。動けば他単元も同じ形で増やせる。
// ============================================================
import { videoUrlFor } from "./videoLinks.js";

const MEDIA = {
  u1: { youtubeId: "", pdf: "u1.pdf" }, // ← youtubeId に動画IDを入れると埋め込み再生になる

  // 中2「式の計算」(g2c1)：章ぜんたいのワークシート(1章 式の計算.pdf, 18ページ)を共有。
  //  どの小単元から開いても同じプリントが出て、ページ送りで該当ページへ。
  //  動画IDは未設定（lessonMediaForが19chへのフォールバックを返す）。集まり次第ここに追記。
  g2c1u1: { youtubeId: "", pdf: "g2c1.pdf" },
  g2c1u2: { youtubeId: "", pdf: "g2c1.pdf" },
  g2c1u3: { youtubeId: "", pdf: "g2c1.pdf" },
  g2c1u4: { youtubeId: "", pdf: "g2c1.pdf" },
  g2c1u5: { youtubeId: "", pdf: "g2c1.pdf" },
  g2c1u6: { youtubeId: "", pdf: "g2c1.pdf" },
};

export function hasLessonMedia(unitId) {
  return !!MEDIA[unitId];
}

export function lessonMediaFor(unitId) {
  const m = MEDIA[unitId];
  if (!m) return null;
  return {
    youtubeId: m.youtubeId || "",
    pdfUrl: m.pdf ? import.meta.env.BASE_URL + "worksheets/" + m.pdf : null,
    videoPage: videoUrlFor(unitId), // 埋め込みIDが無いときのフォールバック（別タブで19ch）
  };
}
