import { prototypeFixture } from "./prototype-fixture.js";

/**
 * ชุดข้อมูลของหน้าภาพรวมและหน้าเปรียบเทียบ — ขอบเขตที่ HTTP เท่านั้น ไม่แตะฐานข้อมูล
 *
 * ตั้งใจใส่กรณีที่ทำให้การเปรียบเทียบผิดได้ครบในชุดเดียว
 *   - ฝ่ายเภสัชกรรมบันทึก 0 หน้าจริง (ต้องเป็น 0 ไม่ใช่ "ไม่มีข้อมูล")
 *   - ฝ่ายรังสีวิทยามีในข้อมูลอ้างอิงแต่ไม่มียอดเลย (ต้องเป็น "ไม่มีข้อมูล" ไม่ใช่ 0)
 *   - เครื่อง 6 ยังหาราคาไม่ได้ในเดือน ธ.ค. และไม่มีสัญญาที่คิดเงิน
 *   - ฝ่ายการพยาบาลมีสามเครื่อง ส่วนฝ่ายบริหารมีสองเครื่อง (จำนวนเครื่องไม่เท่ากัน)
 *   - สัญญาที่คิดเงินของเดือนนั้น (billing) ต่างจากสัญญาปัจจุบันของเครื่อง (contract)
 *   - ยอดของปีงบ 2568 สำหรับเทียบช่วงเดียวกันข้ามปี และ ก.ค.–ก.ย. 2568 สำหรับช่วงก่อนหน้า
 *     ที่ข้ามรอยต่อปีงบ
 */
const DIVISIONS = {
  1: "ฝ่ายการพยาบาล",
  2: "ฝ่ายบริหารทั่วไป",
  3: "ฝ่ายเภสัชกรรม",
};
const DEPARTMENTS = {
  11: { name: "งานผู้ป่วยนอก", division: 1 },
  12: { name: "งานผู้ป่วยใน", division: 1 },
  21: { name: "งานการเงิน", division: 2 },
  31: { name: "งานคลังยา", division: 3 },
};
const CONTRACTS = { 5: "CT-009/2568", 7: "CT-001/2569", 8: "CT-002/2569" };

function reading(month, device, department, contract, pages, price = 0.45) {
  const dep = DEPARTMENTS[department];
  const net = Math.round(pages * 98) / 100;
  return {
    device_id: device,
    serial_number: `0${device}00-SN`,
    brand_name: "SUTH Printer",
    model: "Office 400",
    month,
    pages_printed: pages,
    net_pages: net.toFixed(2),
    price_per_page: price === null ? null : price.toFixed(4),
    total_cost: price === null ? null : (Math.round(net * price * 100) / 100).toFixed(2),
    division_id: dep.division,
    division_name: DIVISIONS[dep.division],
    department_id: department,
    department_name: dep.name,
    contract_id: 8,
    contract_no: CONTRACTS[8],
    billing_contract_id: contract,
    billing_contract_no: contract ? CONTRACTS[contract] : null,
    building_id: 1, floor_id: 1, brand_id: 1,
    building_name: "อาคารผู้ป่วยนอก",
  };
}

export const COMPARISON_ROWS = [
  // ปีงบ 2569
  reading("2025-10", 1, 11, 7, 1000), reading("2025-10", 2, 12, 7, 500), reading("2025-10", 3, 21, 8, 300), reading("2025-10", 4, 31, 8, 0),
  reading("2025-11", 1, 11, 7, 1200), reading("2025-11", 2, 12, 7, 400), reading("2025-11", 3, 21, 8, 350), reading("2025-11", 4, 31, 8, 0), reading("2025-11", 5, 21, 8, 200),
  reading("2025-12", 1, 11, 7, 900), reading("2025-12", 2, 12, 7, 450), reading("2025-12", 3, 21, 8, 320), reading("2025-12", 4, 31, 8, 0), reading("2025-12", 5, 21, 8, 250),
  reading("2025-12", 6, 11, null, 100, null),
  // ปีงบ 2568 — ช่วงเดียวกัน (ต.ค.–ธ.ค. 2567) และช่วงก่อนหน้าติดกัน (ก.ค.–ก.ย. 2568)
  reading("2024-10", 1, 11, 5, 800), reading("2024-10", 3, 21, 5, 400),
  reading("2024-11", 1, 11, 5, 900), reading("2024-11", 3, 21, 5, 0),
  reading("2024-12", 1, 11, 5, 1000), reading("2024-12", 3, 21, 5, 300),
  reading("2025-07", 1, 11, 5, 700), reading("2025-08", 1, 11, 5, 600), reading("2025-09", 1, 11, 5, 650),
  reading("2025-09", 3, 21, 5, 100),
];

export const MASTERS = {
  divisions: [...Object.entries(DIVISIONS).map(([id, name]) => ({ id: Number(id), name })), { id: 4, name: "ฝ่ายรังสีวิทยา" }],
  departments: [...Object.entries(DEPARTMENTS).map(([id, dep]) => ({ id: Number(id), name: dep.name, division_id: dep.division })), { id: 41, name: "งานเอกซเรย์", division_id: 4 }],
  contracts: [
    { id: 7, contract_no: CONTRACTS[7], fiscal_year: 2569 },
    { id: 8, contract_no: CONTRACTS[8], fiscal_year: 2569 },
    { id: 5, contract_no: CONTRACTS[5], fiscal_year: 2568 },
  ],
};

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ rows?: object[] }} [options]
 * @returns state — ตั้ง `delay` (ms) หรือ `fail` เพื่อทดสอบสถานะโหลด/ผิดพลาด และอ่าน `requests`
 */
export async function comparisonFixture(page, { rows = COMPARISON_ROWS } = {}) {
  const base = await prototypeFixture(page, "viewer");
  // overviewComparison = เดือนของช่วงก่อนหน้าที่ API จริงคำนวณให้ (ยาวเท่ากัน อยู่ในปีงบเดียวกัน)
  const state = { ...base, delay: 0, fail: false, requests: [], masterRequests: [], overviewComparison: null };
  const json = (route, data, status = 200) => route.fulfill({ status, json: data });

  // route ที่ลงทะเบียนทีหลังถูกเรียกก่อน — ทับของ prototype/asset fixture เฉพาะที่ต้องใช้
  await page.route(/\/api\/(divisions|departments|contracts)$/, (route) => {
    const key = new URL(route.request().url()).pathname.split("/").pop();
    state.masterRequests.push(key);
    return json(route, MASTERS[key]);
  });
  await page.route(/\/api\/dashboard\/(monthly-kpi|overview)\b/, async (route) => {
    const url = new URL(route.request().url());
    const months = (url.searchParams.get("month") || "").split(",").filter(Boolean);
    state.requests.push({ path: url.pathname, months });
    if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
    if (state.fail) return json(route, { title: "Service Unavailable", status: 503 }, 503);
    // กรองเดือนแบบเดียวกับ API จริง (month IN (?)) — เทสจึงตรวจได้ว่าหน้าขอเดือนถูก
    const scoped = months.length ? rows.filter((row) => months.includes(row.month)) : rows;
    if (url.pathname.endsWith("overview")) {
      return json(route, {
        totals: { total_devices: 7, active_devices: 6 },
        coverage: { total_months: 12, annual_complete_months: 3, months: [], verifiable: true },
        comparison: state.overviewComparison,
        attention: [],
      });
    }
    return json(route, scoped);
  });
  return state;
}
