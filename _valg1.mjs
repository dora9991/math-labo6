import * as idx from "./src/data/index.js";
const rint = (a,b)=> a + Math.floor(Math.random()*(b-a+1));
const chs = idx.GRADES[1];
let tpl=0, errs=0; const thin=[];
for(const ch of chs){
  for(const u of ch.units){
    for(const lvl of ["easy","standard","advanced"]){
      const arr=u.problems[lvl]||[];
      if(arr.length<4) thin.push(`${ch.id}.${u.id}.${lvl}=${arr.length}`);
      for(const p of arr){
        tpl++;
        let okOnce=false;
        for(let i=0;i<300;i++){
          let o;
          try{ o=p.build(rint); }catch(e){ errs++; console.log(`THROW [${p.id}] ${e.message}`); break; }
          if(o.skip) continue;
          okOnce=true;
          const bad=[];
          if(typeof o.q!=="string"||!o.q.length) bad.push("q");
          if(typeof o.ans!=="number"||!isFinite(o.ans)) bad.push("ans="+o.ans);
          if(o.h1===undefined||o.h2===undefined) bad.push("missing hint");
          if(bad.length){ errs++; console.log(`[${p.id}] ${bad.join(",")} :: q=${o.q} ans=${o.ans}`); break; }
        }
        if(!okOnce){ errs++; console.log(`[${p.id}] ALWAYS SKIP`); }
      }
    }
  }
}
console.log(`\nテンプレ数: ${tpl} / エラー: ${errs}`);
console.log(thin.length? "4未満スロット: "+thin.join(", ") : "全スロット4テンプレ以上 ✓");
