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
