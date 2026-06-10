// ============================================================
// Transfer.jsx — 初回起動の「引き継ぎ」画面
//  前のアプリ(math-labo4)は別ホストなので localStorage を共有できない。
//  そこで v4 の「遊び方 → 💾 保存する」で作ったバックアップファイルを
//  ここで読み込んで、やり込み（レベル・コイン・星・装備など）を引き継ぐ。
//  変換は store.importData → normalizePlayerState が担当（v4の単一xp→中1のworldXp）。
// ============================================================
import { useState, useRef } from "react";
import { playerLevel } from "../engine/scoring.js";

export default function Transfer({ player, onImportFile, onSkip }) {
  const [phase, setPhase] = useState("ask"); // ask | done
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    onImportFile(file, (ok, msg) => {
      if (ok) setPhase("done");
      else setErr("⚠️ 読み込めませんでした：" + (msg || "ファイルを確認してください"));
    });
  }

  if (phase === "done") {
    return (
      <div className="app">
        <div className="content" style={{ display: "flex", minHeight: "70vh", alignItems: "center", justifyContent: "center" }}>
          <div className="glass" style={{ padding: 24, textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontSize: 50 }}>🎉</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#4ade80" }}>引き継ぎ完了！</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", marginTop: 8, lineHeight: 1.7 }}>
              前のアプリのやり込みを引き継ぎました。
            </div>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", margin: "14px 0 4px" }}>
              <div><div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>Lv.{playerLevel(player)}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>レベル</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>💰{player.coins ?? 0}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>コイン</div></div>
            </div>
            <button onClick={onSkip} data-sfx="none" style={primaryBtn}>はじめる →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="content" style={{ display: "flex", minHeight: "78vh", alignItems: "center", justifyContent: "center" }}>
        <div className="glass" style={{ padding: 24, maxWidth: 460 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44 }}>📦➡️🎮</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4 }}>前のアプリから引き継ぐ</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", marginTop: 10, lineHeight: 1.8, textAlign: "left" }}>
              前のアプリ(数学ラボ v4)で遊んでいた人は、<b style={{ color: "#fde047" }}>レベル・コイン・星・装備</b>などを引き継げます。
              <div style={{ marginTop: 10, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
                <b style={{ color: "#fff" }}>引き継ぎ方</b><br />
                ① 前のアプリを開く<br />
                ② 「📖 遊び方」→「💾 保存する」でファイルを作る<br />
                ③ 下のボタンで、そのファイルを選ぶ
              </div>
            </div>
          </div>

          <button onClick={() => fileRef.current?.click()} data-sfx="none" style={primaryBtn}>
            📂 引き継ぎファイルを選ぶ
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={pick} style={{ display: "none" }} />
          {err && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#fca5a5", textAlign: "center" }}>{err}</div>}

          <button onClick={onSkip} data-sfx="none" style={{ ...primaryBtn, background: "transparent", border: "1px solid rgba(255,255,255,.25)", marginTop: 10 }}>
            ✨ 新しくはじめる（引き継がない）
          </button>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 10, textAlign: "center", lineHeight: 1.6 }}>
            ※ あとから「遊び方」画面でも引き継ぎ（復元）できます。
          </div>
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  width: "100%", marginTop: 16, padding: "13px", borderRadius: 12, border: "none",
  cursor: "pointer", fontSize: 16, fontWeight: 900, color: "#fff", background: "#6366f1",
};
