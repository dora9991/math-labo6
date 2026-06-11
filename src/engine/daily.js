// ============================================================
// daily.js — 毎日の習慣づけ（ログインボーナス & ゴールデンタイム）
//
//  ・ログインボーナス：1日1回。連続ログインで継続を後押し。
//      基本 100G／5日連続ごとに 500G（＝ガチャ1回ぶん）。
//  ・ゴールデンタイム：その日の最初の15分は XP ×1.2。
//      集中したスタートを後押しし、「だらだら続け」を防ぐゆるい区切りにもする。
//
//  日付は todayStr() = toLocaleDateString("ja-JP")（例 "2026/6/9"）を使う。
//  純関数だけ。状態保存・UIには依存しない。
// ============================================================

export const BONUS_BASE = 100;     // 通常日のログインボーナス(G)
export const BONUS_STREAK = 500;   // 5日連続ごとのボーナス(G)＝ガチャ1回
export const BONUS_STREAK_CRYSTAL = 10; // 5日連続ごとに追加でもらえるクリスタル💎
export const STREAK_TARGET = 5;    // 何日連続ごとに大ボーナスか
export const GOLDEN_MS = 15 * 60 * 1000; // ゴールデンタイムの長さ（15分）
export const GOLDEN_MULT = 1.2;    // ゴールデンタイム中のXP倍率

const floorDay = (s) => { const d = new Date(s); if (isNaN(d)) return NaN; d.setHours(0, 0, 0, 0); return d.getTime(); };

/** 2つの日付文字列の差（日数）。prev が無い/不正なら Infinity（＝連続でない扱い）。 */
export function dayDiff(prev, cur) {
  if (!prev) return Infinity;
  const a = floorDay(prev), b = floorDay(cur);
  if (isNaN(a) || isNaN(b)) return Infinity;
  return Math.round((b - a) / 86400000);
}

/**
 * 今日のログインボーナスを計算する（まだ受け取っていない前提で呼ぶ）。
 * @returns {{streak:number, reward:number, isFifth:boolean}}
 */
export function computeLogin(player = {}, today) {
  const diff = dayDiff(player.lastLoginDate, today);
  let streak;
  if (diff === 0) streak = player.loginStreak || 1;        // 同じ日（通常は呼ばれない）
  else if (diff === 1) streak = (player.loginStreak || 0) + 1; // 連続
  else streak = 1;                                          // 途切れ→リセット
  const isFifth = streak % STREAK_TARGET === 0;
  return {
    streak,
    reward: isFifth ? BONUS_STREAK : BONUS_BASE,
    crystal: isFifth ? BONUS_STREAK_CRYSTAL : 0, // 5日連続ごとにクリスタル+10
    isFifth,
  };
}

/** 今日まだログインボーナスを受け取っていないか */
export function canClaimLogin(player = {}, today) {
  return player.lastLoginDate !== today;
}

/** ゴールデンタイム中か（その日・開始から15分以内） */
export function goldenActive(player = {}, nowMs, today) {
  const g = player.golden;
  return !!(g && g.date === today && typeof g.startMs === "number" && nowMs - g.startMs < GOLDEN_MS);
}

/** ゴールデンタイムの残りミリ秒（0以上） */
export function goldenRemainMs(player = {}, nowMs, today) {
  const g = player.golden;
  if (!g || g.date !== today || typeof g.startMs !== "number") return 0;
  return Math.max(0, GOLDEN_MS - (nowMs - g.startMs));
}

/** XP倍率（ゴールデンタイム中は ×1.2、それ以外は ×1） */
export function goldenMultiplier(player = {}, nowMs, today) {
  return goldenActive(player, nowMs, today) ? GOLDEN_MULT : 1;
}

/** 今日のゴールデンタイムが既に終わっているか（開始済みかつ15分超過） */
export function goldenEndedToday(player = {}, nowMs, today) {
  const g = player.golden;
  return !!(g && g.date === today && typeof g.startMs === "number" && nowMs - g.startMs >= GOLDEN_MS);
}
