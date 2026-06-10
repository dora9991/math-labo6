// ============================================================
// App.jsx — アプリ全体のまとめ役（薄く保つ）
//  - 保存データ(player/records/mistakes)を読み込んで持つ
//  - 画面の切り替え（ルーティング）
//  - XP加算・星保存・結果保存などの「データ更新」を一手に引き受ける
// ゲームのルールは engine/ に、問題は data/ に、保存は store/ にあるので、
// このファイルは「つなぐだけ」。
// ============================================================
import { useState, useEffect, useRef } from "react";
import * as store from "./store/localStore.js"; // ★将来ここを supabase.js に差し替える
import { makeRecord, makeMistake } from "./store/recordSchema.js";
import { levelFromXp, xpForLevel, playerLevel, playerXp } from "./engine/scoring.js";
import * as bgm from "./audio/bgm.js";
import * as sfx from "./audio/sfx.js";

import StartScreen from "./screens/StartScreen.jsx";
import Transfer from "./screens/Transfer.jsx";
import LoginBonusOverlay from "./components/LoginBonusOverlay.jsx";
import { computeLogin, canClaimLogin, goldenMultiplier } from "./engine/daily.js";
import TitleScreen from "./screens/TitleScreen.jsx";
import AudioToggle from "./components/AudioToggle.jsx";
import LevelUpOverlay from "./components/LevelUpOverlay.jsx";
import Home from "./screens/Home.jsx";
import ChapterSelect from "./screens/ChapterSelect.jsx";
import TimeAttack from "./screens/TimeAttack.jsx";
import SlowMode from "./screens/SlowMode.jsx";
import Notebook from "./screens/Notebook.jsx";
import Relearn from "./screens/Relearn.jsx";
import BattleSelect from "./screens/BattleSelect.jsx";
import Battle from "./screens/Battle.jsx";
import UnitTestSelect from "./screens/UnitTestSelect.jsx";
import UnitTest from "./screens/UnitTest.jsx";
import StepUp from "./screens/StepUp.jsx";
import StepUpSimple from "./screens/StepUpSimple.jsx";
import Shop from "./screens/Shop.jsx";
import Challenge from "./screens/Challenge.jsx";
import CalcPracticePick from "./screens/CalcPracticePick.jsx";
import Skill from "./screens/Skill.jsx";
import StatusDetail from "./screens/StatusDetail.jsx";
import Admin from "./screens/Admin.jsx";
import Character from "./screens/Character.jsx";
import HowTo from "./screens/HowTo.jsx";
import Clinic from "./screens/Clinic.jsx";
import { findItem, treatCost } from "./engine/items.js";
import { skillForBossDrop, getPlayerBattleStats, BATTLE_SKILLS, battleBonuses, isCalcKingCleared, CALC_KING_CLEAR_STREAK } from "./engine/battle.js";
import { MONSTERS } from "./data/monsters.js";
import { foldSequence } from "./engine/unitMastery.js";
import { isUnitMonsterUnlocked } from "./engine/unlock.js";
import { challengeXp } from "./data/challenge.js";
import { CHAPTERS, LEVEL_KEYS, chaptersForGrade, allChapters, findChapterByUnitId, findUnitById, findChapterById } from "./data/index.js";
import { getWeakUnits, buildWeakUnit } from "./engine/weakness.js";
import { rollGacha, findGear, defaultGacha, GACHA_COST } from "./engine/gear.js";

const todayStr = () => new Date().toLocaleDateString("ja-JP");

export default function App() {
  const [data, setData] = useState(() => store.load());
  const [screen, setScreen] = useState("start");
  // 初回起動か？（v4からの引き継ぎ画面を出すか）。既に進捗がある人には出さない。
  const [needsOnboard, setNeedsOnboard] = useState(() => {
    try { if (localStorage.getItem("ml5_onboarded")) return false; } catch {}
    const p = store.load().player || {};
    const wx = p.worldXp || {};
    const hasProgress =
      ((wx[1] || 0) + (wx[2] || 0) + (wx[3] || 0)) > 0 || (p.xp || 0) > 0 ||
      (p.coins || 0) > 0 || (p.stars && Object.keys(p.stars).length > 0) || (p.name || "").length > 0;
    if (hasProgress) { try { localStorage.setItem("ml5_onboarded", "1"); } catch {} return false; }
    return true;
  });
  const markOnboarded = () => { try { localStorage.setItem("ml5_onboarded", "1"); } catch {} setNeedsOnboard(false); };
  const [mode, setMode] = useState("timeAttack"); // どのモードで章選択に来たか
  // 選択中の学年＝現在いる「ワールド」。完全ワールド分離でレベル(atk/HP)もこの学年のもの。
  const [grade, setGrade] = useState(() => data.player.world || 1);
  const [sel, setSel] = useState({ chapter: null, unit: null, level: null });
  const [battleMonster, setBattleMonster] = useState(null); // 選択中のモンスター
  const [battleKey, setBattleKey] = useState(0); // 「もう一度」で戦闘をやり直す用
  const [utChapter, setUtChapter] = useState(null); // 単元テストの対象章
  const [levelUpTo, setLevelUpTo] = useState(null); // レベルアップ演出（上がった先のレベル）
  const [loginBonus, setLoginBonus] = useState(null); // ログインボーナス演出 { reward, streak, isFifth }
  const loginCheckedRef = useRef(false);              // 今セッションでログイン判定済みか
  const [skillGet, setSkillGet] = useState(null); // スキル入手演出（章ボス撃破）
  const [calcKingClear, setCalcKingClear] = useState(null); // 計算王クリア演出（バトル攻撃力アップ）
  const [newMonster, setNewMonster] = useState(null); // 新モンスター出現演出（タイムアタックで解放）
  const [weakKey, setWeakKey] = useState(0); // 苦手タイムアタックの再挑戦（もう一回）でリセットする用
  const [practiceUnit, setPracticeUnit] = useState(null); // 間違いノートの単元別じっくり練習で選んだ単元
  const [calcChapter, setCalcChapter] = useState(null); // 計算王への道で選んだ単元（章）
  const pendingMonsterRef = useRef(null); // レベルアップ演出の後に出すための保留枠

  // player を更新して保存する共通関数
  function updatePlayer(updater) {
    setData((d) => {
      const player = store.savePlayerState(updater(d.player));
      return { ...d, player };
    });
  }

  // ワールド（学年）を切り替える。レベル/atk/HP はこのワールドのXPで決まるので、
  // 表示用 grade と保存用 player.world を必ず同期させる。
  function setWorld(g) {
    const w = [1, 2, 3].includes(g) ? g : 1;
    setGrade(w);
    updatePlayer((p) => (p.world === w ? p : { ...p, world: w }));
  }

  // 小単元の習得確認ポイントを更新（bools = その単元の正誤を時系列で並べた配列）
  function bumpUnitMastery(unitId, bools) {
    if (!unitId || !bools || bools.length === 0) return;
    updatePlayer((p) => {
      const um = { ...(p.unitMastery || {}) };
      um[unitId] = foldSequence(um[unitId], bools);
      return { ...p, unitMastery: um };
    });
  }

  // XPを加算（同時に連続学習日数も更新）。レベルが上がったら演出を出す。
  function addXp(gain) {
    updatePlayer((p) => {
      const isNewDay = p.lastDate !== todayStr();
      const g = Math.round(gain * goldenMultiplier(p, Date.now(), todayStr())); // ゴールデンタイムは×1.2
      const w = p.world || 1;
      const wx = p.worldXp || { 1: 0, 2: 0, 3: 0 };
      const cur = wx[w] || 0;
      const before = levelFromXp(cur);
      const after = levelFromXp(cur + g);
      if (after > before) {
        sfx.levelUp();
        // 結果画面のXP表示が見えてから出す（少し遅延）
        setTimeout(() => setLevelUpTo(after), 900);
      }
      return {
        ...p,
        worldXp: { ...wx, [w]: cur + g }, // ★現在ワールドのXPだけ増やす（学年ごとに独立）
        streaks: isNewDay ? p.streaks + 1 : p.streaks,
        lastDate: todayStr(),
      };
    });
  }

  // タイムアタック1回の結果を保存
  function saveTimeAttackResult({ chapter, unit, level, correct, wrong, stars, maxStreak, xp, coins = 0, results }) {
    const sid = data.player.studentId;
    // 1) 記録を追加
    store.addRecord(makeRecord({
      studentId: sid, mode: "timeAttack",
      chapterId: chapter.id, unitId: unit.id, level,
      correct, wrong, stars, xp, maxStreak,
    }));
    // 達成ベースのコイン（反復でなく「初クリア」「単元制覇」で出す）
    const akey = `${unit.id}-${level}`;
    const prevStar = (data.player.stars && data.player.stars[akey]) || 0;
    const firstClear = prevStar === 0 && stars >= 1;
    let masteredNow = false;
    if (firstClear) {
      const sNow = { ...(data.player.stars || {}), [akey]: stars };
      masteredNow = LEVEL_KEYS.every((l) => (sNow[`${unit.id}-${l}`] || 0) >= 1);
    }
    const FIRST_CLEAR_COIN = 50, MASTER_BONUS_COIN = 200;
    const bonusCoin = (firstClear ? FIRST_CLEAR_COIN : 0) + (masteredNow ? MASTER_BONUS_COIN : 0); // 達成ベースのコイン
    // 2) 星・くり返しXP履歴(playLog)・コインを更新
    updatePlayer((p) => {
      const key = `${unit.id}-${level}`;
      const prevLog = (p.playLog && p.playLog[key]) || {};
      return {
        ...p,
        coins: (p.coins ?? 0) + coins + bonusCoin,
        stars: { ...p.stars, [key]: Math.max(p.stars[key] || 0, stars) },
        playLog: { ...(p.playLog || {}), [key]: { cleared: prevLog.cleared || stars >= 1, lastDate: todayStr() } },
      };
    });
    // 3) 間違いを間違いノートへ
    const mistakes = results.filter((r) => !r.ok).slice(0, 3).map((r) =>
      makeMistake({ studentId: sid, chapterId: chapter.id, unitId: unit.id, level, q: r.q, ans: r.ans })
    );
    const newMistakes = store.addMistakes(mistakes);
    setData((d) => ({ ...d, records: store.load().records, mistakes: newMistakes }));
    // 4) 小単元の習得確認（解いた順の正誤を反映：4連続正解でOK／ミスで-10）
    bumpUnitMastery(unit.id, results.map((r) => !!r.ok));

    // 5) この単元のモンスターが今回のクリアで新たに解放されたか判定
    // 難易度を1つでも★1にすると、その単元のモンスターが解放される（今回のクリアが初の★なら通知）
    const monster = MONSTERS.find((m) => m.kind === "unit" && m.unitId === unit.id);
    let unlockedMon = null;
    if (monster && stars >= 1 && !isUnitMonsterUnlocked(data.player, monster)) {
      unlockedMon = monster;
      markMonstersSeen([monster.id]); // ここで通知するので「既読」にしておく（バトル選択で二重に出さない）
    }

    // 6) XP加算（レベルアップがあれば演出が出る）
    const curWx = playerXp(data.player);
    const willLevelUp = levelFromXp(curWx + xp) > levelFromXp(curWx);
    addXp(xp);

    // 7) 新モンスター出現の通知。レベルアップがあれば演出の後、無ければ少し後に出す
    if (unlockedMon) {
      if (willLevelUp) {
        pendingMonsterRef.current = unlockedMon; // レベルアップ演出の onDone で出す
      } else {
        setTimeout(() => setNewMonster(unlockedMon), 900);
      }
    }
  }

  // 苦手タイムアタックを開始（もう一回でも呼ぶ＝key更新で画面リセット）
  function startWeakTA() {
    setWeakKey((k) => k + 1);
    setScreen("weakTA");
  }

  // 苦手タイムアタック1回の結果を保存（単元の星は付けず、XP・コイン・間違いだけ反映）
  function saveWeakResult({ correct, wrong, xp, coins = 0, results }) {
    const sid = data.player.studentId;
    store.addRecord(makeRecord({ studentId: sid, mode: "timeAttack", correct, wrong, xp, extra: { weak: true } }));
    updatePlayer((p) => ({ ...p, coins: (p.coins ?? 0) + coins }));
    const mistakes = results.filter((r) => !r.ok).slice(0, 3).map((r) =>
      makeMistake({ studentId: sid, q: r.q, ans: r.ans })
    );
    const newMistakes = store.addMistakes(mistakes);
    setData((d) => ({ ...d, records: store.load().records, mistakes: newMistakes }));
    addXp(xp);
  }

  // じっくりモードのクリア結果を保存
  function saveSlowResult({ chapter, unit, level, streak, total, correct, xp }) {
    store.addRecord(makeRecord({
      studentId: data.player.studentId, mode: "slow",
      chapterId: chapter.id, unitId: unit.id, level,
      correct, wrong: total - correct, xp, maxStreak: streak,
    }));
    // くり返しXP用の履歴を更新（じっくりは到達＝クリア）
    updatePlayer((p) => {
      const key = `${unit.id}-${level}`;
      return { ...p, playLog: { ...(p.playLog || {}), [key]: { cleared: true, lastDate: todayStr() } } };
    });
    setData((d) => ({ ...d, records: store.load().records }));
    addXp(xp);
  }

  // 困り感クリニックの結果を保存（誤答ノート＋記録＋XP、卒業フラグ）
  function saveClinicResult({ skillKey, skillName, correct, wrong, graduated, xp, results }) {
    const sid = data.player.studentId;
    store.addRecord(makeRecord({
      studentId: sid, mode: "clinic", chapterId: "c1",
      correct, wrong, xp, extra: { skillKey, skillName, graduated },
    }));
    const mistakes = (results || []).filter((r) => !r.ok).slice(0, 3).map((r) =>
      makeMistake({ studentId: sid, chapterId: "c1", q: r.q, ans: r.ans })
    );
    const newMistakes = store.addMistakes(mistakes);
    if (graduated) {
      updatePlayer((p) => ({ ...p, clinicCleared: { ...(p.clinicCleared || {}), [skillKey]: todayStr() } }));
    }
    setData((d) => ({ ...d, records: store.load().records, mistakes: newMistakes }));
    addXp(xp);
  }

  // 単元テストの結果を保存
  function saveUnitTestResult({ chapter, answers, correct, total, xp }) {
    const sid = data.player.studentId;
    store.addRecord(makeRecord({
      studentId: sid, mode: "unitTest", chapterId: chapter.id,
      correct, wrong: total - correct, xp,
    }));
    const mistakes = answers.filter((a) => !a.ok).slice(0, 6).map((a) =>
      makeMistake({ studentId: sid, chapterId: chapter.id, unitId: a.unitId, level: a.level, q: a.q, ans: a.ans })
    );
    const newMistakes = store.addMistakes(mistakes);
    setData((d) => ({ ...d, records: store.load().records, mistakes: newMistakes }));
    addXp(xp);
  }

  function removeNote(id) {
    const mistakes = store.removeMistake(id);
    setData((d) => ({ ...d, mistakes }));
  }

  // バトルで間違えた問題を「学び直しモード」に記録（同じ問題文は重複させない・最大40件）
  function recordBattleMistake({ q, ans, unitId, level }) {
    if (!q) return;
    const ch = findChapterByUnitId(unitId);
    const newMistakes = store.addMistakes([
      makeMistake({ studentId: data.player.studentId, chapterId: ch?.id || null, unitId: unitId || null, level: level || null, q, ans }),
    ]);
    setData((d) => ({ ...d, mistakes: newMistakes }));
  }

  // ステップアップ（弱点克服）モード：1問ごとの結果を保存
  //  - スキル習熟度(skillStats)を更新（mNew は画面側のEloで算出済み）
  //  - 間違いはスキル付きでノートへ
  //  - XPはささやか＆ペナルティなし（自己肯定を下げない）
  function recordStepAttempt({ skill, unitId, level, templateId, ok, q, ans, mNew }) {
    const sid = data.player.studentId;
    // スキルタグがある中1のみ習熟度(Elo)を更新（中2・中3の固定問題は skill=null）
    if (skill) {
      updatePlayer((p) => {
        const prev = (p.skillStats && p.skillStats[skill]) || { m: 0.5, n: 0 };
        return {
          ...p,
          skillStats: { ...(p.skillStats || {}), [skill]: { m: mNew, n: prev.n + 1, last: todayStr() } },
        };
      });
    }
    // 小単元の習得確認も更新（1問ずつ）
    bumpUnitMastery(unitId, [!!ok]);
    if (!ok) {
      const newMistakes = store.addMistakes([
        makeMistake({ studentId: sid, chapterId: skill ? "c1" : null, unitId, level, q, ans, skill, templateId }),
      ]);
      setData((d) => ({ ...d, mistakes: newMistakes }));
    }
    addXp(ok ? 10 : 0); // ステップアップは1問10XP（じっくり取り組む価値を高く）
  }

  // チャレンジ：難問を初クリアしたとき（段位の元を保存＋難易度比例XP）
  //  くり返しクリアではXPは入らない＝作業稼ぎでバトル人気を食わないように。
  function recordChallengeClear(problemId, tier) {
    const already = !!(data.player.challengeCleared && data.player.challengeCleared[problemId]);
    updatePlayer((p) => ({
      ...p,
      challengeCleared: { ...(p.challengeCleared || {}), [problemId]: true },
    }));
    if (!already) {
      const gain = challengeXp(tier);
      store.addRecord(makeRecord({
        studentId: data.player.studentId, mode: "challenge",
        correct: 1, xp: gain, extra: { problemId, tier },
      }));
      setData((d) => ({ ...d, records: store.load().records }));
      addXp(gain);
    }
  }

  // チャレンジ「計算王への道」：その単元の自己ベストを更新し、XPを付与（単元ごとに記録）
  function recordCalcKing({ unitId, streak, time5 }) {
    if (!unitId) return;
    const prev = (data.player.calcKing && data.player.calcKing[unitId]) || { bestStreak: 0, bestTime5: null };
    const newBestStreak = streak > (prev.bestStreak || 0);
    // 計算王クリア（5問連続）を初めて達成したら、バトル攻撃力アップを祝う
    const justCleared = (prev.bestStreak || 0) < CALC_KING_CLEAR_STREAK && streak >= CALC_KING_CLEAR_STREAK;
    updatePlayer((p) => {
      const all = (p.calcKing && typeof p.calcKing === "object" && !("bestStreak" in p.calcKing)) ? p.calcKing : {};
      const ck = all[unitId] || { bestStreak: 0, bestTime5: null };
      return {
        ...p,
        calcKing: {
          ...all,
          [unitId]: {
            bestStreak: Math.max(ck.bestStreak || 0, streak),
            bestTime5: (time5 != null && (ck.bestTime5 == null || time5 < ck.bestTime5)) ? time5 : ck.bestTime5,
          },
        },
      };
    });
    const xp = Math.min(streak * 4, 120) + (newBestStreak ? 40 : 0); // 控えめ＋新記録ボーナス
    store.addRecord(makeRecord({
      studentId: data.player.studentId, mode: "challenge",
      correct: streak, xp, extra: { calcKing: true, unitId, streak, time5 },
    }));
    setData((d) => ({ ...d, records: store.load().records }));
    addXp(xp);
    if (justCleared) setTimeout(() => setCalcKingClear({ unitId }), 600); // クリア演出
  }

  // ショップ：アイテム購入（コイン消費・1つだけ所持＝持ち替え）
  function buyItem(itemId) {
    const it = findItem(itemId);
    if (!it) return;
    updatePlayer((p) => {
      if (playerLevel(p) < (it.unlockLv ?? 1)) return p; // レベル未達なら買えない（現在ワールドのLv）
      if ((p.coins ?? 0) < it.price) return p; // コイン不足なら何もしない
      return { ...p, coins: (p.coins ?? 0) - it.price, item: it.id };
    });
  }

  // ショップ：今のアイテムを捨てる
  function discardItem() {
    updatePlayer((p) => ({ ...p, item: null }));
  }

  // ショップ：ガチャを1回引く（コイン消費・武器/防具をコレクションに追加）。引いた装備を返す（演出用）
  function pullGacha() {
    if ((data.player.coins ?? 0) < GACHA_COST) return null;
    const id = rollGacha(); // 当たりを先に決め、結果を即返す（演出のため）
    updatePlayer((p) => {
      if ((p.coins ?? 0) < GACHA_COST) return p; // 二重引き防止
      const g = defaultGacha(p.gacha);
      const owned = { ...g.owned, [id]: (g.owned[id] || 0) + 1 };
      return { ...p, coins: (p.coins ?? 0) - GACHA_COST, gacha: { ...g, owned } };
    });
    return findGear(id);
  }

  // ショップ：武器/防具を装備（未所持は不可。同じものをもう一度押すと外す）
  function equipGear(type, gearId) {
    updatePlayer((p) => {
      const g = defaultGacha(p.gacha);
      if (gearId && !(g.owned[gearId] > 0)) return p; // 未所持
      const slot = type === "weapon" ? "weapon" : "armor";
      return { ...p, gacha: { ...g, [slot]: gearId } };
    });
  }

  // ショップ：治療（HPを全回復）。コインを消費し currentHp を満タン(null)に戻す。
  function healPlayer() {
    updatePlayer((p) => {
      const lv = playerLevel(p);
      const max = getPlayerBattleStats(lv, battleBonuses(p)).maxHp;
      const cur = p.currentHp == null ? max : p.currentHp;
      if (cur >= max) return p;            // すでに満タン
      const cost = treatCost(lv);
      if ((p.coins ?? 0) < cost) return p; // コイン不足
      return { ...p, coins: (p.coins ?? 0) - cost, currentHp: null };
    });
  }


  // ── データのバックアップ（ファイル保存／復元） ──
  function downloadBackup() {
    try {
      const json = store.exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
      a.href = url;
      a.download = `mathlabo_backup_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.warn("バックアップ保存に失敗:", e);
    }
  }
  function restoreBackup(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = store.importData(String(reader.result));
        setData({ player: data.player, records: data.records, mistakes: data.mistakes });
        cb?.(true);
      } catch (e) {
        cb?.(false, e.message || "読み込みエラー");
      }
    };
    reader.onerror = () => cb?.(false, "ファイルを読めませんでした");
    reader.readAsText(file);
  }

  // バトル相手選択：新しく解放された敵を「見た」ことにする（NEW通知の制御）
  function markMonstersSeen(ids) {
    if (!ids || ids.length === 0) return;
    updatePlayer((p) => {
      const seen = { ...(p.seenMonsters || {}) };
      for (const id of ids) seen[id] = true;
      return { ...p, seenMonsters: seen };
    });
  }

  // ── 管理用モード（先生向け）：値を自由に設定する ──
  const admin = {
    setLevel: (lv) => {
      const L = Math.max(1, Math.min(99, Math.round(lv) || 1));
      updatePlayer((p) => {
        const w = p.world || 1;
        return { ...p, worldXp: { ...(p.worldXp || { 1: 0, 2: 0, 3: 0 }), [w]: xpForLevel(L) } };
      });
    },
    setCoins: (n) => updatePlayer((p) => ({ ...p, coins: Math.max(0, Math.round(n) || 0) })),
    setSp: (n) => updatePlayer((p) => ({ ...p, sp: Math.max(0, Math.min(10, Math.round(n) || 0)) })),
    fullHeal: () => updatePlayer((p) => ({ ...p, currentHp: null })),
    maxAllStars: () => updatePlayer((p) => {
      const stars = { ...(p.stars || {}) };
      for (const ch of allChapters()) for (const u of ch.units) for (const l of ["easy", "standard", "advanced"]) stars[`${u.id}-${l}`] = 3;
      return { ...p, stars };
    }),
    unlockAllSkills: () => updatePlayer((p) => ({ ...p, ownedSkills: BATTLE_SKILLS.map((s) => s.id) })),
    clearAllMonsters: () => {
      const cleared = new Set(
        (data.records || []).filter((r) => r.mode === "battle" && r.extra && r.extra.result === "win").map((r) => r.extra.monsterId)
      );
      for (const m of MONSTERS) {
        if (!cleared.has(m.id)) {
          store.addRecord(makeRecord({ studentId: data.player.studentId, mode: "battle", xp: 0, extra: { monsterId: m.id, result: "win" } }));
        }
      }
      setData((d) => ({ ...d, records: store.load().records }));
    },
    resetProgress: () => {
      const fresh = store.resetAll();
      setData({ player: fresh.player, records: fresh.records, mistakes: fresh.mistakes });
    },
  };

  // ゴールデンタイムを「自分のタイミングで」開始（その日まだ始めていなければ）。
  //  開始から15分間 XP1.2倍。焦らないよう、ホームのボタンで任意に始められる。
  function startGolden() {
    const today = todayStr();
    if (data.player.golden?.date === today) return; // 今日はもう開始済み
    updatePlayer((p) => ({ ...p, golden: { date: today, startMs: Date.now() } }));
  }

  // キャラクター画面：自分のキャラ／名前を設定
  function setAvatar(avatar) { updatePlayer((p) => ({ ...p, avatar })); }
  function setName(name) { updatePlayer((p) => ({ ...p, name: (name || "").slice(0, 10) })); }

  // スキル画面：スロット(1|2)に装備するスキルを変える
  function setEquip(slot, skillId) {
    updatePlayer((p) => {
      const owned = p.ownedSkills || [];
      if (!owned.includes(skillId)) return p;
      return { ...p, equip: { ...(p.equip || {}), [slot]: skillId } };
    });
  }

  // バトルの結果。true=勝利, false=敗北, "retry"=やり直し
  function handleBattleResult(outcome) {
    if (outcome === "retry") { setBattleKey((k) => k + 1); return; }
    if (!battleMonster) return;
    const win = outcome === true;
    // この勝利より前に同じモンスターを倒したことがあるか
    const alreadyCleared = (data.records || []).some(
      (r) => r.mode === "battle" && r.extra && r.extra.result === "win" && r.extra.monsterId === battleMonster.id
    );
    // 撃破済みなら報酬は半分（切り上げ）
    const gained = win ? (alreadyCleared ? Math.ceil(battleMonster.reward / 2) : battleMonster.reward) : 0;
    store.addRecord(makeRecord({
      studentId: data.player.studentId, mode: "battle",
      xp: gained,
      extra: { monsterId: battleMonster.id, result: win ? "win" : "lose" },
    }));
    setData((d) => ({ ...d, records: store.load().records }));
    if (win) addXp(gained);
    // 敗北：HP1（Battle側で保存済み）でメニュー画面へ戻る
    if (!win) { setBattleMonster(null); setScreen("home"); return; }
    // 章ボス・ラスボスを初めてたおしたら、対応スキルを入手
    if (win && !alreadyCleared && (battleMonster.kind === "chapterBoss" || battleMonster.kind === "finalBoss")) {
      const dropKey = battleMonster.kind === "finalBoss" ? "final" : battleMonster.chapterId;
      const drop = skillForBossDrop(dropKey);
      if (drop) {
        let granted = false;
        updatePlayer((p) => {
          const owned = p.ownedSkills || [];
          if (owned.includes(drop.id)) return p;
          granted = true;
          return { ...p, ownedSkills: [...owned, drop.id] };
        });
        if (granted) setTimeout(() => setSkillGet(drop), 1700); // 勝利演出のあとに入手演出
      }
    }
  }

  // 効果音：ボタンのクリック（決定/戻る）を全体で拾う（ホバーの移動音は無し）
  //  ・回答ボタン等は data-sfx="none" を付け、各画面で正解/不正解音を鳴らす
  //  ・戻る系（.back-btn / data-sfx="back"）は戻る音
  useEffect(() => {
    const click = (e) => {
      const b = e.target.closest("button");
      if (!b || b.dataset.sfx === "none") return;
      if (b.classList.contains("back-btn") || b.dataset.sfx === "back") sfx.back();
      else sfx.confirm();
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);

  // 画面に合わせてBGMを切り替える（勝利/敗北/タイムアタック終了は各画面で再生）
  useEffect(() => {
    if (screen === "start") { bgm.stop(); return; }
    if (screen === "title") { bgm.play("op"); return; }
    if (screen === "timeAttack") { bgm.play("timeattack"); return; }
    if (screen === "slow") { bgm.play("slow"); return; }
    if (screen === "stepUp") { bgm.play("slow"); return; }
    if (screen === "relearnPractice") { bgm.play("slow"); return; } // 学び直しの練習はステップアップのBGM
    if (screen === "challenge" || screen === "calcKingPick") { bgm.play("unittest"); return; } // 計算王への道は単元テストの音源
    if (screen === "unitTest") { bgm.play(utChapter ? "unittest" : "menu"); return; }
    if (screen === "battle") {
      if (battleMonster) bgm.play((battleMonster.kind === "chapterBoss" || battleMonster.kind === "finalBoss") ? "boss" : "battle");
      else bgm.play("menu");
      return;
    }
    bgm.play("menu"); // home / chapter / notebook など
  }, [screen, battleMonster, utChapter, battleKey]);

  // 1日1回のログインボーナス＆ゴールデンタイム開始（ホーム到達時に1セッション1回だけ判定）
  useEffect(() => {
    if (screen !== "home" || loginCheckedRef.current) return;
    loginCheckedRef.current = true;
    const today = todayStr();
    if (!canClaimLogin(data.player, today)) return;
    const { streak, reward, isFifth } = computeLogin(data.player, today);
    updatePlayer((p) => ({
      ...p,
      coins: (p.coins || 0) + reward,
      loginStreak: streak,
      lastLoginDate: today,
    }));
    setLoginBonus({ reward, streak, isFifth });
  }, [screen]); // eslint-disable-line

  // 画面の振り分け
  const goChapter = (m) => { setMode(m); setScreen("chapter"); };

  const renderScreen = () => {
  if (screen === "start") {
    return <StartScreen onStart={() => setScreen(needsOnboard ? "transfer" : "title")} />;
  }

  // 初回起動：v4からの引き継ぎ（別ホストなのでバックアップファイルで移行）
  if (screen === "transfer") {
    return (
      <Transfer
        player={data.player}
        onImportFile={(file, cb) => restoreBackup(file, (ok, err) => { if (ok) markOnboarded(); cb?.(ok, err); })}
        onSkip={() => { markOnboarded(); setScreen("title"); }}
      />
    );
  }

  if (screen === "title") {
    return (
      <TitleScreen
        onEnter={() => setScreen("home")}
        onAdmin={() => setScreen("admin")}
        onHowTo={() => setScreen("howto")}
        onCharacter={() => setScreen("character")}
      />
    );
  }

  // 管理用モード（タイトルの📐を5回タップで開く隠しコマンド）
  if (screen === "admin") {
    return <Admin player={data.player} records={data.records} admin={admin} onExport={downloadBackup} onImport={restoreBackup} onBack={() => setScreen("home")} />;
  }

  // 遊び方（ヘルプ）
  if (screen === "howto") {
    return <HowTo player={data.player} onExport={downloadBackup} onImport={restoreBackup} onBack={() => setScreen("home")} />;
  }

  // キャラクター設定
  if (screen === "character") {
    return <Character player={data.player} onSetAvatar={setAvatar} onSetName={setName} onBack={() => setScreen("home")} />;
  }

  // 困り感クリニック（試作：1スキル）
  if (screen === "clinic") {
    return <Clinic player={data.player} onComplete={saveClinicResult} onHome={() => setScreen("home")} />;
  }

  if (screen === "chapter") {
    return (
      <ChapterSelect
        player={data.player}
        mode={mode}
        chapters={mode === "timeAttack" ? chaptersForGrade(grade) : CHAPTERS}
        onStart={(chapter, unit, level) => {
          setSel({ chapter, unit, level });
          setScreen(mode); // "timeAttack" など
        }}
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "timeAttack" && sel.unit) {
    return (
      <TimeAttack
        player={data.player}
        chapter={sel.chapter}
        unit={sel.unit}
        level={sel.level}
        onComplete={saveTimeAttackResult}
        onBackToMap={() => setScreen("chapter")}
        onHome={() => setScreen("home")}
        weakUnits={getWeakUnits(data.player, data.mistakes, data.records)}
        onWeakStart={startWeakTA}
      />
    );
  }

  // 苦手タイムアタック：苦手な小単元の問題を混ぜて出題
  if (screen === "weakTA") {
    const weak = getWeakUnits(data.player, data.mistakes, data.records);
    if (weak.length === 0) {
      return (
        <div className="app">
          <Header player={data.player} back="ホーム" onBack={() => setScreen("home")} />
          <div className="content">
            <div className="glass" style={{ padding: 18, textAlign: "center" }}>
              いまは苦手な単元が見つかりませんでした。<br />
              タイムアタックやステップアップで練習すると、苦手が見えてきます。
            </div>
          </div>
        </div>
      );
    }
    return (
      <TimeAttack
        key={"weak-" + weakKey}
        player={data.player}
        unit={buildWeakUnit(weak)}
        level="standard"
        weak
        weakUnits={weak}
        onComplete={saveWeakResult}
        onHome={() => setScreen("home")}
        onBackToMap={() => setScreen("home")}
        onWeakStart={startWeakTA}
      />
    );
  }

  if (screen === "slow" && sel.unit) {
    return (
      <SlowMode
        player={data.player}
        chapter={sel.chapter}
        unit={sel.unit}
        level={sel.level}
        onComplete={saveSlowResult}
        onBackToMap={() => setScreen("chapter")}
        onHome={() => setScreen("home")}
      />
    );
  }

  // 学び直しモード（間違いノート＋学び直しの一本化）：間違い一覧→学び直し/解説
  if (screen === "relearn") {
    return (
      <Relearn
        player={data.player}
        mistakes={data.mistakes}
        onRelearn={(unit) => { setPracticeUnit(unit); setScreen("relearnPractice"); }}
        onRemove={removeNote}
        onBack={() => setScreen("home")}
      />
    );
  }

  // 学び直しの練習（時間制限なし・1問10XP・StepUpSimpleを流用）
  if (screen === "relearnPractice" && practiceUnit) {
    return (
      <StepUpSimple
        key={"relearn-" + practiceUnit.id}
        player={data.player}
        units={[practiceUnit]}
        title={`学び直し：${practiceUnit.name}`}
        roundSize={5}
        onAttempt={recordStepAttempt}
        onHome={() => setScreen("relearn")}
      />
    );
  }

  if (screen === "shop") {
    return <Shop player={data.player} onBuy={buyItem} onDiscard={discardItem} onHeal={healPlayer} onPullGacha={pullGacha} onEquipGear={equipGear} onBack={() => setScreen("home")} />;
  }

  // スキルセット画面（スロット1/2に装備するスキルを選ぶ）
  if (screen === "skill") {
    return <Skill player={data.player} onEquip={setEquip} onBack={() => setScreen("home")} />;
  }

  // ステータス詳細（単元・小単元ごとの理解度・正答率・AIの一言）
  if (screen === "status") {
    return <StatusDetail player={data.player} records={data.records} onBack={() => setScreen("home")} />;
  }

  // 計算王への道：まず単元（章）をえらぶ
  if (screen === "calcKingPick") {
    return (
      <CalcPracticePick
        player={data.player}
        chapterMode
        title="🧮 計算王への道"
        subtitle="単元（章）を選んで、その全範囲のハイレベル問題に連続で挑戦しよう（自己ベストに挑戦）"
        onPick={(c) => { setCalcChapter(c); setScreen("challenge"); }}
        onBack={() => setScreen("home")}
      />
    );
  }

  // チャレンジ「計算王への道」：選んだ単元（章）全体から、式を書く問題を連続正解＋タイムで自己ベストに挑戦
  if (screen === "challenge" && calcChapter) {
    return (
      <Challenge
        player={data.player}
        chapter={calcChapter}
        onResult={recordCalcKing}
        onBack={() => setScreen("calcKingPick")}
        onHome={() => setScreen("home")}
      />
    );
  }

  // 間違いノートからの単元別じっくり練習（単元えらび）
  if (screen === "calcPick") {
    return (
      <CalcPracticePick
        player={data.player}
        title="📚 単元別じっくり練習"
        subtitle="単元を選んで、時間制限なしで練習しよう（間違えても止まりません）"
        onPick={(c, u) => { setPracticeUnit(u); setScreen("calcPractice"); }}
        onBack={() => setScreen("notebook")}
      />
    );
  }

  // 単元別じっくり練習（時間制限なし・StepUpSimpleを流用）
  if (screen === "calcPractice" && practiceUnit) {
    return (
      <StepUpSimple
        key={"prac-" + practiceUnit.id}
        player={data.player}
        units={[practiceUnit]}
        title={`じっくり：${practiceUnit.name}`}
        onAttempt={recordStepAttempt}
        onHome={() => setScreen("calcPick")}
      />
    );
  }

  // ステップアップ（弱点克服）モード
  //  中1：c1（正負の数）をアダプティブに出題。中2・中3：学年の単元から固定問題を出題。
  if (screen === "stepUp") {
    if (grade === 1) {
      return (
        <StepUp
          player={data.player}
          chapter={CHAPTERS[0]}
          onAttempt={recordStepAttempt}
          onHome={() => setScreen("home")}
        />
      );
    }
    const units = chaptersForGrade(grade).flatMap((c) => c.units);
    return (
      <StepUpSimple
        player={data.player}
        units={units}
        title={`ステップアップ（中${grade}）`}
        onAttempt={recordStepAttempt}
        onHome={() => setScreen("home")}
      />
    );
  }

  // バトルモード：相手選択 → 戦闘
  if (screen === "battle") {
    if (!battleMonster) {
      // これまでに撃破したモンスターのIDを集める
      const clearedIds = new Set(
        (data.records || [])
          .filter((r) => r.mode === "battle" && r.extra && r.extra.result === "win")
          .map((r) => r.extra.monsterId)
      );
      return (
        <BattleSelect
          player={data.player}
          clearedIds={clearedIds}
          onSelect={(m) => { setBattleMonster(m); setBattleKey((k) => k + 1); }}
          onSeen={markMonstersSeen}
          onBack={() => setScreen("home")}
        />
      );
    }
    return (
      <Battle
        key={battleKey}
        player={data.player}
        monster={battleMonster}
        onResult={handleBattleResult}
        onSpChange={(sp) => updatePlayer((p) => ({ ...p, sp }))}
        onItemUse={() => updatePlayer((p) => ({ ...p, item: null }))}
        onHpChange={(hp) => updatePlayer((p) => ({ ...p, currentHp: hp }))}
        onMistake={recordBattleMistake}
        onExit={() => setBattleMonster(null)}
      />
    );
  }

  // 単元テスト：章選択 → テスト
  if (screen === "unitTest") {
    if (!utChapter) {
      return <UnitTestSelect player={data.player} onStart={(c) => setUtChapter(c)} onBack={() => setScreen("home")} />;
    }
    return (
      <UnitTest
        key={utChapter.id}
        player={data.player}
        chapter={utChapter}
        onComplete={saveUnitTestResult}
        onBack={() => setUtChapter(null)}
      />
    );
  }

  // ホーム
  return (
    <Home
      player={data.player}
      records={data.records}
      mistakeCount={data.mistakes.length}
      grade={grade}
      onSetGrade={setWorld}
      onTimeAttack={() => goChapter("timeAttack")}
      onChallenge={() => setScreen("calcKingPick")}
      onBattle={() => setScreen("battle")}
      onRelearn={() => setScreen("relearn")}
      onClinic={() => setScreen("clinic")}
      onStartGolden={startGolden}
      onShop={() => setScreen("shop")}
      onSkill={() => setScreen("skill")}
      onDetail={() => setScreen("status")}
      onHowTo={() => setScreen("howto")}
      onCharacter={() => setScreen("character")}
    />
  );
  };

  return (
    <>
      <div key={screen} className={"screen-anim" + (screen === "battle" ? " is-battle" : "")}>
        {renderScreen()}
      </div>
      {screen !== "start" && <AudioToggle />}
      {levelUpTo && (
        <LevelUpOverlay
          level={levelUpTo}
          onDone={() => {
            setLevelUpTo(null);
            // レベルアップ演出のあとに、保留していた新モンスター通知を出す
            if (pendingMonsterRef.current) {
              const m = pendingMonsterRef.current;
              pendingMonsterRef.current = null;
              setTimeout(() => setNewMonster(m), 250);
            }
          }}
        />
      )}
      {loginBonus && (
        <LoginBonusOverlay
          reward={loginBonus.reward}
          streak={loginBonus.streak}
          isFifth={loginBonus.isFifth}
          onDone={() => setLoginBonus(null)}
        />
      )}
      {skillGet && <SkillGetOverlay skill={skillGet} onDone={() => setSkillGet(null)} />}
      {calcKingClear && (
        <CalcKingClearOverlay
          chapter={findChapterById(calcKingClear.unitId)}
          bonusPct={Math.round(battleBonuses(data.player).calcAtkPct * 100)}
          onDone={() => setCalcKingClear(null)}
        />
      )}
      {newMonster && <NewMonsterOverlay monster={newMonster} onDone={() => setNewMonster(null)} />}
    </>
  );
}

// タイムアタックで新しいモンスターが解放されたときの出現演出（タップで閉じる）
function NewMonsterOverlay({ monster, onDone }) {
  return (
    <div onClick={onDone} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="glass" style={{ maxWidth: 330, padding: "24px", textAlign: "center", border: `2px solid ${monster.color}`, animation: "rankUpPop .5s cubic-bezier(.2,1.4,.4,1) both" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#fde047", letterSpacing: 2 }}>✨ NEW MONSTER ✨</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", margin: "8px 0 10px" }}>新しいモンスターが出現！</div>
        <div style={{ width: 120, height: 120, margin: "0 auto", border: `2px solid ${monster.color}`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.3)" }}>
          <svg viewBox="0 0 140 140" style={{ width: 96, height: 96, overflow: "visible" }} dangerouslySetInnerHTML={{ __html: monster.svgDefs + monster.svg }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: monster.color, marginTop: 10 }}>{monster.name}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 4 }}>テーマ：{monster.unit}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 12 }}>バトルモードで挑戦できるよ！（タップで閉じる）</div>
      </div>
    </div>
  );
}

// 計算王クリア（章を5問連続）でバトル攻撃力が永続アップしたときの演出（タップで閉じる）
function CalcKingClearOverlay({ chapter, bonusPct, onDone }) {
  return (
    <div onClick={onDone} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", zIndex: 205, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="glass" style={{ maxWidth: 330, padding: "26px 24px", textAlign: "center", border: "2px solid #a855f7", animation: "rankUpPop .5s cubic-bezier(.2,1.4,.4,1) both" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#fde047", letterSpacing: 2 }}>🧮 計算王クリア！</div>
        <div style={{ fontSize: 48, margin: "8px 0" }}>⚔️✨</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>
          {chapter ? `「${chapter.name}」を制覇！` : "計算王に一歩前進！"}
        </div>
        <div style={{ fontSize: 13, color: "#d8b4fe", fontWeight: 800, marginTop: 10, lineHeight: 1.6 }}>
          計算が速くなった分、このワールドの<br /><b style={{ color: "#fbbf24" }}>バトル攻撃力 +{bonusPct}%</b>（永続）！
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 14 }}>計算王を進めるほど、バトルで強くなる！（タップで閉じる）</div>
      </div>
    </div>
  );
}

// 章ボス撃破でスキルを入手したときの演出（タップで閉じる）
function SkillGetOverlay({ skill, onDone }) {
  return (
    <div onClick={onDone} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="glass" style={{ maxWidth: 320, padding: "26px 24px", textAlign: "center", border: `2px solid ${skill.color}`, animation: "rankUpPop .5s cubic-bezier(.2,1.4,.4,1) both" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#fde047", letterSpacing: 2 }}>✨ SKILL GET! ✨</div>
        <div style={{ fontSize: 56, margin: "10px 0" }}>{skill.icon}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: skill.color }}>{skill.name}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", margin: "8px 0 14px", lineHeight: 1.5 }}>{skill.desc}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>「スキル」画面でスロット{skill.slot}に装備できるよ！</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 12 }}>タップで閉じる</div>
      </div>
    </div>
  );
}
