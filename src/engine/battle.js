// ============================================================
// battle.js — バトルモードのルール（ゲームエンジン）
//  - プレイヤーのステータス（レベルで強くなる。Lv99まで対応）
//  - ダメージ計算（連続正解コンボでボーナス）
//  - 出題：モンスターの担当単元から「標準・発展」を出す
//    ラスボスは全単元の発展のみ
// ============================================================
import { genProblem, makeChoices } from "./generator.js";
import { findUnit, findChapterById } from "../data/index.js";
import { gearBonuses } from "./gear.js";
import { pick } from "./rng.js";

// ── プレイヤーの成長カーブ（Lv1〜99）──────────────────
// 一定（線形）だと後半が辛いので、わずかに二次関数的に伸ばす。
//  序盤(〜Lv20)はほぼ従来どおり、後半ほど伸びが大きくなる。
//   HP : Lv1≈53, Lv30≈592, Lv50≈1140, Lv99≈3091
//   攻撃: Lv1≈14, Lv30≈269, Lv50≈533, Lv99≈1484
/** レベルに応じた最大HP（二次関数的） */
export function playerHpForLevel(lv) {
  return Math.round(40 + 13 * lv + 0.18 * lv * lv);
}
/** レベルに応じた攻撃力（二次関数的） */
export function playerAtkForLevel(lv) {
  return Math.round(8 + 6 * lv + 0.09 * lv * lv);
}

/** プレイヤーのレベルに応じたバトル用ステータス（Lv1〜99）。
 *  bonuses（装備の上昇率 {atkPct,hpPct}）があれば攻撃力・最大HPに加算する。 */
export function getPlayerBattleStats(lv, bonuses = {}) {
  const atkPct = bonuses.atkPct || 0;
  const hpPct = bonuses.hpPct || 0;
  return {
    maxHp: Math.round(playerHpForLevel(lv) * (1 + hpPct)),
    atk: Math.round(playerAtkForLevel(lv) * (1 + atkPct)),
    timer: Math.min(9 + lv, 30), // Lv1=10秒 〜 上限30秒
  };
}

// ── 計算王 × バトル連動（単元クリアで永続バトル強化） ──────────
//  計算王への道で、その章（単元）を「クリア」すると、いる学年ワールドの
//  攻撃力が永続的に上がる（＝計算が速い人ほどバトルで強い、という納得感）。
//  クリア条件：計算王でその章を CALC_KING_CLEAR_STREAK 問連続正解（＝GOAL到達）。
//  計算王の記録(player.calcKing)は「章ID」をキーに { bestStreak, bestTime5 } を持つ。
export const CALC_KING_CLEAR_STREAK = 5;     // 5問連続正解＝その章の計算王クリア
export const CALC_KING_ATK_PER_UNIT = 0.05;  // 1章クリアごとに攻撃力 +5%
export const CALC_KING_ATK_CAP = 0.6;        // 攻撃力ボーナスの上限 +60%

/** その章が計算王クリア済みか（5問連続正解の自己ベストがあるか） */
export function isCalcKingCleared(player, chapterId) {
  const ck = player?.calcKing?.[chapterId];
  return !!ck && (ck.bestStreak || 0) >= CALC_KING_CLEAR_STREAK;
}

/** 指定ワールド（学年）で計算王クリア済みの章数 */
export function calcKingClearedInWorld(player, world) {
  const ck = player?.calcKing || {};
  let n = 0;
  for (const cid of Object.keys(ck)) {
    if ((ck[cid]?.bestStreak || 0) >= CALC_KING_CLEAR_STREAK) {
      const ch = findChapterById(cid);
      if (ch && ch.grade === world) n++;
    }
  }
  return n;
}

/** 現在ワールドの計算王クリアによる攻撃力ボーナス（割合・上限あり） */
export function calcKingAtkBonus(player) {
  const world = player?.world || 1;
  return Math.min(CALC_KING_ATK_CAP, calcKingClearedInWorld(player, world) * CALC_KING_ATK_PER_UNIT);
}

/** 装備（ガチャ）＋計算王クリアを合算したバトルの上昇率 {atkPct,hpPct,gearAtkPct,calcAtkPct} */
export function battleBonuses(player) {
  const g = gearBonuses(player);
  const calc = calcKingAtkBonus(player);
  return {
    atkPct: (g.atkPct || 0) + calc,
    hpPct: g.hpPct || 0,
    gearAtkPct: g.atkPct || 0, // 内訳（表示用）
    calcAtkPct: calc,          // 内訳（表示用）
  };
}

/** 推奨レベルのプレイヤーHPから「6発で倒れる」敵攻撃力を逆算 */
export function enemyAtkForLevel(minLv) {
  return Math.max(8, Math.round(playerHpForLevel(minLv) / 6));
}

/** 正解時のダメージ（プレイヤー攻撃力＋コンボボーナス、3連続以上で1.5倍） */
export function calcDamage(atk, combo) {
  const bonus = combo >= 3 ? Math.floor(atk * 0.5) : 0;
  return atk + bonus;
}

// ── スキルポイント(SP)とスキル ──────────────────────
// SPは正解1問ごとに +1 貯まり、上限まで溜まる。バトルをまたいで維持される
// （= 弱い敵で溜めてからボスに挑む、といった戦い方ができる）。
// スキルは下の配列を増やせばそのまま増える設計（将来は選択式にする想定）。
//   cost  … 発動に必要なSP（使うと消費して無くなる）
//   kind  … "time2x"（回答時間2倍）/ "ultimate"（必殺技：基本ダメージのmult倍）
export const SP_MAX = 10;

// スキルはスロット1（SP5枠）・スロット2（SP10枠）に1つずつ装備する。
// 全31種。最初から各スロット1つ（time2x / ultimate）所持、残りはスキルガチャ（クリスタル）で入手。
//   rarity … "n" | "r" | "sr" | "ssr"（ガチャの排出レア度。defで重み・色を定義）
//   slot   … 1（SP5）または 2（SP10）。equip はスロットごとに1つ。
//   kind   … バトル側の効果分岐（Battle.jsx の useSkill が解釈）:
//     "time2x"    … 回答時間が timeMult 倍（即時）
//     "heal"      … HP を最大の value 割合ぶん回復（即時）
//     "regen"     … turns ターン 毎ターン pct 割合ずつ回復し続ける
//     "dmgup"     … turns ターン 与ダメージ mult 倍
//     "guard"     … turns ターン 受けるダメージを reduce 倍に軽減（reduce<=0 で完全無敵）
//     "ultimate"  … 基本ダメージの mult 倍を直接あたえる
//     "drain"     … mult 倍ダメージ＋与ダメージの drain 割合ぶん HP 回復
//     "timebuff"  … turns 問のあいだ 制限時間 ×mult（inf:true で実質無制限）
//     "poison"    … turns ターン 毎ターン敵に mult×基本ダメージの継続ダメージ
//     "combokeep" … turns ターン 1回ミスしてもコンボが切れない
//     "doublenext"… 次の正解のダメージを2回ぶんあたえる
//     "critup"    … turns ターン コンボ／会心ボーナスが2倍
//     "counter"   … turns ターン 被弾するたび mult×基本ダメージで反撃
//     "revive"    … HP0になっても一度だけ全回復で復活（1バトル1回）
//     "winbonus"  … 勝利時に coins / crystals を追加で獲得（combat 効果なし）
//     "burst"     … ultimate＋dmgup を同時付与（mult/buffMult/buffTurns）
export const BATTLE_SKILLS = [
  // ── スロット1（SP5枠）──
  { id: "time2x",    slot: 1, cost: 5, rarity: "n", kind: "time2x", timeMult: 2,
    name: "タイムスロー", icon: "⏳", color: "#38bdf8", desc: "回答時間が2倍になる" },
  { id: "quickheal", slot: 1, cost: 5, rarity: "n", kind: "heal", value: 0.2,
    name: "クイックヒール", icon: "💚", color: "#86efac", desc: "HPを最大の20%回復する" },
  { id: "barrier",   slot: 1, cost: 5, rarity: "n", kind: "guard", reduce: 0.5, turns: 2,
    name: "ガード", icon: "🛡️", color: "#60a5fa", desc: "2ターン 受けるダメージが1/2" },
  { id: "powerup",   slot: 1, cost: 5, rarity: "n", kind: "dmgup", turns: 2, mult: 1.5,
    name: "ちからため", icon: "💪", color: "#fcd34d", desc: "2ターン 与ダメージが1.5倍" },
  { id: "fire",      slot: 1, cost: 5, rarity: "n", kind: "ultimate", mult: 3,
    name: "ファイア", icon: "🔥", color: "#fb7185", desc: "基本ダメージの3倍の一撃" },
  { id: "regen",     slot: 1, cost: 5, rarity: "n", kind: "regen", turns: 3, pct: 0.15,
    name: "リジェネ", icon: "🌿", color: "#34d399", desc: "3ターン 毎ターンHPを15%ずつ回復" },
  { id: "lucky",     slot: 1, cost: 5, rarity: "n", kind: "winbonus", coins: 80,
    name: "ついてる", icon: "🍀", color: "#4ade80", desc: "勝つとコイン+80（戦闘効果なし）" },
  { id: "focus",     slot: 1, cost: 5, rarity: "n", kind: "timebuff", turns: 3, mult: 1.5,
    name: "しゅうちゅう", icon: "👓", color: "#7dd3fc", desc: "次の3問 制限時間が1.5倍" },
  { id: "haste",     slot: 1, cost: 5, rarity: "r", kind: "time2x", timeMult: 2.5,
    name: "ヘイスト", icon: "💨", color: "#22d3ee", desc: "回答時間が2.5倍になる" },
  { id: "overdrive", slot: 1, cost: 5, rarity: "r", kind: "dmgup", turns: 3, mult: 2,
    name: "オーバードライブ", icon: "⚙️", color: "#fb923c", desc: "3ターン 与ダメージが2倍" },
  { id: "burstheal", slot: 1, cost: 5, rarity: "r", kind: "heal", value: 0.5,
    name: "バーストヒール", icon: "✨", color: "#4ade80", desc: "HPを最大の50%回復する" },
  { id: "ironwall",  slot: 1, cost: 5, rarity: "r", kind: "guard", reduce: 0.34, turns: 3,
    name: "アイアンウォール", icon: "🧱", color: "#3b82f6", desc: "3ターン 受けるダメージが約1/3" },
  { id: "doubleup",  slot: 1, cost: 5, rarity: "r", kind: "doublenext",
    name: "ダブルアップ", icon: "✌️", color: "#facc15", desc: "次の正解のダメージを2回ぶん" },
  { id: "poison",    slot: 1, cost: 5, rarity: "r", kind: "poison", turns: 3, mult: 1.2,
    name: "ポイズン", icon: "☠️", color: "#a3e635", desc: "敵に毒：3ターン継続ダメージ" },
  { id: "combokeep", slot: 1, cost: 5, rarity: "r", kind: "combokeep", turns: 3,
    name: "コンボキープ", icon: "🔗", color: "#fbbf24", desc: "3ターン 1回ミスしてもコンボ維持" },

  // ── スロット2（SP10枠）──
  { id: "ultimate",  slot: 2, cost: 10, rarity: "n", kind: "ultimate", mult: 7,
    name: "必殺技", icon: "💥", color: "#f472b6", desc: "基本ダメージの7倍を直接あたえる" },
  { id: "drain",     slot: 2, cost: 10, rarity: "r", kind: "drain", mult: 8, drain: 0.4,
    name: "ドレイン", icon: "🧛", color: "#a78bfa", desc: "8倍ダメージ＋40%ぶんHP回復" },
  { id: "meteor",    slot: 2, cost: 10, rarity: "sr", kind: "ultimate", mult: 12,
    name: "メテオ", icon: "☄️", color: "#f97316", desc: "基本ダメージの12倍を直接あたえる" },
  { id: "judgment",  slot: 2, cost: 10, rarity: "sr", kind: "drain", mult: 9, drain: 0.5,
    name: "天罰", icon: "⚡", color: "#facc15", desc: "9倍ダメージ＋50%ぶんHP回復" },
  { id: "fullheal",  slot: 2, cost: 10, rarity: "sr", kind: "heal", value: 1.0,
    name: "フルヒール", icon: "🍶", color: "#22c55e", desc: "HPを全回復する（100%）" },
  { id: "invincible",slot: 2, cost: 10, rarity: "sr", kind: "guard", reduce: 0, turns: 1,
    name: "インビンシブル", icon: "🌟", color: "#fde047", desc: "1ターン 完全無敵（被ダメ0）" },
  { id: "critup",    slot: 2, cost: 10, rarity: "sr", kind: "critup", turns: 3,
    name: "クリティカル", icon: "🎯", color: "#fb7185", desc: "3ターン コンボ会心ボーナス2倍" },
  { id: "counter",   slot: 2, cost: 10, rarity: "sr", kind: "counter", turns: 3, mult: 2,
    name: "カウンター", icon: "🪃", color: "#38bdf8", desc: "3ターン 被弾するたび反撃" },
  { id: "thunder",   slot: 2, cost: 10, rarity: "sr", kind: "burst", mult: 10, buffMult: 1.5, buffTurns: 2,
    name: "サンダーストーム", icon: "🌩️", color: "#818cf8", desc: "10倍の一撃＋2ターン与ダメ1.5倍" },
  { id: "timefreeze",slot: 2, cost: 10, rarity: "sr", kind: "timebuff", turns: 2, inf: true,
    name: "タイムフリーズ", icon: "⏱️", color: "#67e8f9", desc: "次の2問 制限時間なし" },
  { id: "ultima",    slot: 2, cost: 10, rarity: "ssr", kind: "ultimate", mult: 15,
    name: "アルティマ", icon: "🌌", color: "#e879f9", desc: "基本ダメージの15倍を直接あたえる" },
  { id: "phoenix",   slot: 2, cost: 10, rarity: "ssr", kind: "revive",
    name: "フェニックス", icon: "🕊️", color: "#fb923c", desc: "HP0でも1回だけ全回復で復活" },
  { id: "genocide",  slot: 2, cost: 10, rarity: "ssr", kind: "drain", mult: 20, drain: 0.3,
    name: "ジェノサイド", icon: "💀", color: "#f43f5e", desc: "20倍ダメージ＋30%ぶんHP回復" },
  { id: "zerocount", slot: 2, cost: 10, rarity: "ssr", kind: "burst", mult: 0, buffMult: 1.5, buffTurns: 99, timeInf: 99,
    name: "ゼロカウント", icon: "⌛", color: "#c4b5fd", desc: "以降ずっと時間無制限＋与ダメ1.5倍" },
  { id: "crystalluck",slot: 2, cost: 10, rarity: "ssr", kind: "winbonus", coins: 150, crystals: 1,
    name: "クリスタルラック", icon: "💎", color: "#67e8f9", desc: "勝つとコイン+150＆クリスタル+1" },
  { id: "overload",  slot: 2, cost: 10, rarity: "ssr", kind: "burst", mult: 0, buffMult: 3, buffTurns: 5, regenPct: 0.1, regenTurns: 5,
    name: "オーバーロード", icon: "👑", color: "#fbbf24", desc: "5ターン 与ダメ3倍＋毎ターンHP10%回復" },
];

// ── スキルガチャ：レア度の定義（重み＝出やすさ%、色・ラベル） ──
export const SKILL_RARITY = {
  n:   { key: "n",   label: "ノーマル",       color: "#94a3b8", weight: 60, refund: 50 },
  r:   { key: "r",   label: "レア",           color: "#38bdf8", weight: 28, refund: 150 },
  sr:  { key: "sr",  label: "スーパーレア",   color: "#a78bfa", weight: 10, refund: 400 },
  ssr: { key: "ssr", label: "ウルトラレア",   color: "#fde047", weight: 2,  refund: 1000 },
};
export const SKILL_RARITY_ORDER = ["n", "r", "sr", "ssr"];

// スキルガチャの値段（クリスタル）。10連は1回ぶんお得。
export const SKILL_GACHA_COST_1 = 50;
export const SKILL_GACHA_COST_10 = 450;

/** id からスキル定義を引く */
export function findSkill(id) {
  return BATTLE_SKILLS.find((s) => s.id === id) || null;
}

/** レア度キーのスキル一覧 */
export function skillsOfRarity(rarity) {
  return BATTLE_SKILLS.filter((s) => s.rarity === rarity);
}

/**
 * スキルガチャを1回引く → 当たったスキルの id。
 *  レア度を重みで抽選 → そのレア度のスキルから等確率で1つ。
 */
export function rollSkillGacha(rand = Math.random) {
  const defs = SKILL_RARITY_ORDER.map((k) => SKILL_RARITY[k]);
  const total = defs.reduce((s, d) => s + d.weight, 0);
  let t = rand() * total;
  let chosen = defs[0];
  for (const d of defs) { if ((t -= d.weight) < 0) { chosen = d; break; } }
  const pool = skillsOfRarity(chosen.key);
  return (pool[Math.floor(rand() * pool.length)] || BATTLE_SKILLS[0]).id;
}

/**
 * 10連を引く（id配列を返す）。10連は最低1つ R 以上を保証する。
 */
export function rollSkillGacha10(rand = Math.random) {
  const ids = Array.from({ length: 10 }, () => rollSkillGacha(rand));
  const hasRPlus = ids.some((id) => {
    const r = findSkill(id)?.rarity;
    return r === "r" || r === "sr" || r === "ssr";
  });
  if (!hasRPlus) {
    const rPool = skillsOfRarity("r");
    ids[9] = (rPool[Math.floor(rand() * rPool.length)] || BATTLE_SKILLS[0]).id;
  }
  return ids;
}

/** スロット番号(1|2)のスキル候補を返す */
export function skillsForSlot(slot) {
  return BATTLE_SKILLS.filter((s) => s.slot === slot);
}

/** プレイヤーの装備中スキルを [スロット1, スロット2] で返す（未装備や未所持は既定にフォールバック） */
export function getEquippedSkills(player) {
  const owned = player?.ownedSkills || ["time2x", "ultimate"];
  const equip = player?.equip || { 1: "time2x", 2: "ultimate" };
  const pick = (slot, fallback) => {
    const id = equip[slot];
    const s = id && owned.includes(id) ? findSkill(id) : null;
    return s && s.slot === slot ? s : findSkill(fallback);
  };
  return [pick(1, "time2x"), pick(2, "ultimate")].filter(Boolean);
}

/** 必殺技のダメージ（基本攻撃力 × 倍率） */
export function ultimateDamage(atk, mult = 7) {
  return Math.round(atk * mult);
}

// ── 敵モンスターの行動パターン（AI）──────────────────
// 敵は「自分のターン」（＝プレイヤーが不正解／時間切れになった時）に
// 下のアーキタイプに従って行動する。ただ殴るだけでなく、回復・魔法・
// ためる・超必殺・炎ブレスなどでバリエーションを出す。
// 新しいタイプを足すときは ENEMY_AI に1つ加えて enemyDecide に分岐を書く。
//
//   plain   … 単調に攻撃（今までの形）
//   healer  … たまに自分のHPを回復
//   mage    … たまに魔法で大きめダメージ
//   charger … たまに力をためて、次の攻撃が2倍
//   super   … 2ターンためてから超必殺（5倍）
//   fire    … たまに炎ブレス（2倍ダメージ）
export const ENEMY_AI = {
  plain:   { label: "通常型" },
  healer:  { label: "回復型",  healChance: 0.35, healPct: 0.12 },
  mage:    { label: "魔法型",  magicChance: 0.40, magicMult: 1.6 },
  charger: { label: "ためる型", chargeChance: 0.45, burstMult: 2 },
  super:   { label: "超必殺型", chargeNeed: 2, superMult: 5 },
  fire:    { label: "炎型",    fireChance: 0.5, fireMult: 2 },
};

/**
 * 敵の1ターンの行動を決める（純関数）。
 * @param {string} aiId  ENEMY_AI のキー
 * @param {object} state { charged:bool, superCount:number } 現在のためチャージ状態
 * @returns {{ st: object, act: object }}
 *   act.kind: "attack" | "magic" | "fire" | "burst" | "super" | "heal" | "charge"
 *   act.mult: ダメージ倍率（攻撃系）/ act.healPct: 回復割合（heal）
 */
// opts: モンスターごとの技の強さ上書き（superMult/burstMult/magicMult/fireMult/healPct）
export function enemyDecide(aiId, state = {}, opts = {}) {
  const ai = ENEMY_AI[aiId] || ENEMY_AI.plain;
  const st = { charged: !!state.charged, superCount: state.superCount || 0 };
  const r = Math.random();

  if (aiId === "charger") {
    if (st.charged) { st.charged = false; return { st, act: { kind: "burst", mult: opts.burstMult ?? ai.burstMult, label: "ためた一撃！" } }; }
    if (r < ai.chargeChance) { st.charged = true; return { st, act: { kind: "charge", label: "力をためている…！" } }; }
    return { st, act: { kind: "attack", mult: 1, label: "の攻撃！" } };
  }

  if (aiId === "super") {
    if (st.superCount >= ai.chargeNeed) { st.superCount = 0; return { st, act: { kind: "super", mult: opts.superMult ?? ai.superMult, label: "超必殺技さくれつ！" } }; }
    st.superCount += 1;
    return { st, act: { kind: "charge", label: "エネルギーをためている…！" } };
  }

  if (aiId === "healer" && r < ai.healChance) return { st, act: { kind: "heal", healPct: opts.healPct ?? ai.healPct, label: "キズをいやした！" } };
  if (aiId === "mage" && r < ai.magicChance) return { st, act: { kind: "magic", mult: opts.magicMult ?? ai.magicMult, label: "の魔法こうげき！" } };
  if (aiId === "fire" && r < ai.fireChance) return { st, act: { kind: "fire", mult: opts.fireMult ?? ai.fireMult, label: "の炎のブレス！" } };

  return { st, act: { kind: "attack", mult: 1, label: "の攻撃！" } };
}

// 通常戦の難易度（標準寄り＋ときどき発展。易しすぎる easy は除外）
const BATTLE_LEVELS = ["standard", "standard", "advanced"];

/**
 * モンスターの担当単元から1問生成する（4択つき）。
 * ラスボス（bossAdvancedOnly）は発展のみ。
 * @param {object} monster MONSTERS の1体（pools を持つ）
 * @param {string|null} lastId 直前の問題ID
 */
export function genBattleProblem(monster, lastId = null) {
  const levels = monster.bossAdvancedOnly ? ["advanced"] : BATTLE_LEVELS;
  for (let attempt = 0; attempt < 20; attempt++) {
    const pool = pick(monster.pools);
    const unit = pool && findUnit(pool.c, pool.u);
    if (!unit) continue;
    const level = pick(levels);
    const q = genProblem(unit, level, lastId);
    if (q) {
      return { ...q, unitName: unit.name, level, choices: makeChoices(q.ans) };
    }
  }
  return null;
}
