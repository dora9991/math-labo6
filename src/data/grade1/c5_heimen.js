// ============================================================
// c5_heimen.js — 中1「平面図形」
// 小テスト準拠：図形の基本・角／移動／おうぎ形（弧・面積・中心角）
// 作図は数値回答にならないため、角度・おうぎ形計算・移動後の座標で出題。
// おうぎ形は π=3.14 として小数で答える。
// ============================================================
const p = (id, build) => ({ id, build });
const r2 = (n) => Math.round(n * 100) / 100; // 小数2桁

export const chapter = {
  id: "c5",
  name: "平面図形",
  emoji: "🔺",
  color: "#f472b6",
  grade: 1,
  units: [
    {
      id: "z1",
      name: "図形の基本と角",
      emoji: "📐",
      desc: "対頂角・補角・多角形の角",
      problems: {
        easy: [
          p("z1e1", (r) => { const a = r(20, 80); return { q: `${a}°の対頂角は何度？`, ans: a, h1: "対頂角は等しい", h2: `${a}°` }; }),
          p("z1e2", (r) => { const a = r(20, 70); return { q: `${a}°の補角（合わせて180°）は？`, ans: 180 - a, h1: "180−その角", h2: `${180 - a}°` }; }),
          p("z1e3", (r) => { const a = r(10, 80); return { q: `${a}°の余角（合わせて90°）は？`, ans: 90 - a, h1: "90−その角", h2: `${90 - a}°` }; }),
        ],
        standard: [
          p("z1s1", (r) => { const a = r(20, 70); return { q: `平行線の錯角。一方が${a}°のとき他方は？`, ans: a, h1: "錯角は等しい", h2: `${a}°` }; }),
          p("z1s2", (r) => { const n = r(3, 8); return { q: `${n}角形の内角の和は？`, ans: (n - 2) * 180, h1: "(n−2)×180", h2: `(${n}-2)×180=${(n - 2) * 180}°` }; }),
          p("z1s3", (r) => { const a = r(10, 50), b = r(10, 50); return { q: `三角形の2角が${a}°と${b}°。残りの角は？`, ans: 180 - a - b, h1: "内角の和180°", h2: `${180 - a - b}°` }; }),
        ],
        advanced: [
          p("z1a1", (r) => { const n = r(5, 10); return { q: `正${n}角形の1つの外角は？`, ans: 360 / n, h1: "外角の和360°", h2: `360÷${n}=${360 / n}°`, skip: 360 % n !== 0 }; }),
          p("z1a2", (r) => { const n = r(5, 9); return { q: `正${n}角形の1つの内角は？`, ans: (n - 2) * 180 / n, h1: `内角の和÷${n}`, h2: `${(n - 2) * 180 / n}°`, skip: ((n - 2) * 180) % n !== 0 }; }),
        ],
      },
    },
    {
      id: "z2",
      name: "図形の移動",
      emoji: "🔄",
      desc: "対称・回転・平行移動（座標）",
      problems: {
        easy: [
          p("z2e1", (r) => { const a = r(2, 8); return { q: `点(${a},0)をy軸対称移動した点のx座標は？`, ans: -a, h1: "y軸対称はx符号反転", h2: `-${a}` }; }),
          p("z2e2", (r) => { const b = r(2, 8); return { q: `点(0,${b})をx軸対称移動した点のy座標は？`, ans: -b, h1: "x軸対称はy符号反転", h2: `-${b}` }; }),
        ],
        standard: [
          p("z2s1", (r) => { const a = r(2, 5), b = r(2, 5); return { q: `点(${a},${b})を原点対称移動した点のx座標は？`, ans: -a, h1: "両座標の符号反転", h2: `-${a}` }; }),
          p("z2s2", (r) => { const a = r(1, 5), b = r(1, 5), dx = r(1, 4); return { q: `点(${a},${b})をx方向に+${dx}平行移動した点のx座標は？`, ans: a + dx, h1: "x座標に加える", h2: `${a}+${dx}=${a + dx}` }; }),
        ],
        advanced: [
          p("z2a1", (r) => { const a = r(2, 4), b = r(2, 4); return { q: `点(${a},${b})を原点中心に90°反時計回りに回転した点のx座標は？`, ans: -b, h1: "(x,y)→(-y,x)", h2: `-${b}` }; }),
          p("z2a2", (r) => { const a = r(1, 5), b = r(1, 5); return { q: `点(${a},${b})を直線y=xに対称移動した点のx座標は？`, ans: b, h1: "xとyを交換", h2: `${b}` }; }),
        ],
      },
    },
    {
      id: "z3",
      name: "おうぎ形①（弧・面積）",
      emoji: "🍕",
      desc: "答えは「□π」の□（係数）を答える",
      problems: {
        easy: [
          p("z3e1", (r) => { const rad = r(2, 9); return { q: `半径${rad}cmの円の面積は □π cm²。□は？`, ans: rad * rad, h1: "面積=π×r²なので□=r²", h2: `${rad}²=${rad * rad}` }; }),
          p("z3e2", (r) => { const rad = r(2, 9); return { q: `半径${rad}cmの円の円周は □π cm。□は？`, ans: 2 * rad, h1: "円周=2×π×rなので□=2r", h2: `2×${rad}=${2 * rad}` }; }),
        ],
        standard: [
          p("z3s1", (r) => { const rad = r(1, 3) * 2, ang = r(1, 3) * 90; return { q: `半径${rad}cm・中心角${ang}°のおうぎ形の面積は □π cm²。□は？`, ans: rad * rad * ang / 360, h1: "□=r²×(中心角/360)", h2: `${rad * rad}×${ang}/360=${rad * rad * ang / 360}` }; }),
          p("z3s2", (r) => { const rad = r(1, 3) * 3, ang = r(1, 5) * 60; return { q: `半径${rad}cm・中心角${ang}°のおうぎ形の弧の長さは □π cm。□は？`, ans: 2 * rad * ang / 360, h1: "□=2r×(中心角/360)", h2: `2×${rad}×${ang}/360=${2 * rad * ang / 360}` }; }),
        ],
        advanced: [
          p("z3a1", (r) => { const r1 = r(2, 4), ro = r(5, 8); return { q: `半径${ro}cmの円から半径${r1}cmの円をくり抜いた面積は □π cm²。□は？`, ans: ro * ro - r1 * r1, h1: "□=R²−r²", h2: `${ro * ro}−${r1 * r1}=${ro * ro - r1 * r1}` }; }),
          p("z3a2", (r) => { const rad = r(2, 6), n = r(3, 6); return { q: `半径${rad}cmの円を${n}等分したおうぎ形1つの面積は □π cm²。□は？`, ans: r2(rad * rad / n), h1: `□=r²÷${n}`, h2: `${rad * rad}÷${n}=${r2(rad * rad / n)}` }; }),
        ],
      },
    },
    {
      id: "z4",
      name: "おうぎ形②（中心角）",
      emoji: "🧭",
      desc: "弧・割合から中心角を求める",
      problems: {
        easy: [
          p("z4e1", (r) => { const rad = r(2, 6); return { q: `半径${rad}cmの円で、面積が全体の1/4のおうぎ形の中心角は？`, ans: 90, h1: "360×1/4", h2: "90°" }; }),
          p("z4e2", (r) => { const rad = r(2, 6); return { q: `半径${rad}cmの円で、全体の1/3のおうぎ形の中心角は？`, ans: 120, h1: "360×1/3", h2: "120°" }; }),
        ],
        standard: [
          p("z4s1", (r) => { const rad = r(1, 3) * 3, ang = r(1, 4) * 60; const arc = 2 * rad * ang / 360; return { q: `半径${rad}cm・弧の長さ ${arc}π cm のおうぎ形の中心角は？`, ans: ang, h1: "中心角=弧÷(2r)×360", h2: `${arc}÷${2 * rad}×360=${ang}°` }; }),
        ],
        advanced: [
          p("z4a1", (r) => { const rad = r(2, 6); const part = r(1, 5); const ang = part * 30; return { q: `半径${rad}cm・面積 ${r2(rad * rad * ang / 360)}π cm² のおうぎ形の中心角は？`, ans: ang, h1: "中心角=面積÷r²×360", h2: `${ang}°` }; }),
        ],
      },
    },
  ],
};
