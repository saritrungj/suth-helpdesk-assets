// PROTOTYPE #289: compare only the approved background, not application structure.
export const variants = {
  before: { name: "พื้นเดิม", css: "" },
  A: { name: "A · แสงนุ่มกระจาย", peach: .65, mint: .60, spread: 82, fade: 75 },
  B: { name: "B · แสงสมดุล", peach: .85, mint: .80, spread: 70, fade: 72 },
  C: { name: "C · เน้นแสงที่มุม", peach: 1, mint: 1, spread: 52, fade: 68 },
};
export function variantCss(key) {
  const v = variants[key];
  if (!v || key === "before") return "";
  // Even fully opaque overlapping washes remain between the approved endpoints.
  // Dark, Login, print and forced-colors are outside this preview override.
  return `@media screen and (forced-colors: none) {
    html[data-mode="light"]:not(:has(.auth-stage)) {
      --canvas: #FFFAF5;
      --canvas-wash: radial-gradient(ellipse ${v.spread}% 85% at 0% 0%, rgb(255 227 204 / ${v.peach}), transparent ${v.fade}%),
        radial-gradient(ellipse ${v.spread}% 85% at 100% 100%, rgb(211 239 238 / ${v.mint}), transparent ${v.fade}%);
      --canvas-wash-worst: #FFE3CC;
    }
  }`;
}
