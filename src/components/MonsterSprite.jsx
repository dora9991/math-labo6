// ============================================================
// MonsterSprite.jsx — モンスターのSVGを描画し、状態アニメを当てる部品
//   state: "idle" | "damage" | "attack" | "dead"
//   animKey: 値が変わるたびにアニメを再生（被ダメを何度も再生するため）
// SVGは自前のデザイン資産なので dangerouslySetInnerHTML で描画する。
// ============================================================

const STATE_CLASS = {
  idle: "idle-anim",
  damage: "dmg-anim",
  attack: "atk-anim",
  dead: "dead-anim",
};

export default function MonsterSprite({ monster, state = "idle", animKey = 0, mini = false }) {
  if (!monster) return null;
  const bodyClass = STATE_CLASS[state] || "idle-anim";
  const flash = state === "damage" || state === "dead" ? " flash-anim" : "";
  const html = `${monster.svgDefs}<g class="${bodyClass}">${monster.svg}</g>`;

  return (
    <>
      {monster.idleExtra ? <style>{monster.idleExtra}</style> : null}
      <svg
        key={animKey}
        className={(mini ? "" : "mon-svg") + flash}
        viewBox="0 0 140 140"
        xmlns="http://www.w3.org/2000/svg"
        style={mini ? { width: 64, height: 64, overflow: "visible" } : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
