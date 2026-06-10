// ============================================================
// c3_houteishiki.js — 中1「方程式」
// 小テスト準拠：解き方の基本／小数・分数／両辺に項／比例式／文章題
// 答えはすべて「x の値」など数値。
// ============================================================
const p = (id, build) => ({ id, build });

export const chapter = {
  id: "c3",
  name: "方程式",
  emoji: "⚖️",
  color: "#fb923c",
  grade: 1,
  units: [
    {
      id: "e1",
      name: "方程式の解き方①",
      emoji: "🔑",
      desc: "移項の基本",
      problems: {
        easy: [
          p("e1e1", (r) => { const x = r(1, 10), b = r(1, 9); return { q: `x+${b}=${x + b}　x=？`, ans: x, h1: `${b}を右辺へ移項`, h2: `x=${x + b}-${b}=${x}` }; }),
          p("e1e2", (r) => { const x = r(1, 10), b = r(1, 9); return { q: `x-${b}=${x - b}　x=？`, ans: x, h1: `-${b}を移項`, h2: `x=${x - b}+${b}=${x}` }; }),
          p("e1e3", (r) => { const x = r(1, 10), a = r(2, 5); return { q: `${a}x=${a * x}　x=？`, ans: x, h1: `両辺を${a}で割る`, h2: `x=${a * x}÷${a}=${x}` }; }),
        ],
        standard: [
          p("e1s1", (r) => { const x = r(1, 10), a = r(2, 5), b = r(1, 8); return { q: `${a}x+${b}=${a * x + b}　x=？`, ans: x, h1: `${b}を移項`, h2: `${a}x=${a * x} → x=${x}` }; }),
          p("e1s2", (r) => { const x = r(1, 8), a = r(2, 4), b = r(1, 6); return { q: `${a}x-${b}=${a * x - b}　x=？`, ans: x, h1: `-${b}を移項`, h2: `${a}x=${a * x} → x=${x}` }; }),
          p("e1s3", (r) => { const x = r(1, 8), a = r(2, 3), b = r(1, 6); return { q: `${a}(x-${b})=${a * (x - b)}　x=？`, ans: x, h1: "展開してから", h2: `${a}x-${a * b}=${a * (x - b)} → x=${x}` }; }),
        ],
        advanced: [
          p("e1a1", (r) => { const x = r(2, 6), a = r(2, 3), b = r(1, 4); return { q: `${a}(x+${b})-${b}=${a * x + a * b - b}　x=？`, ans: x, h1: "左辺を展開", h2: `${a}x=${a * x} → x=${x}` }; }),
          p("e1a2", (r) => { const x = r(1, 5), a = r(2, 4), b = r(2, 4), c = r(1, 4); return { q: `${a}x-(${b}x-${c})=${a * x - (b * x - c)}　x=？`, ans: x, h1: "括弧を外す", h2: `${a - b}x+${c}=… → x=${x}` }; }),
        ],
      },
    },
    {
      id: "e2",
      name: "方程式の解き方②",
      emoji: "🔓",
      desc: "小数・分数の方程式",
      problems: {
        easy: [
          p("e2e1", (r) => { const x = r(2, 8), a = r(2, 4); return { q: `x/${a}=${x / a}　x=？`, ans: x, h1: `両辺に${a}をかける`, h2: `x=${x / a}×${a}=${x}`, skip: x % a !== 0 }; }),
          p("e2e2", (r) => { const x = r(2, 8), a = r(2, 4), b = r(1, 6); return { q: `x/${a}+${b}=${x / a + b}　x=？`, ans: x, h1: `${b}を移項→${a}倍`, h2: `x/${a}=${x / a} → x=${x}`, skip: x % a !== 0 }; }),
        ],
        standard: [
          p("e2s1", (r) => { const x = r(2, 8), a = r(2, 3), b = r(1, 4); return { q: `(x+${b})/${a}=${(x + b) / a}　x=？`, ans: x, h1: `両辺に${a}をかける`, h2: `x+${b}=${x + b} → x=${x}`, skip: (x + b) % a !== 0 }; }),
          p("e2s2", (r) => { const x = r(2, 8), a = r(2, 4); return { q: `0.${a}x=${(0.1 * a * x).toFixed(1)}　x=？`, ans: x, h1: `両辺を10倍`, h2: `${a}x=${a * x} → x=${x}` }; }),
        ],
        advanced: [
          p("e2a1", () => { return { q: `x/2-x/3=1　x=？`, ans: 6, h1: "両辺×6", h2: "3x-2x=6 → x=6" }; }),
          p("e2a2", () => { return { q: `x/2=(x+2)/3　x=？`, ans: 4, h1: "両辺×6", h2: "3x=2x+4 → x=4" }; }),
        ],
      },
    },
    {
      id: "e3",
      name: "両辺に文字がある式",
      emoji: "↔️",
      desc: "文字を左辺に集める",
      problems: {
        easy: [
          p("e3e1", (r) => { const x = r(2, 8), a = r(3, 6), c = r(2, a - 1); return { q: `${a}x=${c}x+${(a - c) * x}　x=？`, ans: x, h1: "文字を左辺へ", h2: `${a - c}x=${(a - c) * x} → x=${x}` }; }),
          p("e3e2", (r) => { const x = r(1, 6); return { q: `11x=2x+${9 * x}　x=？`, ans: x, h1: "9x=…", h2: `9x=${9 * x} → x=${x}` }; }),
        ],
        standard: [
          p("e3s1", (r) => { const x = r(1, 6), a = r(3, 5), b = r(1, 6), c = r(1, a - 1); return { q: `${a}x+${b}=${c}x+${(a - c) * x + b}　x=？`, ans: x, h1: "文字を左、数を右へ", h2: `${a - c}x=${(a - c) * x} → x=${x}` }; }),
          p("e3s2", (r) => { const x = r(2, 6); return { q: `6x+3=2x+${4 * x + 3}　x=？`, ans: x, h1: "4x=…", h2: `4x=${4 * x} → x=${x}` }; }),
        ],
        advanced: [
          p("e3a1", (r) => { const x = r(2, 6), a = r(2, 3), b = r(1, 4), c = r(2, 4), d = r(1, 4); const rhs = a * x + b; const cc = c, dd = rhs - c * x; return { q: `${a}x+${b}=${c}x+${dd}　x=？`, ans: x, h1: "移項して整理", h2: `x=${x}`, skip: a === c }; }),
        ],
      },
    },
    {
      id: "e4",
      name: "比例式",
      emoji: "🟰",
      desc: "a:b=c:d → ad=bc",
      problems: {
        easy: [
          p("e4e1", (r) => { const k = r(2, 6); return { q: `2:3=${2 * k}:x　x=？`, ans: 3 * k, h1: "2×x=3×(2k)", h2: `x=${3 * k}` }; }),
          p("e4e2", (r) => { const k = r(2, 5); return { q: `x:12=${k}:3　x=？`, ans: 4 * k, h1: "3×x=12×k", h2: `x=${4 * k}` }; }),
        ],
        standard: [
          p("e4s1", (r) => { const a = r(2, 4), b = r(3, 6), k = r(2, 4); return { q: `${a}:${b}=${a * k}:x　x=？`, ans: b * k, h1: "ad=bc", h2: `x=${b * k}` }; }),
          p("e4s2", (r) => { const k = r(2, 5); return { q: `6:5=${6 * k}:x　x=？`, ans: 5 * k, h1: "比を同じ倍率に", h2: `x=${5 * k}` }; }),
        ],
        advanced: [
          p("e4a1", (r) => { const a = r(2, 4), b = r(3, 6), tot = (a + b) * r(3, 6); return { q: `${a}:${b}=x:(${tot}-x)　x=？`, ans: a * tot / (a + b), h1: `${a}(${tot}-x)=${b}x`, h2: `x=${a * tot / (a + b)}`, skip: (a * tot) % (a + b) !== 0 }; }),
        ],
      },
    },
    {
      id: "e5",
      name: "方程式の文章題",
      emoji: "📐",
      desc: "代金・過不足・速さ",
      problems: {
        easy: [
          p("e5e1", (r) => { const x = r(5, 20), add = r(5, 15); return { q: `ある数xに${add}を足すと${x + add}。xは？`, ans: x, h1: `x+${add}=${x + add}`, h2: `x=${x}` }; }),
          p("e5e2", (r) => { const x = r(5, 20), m = r(2, 4); return { q: `ある数xを${m}倍すると${x * m}。xは？`, ans: x, h1: `${m}x=${x * m}`, h2: `x=${x}` }; }),
        ],
        standard: [
          p("e5s1", (r) => { const x = r(10, 25), diff = r(3, 10); return { q: `2つの数の和が${2 * x + diff}、差が${diff}。大きい方は？`, ans: x + diff, h1: "x+y=和, x-y=差", h2: `大きい方=${x + diff}` }; }),
          p("e5s2", (r) => { const n = r(4, 8), e = r(3, 6), extra = r(2, 5); return { q: `${n}人に${e}個ずつ配ると${extra}個余る。全部で何個？`, ans: n * e + extra, h1: `${n}×${e}+${extra}`, h2: `${n * e + extra}個` }; }),
        ],
        advanced: [
          p("e5a1", (r) => { const e = r(4, 6), short = r(1, 3), extra = r(1, 3); return { q: `1人に${e}個ずつ配ると${short}個足りず、${e - 1}個ずつだと${extra}個余る。人数は？`, ans: short + extra, h1: "1人あたり1個差", h2: `(${short}+${extra})÷1=${short + extra}人` }; }),
          p("e5a2", (r) => { const v1 = 100, v2 = 60, lead = 800; const t = lead / (v1 - v2); return { q: `弟が${lead}m先を分速${v2}mで進み、姉が分速${v1}mで追う。何分後に追いつく？`, ans: t, h1: "差の速さで追う", h2: `${lead}÷(${v1}-${v2})=${t}分後` }; }),
        ],
      },
    },
  ],
};
