// ============================================================
// c7_data.js — 中1「データの活用」
// 小テスト準拠：代表値（平均・中央値・最頻値）／度数分布・相対度数／確率（相対度数）
// ============================================================
const p = (id, build) => ({ id, build });
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

export const chapter = {
  id: "c7",
  name: "データの活用",
  emoji: "📊",
  color: "#34d399",
  grade: 1,
  units: [
    {
      id: "d1",
      name: "代表値",
      emoji: "📌",
      desc: "平均・中央値・最頻値",
      problems: {
        easy: [
          p("d1e1", (r) => { const v = [r(1, 9), r(1, 9), r(1, 9), r(1, 9), r(1, 9)]; const s = v.reduce((a, b) => a + b, 0); return { q: `データ [${v.join(",")}] の合計は？`, ans: s, h1: "全部足す", h2: `${s}` }; }),
          p("d1e2", (r) => { const v = [r(1, 4), r(2, 5), r(5, 7), r(6, 8), r(7, 9)].sort((a, b) => a - b); return { q: `5個のデータ [${v.join(",")}] の中央値は？`, ans: v[2], h1: "真ん中の3番目", h2: `${v[2]}` }; }),
          p("d1e3", (r) => { const mode = r(3, 7); const v = [mode, mode, r(1, mode - 1), r(mode + 1, 9), r(1, 9)].sort((a, b) => a - b); return { q: `データ [${v.join(",")}] の最頻値は？`, ans: mode, h1: "一番多い値", h2: `${mode}` }; }),
        ],
        standard: [
          p("d1s1", (r) => { const v = [r(1, 5), r(2, 6), r(3, 7), r(4, 8), r(5, 9)]; const s = v.reduce((a, b) => a + b, 0); return { q: `データ [${v.join(",")}] の平均値は？（小数1桁）`, ans: r1(s / v.length), h1: "合計÷個数", h2: `${s}÷${v.length}=${r1(s / v.length)}` }; }),
          p("d1s2", (r) => { const v = [r(1, 3), r(2, 4), r(4, 6), r(5, 7), r(6, 8), r(7, 9)].sort((a, b) => a - b); return { q: `6個のデータ [${v.join(",")}] の中央値は？`, ans: (v[2] + v[3]) / 2, h1: "3番目と4番目の平均", h2: `(${v[2]}+${v[3]})÷2=${(v[2] + v[3]) / 2}` }; }),
          p("d1s3", (r) => { const v = [r(1, 5), r(2, 6), r(3, 7), r(4, 8), r(5, 9)]; const max = Math.max(...v), min = Math.min(...v); return { q: `データ [${v.join(",")}] の範囲（最大−最小）は？`, ans: max - min, h1: "最大−最小", h2: `${max}-${min}=${max - min}` }; }),
        ],
        advanced: [
          p("d1a1", (r) => { const n = r(4, 7), avg = r(5, 9); const known = Array.from({ length: n - 1 }, () => r(avg - 3, avg + 3)); const last = n * avg - known.reduce((a, b) => a + b, 0); return { q: `${n}個の平均が${avg}。${n - 1}個が[${known.join(",")}]のとき残り1つは？`, ans: last, h1: `合計=${n}×${avg}=${n * avg}`, h2: `残り=${n * avg}-${known.reduce((a, b) => a + b, 0)}=${last}` }; }),
          p("d1a2", (r) => { const n = r(4, 7), avg = r(5, 9), extra = r(avg + 1, avg + 5); return { q: `平均${avg}・${n}人のデータに${extra}が加わった。新しい平均は？（小数1桁）`, ans: r1((avg * n + extra) / (n + 1)), h1: `新合計=${avg * n}+${extra}`, h2: `÷${n + 1}=${r1((avg * n + extra) / (n + 1))}` }; }),
        ],
      },
    },
    {
      id: "d2",
      name: "度数分布・相対度数",
      emoji: "📋",
      desc: "階級・相対度数・累積",
      problems: {
        easy: [
          p("d2e1", (r) => { const a = r(2, 6), b = r(a + 1, 9); return { q: `階級「${a}以上${b}未満」の階級の幅は？`, ans: b - a, h1: "上−下", h2: `${b}-${a}=${b - a}` }; }),
          p("d2e2", (r) => { const f = [r(2, 5), r(3, 7), r(2, 5), r(1, 4)]; const t = f.reduce((a, b) => a + b, 0); return { q: `度数が[${f.join(",")}]のとき総度数は？`, ans: t, h1: "全部足す", h2: `${t}` }; }),
        ],
        standard: [
          p("d2s1", (r) => { const total = 50, f = r(5, 20); return { q: `総度数${total}で、ある階級の度数が${f}。相対度数は？（小数2桁）`, ans: r2(f / total), h1: "度数÷総度数", h2: `${f}÷${total}=${r2(f / total)}` }; }),
          p("d2s2", (r) => { const total = r(20, 50), rel = r(1, 4) * 0.1; return { q: `総度数${total}で相対度数が${rel}の階級の度数は？`, ans: Math.round(rel * total), h1: "相対度数×総度数", h2: `${rel}×${total}=${Math.round(rel * total)}` }; }),
        ],
        advanced: [
          p("d2a1", (r) => { const total = 50, f1 = r(8, 12), f2 = r(20, 28); return { q: `総度数${total}人。10分未満が${f1}人、30分未満の累積が${f1 + f2}人のとき、30分未満の割合は？（％）`, ans: Math.round((f1 + f2) / total * 100), h1: "累積度数÷総度数×100", h2: `${Math.round((f1 + f2) / total * 100)}%` }; }),
          p("d2a2", (r) => { const total = r(20, 40); const rels = [r(1, 3) * 0.1, r(1, 3) * 0.1]; const remain = r2(1 - rels[0] - rels[1]); return { q: `相対度数が${r2(rels[0])}と${r2(rels[1])}の2階級。残りの相対度数の合計は？`, ans: remain, h1: "全相対度数の和=1", h2: `1-${r2(rels[0])}-${r2(rels[1])}=${remain}` }; }),
        ],
      },
    },
    {
      id: "d3",
      name: "確率（相対度数）",
      emoji: "🎲",
      desc: "起こりやすさを相対度数で",
      problems: {
        easy: [
          p("d3e1", (r) => { const n = r(2, 5) * 100, k = Math.round(n * 0.4); return { q: `${n}回投げて表が${k}回出た。表の相対度数は？（小数2桁）`, ans: r2(k / n), h1: "回数÷全体", h2: `${k}÷${n}=${r2(k / n)}` }; }),
          p("d3e2", () => ({ q: `50年間で3月5日が晴れたのは22日。晴れの相対度数は？（小数2桁）`, ans: 0.44, h1: "22÷50", h2: "0.44" })),
        ],
        standard: [
          p("d3s1", () => ({ q: `さいころで偶数が出る相対度数（理論値）は？（小数2桁）`, ans: 0.5, h1: "3÷6", h2: "0.50" })),
          p("d3s2", (r) => { const n = r(3, 8) * 100, k = Math.round(n * 0.25); return { q: `${n}回中${k}回当たり。当たりの相対度数は？（小数2桁）`, ans: r2(k / n), h1: "k÷n", h2: `=${r2(k / n)}` }; }),
        ],
        advanced: [
          p("d3a1", (r) => { const n = r(5, 10) * 100, p1 = r(35, 45); const k = Math.round(n * p1 / 100); return { q: `${n}回投げて上向きが${k}回。相対度数は？（小数3桁）`, ans: Math.round(k / n * 1000) / 1000, h1: "k÷n（小数3桁）", h2: `=${Math.round(k / n * 1000) / 1000}` }; }),
          p("d3a2", () => ({ q: `相対度数が一定の0.38に近づいた。1000回投げたとき、上向きはおよそ何回と予想？`, ans: 380, h1: "1000×0.38", h2: "380回" })),
        ],
      },
    },
  ],
};
