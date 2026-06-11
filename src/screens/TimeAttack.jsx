// ============================================================
// TimeAttack.jsx — タイムアタックモード（制限時間内・4択。時間は単元ごとに可変）
// 遊びの進行はこの画面が持ち、終了時に onComplete で結果を渡す（保存はApp）。
// ============================================================
import { useState, useEffect, useRef } from "react";
import Header from "../components/Header.jsx";
import Stars from "../components/Stars.jsx";
import { BigWord } from "../components/Decorations.jsx";
import MathText from "../components/MathText.jsx";
import * as bgm from "../audio/bgm.js";
import * as sfx from "../audio/sfx.js";
import { genProblem, makeChoices, isHardProblem } from "../engine/generator.js";
import { calcStars, timeAttackXp, timeAttackCoins, timeAttackCrystal, timeAttackStreakBonus, isCorrect, parseAnswer, STAR_TARGET, XP_PER_CORRECT, XP_PENALTY_PER_WRONG, xpRepeatMultiplier } from "../engine/scoring.js";

// 選択肢・正誤判定のヘルパー
//  問題が自前の choices を持つ＝式の4択問題 → 文字列で厳密一致（数値化しない）。
//  choices が無い＝数値問題 → makeChoices で4択を作り、isCorrect で数値照合。
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const hasChoices = (q) => Array.isArray(q.choices) && q.choices.length > 0;
const choicesFor = (q) => hasChoices(q) ? shuffle([...q.choices]) : makeChoices(q.ans);
const ansEq = (val, q) => hasChoices(q) ? String(val).replace(/\s/g, "") === String(q.ans).replace(/\s/g, "") : isCorrect(val, q.ans);
import { getStars } from "../engine/progress.js";

const QUIZ_TIME = 40;
// 単元（章）ごとの制限時間。基本は40秒。途中計算（式を書く・読み取る）が
// 必要な単元ほど長く取る：軽い=40 / 途中計算=60 / 重い=80 / 最重量=100。
// ※個別に微調整したいときはこの表の数値を直すだけ。data側に unit.taTime を
//   足せば、その小単元だけ上書きもできる。
const TA_TIME_BY_CHAPTER = {
  // ── 中1 ──
  c1: 40,    // 正の数と負の数（暗算中心）
  c2: 40,    // 文字の式
  c3: 60,    // 方程式（移項などの途中計算）
  c4: 40,    // 比例と反比例
  c5: 40,    // 平面図形
  c6: 60,    // 空間図形（体積・表面積の計算）
  c7: 40,    // データの活用
  // ── 中2 ──
  g2c1: 60,  // 式の計算（長い多項式）
  g2c2: 100, // 連立方程式（最も途中計算が重い）
  g2c3: 60,  // 1次関数（式を求める・グラフ読み取り）
  g2c4: 40,  // 平行と合同
  g2c5: 40,  // 三角形と四角形
  g2c6: 60,  // 確率と統計（場合の数・分数計算）
  // ── 中3 ──
  g3c1: 60,  // 式の展開と因数分解（長い式）
  g3c2: 60,  // 平方根（√の計算・有理化）
  g3c3: 80,  // 2次方程式（解の公式・平方完成）
  g3c4: 60,  // 関数 y=ax²（変化の割合など）
  g3c5: 40,  // 相似な図形
  g3c6: 40,  // 円
  g3c7: 60,  // 三平方の定理（√を含む計算）
  g3c8: 40,  // 標本調査
};
const taTimeFor = (chapter, unit) =>
  (unit && typeof unit.taTime === "number" && unit.taTime) ||
  (chapter && TA_TIME_BY_CHAPTER[chapter.id]) || QUIZ_TIME;
const todayStr = () => new Date().toLocaleDateString("ja-JP");

export default function TimeAttack({ player, chapter, unit, level, onComplete, onBackToMap, onHome, weak = false, weakUnits = [], onWeakStart }) {
  const quizTime = taTimeFor(chapter, unit);
  // 通常TAは「暗算が非常に厳しい問題」を除外して出題（計算王の単元別じっくりで扱う）。
  const genGood = (recent) => {
    for (let i = 0; i < 14; i++) {
      const p = genProblem(unit, level, recent);
      if (!p) return null;
      if (weak || !isHardProblem(p)) return p;
    }
    return genProblem(unit, level, recent); // 易しいのが見つからない時はそのまま
  };
  const [phase, setPhase] = useState("intro"); // intro | playing | finish | end
  const [timeLeft, setTimeLeft] = useState(quizTime);
  const [q, setQ] = useState(() => genGood([]));
  const [choices, setChoices] = useState(() => []);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);
  const [showRing, setShowRing] = useState(false); // 正解の光る◯
  const [shakeAns, setShakeAns] = useState(false); // 不正解の横揺れ
  const [summary, setSummary] = useState(null);    // 結果のXP内訳
  const savedRef = useRef(false);
  const recentRef = useRef([]);                     // 直近に出した問題ID（重複・かたより対策）

  // 最初の問題の選択肢を用意
  useEffect(() => { if (q) { setChoices(choicesFor(q)); recentRef.current = [q.id]; } }, []); // eslint-disable-line

  // カウントダウン
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(id); setPhase("finish"); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // 終了の合図でジングルを鳴らす
  useEffect(() => { if (phase === "finish") bgm.play("timeattack_end", { loop: false }); }, [phase]);

  // 終了時に1回だけ結果を保存
  useEffect(() => {
    if (phase !== "end" || savedRef.current) return;
    savedRef.current = true;
    const stars = calcStars(correct, level);
    const streakBonus = timeAttackStreakBonus(results.map((r) => r.ok));
    // 苦手モード：単元の星は付けず、XPは控えめ（正解ベース＋連続ボーナス−ミス）
    if (weak) {
      const xp = Math.max(0, correct * XP_PER_CORRECT + streakBonus - wrong * XP_PENALTY_PER_WRONG);
      const coins = timeAttackCoins({ correct, stars: 0 });
      setSummary({ xp, baseXp: xp, mult: 1, penalty: wrong * XP_PENALTY_PER_WRONG, coins });
      onComplete({ correct, wrong, stars, maxStreak, xp, coins, results, weak: true });
      return;
    }
    const prevStars = getStars(player, unit.id, level);
    const newStars = Math.max(0, stars - prevStars);
    const baseXp = timeAttackXp({ correct, wrong, stars, newStars, streakBonus });
    const mult = xpRepeatMultiplier(player.playLog, `${unit.id}-${level}`, todayStr());
    const xp = Math.round(baseXp * mult);
    const coins = timeAttackCoins({ correct, stars });
    const crystal = timeAttackCrystal({ correct, wrong, stars });
    setSummary({ xp, baseXp, mult, penalty: wrong * XP_PENALTY_PER_WRONG, coins, crystal });
    onComplete({ chapter, unit, level, correct, wrong, stars, maxStreak, xp, coins, results });
  }, [phase]); // eslint-disable-line

  function answer(val, idx) {
    if (!q || locked || phase !== "playing") return;
    const ok = ansEq(val, q);
    setSelected(idx);
    setLocked(true);
    const ns = ok ? streak + 1 : 0;
    setStreak(ns);
    setMaxStreak((m) => Math.max(m, ns));
    if (ok) {
      setCorrect((c) => c + 1);
      sfx.correct();
      setShowRing(true); setTimeout(() => setShowRing(false), 700); // 光る◯
    } else {
      setWrong((w) => w + 1);
      sfx.wrong();
      setShakeAns(true); setTimeout(() => setShakeAns(false), 460); // 横揺れ
    }
    setResults((p) => [...p, { q: q.q, ans: q.ans, userAns: parseFloat(val), ok }]);
    setTimeout(() => {
      setLocked(false); setSelected(null);
      const nq = genGood(recentRef.current);
      if (nq) {
        setQ(nq); setChoices(choicesFor(nq));
        recentRef.current = [...recentRef.current, nq.id].slice(-4);
      }
    }, ok ? 350 : 650);
  }

  // ---- 結果画面 ----
  if (phase === "end") {
    const stars = calcStars(correct, level);
    const t = STAR_TARGET[level];
    return (
      <div className="app">
        <Header player={player} />
        <div className="content">
          <div className="res-card">
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div className="big-n" style={{ color: "#4f46e5" }}>{correct}</div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>問正解 / {correct + wrong}問（{quizTime}秒）</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1e1b4b", marginTop: 4 }}>
                {weak
                  ? (correct >= 8 ? "🎯 よくがんばった！" : "🎯 苦手にチャレンジ！おつかれさま")
                  : (stars === 3 ? "🎉 パーフェクト！" : stars >= 1 ? "✅ クリア！" : "😊 もう少し！")}
              </div>
              {!weak && <div style={{ marginTop: 7 }}><Stars count={stars} size={24} /></div>}
              {summary && (
                <div style={{ marginTop: 9 }}>
                  <span className="xp-pill">✨ +{summary.xp} XP</span>
                  {summary.coins > 0 && (
                    <span className="xp-pill" style={{ marginLeft: 6, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#3a2a00" }}>
                      💰 +{summary.coins} コイン
                    </span>
                  )}
                  {summary.crystal > 0 && (
                    <span className="xp-pill" style={{ marginLeft: 6, background: "linear-gradient(135deg,#22d3ee,#67e8f9)", color: "#063b44" }}>
                      💎 +{summary.crystal} クリスタル
                    </span>
                  )}
                  {!weak && summary.crystal === 0 && (
                    <div style={{ fontSize: 11, color: "#0e7490", fontWeight: 700, marginTop: 5 }}>
                      💎 クリスタルは「星1つ以上 ＆ 正答率60%以上」でもらえます
                    </div>
                  )}
                  {summary.mult < 1 && (
                    <div style={{ fontSize: 11, color: "#92400e", fontWeight: 700, marginTop: 5 }}>
                      {summary.mult === 0.5 ? "今日2回目以降のためXP½" : "クリア済みの再挑戦のためXP⅕"}（通常なら{summary.baseXp}XP）
                    </div>
                  )}
                  {summary.penalty > 0 && (
                    <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginTop: 5 }}>
                      ミス{wrong}問で −{summary.penalty}XP（間違い1問につき2問分マイナス）
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="stats-grid">
              <div className="stat-box"><div className="stat-n" style={{ color: "#16a34a" }}>{correct}</div><div className="stat-l">正解</div></div>
              <div className="stat-box"><div className="stat-n" style={{ color: "#dc2626" }}>{wrong}</div><div className="stat-l">ミス</div></div>
              <div className="stat-box"><div className="stat-n" style={{ color: "#d97706" }}>{maxStreak}</div><div className="stat-l">最大連続</div></div>
            </div>
            {!weak && (
              <div style={{ textAlign: "center", marginBottom: 6, fontSize: 11, color: "#94a3b8" }}>
                目標：⭐{t.s1}問 ⭐⭐{t.s2}問 ⭐⭐⭐{t.s3}問
              </div>
            )}

            {/* 苦手モード：今回まちがえた問題を振り返る */}
            {weak && results.some((r) => !r.ok) && (
              <div className="glass" style={{ padding: "10px 12px", margin: "4px 0 10px", textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#dc2626", marginBottom: 6 }}>📝 ここを復習しよう</div>
                {results.filter((r) => !r.ok).slice(0, 5).map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#475569", lineHeight: 1.6, borderTop: i ? "1px solid rgba(0,0,0,.06)" : "none", paddingTop: i ? 5 : 0 }}>
                    <MathText>{r.q}</MathText> <span style={{ color: "#16a34a", fontWeight: 800 }}>＝ <MathText>{r.ans}</MathText></span>
                  </div>
                ))}
              </div>
            )}

            {/* 通常モード：あなたの苦手単元＋「苦手だけ挑戦」への導線 */}
            {!weak && weakUnits.length > 0 && (
              <div className="glass" style={{ padding: "10px 12px", margin: "4px 0 10px", textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#b45309", marginBottom: 6 }}>🎯 あなたの苦手</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: onWeakStart ? 8 : 0 }}>
                  {weakUnits.slice(0, 3).map((w) => (
                    <span key={w.unitId} style={{ fontSize: 11, fontWeight: 800, color: "#92400e", background: "rgba(251,191,36,.18)", borderRadius: 999, padding: "3px 9px" }}>
                      {w.unit.name}
                    </span>
                  ))}
                </div>
                {onWeakStart && (
                  <button className="rbtn p" style={{ width: "100%" }} onClick={onWeakStart}>🎯 苦手だけタイムアタック</button>
                )}
              </div>
            )}

            <div className="res-acts">
              {weak ? (
                <>
                  <button className="rbtn s" onClick={onWeakStart}>🔁 もう一回</button>
                  <button className="rbtn p" onClick={onHome}>🏠 ホーム</button>
                </>
              ) : (
                <>
                  <button className="rbtn s" onClick={onBackToMap}>🗺️ 単元へ</button>
                  <button className="rbtn p" onClick={onHome}>🏠 ホーム</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- プレイ中 ----
  if (!q) {
    return (
      <div className="app">
        <Header player={player} back="戻る" onBack={onBackToMap} />
        <div className="content"><div className="glass">この単元の問題が見つかりませんでした。</div></div>
      </div>
    );
  }

  return (
    <div className="app">
      {phase === "intro" && <BigWord text="START!" color="#4ade80" onDone={() => setPhase("playing")} />}
      {phase === "finish" && <BigWord text="終了！" color="#fbbf24" onDone={() => setPhase("end")} />}
      {/* 正解：画面全体のやわらかい閃光（◯は選択肢の中央に出す） */}
      {showRing && <div className="correct-flash show" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 55 }} />}
      <Header player={player} back="やめる" onBack={onBackToMap} />
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "'M PLUS Rounded 1c',sans-serif", fontSize: 40, fontWeight: 900, color: timeLeft > 16 ? "#4ade80" : timeLeft > 8 ? "#fb923c" : "#f87171" }}>
            {timeLeft}<span style={{ fontSize: 14 }}>秒</span>
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <div className="stat-box" style={{ background: "rgba(255,255,255,.06)" }}>
              <div className="stat-n" style={{ color: "#4ade80" }}>{correct}</div><div className="stat-l" style={{ color: "rgba(255,255,255,.4)" }}>正解</div>
            </div>
            <div className="stat-box" style={{ background: "rgba(255,255,255,.06)" }}>
              <div className="stat-n" style={{ color: "#f87171" }}>{wrong}</div><div className="stat-l" style={{ color: "rgba(255,255,255,.4)" }}>ミス</div>
            </div>
          </div>
        </div>
        {streak >= 3 && <div style={{ textAlign: "center", color: "#fbbf24", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>🔥 {streak}連続！</div>}
        <div className="qcard">
          <span className="q-pill">{unit.name}</span>
          <div className="q-text"><MathText>{q.q}</MathText></div>
          {/* 選択肢の中央に◯が出るよう relative で包む */}
          <div style={{ position: "relative" }}>
            {showRing && <div className="correct-ring show" />}
            <div className={"choices-grid" + (shakeAns ? " answer-shake" : "")}>
              {choices.map((c, i) => {
                const isAns = ansEq(c, q);
                let cls = "choice-btn";
                if (locked) {
                  if (i === selected && !isAns) cls += " wrong";
                  else if (isAns) cls += i === selected ? " correct" : " reveal";
                }
                return (
                  <button key={i} className={cls} data-sfx="none" disabled={locked} onClick={() => answer(c, i)}><MathText>{c}</MathText></button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
