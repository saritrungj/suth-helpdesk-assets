import { test } from "@playwright/test";

const HELPERS = `
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  const comp = (layers) => {
    ctx.clearRect(0, 0, 1, 1);
    for (const l of layers) { ctx.fillStyle = l; ctx.fillRect(0, 0, 1, 1); }
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => {
    const c = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgb = (c) => "rgb(" + c.join(",") + ")";
`;

test("probe", async ({ page }) => {
  await page.goto("/login");
  await page.waitForSelector("#login-username");

  const aurora = await page.evaluate(`(() => {
    ${HELPERS}
    const out = [];
    // ลองลดความเข้มของชั้นแสงลงเป็นขั้นๆ แล้วดูว่าตัวหนังสือ alpha เท่าไรจึงผ่าน 4.5
    for (const [a1, a2, a3] of [[0.55,0.38,0.45],[0.46,0.32,0.38],[0.40,0.28,0.34],[0.34,0.24,0.30]]) {
      const bright = comp([
        tok("--aurora-ground"),
        "oklch(0.690 0.105 205 / " + a1 + ")",
        "oklch(0.690 0.190 38 / " + a2 + ")",
        "oklch(0.520 0.092 205 / " + a3 + ")",
      ]);
      const row = { layers: [a1,a2,a3], bg: rgb(bright) };
      for (const ta of [0.72, 0.78, 0.82, 0.86]) {
        row["text" + ta] = ratio(comp([rgb(bright), "oklch(0.985 0.003 205 / " + ta + ")"]), bright).toFixed(2);
      }
      out.push(row);
    }
    return out;
  })()`);

  const borders = await page.evaluate(`(() => {
    ${HELPERS}
    const scan = (surface, label) => {
      const bg = comp([surface]);
      const rows = [];
      for (const l of [0.78,0.74,0.70,0.66,0.62,0.58,0.54,0.50,0.46,0.42]) {
        rows.push("L" + l + "=" + ratio(comp([rgb(bg), "oklch(" + l + " 0.017 220)"]), bg).toFixed(2));
      }
      const teal = {};
      for (const [name, c] of [["teal-500","oklch(0.690 0.105 205)"],["teal-600","oklch(0.600 0.103 205)"],["teal-700","oklch(0.520 0.092 205)"],["teal-400","oklch(0.780 0.086 205)"],["teal-300","oklch(0.860 0.061 205)"]]) {
        teal[name] = ratio(comp([rgb(bg), c]), bg).toFixed(2);
      }
      return { label, surface: rgb(bg), neutralScan: rows, teal };
    };
    return [scan("oklch(1 0 0)", "light --surface"), scan("oklch(0.215 0.015 205)", "dark --surface")];
  })()`);

  console.log("AURORA\\n" + JSON.stringify(aurora, null, 1));
  console.log("BORDERS\\n" + JSON.stringify(borders, null, 1));
});
