// ============================================================
// Battle.jsx — モンスターと4択クイズで戦う画面
//  正解 → モンスターにダメージ＋中央に光る◯＋コンボ
//  不正解・時間切れ → 解答欄が左右に高速で揺れる＋被ダメ（赤フラッシュ・画面揺れ）
//  問題は単元テスト級（標準・発展）。HP0で勝敗が決まる。
// ============================================================
import { useState, useEffect, useRef } from "react";
import MonsterSprite from "../components/MonsterSprite.jsx";
import Avatar from "../components/Avatar.jsx";
import { BigWord, StarField } from "../components/Decorations.jsx";
import MathText from "../components/MathText.jsx";
import * as bgm from "../audio/bgm.js";
import * as sfx from "../audio/sfx.js";
import { getPlayerBattleStats, calcDamage, genBattleProblem, getEquippedSkills, SP_MAX, ultimateDamage, enemyDecide, battleBonuses } from "../engine/battle.js";
import { findItem } from "../engine/items.js";
import { isCorrect, playerLevel } from "../engine/scoring.js";

const ENEMY_CHARGE_NEED = 2; // super型が超必殺を撃つまでのチャージ回数（engine ENEMY_AI.super と一致）

export default function Battle({ player, monster, onResult, onSpChange, onItemUse, onHpChange, onWinBonus, onExit, onMistake }) {
  const lv = playerLevel(player); // 現在ワールド（学年）のレベルでバトル能力が決まる
  // 制限時間 = 基本の制限時間 × (自分のレベル+10) ÷ (敵の適正レベル+10)（切り上げ）
  //  +10で格差をマイルドに。自分が強いほど長く、格上の敵だと短くなる。最低1秒。
  const stats = useRef((() => {
    const base = getPlayerBattleStats(lv, battleBonuses(player));
    const ratio = (lv + 10) / ((monster.minLv || 1) + 10);
    const timer = Math.max(1, Math.ceil(base.timer * ratio));
    return { ...base, timer };
  })()).current;

  // バトル開始HP：前回の続き(currentHp)があればそこから。null=満タン。最低1。
  const startHp = player.currentHp == null ? stats.maxHp : Math.max(1, Math.min(stats.maxHp, player.currentHp));
  const [playerHp, setPlayerHp] = useState(startHp);
  const [monsterHp, setMonsterHp] = useState(monster.hp);
  const [q, setQ] = useState(() => genBattleProblem(monster));
  const [timer, setTimer] = useState(stats.timer);
  const [combo, setCombo] = useState(0);
  const [sp, setSp] = useState(() => Math.min(SP_MAX, player.sp ?? 0)); // スキルポイント（永続）
  const [skillFx, setSkillFx] = useState(null);  // 発動中スキル/アイテムの画面演出 { name, icon, color }
  const [item, setItem] = useState(player.item || null); // 所持アイテム（1つ）
  const [atkBuff, setAtkBuff] = useState(null); // 攻撃バフ { turns, mult }（アイテム/スキル）
  const [guardBuff, setGuardBuff] = useState(null); // 防御バフ { turns, reduce }（アイテム）
  const [regen, setRegen] = useState(null); // 継続回復 { turns, pct }（リジェネ）
  const equipped = getEquippedSkills(player); // 装備中スキル（スロット1/2）
  const [phase, setPhase] = useState("intro"); // intro | fight | win | lose
  const [input, setInput] = useState("");      // 文字入力の答え
  const [locked, setLocked] = useState(false);
  const [monState, setMonState] = useState("idle");
  const [animKey, setAnimKey] = useState(0);
  const [log, setLog] = useState(`${monster.name} があらわれた！`);

  // 視覚効果
  const [showRing, setShowRing] = useState(false);   // 正解の◯
  const [shakeAns, setShakeAns] = useState(false);   // 不正解の解答欄ゆれ
  const [hurt, setHurt] = useState(false);           // 被ダメ（赤＋画面ゆれ）
  const [monDmg, setMonDmg] = useState(null);        // モンスターのダメージ数字
  const [dmgKey, setDmgKey] = useState(0);
  const [deadParticles, setDeadParticles] = useState([]);
  const [enemyFx, setEnemyFx] = useState(null);      // 敵の行動演出 { icon, label, color }
  const [enemyIntent, setEnemyIntent] = useState(null); // 敵の「ため」状態の予告 { text, color }
  const [charging, setCharging] = useState(false);   // ためている間のオーラ
  const aiStateRef = useRef({ charged: false, superCount: 0 }); // 敵のためチャージ状態

  // 安定参照（タイマーから最新処理を呼ぶ）
  const lockedRef = useRef(false);
  const phaseRef = useRef("intro");
  const endedRef = useRef(false); // 勝敗確定の二重発火を防ぐ
  const atkBuffRef = useRef(null); // 攻撃バフ { turns, mult }（setTimeout経由でも正しく参照）
  const guardBuffRef = useRef(null); // 防御バフ { turns, reduce }
  const regenRef = useRef(null); // 継続回復 { turns, pct }
  const timerRef = useRef(stats.timer);
  const actionsRef = useRef({});
  const inputRef = useRef(null);
  const playerHpRef = useRef(startHp); // 最新の自分のHP（戦闘終了時に持ち越し保存する用）
  useEffect(() => { playerHpRef.current = playerHp; }, [playerHp]);
  // maxHp と同じなら満タン扱い(null)。それ以外は実数で持ち越す。
  const saveHp = (hp) => onHpChange?.(hp >= stats.maxHp ? null : Math.max(0, Math.round(hp)));
  // 新しい問題になったら（ロック解除中は）入力欄にフォーカス
  useEffect(() => { if (!locked && phaseRef.current === "fight") inputRef.current?.focus(); }, [q, locked]);

  // ── 追加スキルのための状態（refで即時参照、UIに出すものは state も） ──
  const timeBuffRef = useRef(null);   // { turns, mult, inf } 次の数問の制限時間を伸ばす
  const poisonRef = useRef(null);     // { turns, dmg } 敵への継続ダメージ
  const comboKeepRef = useRef(null);  // { turns } ミスしてもコンボ維持
  const doubleNextRef = useRef(false);// 次の正解ダメージ2回ぶん
  const critRef = useRef(null);       // { turns } コンボ会心ボーナス2倍
  const counterRef = useRef(null);    // { turns, dmg } 被弾時に反撃
  const reviveRef = useRef(false);    // HP0で一度だけ復活
  const winBonusRef = useRef({ coins: 0, crystals: 0 }); // 勝利時ボーナスの累積
  const [buffTags, setBuffTags] = useState([]); // 画面上のバフ表示用（簡易）
  // 画面のバフ表示を再計算
  function refreshBuffTags() {
    const tags = [];
    if (timeBuffRef.current) tags.push({ icon: "⏱️", color: "#67e8f9" });
    if (poisonRef.current) tags.push({ icon: "☠️", color: "#a3e635" });
    if (comboKeepRef.current) tags.push({ icon: "🔗", color: "#fbbf24" });
    if (doubleNextRef.current) tags.push({ icon: "✌️", color: "#facc15" });
    if (critRef.current) tags.push({ icon: "🎯", color: "#fb7185" });
    if (counterRef.current) tags.push({ icon: "🪃", color: "#38bdf8" });
    if (reviveRef.current) tags.push({ icon: "🕊️", color: "#fb923c" });
    setBuffTags(tags);
  }

  const setTimerBoth = (v) => { timerRef.current = v; setTimer(v); };
  // バフは ref（即時参照）と state（表示）を両方更新する
  const setAtkBuffBoth = (v) => { atkBuffRef.current = v; setAtkBuff(v); };
  const setGuardBuffBoth = (v) => { guardBuffRef.current = v; setGuardBuff(v); };
  const setRegenBoth = (v) => { regenRef.current = v; setRegen(v); };

  // 毎秒のカウントダウン（ロック中・戦闘終了中は止める）
  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current !== "fight" || lockedRef.current) return;
      const next = timerRef.current - 1;
      if (next <= 0) { setTimerBoth(stats.timer); actionsRef.current.miss?.(); }
      else setTimerBoth(next);
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  function nextQuestion() {
    // 継続回復（リジェネ）：1ターンごとに少しずつ回復し、残りターンを減らす
    const rg = regenRef.current;
    if (rg && rg.turns > 0) {
      const amt = Math.max(1, Math.round(stats.maxHp * rg.pct));
      setPlayerHp((hp) => Math.min(stats.maxHp, hp + amt));
      const left = rg.turns - 1;
      setRegenBoth(left > 0 ? { ...rg, turns: left } : null);
    }
    // 毒（ポイズン）：1問ごとに敵へ継続ダメージ
    const ps = poisonRef.current;
    if (ps && ps.turns > 0) {
      const dmg = ps.dmg;
      setMonDmg(`-${dmg}`); setDmgKey((k) => k + 1);
      setMonsterHp((hp) => {
        const nv = Math.max(0, hp - dmg);
        if (nv <= 0 && !endedRef.current) setTimeout(triggerWin, 300);
        return nv;
      });
      poisonRef.current = ps.turns - 1 > 0 ? { ...ps, turns: ps.turns - 1 } : null;
    }
    setQ((cur) => genBattleProblem(monster, cur?.id));
    setInput("");
    setLocked(false); lockedRef.current = false;
    // 制限時間：時間バフ（しゅうちゅう／タイムフリーズ等）があれば伸ばす
    const tb = timeBuffRef.current;
    let t = stats.timer;
    if (tb && tb.turns > 0) {
      t = tb.inf ? 99 : Math.min(99, Math.ceil(stats.timer * (tb.mult ?? 1.5)));
      timeBuffRef.current = tb.turns - 1 > 0 ? { ...tb, turns: tb.turns - 1 } : null;
    }
    setTimerBoth(t);
    refreshBuffTags();
  }

  // SPを変更して即保存（バトルをまたいで維持されるよう App 側へ通知）
  function changeSp(nv) {
    const v = Math.max(0, Math.min(SP_MAX, nv));
    setSp(v);
    onSpChange?.(v);
    return v;
  }

  // スキル発動（SPを消費）。time2x=回答時間2倍 / ultimate=必殺技（基本ダメージのmult倍）
  function useSkill(skill) {
    if (phaseRef.current !== "fight" || endedRef.current || lockedRef.current) return;
    if (sp < skill.cost) return;
    changeSp(sp - skill.cost);
    const isUlt = skill.kind === "ultimate" || skill.kind === "drain" || (skill.kind === "burst" && (skill.mult ?? 0) > 0);
    sfx.skill({ ult: isUlt });
    setSkillFx({ name: skill.name, icon: skill.icon, color: skill.color, big: isUlt });
    setTimeout(() => setSkillFx(null), 2000);

    if (skill.kind === "time2x") {
      const mult = skill.timeMult ?? 2;
      setTimerBoth(Math.min(99, Math.ceil(timerRef.current * mult)));
      setLog(`${skill.icon} ${skill.name}！ 考える時間が${mult}倍になった！`);
    } else if (skill.kind === "heal") {
      const amt = Math.round(stats.maxHp * (skill.value ?? 0.3));
      setPlayerHp((hp) => Math.min(stats.maxHp, hp + amt));
      setLog(`${skill.icon} ${skill.name}！ HPが ${amt} 回復した！`);
    } else if (skill.kind === "regen") {
      setRegenBoth({ turns: skill.turns ?? 3, pct: skill.pct ?? 0.15 });
      setLog(`${skill.icon} ${skill.name}！ ${skill.turns}ターン 毎ターン回復し続ける！`);
    } else if (skill.kind === "guard") {
      setGuardBuffBoth({ turns: skill.turns ?? 2, reduce: skill.reduce ?? 0.5 });
      setLog(`${skill.icon} ${skill.name}！ ${skill.turns}ターン 受けるダメージを軽減！`);
    } else if (skill.kind === "dmgup") {
      setAtkBuffBoth({ turns: skill.turns ?? 2, mult: skill.mult ?? 1.5 });
      setLog(`${skill.icon} ${skill.name}！ ${skill.turns}ターン 与ダメージ${skill.mult}倍！`);
    } else if (skill.kind === "timebuff") {
      timeBuffRef.current = { turns: skill.turns ?? 2, mult: skill.mult ?? 1.5, inf: !!skill.inf };
      // 今出ている問題にも即反映
      setTimerBoth(skill.inf ? 99 : Math.min(99, Math.ceil(timerRef.current * (skill.mult ?? 1.5))));
      refreshBuffTags();
      setLog(`${skill.icon} ${skill.name}！ ${skill.inf ? "制限時間がなくなった！" : `${skill.turns}問のあいだ 時間に余裕ができた！`}`);
    } else if (skill.kind === "poison") {
      poisonRef.current = { turns: skill.turns ?? 3, dmg: Math.max(1, Math.round(stats.atk * (skill.mult ?? 1.2))) };
      refreshBuffTags();
      setLog(`${skill.icon} ${skill.name}！ 敵を毒におかした！（${skill.turns}ターン継続ダメージ）`);
    } else if (skill.kind === "combokeep") {
      comboKeepRef.current = { turns: skill.turns ?? 3 };
      refreshBuffTags();
      setLog(`${skill.icon} ${skill.name}！ ${skill.turns}ターン コンボが切れなくなった！`);
    } else if (skill.kind === "doublenext") {
      doubleNextRef.current = true;
      refreshBuffTags();
      setLog(`${skill.icon} ${skill.name}！ 次の正解のダメージが2倍だ！`);
    } else if (skill.kind === "critup") {
      critRef.current = { turns: skill.turns ?? 3 };
      refreshBuffTags();
      setLog(`${skill.icon} ${skill.name}！ ${skill.turns}ターン コンボの会心ボーナスが2倍！`);
    } else if (skill.kind === "counter") {
      counterRef.current = { turns: skill.turns ?? 3, dmg: Math.max(1, Math.round(stats.atk * (skill.mult ?? 2))) };
      refreshBuffTags();
      setLog(`${skill.icon} ${skill.name}！ ${skill.turns}ターン 被弾するたび反撃する！`);
    } else if (skill.kind === "revive") {
      reviveRef.current = true;
      refreshBuffTags();
      setLog(`${skill.icon} ${skill.name}！ 倒れても一度だけ復活できる！`);
    } else if (skill.kind === "winbonus") {
      winBonusRef.current = {
        coins: (winBonusRef.current.coins || 0) + (skill.coins || 0),
        crystals: (winBonusRef.current.crystals || 0) + (skill.crystals || 0),
      };
      setLog(`${skill.icon} ${skill.name}！ 勝つとごほうびが増える！`);
    } else if (skill.kind === "ultimate" || skill.kind === "drain" || skill.kind === "burst") {
      // burst：与ダメ倍・時間無制限・継続回復などのバフを同時付与
      if (skill.kind === "burst") {
        if (skill.buffMult) setAtkBuffBoth({ turns: skill.buffTurns ?? 3, mult: skill.buffMult });
        if (skill.timeInf) { timeBuffRef.current = { turns: skill.timeInf, inf: true }; setTimerBoth(99); }
        if (skill.regenPct) setRegenBoth({ turns: skill.regenTurns ?? 5, pct: skill.regenPct });
        refreshBuffTags();
      }
      const dmg = (skill.mult ?? 0) > 0 ? ultimateDamage(stats.atk, skill.mult) : 0;
      if (dmg <= 0) {
        // ダメージなし（ゼロカウント／オーバーロード等）はバフのみ
        setLog(`${skill.icon} ${skill.name}発動！ 力がみなぎる！`);
        return;
      }
      // カットイン演出を見せてから着弾させる（倒した瞬間の余韻を出す）
      setTimeout(() => {
        if (endedRef.current) return;
        setMonState("damage"); setAnimKey((k) => k + 1);
        setMonDmg(`-${dmg}`); setDmgKey((k) => k + 1);
        setShowRing(true); setTimeout(() => setShowRing(false), 700);
        if (skill.kind === "drain") {
          const heal = Math.round(dmg * (skill.drain ?? 0.4));
          setPlayerHp((hp) => Math.min(stats.maxHp, hp + heal));
          setLog(`${skill.icon} ${skill.name}！ ${dmg}ダメージ＋HP ${heal} 回復！`);
        } else {
          setLog(`${skill.icon} ${skill.name}さくれつ！ ${dmg}ダメージ！`);
        }
        setMonsterHp((hp) => {
          const nv = Math.max(0, hp - dmg);
          if (nv <= 0) setTimeout(triggerWin, 800);
          else setTimeout(() => setMonState("idle"), 700);
          return nv;
        });
      }, 1500);
    }
  }

  // アイテムを使う（1つだけ所持・使うと消費して永続データからも消す）
  function useItem() {
    if (!item || phaseRef.current !== "fight" || endedRef.current) return;
    const it = findItem(item);
    if (!it) return;
    setItem(null); onItemUse?.(); // 在庫から消す（バトルをまたいで消費が残る）
    setSkillFx({ name: it.name, icon: it.icon, color: it.color });
    setTimeout(() => setSkillFx(null), 2000);
    sfx.skill();

    if (it.kind === "heal") {
      const amt = Math.round(stats.maxHp * (it.value ?? 0.5));
      setPlayerHp((hp) => Math.min(stats.maxHp, hp + amt));
      setLog(`${it.icon} ${it.name}！ HPが ${amt} 回復した！`);
    } else if (it.kind === "atk2x") {
      const turns = it.turns ?? 1;
      setAtkBuffBoth({ turns, mult: 2 });
      setLog(`${it.icon} ${it.name}！ ${turns === 1 ? "次の攻撃" : `${turns}ターン`}ダメージが2倍だ！`);
    } else if (it.kind === "guard") {
      const turns = it.turns ?? 2;
      const reduce = it.reduce ?? 0.5;
      setGuardBuffBoth({ turns, reduce });
      setLog(`${it.icon} ${it.name}！ ${turns}ターン 受けるダメージが${reduce <= 0.25 ? "1/4" : reduce <= 0.34 ? "約1/3" : "1/2"}になる！`);
    } else if (it.kind === "sp" || it.kind === "sp5") {
      const amt = it.value ?? 5;
      changeSp(sp + amt);
      setLog(`${it.icon} ${it.name}！ スキルポイントが ${amt} 増えた！`);
    }
  }

  function triggerWin() {
    if (endedRef.current) return;
    endedRef.current = true;
    // 勝利ボーナス（ついてる／クリスタルラック等のスキル効果）を反映
    const wb = winBonusRef.current;
    if (wb && (wb.coins || wb.crystals)) onWinBonus?.({ coins: wb.coins || 0, crystals: wb.crystals || 0 });
    saveHp(playerHpRef.current); // 勝っても全快しない：残りHPを持ち越す
    setPhase("win"); phaseRef.current = "win";
    bgm.play("victory", { loop: false });
    setMonState("dead"); setAnimKey((k) => k + 1);
    const parts = Array.from({ length: 16 }, (_, i) => {
      const ang = (i * (360 / 16)) * Math.PI / 180;
      const r = 50 + Math.random() * 60;
      return {
        i, size: 6 + Math.random() * 9,
        color: monster.deathColors[i % monster.deathColors.length],
        tx: Math.cos(ang) * r, ty: Math.sin(ang) * r, rot: Math.random() * 360,
        round: Math.random() > 0.5,
      };
    });
    setDeadParticles(parts);
    setLog(`${monster.name} をたおした！✨ +${monster.reward}XP`);
    setTimeout(() => onResult(true), 1500);
  }

  function triggerLose() {
    if (endedRef.current) return;
    // フェニックス：HP0でも一度だけ全回復で復活
    if (reviveRef.current) {
      reviveRef.current = false;
      refreshBuffTags();
      setPlayerHp(stats.maxHp);
      setHurt(false);
      setLog("🕊️ フェニックス！ 倒れたが全回復で復活した！");
      sfx.skill({ ult: true });
      return;
    }
    endedRef.current = true;
    saveHp(1); // 敗北：HP1で生き残る（ショップで治療して再挑戦）
    setPhase("lose"); phaseRef.current = "lose";
    bgm.play("defeat", { loop: false });
    setLog("あなたはたおれてしまった…💀");
    setTimeout(() => onResult(false), 1200);
  }

  // 敵の演出を中央に一瞬出す
  function showEnemyFx(fx) {
    setEnemyFx(fx);
    setTimeout(() => setEnemyFx(null), 1100);
  }

  // 敵の攻撃を実際に当てる（ガード・画面ゆれ・被ダメ・敗北判定）
  function enemyHit(rawDmg, label, fx) {
    // 1パン防止：1回の被ダメは最大HPの70%まで（満タンからの即死を避ける）
    let dmg = Math.max(1, Math.min(Math.round(rawDmg), Math.ceil(stats.maxHp * 0.7)));
    let guarded = false, invinc = false;
    const gb = guardBuffRef.current;
    if (gb && gb.turns > 0) {
      if ((gb.reduce ?? 0.5) <= 0) { dmg = 0; invinc = true; } // 完全無敵
      else { dmg = Math.max(1, Math.round(dmg * gb.reduce)); guarded = true; }
      const left = gb.turns - 1;
      setGuardBuffBoth(left > 0 ? { ...gb, turns: left } : null);
    }
    setShakeAns(true); setTimeout(() => setShakeAns(false), 460);
    if (dmg > 0) { setHurt(true); setTimeout(() => setHurt(false), 520); }
    setMonState("attack"); setAnimKey((k) => k + 1);
    if (fx) showEnemyFx(fx);
    setLog(`${label} -${dmg}` + (invinc ? "（🌟無敵！）" : guarded ? "（🛡️ガード！）" : ""));
    setPlayerHp((hp) => {
      const nv = Math.max(0, hp - dmg);
      if (nv <= 0) setTimeout(triggerLose, 500);
      return nv;
    });
    // カウンター：被弾するたび反撃（1ターン消費）
    const ct = counterRef.current;
    if (ct && ct.turns > 0 && dmg > 0) {
      counterRef.current = ct.turns - 1 > 0 ? { ...ct, turns: ct.turns - 1 } : null;
      refreshBuffTags();
      setTimeout(() => {
        if (endedRef.current) return;
        setMonDmg(`-${ct.dmg}`); setDmgKey((k) => k + 1);
        setMonState("damage"); setAnimKey((k) => k + 1);
        setLog(`🪃 カウンター！ ${ct.dmg}ダメージ！`);
        setMonsterHp((hp) => {
          const nv = Math.max(0, hp - ct.dmg);
          if (nv <= 0 && !endedRef.current) setTimeout(triggerWin, 400);
          else setTimeout(() => setMonState("idle"), 500);
          return nv;
        });
      }, 600);
    }
  }

  // 敵のターン（プレイヤーの不正解・時間切れで回ってくる）。AIに従って行動を分岐。
  function enemyTurn(reason) {
    // コンボキープ中はミスしてもコンボ維持（1チャージ消費）。それ以外は0に戻す。
    const ck = comboKeepRef.current;
    if (ck && ck.turns > 0) {
      comboKeepRef.current = ck.turns - 1 > 0 ? { ...ck, turns: ck.turns - 1 } : null;
      refreshBuffTags();
    } else {
      setCombo(0);
    }
    const { st, act } = enemyDecide(monster.ai || "plain", aiStateRef.current, monster);
    aiStateRef.current = st;
    const pre = reason ? reason + " " : "";

    // 敵の「ため」状態を予告バッジに反映
    if (monster.ai === "charger") setEnemyIntent(st.charged ? { text: "⚡ ためた！次の一撃は2倍", color: "#fbbf24" } : null);
    else if (monster.ai === "super") setEnemyIntent(st.superCount > 0 ? { text: `💥 超必殺まであと ${ENEMY_CHARGE_NEED - st.superCount + 1}`, color: "#f472b6" } : null);

    if (act.kind === "charge") {
      setCharging(true);
      setMonState("idle"); setAnimKey((k) => k + 1);
      showEnemyFx({ icon: "⚡", label: monster.ai === "super" ? "チャージ中…" : "ためている…", color: "#fbbf24" });
      setLog(`${pre}${monster.name} は ${act.label}`);
      return;
    }
    setCharging(false);

    if (act.kind === "heal") {
      const amt = Math.max(1, Math.round(monster.hp * act.healPct));
      setMonsterHp((hp) => Math.min(monster.hp, hp + amt));
      setMonState("idle"); setAnimKey((k) => k + 1);
      showEnemyFx({ icon: "💚", label: "かいふく！", color: "#4ade80" });
      setLog(`${pre}${monster.name} は ${act.label} ＋${amt}`);
      return;
    }

    // 攻撃系（attack / magic / fire / burst / super）
    const FX = {
      magic: { icon: "🔮", label: "まほう！", color: "#a78bfa" },
      fire:  { icon: "🔥", label: "炎のブレス！", color: "#fb923c" },
      burst: { icon: "💢", label: "ためた一撃！", color: "#f87171" },
      super: { icon: "💥", label: "超必殺技！", color: "#f472b6" },
    };
    if (act.kind === "super" || act.kind === "burst") setEnemyIntent(null); // 撃ったので予告クリア
    enemyHit(monster.atk * (act.mult || 1), `${pre}${monster.name} ${act.label}`, FX[act.kind] || null);
  }

  function answer(val) {
    if (locked || phaseRef.current !== "fight" || !q || val === "" || val == null) return;
    setLocked(true); lockedRef.current = true;
    const ok = isCorrect(val, q.ans);

    if (ok) {
      sfx.correct();
      const newCombo = combo + 1;
      setCombo(newCombo);
      changeSp(sp + 1); // 正解でSP+1（5でスキル1、10でスキル2）
      let dmg = calcDamage(stats.atk, newCombo);
      let boosted = false, crit = false, doubled = false;
      // クリティカル：コンボ会心ボーナス（atk×0.5）をもう一段ぶん上乗せ
      const cr = critRef.current;
      if (cr && cr.turns > 0) {
        if (newCombo >= 3) { dmg += Math.floor(stats.atk * 0.5); crit = true; }
        critRef.current = cr.turns - 1 > 0 ? { ...cr, turns: cr.turns - 1 } : null;
      }
      const ab = atkBuffRef.current;
      if (ab && ab.turns > 0) {
        dmg = Math.round(dmg * ab.mult);
        boosted = true;
        const left = ab.turns - 1;
        setAtkBuffBoth(left > 0 ? { ...ab, turns: left } : null);
      }
      // ダブルアップ：次の正解ダメージを2倍（1回だけ）
      if (doubleNextRef.current) { dmg *= 2; doubled = true; doubleNextRef.current = false; }
      refreshBuffTags();
      setShowRing(true); setTimeout(() => setShowRing(false), 700);
      setMonState("damage"); setAnimKey((k) => k + 1);
      setMonDmg(`-${dmg}`); setDmgKey((k) => k + 1);
      setLog(
        (doubled ? "✌️ダブルアップ！ " : "") + (crit ? "🎯会心！ " : "") + (boosted ? "💪パワーアップ！ " : "") +
        (newCombo >= 3 ? `正解！🔥${newCombo}コンボ ${dmg}ダメージ！` : `正解！${dmg}ダメージ！`)
      );
      setMonsterHp((hp) => {
        const nv = Math.max(0, hp - dmg);
        if (nv <= 0) setTimeout(triggerWin, 350);
        else setTimeout(() => { setMonState("idle"); nextQuestion(); }, 700);
        return nv;
      });
    } else {
      sfx.wrong();
      // 間違えた問題を「学び直しモード」へ記録（バトルの誤答も復習対象に）
      onMistake?.({ q: q.q, ans: q.ans, unitId: q.unitId, level: q.level });
      enemyTurn(`不正解…(正解 ${q.ans})`);
      setTimeout(() => { if (phaseRef.current === "fight") { setMonState("idle"); nextQuestion(); } }, 950);
    }
  }

  // 時間切れ＝ミス（タイマーから呼ばれる。最新版を毎レンダー登録）
  actionsRef.current.miss = () => {
    if (lockedRef.current || phaseRef.current !== "fight") return;
    setLocked(true); lockedRef.current = true;
    sfx.wrong();
    if (q) onMistake?.({ q: q.q, ans: q.ans, unitId: q.unitId, level: q.level }); // 時間切れも学び直しへ
    enemyTurn("⏰時間切れ！");
    setTimeout(() => { if (phaseRef.current === "fight") { setMonState("idle"); nextQuestion(); } }, 850);
  };

  const monHpPct = Math.max(0, (monsterHp / monster.hp) * 100);
  const plHpPct = Math.max(0, (playerHp / stats.maxHp) * 100);
  const timePct = (timer / stats.timer) * 100;
  const hpColor = (p) => (p > 50 ? "linear-gradient(90deg,#00cc44,#00ff88)" : p > 25 ? "linear-gradient(90deg,#cc9900,#ffcc00)" : "linear-gradient(90deg,#cc2200,#ff4400)");

  // ---- 勝敗画面 ----
  if (phase === "win" || phase === "lose") {
    const win = phase === "win";
    return (
      <div className="battle-app">
        <StarField />
        <div className="bt-moon" />
        <div className="battle-ground" />
        <div className="battle-content" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 64 }}>{win ? "🎉" : "💀"}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: win ? "#7fff7f" : "#ff6b6b", textShadow: win ? "0 0 18px #00ff88" : "none" }}>
            {win ? "勝利！" : "敗北…"}
          </div>
          <div style={{ fontSize: 13, color: "#cceebb", margin: "6px 0 14px" }}>
            {win ? `${monster.name} をたおした！ +${monster.reward}XP を獲得！` : `${monster.name} に やられてしまった…`}
          </div>
          {!win && <div style={{ fontSize: 12, color: "#88aa88", marginBottom: 14, maxWidth: 300 }}>💡 XPを貯めてレベルを上げると、HP・攻撃力・考える時間が増えて有利になります。<br />HP1でメニューに戻ります。ショップで治療してから再挑戦しよう。</div>}
          {win ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button className="bt-choice" style={{ padding: "12px 18px" }} onClick={onExit}>👾 相手を選ぶ</button>
              <button className="bt-choice" style={{ padding: "12px 18px", borderColor: "#7fff7f" }} onClick={() => onResult("retry")}>🔁 もう一度</button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#cceebb", fontWeight: 700 }}>メニューにもどります…</div>
          )}
        </div>
      </div>
    );
  }

  // ---- 戦闘中 ----
  return (
    <div className={"battle-app" + (hurt ? " bt-screen-shake" : "")}>
      <div className="encounter-flash" />
      {phase === "intro" && <BigWord text="START!" color="#7fff7f" onDone={() => { phaseRef.current = "fight"; setPhase("fight"); }} />}
      <StarField />
      <div className="bt-moon" />
      {hurt && <div className="bt-damage-overlay show" />}
      {skillFx && (
        <div className={"bt-skill-fx" + (skillFx.big ? " is-ult" : "")} style={{ "--sc": skillFx.color }}>
          <div className="sc-flash" />
          <div className="sc-rays" />
          <div className="sc-band" />
          <div className="sc-burst" />
          <div className="sc-core">
            <span className="sc-ic">{skillFx.icon}</span>
            <span className="sc-nm">{skillFx.name}！</span>
          </div>
        </div>
      )}
      <div className="battle-ground" />
      <div className="battle-content">
        {/* 敵ステータス */}
        <div className="bt-panel">
          <span className="bt-enemy-name" style={{ color: monster.color }}>{monster.name}</span>
          <span className="bt-enemy-theme">【{monster.unit}】</span>
          {enemyIntent && (
            <span className="bt-intent" style={{ "--ic": enemyIntent.color }}>{enemyIntent.text}</span>
          )}
          <div className="bt-hp-row">
            <span className="bt-hp-label">HP</span>
            <div className="bt-hp-track"><div className="bt-hp-fill" style={{ width: monHpPct + "%", background: hpColor(monHpPct) }} /></div>
            <span className="bt-hp-num">{Math.max(0, monsterHp)} / {monster.hp}</span>
          </div>
        </div>

        {/* モンスター舞台 */}
        <div className="bt-stage">
          {charging && <div className="bt-charge-aura" />}
          {monDmg && <div key={dmgKey} className="mon-dmg-num show">{monDmg}</div>}
          {enemyFx && (
            <div className="bt-enemy-fx" style={{ "--ec": enemyFx.color }}>
              <span className="ic">{enemyFx.icon}</span>
              <span className="nm">{enemyFx.label}</span>
            </div>
          )}
          {showRing && <><div className="correct-ring show" /><div className="correct-flash show" /></>}
          <MonsterSprite monster={monster} state={monState} animKey={animKey} />
          {deadParticles.length > 0 && (
            <div className="bt-particles">
              {deadParticles.map((p) => (
                <div key={p.i} className="bt-dp burst" style={{
                  width: p.size, height: p.size, background: p.color,
                  borderRadius: p.round ? "50%" : "2px",
                  "--tx": p.tx + "px", "--ty": p.ty + "px", "--r": p.rot + "deg",
                  animationDelay: p.i * 0.03 + "s",
                }} />
              ))}
            </div>
          )}
        </div>

        {/* タイマー＋コンボ */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#88aa88" }}>のこり</span>
          <div className="bt-timer-track" style={{ flex: 1 }}>
            <div className="bt-timer-fill" style={{ width: timePct + "%", background: timer > stats.timer * 0.4 ? "#4ade80" : timer > stats.timer * 0.2 ? "#fbbf24" : "#f87171" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#cceebb", minWidth: 28, textAlign: "right" }}>{timer}</span>
          {combo >= 2 && <span className="bt-combo">🔥{combo}</span>}
          {buffTags.map((b, i) => (
            <span key={i} style={{ fontSize: 14, filter: `drop-shadow(0 0 3px ${b.color})` }}>{b.icon}</span>
          ))}
        </div>

        {/* 問題＋文字入力 */}
        <div className="bt-q-panel">
          {q ? (
            <>
              <span className="bt-q-theme">{q.unitName} ・ {q.level === "advanced" ? "発展" : "標準"}</span>
              <div className="bt-q-text"><MathText>{q.q}</MathText></div>
              <div className={"ans-row" + (shakeAns ? " answer-shake" : "")}>
                <input
                  ref={inputRef} className="ans-in" type="text" inputMode="text" value={input}
                  disabled={locked}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") answer(input); }}
                  placeholder="例: -5 や 1/2"
                />
                <button className="ok-btn" data-sfx="none" disabled={locked || input === ""} onClick={() => answer(input)}>⚔️</button>
              </div>
            </>
          ) : <div style={{ color: "#cceebb" }}>問題を準備中…</div>}
        </div>

        {/* スキル（SP） */}
        <div className="bt-skill-bar">
          <div className="bt-sp">
            <span className="bt-sp-label">SP</span>
            <div className="bt-sp-cells">
              {Array.from({ length: SP_MAX }).map((_, i) => (
                <span
                  key={i}
                  className={"bt-sp-cell" + (i < sp ? " on" : "") + (i === 4 || i === 9 ? " notch" : "")}
                />
              ))}
            </div>
            <span className="bt-sp-num">{sp}/{SP_MAX}</span>
          </div>
          <div className="bt-skill-btns">
            {equipped.map((s) => {
              const ready = sp >= s.cost;
              return (
                <button
                  key={s.id}
                  className={"bt-skill-btn" + (ready ? " ready" : "")}
                  data-sfx="none"
                  disabled={!ready || locked}
                  onClick={() => useSkill(s)}
                  style={{ "--sc": s.color }}
                  title={s.desc}
                >
                  <span className="ic">{s.icon}</span>
                  <span className="nm">{s.name}</span>
                  <span className="ct">{s.cost} SP</span>
                </button>
              );
            })}
          </div>

          {/* アイテム（1つだけ持てる） */}
          <div className="bt-item-row">
            {(() => {
              const it = item ? findItem(item) : null;
              return it ? (
                <button className="bt-item-btn" data-sfx="none" onClick={useItem} disabled={endedRef.current} title={it.desc}>
                  <span className="ic">{it.icon}</span>
                  <span className="nm">{it.name}</span>
                  <span className="use">つかう</span>
                </button>
              ) : (
                <div className="bt-item-empty">🎒 アイテムなし（ショップで買えます）</div>
              );
            })()}
          </div>
        </div>

        {/* かかっている効果（アイテム/スキルのバフ・残ターン付き） */}
        {(atkBuff || guardBuff || regen) && (
          <div className="bt-buffs">
            {atkBuff && <span className="bt-buff" style={{ "--bc": "#fbbf24" }}>💪 与ダメ{atkBuff.mult}倍（あと{atkBuff.turns}回）</span>}
            {guardBuff && <span className="bt-buff" style={{ "--bc": "#60a5fa" }}>🛡️ 被ダメ軽減（あと{guardBuff.turns}回）</span>}
            {regen && <span className="bt-buff" style={{ "--bc": "#34d399" }}>🌿 継続回復（あと{regen.turns}回）</span>}
          </div>
        )}

        {/* バトルログ */}
        <div className="bt-panel bt-log"><span className="new">{log}</span></div>

        {/* プレイヤー */}
        <div className="bt-panel bt-player">
          <Avatar avatar={player.avatar} size={30} />
          <span className="bt-player-name">{player.name ? player.name : "あなた"}（Lv.{lv}）</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7fff7f", fontSize: 12 }}>
            HP {Math.max(0, playerHp)}/{stats.maxHp}
            <div className="bt-hp-track" style={{ width: 110 }}><div className="bt-hp-fill" style={{ width: plHpPct + "%", background: hpColor(plHpPct) }} /></div>
          </div>
        </div>

        <button className="back-btn" style={{ alignSelf: "center" }} onClick={() => { if (!endedRef.current) saveHp(playerHpRef.current); onExit(); }}>← にげる</button>
      </div>
    </div>
  );
}
