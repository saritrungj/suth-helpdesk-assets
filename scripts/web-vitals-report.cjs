// scripts/web-vitals-report.cjs — สรุป Core Web Vitals จากผู้ใช้จริงจาก log ของ API (#171)
//
//   node scripts/web-vitals-report.cjs <ไฟล์ log> [ไฟล์ log ...]
//
// อ่านบรรทัด `web-vital` ที่ apps/api/src/metrics/routes.js เขียน (ทั้งแบบ pretty และ JSON เมื่อ
// NODE_ENV=production) แล้วสรุปรายหน้า: จำนวนครั้ง, p75 และสัดส่วนดี/พอใช้/แย่ เทียบเกณฑ์ของ Google
// (web.dev/articles/vitals) — วัดที่ p75 ตามมาตรฐาน พร้อม element ที่ทำให้ช้าบ่อยที่สุดของ INP/CLS/LCP
const fs = require("node:fs");

/** เกณฑ์ "ดี" ของแต่ละค่า (Core Web Vitals + ค่าประกอบ) */
const GOOD = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };
const ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB"];

/** ดึง object ค่าจากหนึ่งบรรทัด — คืน null ถ้าไม่ใช่บรรทัด web-vital */
function parseLine(line) {
  const text = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
  if (!text.includes("web-vital")) return null;
  try {
    if (text.startsWith("{")) {
      const entry = JSON.parse(text);
      return entry.message === "web-vital" && entry.vital ? entry.vital : null;
    }
    const at = text.indexOf("vital={");
    return at < 0 ? null : JSON.parse(text.slice(at + "vital=".length));
  } catch {
    return null;
  }
}

/** p75 แบบ nearest-rank — ตัวเดียวกับที่ CrUX ใช้ */
function p75(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)];
}

function summarize(vitals) {
  const groups = new Map();
  for (const v of vitals) {
    const key = `${v.page}\u0000${v.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  const rows = [...groups.entries()].map(([key, list]) => {
    const [page, name] = key.split("\u0000");
    const value = p75(list.map((v) => v.value));
    const count = (rating) => list.filter((v) => v.rating === rating).length;
    const targets = new Map();
    for (const v of list) if (v.target && v.rating !== "good") targets.set(v.target, (targets.get(v.target) || 0) + 1);
    const worstTarget = [...targets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { page, name, n: list.length, p75: value, pass: value <= GOOD[name], good: count("good"), ni: count("needs-improvement"), poor: count("poor"), worstTarget };
  });
  return rows.sort((a, b) => a.page.localeCompare(b.page) || ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
}

function format(row) {
  const value = row.name === "CLS" ? row.p75.toFixed(3) : `${Math.round(row.p75)} ms`;
  const threshold = row.name === "CLS" ? GOOD.CLS : `${GOOD[row.name]} ms`;
  const mark = row.pass ? "ผ่าน" : "ไม่ผ่าน";
  const where = row.worstTarget ? `  ต้นเหตุบ่อยสุด: ${row.worstTarget}` : "";
  return `  ${row.name.padEnd(5)} p75 ${value.padStart(9)} (เกณฑ์ ${threshold}) ${mark}  n=${row.n} ดี/พอใช้/แย่ ${row.good}/${row.ni}/${row.poor}${where}`;
}

module.exports = { parseLine, p75, summarize, GOOD };

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("ใช้: node scripts/web-vitals-report.cjs <ไฟล์ log ของ API> [...]");
    process.exit(2);
  }
  const vitals = files.flatMap((file) => fs.readFileSync(file, "utf8").split(/\r?\n/).map(parseLine).filter(Boolean));
  if (!vitals.length) {
    console.log("ยังไม่มีค่า web-vital ใน log — เปิดใช้เว็บ (build จริง) แล้วสลับแท็บหรือปิดหน้าสักครั้ง");
    process.exit(0);
  }
  let page = null;
  for (const row of summarize(vitals)) {
    if (row.page !== page) console.log(`\n${(page = row.page)}`);
    console.log(format(row));
  }
  console.log(`\nรวม ${vitals.length} ค่า — p75 = 75% ของการใช้งานได้ค่านี้หรือดีกว่า (มาตรฐาน Core Web Vitals)`);
}
