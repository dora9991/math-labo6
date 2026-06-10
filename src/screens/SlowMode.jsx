// ============================================================
// SlowMode.jsx — じっくりモード（時間制限なし・ヒントあり）
//  - 4択。正解で光る◯、不正解で横揺れ（タイムアタックと同じ演出）
//  - ヒントボタン（問題データの h1 → h2）で考える手助け
//  - 一問ごとにキャラが言葉をかける（CharBubble）
//  - 連続正解が目標数に達するとクリア
// ============================================================
import { useState } from "react";
import Header from "../components/Header.jsx";
import CharBubble, { voice } from "../components/CharBubble.jsx";
import { BigWord } from "../components/Decorations.jsx";
import MathText from "../components/MathText.jsx";
import * as sfx from "../audio/sfx.js";
import { genProblem, makeChoices } from "../engine/generator.js";
import { isCorrect, SLOW_TARGET, slowXp, xpRepeatMultiplier } from "../engine/scoring.js";

const todayStr = () => new Date().toLocaleDateString("ja-JP");

export default function SlowMode({ player, chapter, unit, level, onComplete, onBackToMap, onHome }) {
  const target = SLOW_TARGET[level];
  const [q, setQ] = useState(() => genProblem(unit, level));
  const [choices, setChoices] = useState(() => (q ? makeChoices(q.ans) : []));
  const [streak, setStreak] = useState(0);
  const [total, setTotal] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);
  const [hintLevel, setHintLevel] = useState(0); // 0:なし 1:h1 2:h2
  const [msg, setMsg] = useState(() => voice("open"));
  const [showRing, setShowRing] = useState(false);
  const [shakeAns, setShakeAns] = useState(false);
  const [phase, setPhase] = useState("intro"); // intro | playing | clear
  const [clearInfo, setClearInfo] = useState(null); // {xp, baseXp, mult}

  function nextQuestion() {
    const nq = genProblem(unit, level, q?.id);
    if (nq) { setQ(nq); setChoices(makeChoices(nq.ans)); }
    setSelected(null); setLocked(false); setHintLevel(0);
  }

  function answer(val, idx) {
    if (!q || locked || phase !== "playing") return;
    setLocked(true); setSelected(idx);
    const ok = isCorrect(val, q.ans);
    setTotal((t) => t + 1);

    if (ok) {
      const ns = streak + 1;
      setStreak(ns); setCorrect((c) => c + 1);
      sfx.correct();
      setShowRing(true); setTimeout(() => setShowRing(false), 700);
      setMsg(ns >= 5 ? voice("streak") : ns >= 3 ? voice("streak") : voice("correct"));
      if (ns >= target) {
        // クリア
        const baseXp = slowXp({ streak: ns, correct: correct + 1 });
        const mult = xpRepeatMultiplier(player.playLog, `${unit.id}-${level}`, todayStr());
        const xp = Math.round(baseXp * mult);
        setClearInfo({ xp, baseXp, mult });
        setMsg(voice("clear"));
        setTimeout(() => {
          setPhase("clear");
          onComplete({ chapter, unit, level, streak: ns, total: total + 1, correct: correct + 1, xp, results: [] });
        }, 700);
      } else {
        setTimeout(nextQuestion, 800);
      }
    } else {
      setStreak(0);
      sfx.wrong();
      setShakeAns(true); setTimeout(() => setShakeAns(false), 460);
      setMsg(voice("wrong"));
      setTimeout(nextQuestion, 950);
    }
  }

  // ---- クリア画面 ----
  if (phase === "clear") {
    return (
      <div className="app">
        <Header player={player} />
        <div className="content">
          <CharBubble text={msg} />
          <div className="res-card">
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 60 }}>🌟</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#1e1b4b" }}>クリア！{streak}問連続正解！</div>
              <div style={{ marginTop: 9 }}>
                <span className="xp-pill">✨ +{clearInfo ? clearInfo.xp : 0} XP</span>
                {clearInfo && clearInfo.mult < 1 && (
                  <div style={{ fontSize: 11, color: "#92400e", fontWeight: 700, marginTop: 5 }}>
                    {clearInfo.mult === 0.5 ? "今日2回目以降のためXP½" : "クリア済みの再挑戦のためXP⅕"}（通常なら{clearInfo.baseXp}XP）
                  </div>
                )}
              </div>
            </div>
            <div className="stats-grid">
              <div className="stat-box"><div className="stat-n" style={{ color: "#d97706" }}>{streak}</div><div className="stat-l">連続正解</div></div>
              <div className="stat-box"><div className="stat-n" style={{ color: "#16a34a" }}>{correct}</div><div className="stat-l">正解</div></div>
              <div className="stat-box"><div className="stat-n" style={{ color: "#94a3b8" }}>{total}</div><div className="stat-l">挑戦</div></div>
            </div>
            <div className="res-acts">
              <button className="rbtn s" onClick={onBackToMap}>🗺️ 単元へ</button>
              <button className="rbtn p" onClick={onHome}>🏠 ホーム</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="app">
        <Header player={player} back="戻る" onBack={onBackToMap} />
        <div className="content"><div className="glass">この単元の問題が見つかりませんでした。</div></div>
      </div>
    );
  }

  // ---- プレイ中 ----
  return (
    <div className="app">
      {phase === "intro" && <BigWord text="START!" color="#4ade80" onDone={() => setPhase("playing")} />}
      {showRing && <div className="correct-flash show" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 55 }} />}
      <Header player={player} back="やめる" onBack={onBackToMap} />
      <div className="content">
        {/* 連続正解メーター */}
        <div className="glass" style={{ padding: "11px 13px", marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.5)" }}>🌱 連続正解チャレンジ</span>
            <span style={{ fontFamily: "'M PLUS Rounded 1c',sans-serif", fontSize: 18, fontWeight: 900, color: "#fbbf24" }}>🔥 {streak}/{target}</span>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {Array.from({ length: target }, (_, i) => (
              <div key={i} style={{
                flex: 1, height: 8, borderRadius: 4,
                background: i < streak ? "#fbbf24" : "rgba(255,255,255,.12)",
              }} />
            ))}
          </div>
        </div>

        {/* 一問ごとのひとこと */}
        <CharBubble text={msg} />

        <div className="qcard">
          <span className="q-pill">{unit.name} ・ じっくり</span>
          <div className="q-text"><MathText>{q.q}</MathText></div>

          {/* ヒント */}
          {hintLevel > 0 && (
            <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 11, padding: "9px 12px", marginBottom: 11 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#854d0e", lineHeight: 1.6 }}>
                💡 {q.h1}
                {hintLevel >= 2 && q.h2 ? <><br />💡 {q.h2}</> : null}
              </div>
            </div>
          )}
          {!locked && hintLevel < 2 && (
            <div style={{ marginBottom: 11 }}>
              <button
                className="rbtn s" style={{ fontSize: 12, padding: "7px 13px" }}
                onClick={() => setHintLevel((h) => h + 1)}
              >💡 ヒント{hintLevel === 0 ? "①" : "②"}を見る</button>
            </div>
          )}

          {/* 選択肢の中央に◯が出るよう relative で包む */}
          <div style={{ position: "relative" }}>
            {showRing && <div className="correct-ring show" />}
            <div className={"choices-grid" + (shakeAns ? " answer-shake" : "")}>
              {choices.map((c, i) => {
                const isAns = isCorrect(c, q.ans);
                let cls = "choice-btn";
                if (locked) {
                  if (i === selected && !isAns) cls += " wrong";
                  else if (isAns) cls += i === selected ? " correct" : " reveal";
                }
                return <button key={i} className={cls} data-sfx="none" disabled={locked} onClick={() => answer(c, i)}><MathText>{c}</MathText></button>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
