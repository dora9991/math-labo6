// ============================================================
// SkillGachaBox.jsx — スキルガチャ（クリスタルで引く）
//  ・単発（💎50）と 10連（💎450）。10連は最低1つ R 以上を保証。
//  ・引くと結果をカードで一覧表示。新規は「NEW」、被りはコイン還元を表示。
//  ・所持済みのスキルはコレクションとして下に一覧（装備は「スキル」画面で）。
// ============================================================
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  BATTLE_SKILLS, SKILL_RARITY, SKILL_GACHA_COST_1, SKILL_GACHA_COST_10,
} from "../engine/battle.js";

const RARITY_LABEL_ORDER = ["ssr", "sr", "r", "n"];

export default function SkillGachaBox({ player, onPull }) {
  const crystals = player.crystals ?? 0;
  const owned = new Set(player.ownedSkills || []);
  const total = BATTLE_SKILLS.length;
  const collected = BATTLE_SKILLS.filter((s) => owned.has(s.id)).length;

  const [stage, setStage] = useState(null); // null | "rolling" | "done"
  const [results, setResults] = useState(null);
  const timers = useRef([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  function pull(count) {
    const cost = count === 10 ? SKILL_GACHA_COST_10 : SKILL_GACHA_COST_1;
    if (crystals < cost) return;
    const res = onPull?.(count);
    if (!res) return;
    clearTimers();
    setResults(res);
    setStage("rolling");
    timers.current.push(setTimeout(() => setStage("done"), 900));
  }
  function close() { clearTimers(); setStage(null); setResults(null); }

  const can1 = crystals >= SKILL_GACHA_COST_1;
  const can10 = crystals >= SKILL_GACHA_COST_10;

  const btn = (ok) => ({
    flex: 1, padding: "13px 10px", borderRadius: 12, border: "none",
    cursor: ok ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 900, color: "#fff",
    background: ok ? "linear-gradient(135deg,#22d3ee,#6366f1)" : "rgba(255,255,255,.12)",
  });

  return (
    <div className="glass" style={{ padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>🎴 スキルガチャ</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>図鑑 {collected}/{total}</div>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", lineHeight: 1.6, marginBottom: 10 }}>
        クリスタル💎でバトルスキルが当たる！ <b style={{ color: "#fde047" }}>ウルトラレアは2%</b>。
        10連は最低1つ <b style={{ color: "#38bdf8" }}>レア以上</b> 確定。被りはコインに還元。
      </div>

      {/* クリスタル残高 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 10, background: "rgba(103,232,249,.08)", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>所持クリスタル</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: "#67e8f9" }}>💎 {crystals}</span>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => pull(1)} disabled={!can1} data-sfx="none" style={btn(can1)}>
          単発<br /><span style={{ fontSize: 11 }}>💎{SKILL_GACHA_COST_1}</span>
        </button>
        <button onClick={() => pull(10)} disabled={!can10} data-sfx="none" style={btn(can10)}>
          10連<br /><span style={{ fontSize: 11 }}>💎{SKILL_GACHA_COST_10}</span>
        </button>
      </div>

      {/* レア度ごとのコレクション一覧 */}
      {RARITY_LABEL_ORDER.map((rk) => {
        const rar = SKILL_RARITY[rk];
        const list = BATTLE_SKILLS.filter((s) => s.rarity === rk);
        return (
          <div key={rk} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: rar.color, marginBottom: 6 }}>{rar.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {list.map((s) => {
                const has = owned.has(s.id);
                return (
                  <div key={s.id} style={{
                    padding: "8px 9px", borderRadius: 10, background: "rgba(255,255,255,.05)",
                    border: `1px solid ${has ? rar.color + "66" : "rgba(255,255,255,.08)"}`, opacity: has ? 1 : 0.5,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 18, filter: has ? "none" : "grayscale(1) brightness(.6)" }}>{has ? s.icon : "❓"}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{has ? s.name : "？？？"}</span>
                    </div>
                    <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.55)", marginTop: 3, lineHeight: 1.35, minHeight: 26 }}>
                      {has ? s.desc : "未入手"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ===== ガチャ演出オーバーレイ ===== */}
      {stage && results && createPortal(
        <div className="gacha-ov" onClick={stage === "done" ? close : undefined}>
          <div className="gacha-stage" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            {stage === "rolling" && (
              <div style={{ textAlign: "center", padding: 30 }}>
                <div style={{ fontSize: 54, animation: "rankUpPop .6s ease both" }}>🎴</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#67e8f9", marginTop: 10 }}>ガチャ中…</div>
              </div>
            )}
            {stage === "done" && (
              <>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#fde047", letterSpacing: 2, textAlign: "center", marginBottom: 10 }}>✨ けっか ✨</div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: results.length > 1 ? "1fr 1fr" : "1fr",
                  gap: 8, maxHeight: "56vh", overflowY: "auto", padding: 2,
                }}>
                  {results.map((r, i) => {
                    const rar = SKILL_RARITY[r.skill?.rarity] || SKILL_RARITY.n;
                    return (
                      <div key={i} style={{
                        padding: "10px 10px", borderRadius: 12, textAlign: "center",
                        background: `color-mix(in srgb, ${rar.color} 14%, rgba(0,0,0,.3))`,
                        border: `2px solid ${rar.color}`,
                        animation: `rankUpPop .4s cubic-bezier(.2,1.4,.4,1) both`, animationDelay: `${i * 0.05}s`,
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 900, color: rar.color, letterSpacing: 1 }}>{rar.label}</div>
                        <div style={{ fontSize: 30, margin: "2px 0" }}>{r.skill?.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{r.skill?.name}</div>
                        <div style={{
                          marginTop: 4, fontSize: 9.5, fontWeight: 800, borderRadius: 6, padding: "2px 0",
                          color: r.isNew ? "#fff" : "#fcd34d",
                          background: r.isNew ? rar.color : "rgba(252,211,77,.15)",
                        }}>
                          {r.isNew ? "✨ NEW!" : `被り → 💰+${r.refund}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={close} data-sfx="none" style={{
                  marginTop: 12, width: "100%", padding: 12, borderRadius: 12, border: "none",
                  fontSize: 14, fontWeight: 900, color: "#fff", cursor: "pointer",
                  background: "rgba(255,255,255,.14)",
                }}>とじる</button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
