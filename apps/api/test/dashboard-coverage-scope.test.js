// apps/api/test/dashboard-coverage-scope.test.js
//
// เทส regression ของ "ขอบเขต" ที่ใช้คำนวณความครบถ้วน — โดยเฉพาะกรณีหลายอาคาร
//
// ## บั๊กที่เทสชุดนี้มีไว้กัน
//
// `/dashboard/overview` คำนวณความครบถ้วนจากเศษส่วน filled/activeDevices
// ทั้งสองตัวมาจากคนละคิวรี่ และมีอยู่ช่วงหนึ่งที่ **คิวรี่ตัวเศษไม่มีตัวกรอง
// อาคาร แต่คิวรี่ตัวส่วนมี**
//
// ผลคือเมื่อเลือกอาคารที่มีเครื่อง 3 เครื่อง ตัวส่วนเป็น 3 ส่วนตัวเศษยังเป็นยอด
// รวมทุกอาคาร (18) เงื่อนไข `18 < 3` เป็นเท็จ ทุกเดือนจึงถูกรายงานว่า "ครบแล้ว"
// ทั้งที่อาคารนั้นอาจยังไม่ได้กรอกสักเครื่อง — ระบบบอกว่างานเสร็จทั้งที่ยังไม่ทำ
//
// ## ทำไมต้องเป็นเทสที่ยิง API จริง ไม่ใช่ unit test
//
// `computeCoverage` เป็นฟังก์ชันบริสุทธิ์ที่รับ "ตัวเลขที่นับเสร็จแล้ว" มา
// มันมองไม่เห็นเลยว่าสองตัวเลขนั้นมาจากคนละขอบเขตกัน — บั๊กอยู่ใน SQL
// เทสระดับหน่วยจึงจับไม่ได้โดยหลักการ ต้องเทียบผลของ endpoint กับค่าที่คำนวณ
// อิสระจากข้อมูลดิบเท่านั้น
//
// ## ข้อจำกัดที่ต้องรู้
//
// เทสนี้ **แยกโค้ดที่ถูกกับผิดออกจากกันได้ก็ต่อเมื่อข้อมูลไม่สม่ำเสมอ** คือมี
// อย่างน้อยหนึ่งเดือนที่อาคารหนึ่งกรอกครบแต่อีกอาคารยังไม่ครบ ถ้าฐานข้อมูลที่
// รันเทสมีแต่เดือนที่ทุกอาคารครบเหมือนกันหมด เทสจะผ่านทั้งสองแบบ — จึงประกาศ
// ออกมาตรงๆ ว่าชุดข้อมูลนี้แยกได้หรือไม่ ไม่ปล่อยให้เข้าใจว่าตรวจครบแล้ว
//
// รัน: npm test --workspace @suth/api

const test = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = (process.env.SUTH_API_URL || "http://localhost:3000/api").replace(/\/$/, "");
const TOKEN = process.env.SUTH_API_TOKEN;

/** @returns {Promise<string|null>} เหตุผลที่ข้าม หรือ null ถ้ารันได้ */
async function reasonToSkip() {
  if (!TOKEN) return "ไม่ได้ตั้ง SUTH_API_TOKEN";

  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return `API ที่ ${BASE_URL} ตอบสถานะ ${res.status}`;
  } catch {
    return `ต่อ API ที่ ${BASE_URL} ไม่ได้`;
  }

  return null;
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `suth_session=${TOKEN}` } });
  assert.equal(res.ok, true, `${path} ตอบสถานะ ${res.status}`);
  return res.json();
}

/** เดือนปัจจุบัน "YYYY-MM" — ต้องตรงกับที่ฝั่ง API ใช้ตัดเดือนอนาคตออก */
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// workspace นี้เป็น CommonJS จึงใช้ top-level await ไม่ได้ ต้องเช็คในตัวเทสเอง
// แล้วเรียก t.skip() ซึ่งทำให้ผลออกมาเป็น "ข้าม" ไม่ใช่ "ผ่าน" — สำคัญมาก
// เพราะเทสที่ผ่านเพราะไม่ได้รันคือเทสที่โกหก
test("ขอบเขตของความครบถ้วน (หลายอาคาร)", async (t) => {
  const skip = await reasonToSkip();
  if (skip) return t.skip(`ต้องมี API ทำงานอยู่ — ${skip}`);

  const fiscalYears = await get("/fiscal-years");
  const fy = fiscalYears.at(-1);
  const buildings = await get("/buildings");

  // ---- รวบรวมข้อมูลดิบ: เครื่องแต่ละเครื่องอยู่อาคารไหน และกรอกเดือนไหนไปแล้ว ----
  const devices = await get("/devices?per_page=200").then((d) => (Array.isArray(d) ? d : d.data));
  const activeDevices = devices.filter((d) => d.status === "active");

  const readings = new Map(); // device_id -> Set<month>
  await Promise.all(
    activeDevices.map(async (device) => {
      const rows = await get(`/print-transactions/by-device/${device.id}?fiscal_year_id=${fy.id}`);
      readings.set(device.id, new Set(rows.map((r) => r.month)));
    })
  );

  const fyMonths = (await get(`/dashboard/overview?fiscal_year_id=${fy.id}`)).fiscal_year.months;
  const elapsed = fyMonths.filter((m) => m < currentMonth());

  /** คำนวณความครบถ้วนของอาคารหนึ่งจากข้อมูลดิบ โดยไม่พึ่ง endpoint ที่กำลังทดสอบ */
  function expectedFor(buildingName) {
    const inScope = activeDevices.filter((d) => d.building_name === buildingName);
    if (inScope.length === 0) return null;

    const incomplete = elapsed.filter(
      (month) => inScope.filter((d) => readings.get(d.id)?.has(month)).length < inScope.length
    );

    return { elapsed: elapsed.length, complete: elapsed.length - incomplete.length };
  }

  await t.test("ความครบถ้วนของแต่ละอาคารตรงกับที่คำนวณจากข้อมูลดิบ", async () => {
    for (const building of buildings) {
      const expected = expectedFor(building.name);
      if (!expected) continue; // อาคารที่ไม่มีเครื่องใช้งานอยู่ ไม่มีอะไรให้เทียบ

      const actual = await get(
        `/dashboard/overview?fiscal_year_id=${fy.id}&building_name=${encodeURIComponent(building.name)}`
      );

      assert.equal(
        actual.coverage.elapsed_months,
        expected.elapsed,
        `${building.name}: จำนวนเดือนที่ผ่านไปแล้วไม่ตรง`
      );

      assert.equal(
        actual.coverage.complete_months,
        expected.complete,
        `${building.name}: เดือนที่กรอกครบไม่ตรงกับข้อมูลดิบ ` +
          `(ได้ ${actual.coverage.complete_months} ควรเป็น ${expected.complete}) — ` +
          `อาการนี้คือตัวเศษกับตัวส่วนมาจากคนละขอบเขต`
      );
    }
  });

  await t.test("ตัวส่วนของแต่ละอาคารต้องเป็นจำนวนเครื่องของอาคารนั้น ไม่ใช่ยอดรวม", async () => {
    const all = await get(`/dashboard/overview?fiscal_year_id=${fy.id}`);

    for (const building of buildings) {
      const inScope = activeDevices.filter((d) => d.building_name === building.name);
      if (inScope.length === 0) continue;

      const scoped = await get(
        `/dashboard/overview?fiscal_year_id=${fy.id}&building_name=${encodeURIComponent(building.name)}`
      );

      assert.equal(
        scoped.totals.active_devices,
        inScope.length,
        `${building.name}: active_devices ไม่ตรงกับจำนวนเครื่องจริงของอาคาร`
      );

      assert.ok(
        scoped.totals.active_devices <= all.totals.active_devices,
        `${building.name}: อาคารเดียวมีเครื่องมากกว่ายอดรวมทุกอาคาร เป็นไปไม่ได้`
      );
    }
  });

  await t.test("บอกให้ชัดว่าชุดข้อมูลนี้แยกโค้ดที่ถูกกับผิดออกจากกันได้หรือไม่", () => {
    // เดือนที่ "บางอาคารครบ บางอาคารไม่ครบ" คือเดือนเดียวที่ทำให้บั๊กขอบเขตโผล่
    // ถ้าไม่มีเดือนแบบนี้เลย เทสสองข้อบนผ่านทั้งโค้ดที่ถูกและโค้ดที่ผิด
    const withBuildings = buildings
      .map((b) => ({ name: b.name, devices: activeDevices.filter((d) => d.building_name === b.name) }))
      .filter((b) => b.devices.length > 0);

    const discriminating = elapsed.filter((month) => {
      const states = withBuildings.map(
        (b) => b.devices.filter((d) => readings.get(d.id)?.has(month)).length === b.devices.length
      );
      return states.includes(true) && states.includes(false);
    });

    // ไม่ใช่การ assert ว่าต้องมี — ข้อมูลจริงจะมีเองเมื่อเจ้าหน้าที่กรอกทีละอาคาร
    // แต่ต้องรายงานออกมาเสมอ ไม่งั้นจะเข้าใจว่าเทสนี้ยืนยันอะไรมากกว่าที่ยืนยันจริง
    console.log(
      `    ℹ ชุดข้อมูลนี้มีเดือนที่อาคารกรอกไม่พร้อมกัน ${discriminating.length} เดือน` +
        (discriminating.length === 0
          ? " — เทสสองข้อบนจึงยังแยกโค้ดที่ถูกกับผิดไม่ได้ด้วยข้อมูลชุดนี้"
          : ` (${discriminating.join(", ")}) — แยกได้จริง`)
    );

    assert.ok(withBuildings.length >= 2, "ต้องมีอย่างน้อยสองอาคารที่มีเครื่อง ถึงจะทดสอบเรื่องขอบเขตได้");
  });
});
