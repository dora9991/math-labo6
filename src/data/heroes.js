// ============================================================
// heroes.js — 自分のキャラに選べる「ヒーロー（立ち絵）」一覧
//  player.avatar = { type:"hero", id } で選択。画像は src/assets/avatars/*.png。
//  丸アイコン（Avatar）でも、全身の立ち絵（ホーム・バトル）でも使う。
// ============================================================
const glob = import.meta.glob("../assets/avatars/*.png", { eager: true, query: "?url", import: "default" });

function urlOf(slug) {
  for (const p in glob) if (p.endsWith("/" + slug + ".png")) return glob[p];
  return null;
}

export const HERO_AVATARS = [
  { id: "hero14", name: "いなずまの魔導士" },
  { id: "hero15", name: "やみの魔狼騎士" },
  { id: "hero16", name: "せいれいのエルフ" },
  { id: "hero17", name: "ほのおの魔法剣士" },
  { id: "hero18", name: "いなずまの戦士" },
  { id: "hero19", name: "みなもの魔法少女" },
  { id: "hero20", name: "古強者の魔導士" },
  { id: "hero09", name: "まほう学園の少女" },
  { id: "hero02", name: "ほのおの魔法少女" },
  { id: "hero13", name: "みずの魔法少女" },
  { id: "hero03", name: "みずの巫女" },
  { id: "hero04", name: "こおりの魔導士" },
  { id: "hero01", name: "ぼうけんの少女" },
  { id: "hero05", name: "こおりの少年" },
  { id: "hero06", name: "いかずちの少年" },
  { id: "hero08", name: "いなずまの剣士" },
  { id: "hero10", name: "たびびとの少年" },
  { id: "hero11", name: "じゅうじんの戦士" },
  { id: "hero12", name: "ベテラン冒険者" },
  { id: "hero07", name: "やみの騎士" },
].map((h) => ({ ...h, src: urlOf(h.id) }));

export function findHero(id) {
  return HERO_AVATARS.find((h) => h.id === id) || null;
}

/** avatar から立ち絵(全身)画像URLを返す（hero型のときだけ。それ以外は null） */
export function heroImageFor(avatar) {
  if (avatar && avatar.type === "hero") return findHero(avatar.id)?.src || null;
  return null;
}
