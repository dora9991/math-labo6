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
// 全10種：最初から各スロット1つ（計2）＋ボス撃破でもらう8つ（各章ボス7＋ラスボス）。
//   unlock:"default" … 最初から所持
//   unlock:"boss"    … ボスを初めてたおすと入手（bossDrop: 章ID または "final"=ラスボス）
//   kind  … バトル側の効果分岐
//     "time2x" … 回答時間が timeMult 倍（既定2）
//     "regen"  … turns ターンのあいだ 毎ターン pct 割合ずつ回復し続ける
//     "dmgup"  … turns ターンのあいだ 与ダメージ mult 倍
//     "guard"  … turns ターンのあいだ 受けるダメージを reduce 倍に軽減
//     "ultimate" … 基本ダメージの mult 倍を直接あたえる
//     "drain"    … mult 倍ダメージ＋与ダメージの drain 割合ぶんHP回復
export const BATTLE_SKILLS = [
  // ── スロット1（SP5枠）：5種（既定1＋ボス4） ──
  {
    id: "time2x", slot: 1, cost: 5, kind: "time2x", timeMult: 2, unlock: "default",
    name: "タイムスロー", icon: "⏳",
    desc: "回答時間が2倍になる", color: "#38bdf8",
  },
  {
    id: "regen", slot: 1, cost: 5, kind: "regen", turns: 3, pct: 0.15, unlock: "boss", bossDrop: "c1",
    name: "リジェネ", icon: "🌿",
    desc: "3ターンのあいだ 毎ターンHPを15%ずつ回復し続ける", color: "#34d399",
  },
  {
    id: "barrier", slot: 1, cost: 5, kind: "guard", reduce: 0.5, turns: 2, unlock: "boss", bossDrop: "c3",
    name: "バリア", icon: "🔰",
    desc: "2ターンのあいだ 受けるダメージが1/2", color: "#60a5fa",
  },
  {
    id: "haste", slot: 1, cost: 5, kind: "time2x", timeMult: 2.5, unlock: "boss", bossDrop: "c5",
    name: "ヘイスト", icon: "💨",
    desc: "回答時間が2.5倍になる", color: "#22d3ee",
  },
  {
    id: "overdrive", slot: 1, cost: 5, kind: "dmgup", turns: 3, mult: 2, unlock: "boss", bossDrop: "c7",
    name: "オーバードライブ", icon: "⚙️",
    desc: "3ターンのあいだ 与ダメージが2倍", color: "#fb923c",
  },
  // ── スロット2（SP10枠）：5種（既定1＋ボス4） ──
  {
    id: "ultimate", slot: 2, cost: 10, kind: "ultimate", mult: 7, unlock: "default",
    name: "必殺技", icon: "💥",
    desc: "基本ダメージの7倍を直接あたえる", color: "#f472b6",
  },
  {
    id: "drain", slot: 2, cost: 10, kind: "drain", mult: 8, drain: 0.4, unlock: "boss", bossDrop: "c2",
    name: "ドレイン", icon: "🧛",
    desc: "8倍ダメージ＋与えたダメージの40%ぶんHP回復", color: "#a78bfa",
  },
  {
    id: "meteor", slot: 2, cost: 10, kind: "ultimate", mult: 12, unlock: "boss", bossDrop: "c4",
    name: "メテオ", icon: "☄️",
    desc: "基本ダメージの12倍を直接あたえる", color: "#f97316",
  },
  {
    id: "judgment", slot: 2, cost: 10, kind: "drain", mult: 9, drain: 0.5, unlock: "boss", bossDrop: "c6",
    name: "天罰", icon: "⚡",
    desc: "9倍ダメージ＋与えたダメージの50%ぶんHP回復", color: "#facc15",
  },
  {
    id: "ultima", slot: 2, cost: 10, kind: "ultimate", mult: 15, unlock: "boss", bossDrop: "final",
    name: "アルティマ", icon: "🌌",
    desc: "基本ダメージの15倍を直接あたえる（ラスボスの力）", color: "#e879f9",
  },
];

/** id からスキル定義を引く */
export function findSkill(id) {
  return BATTLE_SKILLS.find((s) => s.id === id) || null;
}

/** 章ボス(chapterId)が落とすスキルを返す（無ければ null） */
export function skillForBossDrop(chapterId) {
  return BATTLE_SKILLS.find((s) => s.unlock === "boss" && s.bossDrop === chapterId) || null;
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
