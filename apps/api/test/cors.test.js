// apps/api/test/cors.test.js
//
// preflight ต้องอนุญาต header ที่เว็บส่งจริง (#152)
//
// เว็บส่ง Cache-Control: no-cache ในคำขอแรกหลังเขียนข้อมูล (apps/web/src/api/http-cache.js) เพื่อไม่ให้
// เบราว์เซอร์คืนรายการเก่าจาก max-age=60 เดิม header นี้ไม่อยู่ใน allowedHeaders preflight ของคำขอข้ามโดเมน
// (เว็บ :5173 → API :3000 และเครื่องจริงที่ตั้ง VITE_API_BASE_URL) จึงไม่ผ่าน เบราว์เซอร์บล็อกคำขอทั้งคำขอ
// หน้าสัญญาแสดงราคาเก่าหลังบันทึก และการล้างแคชหลังแก้ข้อมูลอ้างอิงทั้งระบบไม่เคยได้ผลข้ามโดเมน

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../index");

/** header ที่ apps/web ส่งเอง — ต้องผ่าน preflight ทุกตัว */
const WEB_REQUEST_HEADERS = ["content-type", "cache-control"];

test("preflight ข้ามโดเมนอนุญาตทุก header ที่เว็บส่ง", async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/contracts`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": WEB_REQUEST_HEADERS.join(","),
      },
    });
    assert.equal(res.status, 204);
    const allowed = (res.headers.get("access-control-allow-headers") || "").toLowerCase().split(",").map((h) => h.trim());
    for (const header of WEB_REQUEST_HEADERS) assert.ok(allowed.includes(header), `preflight ต้องอนุญาต ${header}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
