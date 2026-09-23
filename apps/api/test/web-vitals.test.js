// apps/api/test/web-vitals.test.js
//
// ปลายทางรับ Core Web Vitals จากผู้ใช้จริง (#171) — เปิดโดยไม่ต้องล็อกอิน จึงต้องรับเฉพาะรูปแบบแคบ
// และส่งจาก sendBeacon ข้ามโดเมนได้โดยไม่ต้อง preflight (body แบบ text/plain)

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../index");

const LCP = { name: "LCP", value: 1234.5678, rating: "good", id: "v5-1-1", navigationType: "navigate", page: "/dashboard", target: "main>h1" };
const INP = {
  name: "INP", value: 320, rating: "needs-improvement", id: "v5-1-2", page: "/assets/:id",
  target: "button.save", interactionType: "pointer", inputDelay: 12, processingDuration: 250, presentationDelay: 58,
};

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await run(`http://localhost:${server.address().port}/api/metrics/web-vitals`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** เก็บบรรทัดที่เขียนลง stdout ระหว่าง fn */
async function captureStdout(fn) {
  const lines = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return original(chunk, ...rest);
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return lines.join("");
}

test("รับ batch แบบ text/plain (sendBeacon) ตอบ 204 และเขียน log หนึ่งบรรทัดต่อค่า โดยไม่ต้องล็อกอิน", async () => {
  const out = await captureStdout(() =>
    withServer(async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: "http://localhost:5173" },
        body: JSON.stringify([LCP, INP]),
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
      // beacon text/plain เป็นคำขอ no-cors — ถ้าเป็น same-origin เบราว์เซอร์ทิ้งคำตอบแล้วขึ้น error ใน console
      assert.equal(res.headers.get("cross-origin-resource-policy"), "cross-origin");
    })
  );
  const vitals = out.split("\n").filter((line) => line.includes("web-vital "));
  assert.equal(vitals.length, 2);
  assert.match(vitals[0], /"name":"LCP"/);
  assert.match(vitals[0], /"value":1234.568/);
  assert.match(vitals[1], /"target":"button.save"/);
  assert.doesNotMatch(out, /user=/, "ต้องไม่บันทึกตัวตนผู้ใช้");
});

test("รับ application/json ได้ด้วย (เครื่องมือหรือเบราว์เซอร์ที่ไม่มี sendBeacon)", async () => {
  await withServer(async (url) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([LCP]) });
    assert.equal(res.status, 204);
  });
});

test("ปฏิเสธข้อมูลนอกรูปแบบ: ชื่อค่าแปลก, query ใน page, อักขระควบคุม, ฟิลด์เกิน, ว่าง, เกิน 20 ค่า, ไม่ใช่ JSON", async () => {
  const bad = [
    [{ ...LCP, name: "FID" }],
    [{ ...LCP, page: "/dashboard?fy=1" }],
    [{ ...LCP, target: "a\nFAKE ERROR line" }],
    [{ ...LCP, user: "admin" }],
    [],
    Array.from({ length: 21 }, (_, i) => ({ ...LCP, id: `x${i}` })),
    [{ ...LCP, value: -1 }],
  ];
  await withServer(async (url) => {
    for (const body of bad) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
      assert.equal(res.status, 400, `ต้องปฏิเสธ ${JSON.stringify(body).slice(0, 80)}`);
    }
    const notJson = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "not json" });
    assert.equal(notJson.status, 400);
  });
});

test("body ใหญ่เกิน 8 KB ถูกปฏิเสธ", async () => {
  await withServer(async (url) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x".repeat(9 * 1024) });
    assert.equal(res.status, 413);
  });
});
