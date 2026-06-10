// ============================================================
// DrawPad.jsx — 手書き計算スペース
// 指やマウスで自由に書ける計算用キャンバス。ステップアップ等で使用。
//  - ポインタ操作（マウス／タッチ／ペン）で線を描く
//  - 「消す」ボタンで全消去
//  - devicePixelRatio に合わせて高解像度で描画（線がにじまない）
// 表示中にマウントされる前提（非表示で mount すると寸法が 0 になるため）。
// ============================================================
import { useRef, useEffect } from "react";

export default function DrawPad({ height = 220 }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // 初期化：表示サイズに合わせて解像度を決め、ペンの見た目を整える
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e1b4b";
    ctxRef.current = ctx;
  }, []);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e) {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    // 点だけ打っても見えるように小さな点を描く
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.3, 0, Math.PI * 2);
    ctx.fillStyle = "#1e1b4b";
    ctx.fill();
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function up() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)" }}>
          ✏️ 計算スペース（手書きでメモ）
        </span>
        <button
          onClick={clear}
          data-sfx="none"
          style={{
            fontSize: 11, fontWeight: 800, color: "#fff", cursor: "pointer",
            padding: "5px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.2)",
            background: "rgba(255,255,255,.08)",
          }}
        >
          消す
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{
          width: "100%", height, display: "block",
          background: "rgba(255,255,255,.97)", borderRadius: 12,
          border: "2px solid rgba(255,255,255,.15)", touchAction: "none", cursor: "crosshair",
        }}
      />
    </div>
  );
}
