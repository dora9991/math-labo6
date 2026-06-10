// ============================================================
// recordSchema.js — 「記録するデータの形」の定義（最重要・将来も生き残る資産）
//
// ★なぜ大事か★
//   今はブラウザ内(localStorage)に保存するが、将来 Supabase の
//   データベースに移すとき、ここで決めた形をそのままテーブルに流し込める。
//   どの記録にも studentId（誰が）と createdAt（いつ）を最初から持たせる。
//   → サーバー化のとき「保存先を差し替えるだけ」で済む。
//
// Supabase に作る予定のテーブルと1対1で対応：
//   records      … 1回の挑戦の結果（下の makeRecord）
//   mistakes     … 間違えた問題（下の makeMistake）
//   player_state … XP・レベル・単元ごとの星・スキル習熟度（PlayerState）
// ============================================================

/** 端末ローカルの仮の生徒ID（サーバー化したら本物のIDに置き換える） */
export function getOrCreateLocalStudentId() {
  const KEY = "mathApp_studentId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "local-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** ISO形式の現在時刻（サーバーの timestamp 列にそのまま入る） */
function now() {
  return new Date().toISOString();
}

/**
 * 1回の挑戦の記録を作る。
 * mode: "timeAttack" | "slow" | "battle" | "unitTest" | "stepUp"
 */
export function makeRecord({
  studentId, mode, chapterId, unitId, level,
  correct = 0, wrong = 0, stars = 0, xp = 0, maxStreak = 0, extra = {},
}) {
  return {
    studentId,
    mode,
    chapterId: chapterId ?? null,
    unitId: unitId ?? null,
    level: level ?? null,
    correct,
    wrong,
    stars,
    xp,
    maxStreak,
    extra,            // モード固有の追加情報（自由欄）
    createdAt: now(),
  };
}

/**
 * 間違えた問題の記録を作る（間違いノート＆教員分析の元データ）。
 * skill / templateId を持たせ、スキル単位の弱点分析・診断に使えるようにする。
 */
export function makeMistake({ studentId, chapterId, unitId, level, q, ans, skill = null, templateId = null }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    studentId,
    chapterId: chapterId ?? null,
    unitId: unitId ?? null,
    level: level ?? null,
    q,
    ans,
    skill,            // どのスキルの問題か（data/skills.js の id）
    templateId,       // どのテンプレか（再出題・分析用）
    createdAt: now(),
  };
}

/** プレイヤー状態の初期値（XP・連続日数・星など） */
export function initialPlayerState(studentId) {
  return {
    studentId,
    xp: 0,             // （旧）単一レベルのXP。完全ワールド分離後は worldXp を使用（後方互換で残す）
    world: 1,          // 現在いるワールド（学年）= 1:中1 / 2:中2 / 3:中3。レベルはこのワールドのXPで決まる
    worldXp: { 1: 0, 2: 0, 3: 0 }, // ★ワールド別の累計XP。学年ごとにレベル(atk/HP)が独立
    streaks: 0,        // 連続学習日数
    lastDate: null,    // 最後に学習した日
    loginStreak: 0,    // 連続ログイン日数（ログインボーナス用。途切れたらリセット）
    lastLoginDate: null, // 最後にログインボーナスを受け取った日
    golden: { date: null, startMs: null }, // その日のゴールデンタイム（最初の15分・XP1.2倍）
    stars: {},         // { "u1-easy": 3, ... }
    playLog: {},       // { "u1-easy": { cleared: true, lastDate: "2026/5/30" }, ... } くり返しXP用
    skillStats: {},    // { "S-NEG-012": { m: 0.62, n: 8, last: "2026/6/2" }, ... } アダプティブ習熟度
    sp: 0,             // バトルのスキルポイント（正解で貯まり、スキル発動で消費。バトルをまたいで維持）
    currentHp: null,   // バトル間で持ち越す現在HP（null=満タン。0以下にはせず、ショップの治療で全回復）
    coins: 0,          // 所持コイン（タイムアタックで稼ぎ、ショップでアイテム購入に使う）
    item: null,        // 所持アイテム（id 文字列。1つだけ持てる。バトルで使うと消費）
    gacha: { owned: {}, weapon: null, armor: null }, // ガチャ装備：owned={id:個数}, 装備中の武器/防具id
    challengeCleared: {}, // { "ch1a": true, ... } 旧チャレンジ（難問）クリア記録（後方互換で保持）
    calcKing: {}, // 計算王への道：単元ごとの自己ベスト { unitId: { bestStreak, bestTime5 } }
    ownedSkills: ["time2x", "ultimate"], // 所持バトルスキルid（初期は基本2種。ショップで買い切り追加）
    equip: { 1: "time2x", 2: "ultimate" }, // スロット1/2に装備中のスキルid
    seenMonsters: {},  // { "m_c1_u1": true, ... } 解放を既に見たモンスター（「新しい敵」通知の制御）
    avatar: null,      // 自分のキャラ { type:"template", id } または { type:"image", src:dataURL }。null=既定（🐧）
    name: "",          // プレイヤー名（任意）
    unitMastery: {},   // { unitId: { pt:0〜100, streak:連続正解数, ok:bool } } 小単元の習得確認（4連続正解でOK）
    updatedAt: now(),
  };
}

/**
 * 旧セーブデータに新フィールドが無くても落ちないよう、既定値で補完する。
 * load() のたびに通すので、ここを増やせば後方互換が保てる。
 */
export function normalizePlayerState(p) {
  if (!p || typeof p !== "object") return p;
  const base = initialPlayerState(p.studentId);
  const out = { ...base, ...p };
  // ネストするオブジェクト系は欠けていれば既定値で補う
  // ── 完全ワールド分離: world / worldXp を補完。旧データは xp を中1へ移行 ──
  out.world = [1, 2, 3].includes(p.world) ? p.world : 1;
  if (p.worldXp && typeof p.worldXp === "object") {
    out.worldXp = { 1: p.worldXp[1] || 0, 2: p.worldXp[2] || 0, 3: p.worldXp[3] || 0 };
  } else {
    // 旧セーブ（単一XP）→ これまでの進捗を中1ワールドの値として引き継ぐ
    out.worldXp = { 1: p.xp || 0, 2: 0, 3: 0 };
  }
  out.loginStreak = Number.isFinite(p.loginStreak) ? p.loginStreak : 0;
  out.lastLoginDate = p.lastLoginDate || null;
  out.golden = (p.golden && typeof p.golden === "object") ? { date: p.golden.date || null, startMs: p.golden.startMs ?? null } : { date: null, startMs: null };
  out.stars = p.stars || {};
  out.playLog = p.playLog || {};
  out.skillStats = p.skillStats || {};
  out.challengeCleared = p.challengeCleared || {};
  // calcKing は単元ごとの自己ベストマップ。旧フラット形式({bestStreak,...})は破棄して空に。
  out.calcKing = (p.calcKing && typeof p.calcKing === "object" && !("bestStreak" in p.calcKing)) ? p.calcKing : {};
  out.gacha = p.gacha && typeof p.gacha === "object"
    ? { owned: p.gacha.owned || {}, weapon: p.gacha.weapon || null, armor: p.gacha.armor || null }
    : { owned: {}, weapon: null, armor: null };
  out.seenMonsters = p.seenMonsters || {};
  out.unitMastery = p.unitMastery || {};
  out.ownedSkills = Array.isArray(p.ownedSkills) && p.ownedSkills.length ? p.ownedSkills : [...base.ownedSkills];
  out.equip = { ...base.equip, ...(p.equip || {}) };
  // 装備中スキルが未所持なら基本スキルへフォールバック
  if (!out.ownedSkills.includes(out.equip[1])) out.equip[1] = base.equip[1];
  if (!out.ownedSkills.includes(out.equip[2])) out.equip[2] = base.equip[2];
  return out;
}
