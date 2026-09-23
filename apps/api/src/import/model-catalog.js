// apps/api/src/import/model-catalog.js
//
// หมวดมิเตอร์ของรุ่นเครื่องที่รู้จักแน่นอน — ใช้ตอนนำเข้าอัตโนมัติ (#190, ADR-0030) กับรุ่นที่ยังไม่เคยลงในระบบ
//
// หมวดกำหนดราคาต่อหน้าของสัญญา เดาผิด = คิดเงินผิด จึงไม่เดาจากชื่อรุ่นกว้างๆ (เช่น "MFP" แปลว่ามัลติฟังก์ชัน
// แต่ไม่บอกว่า A3 หรือ A4) — ใส่เฉพาะรุ่นที่ตรวจสเปกแล้ว รุ่นที่ไม่อยู่ในรายการ ระบบถามผู้ดูแลเหมือนเดิม
// เมื่อรุ่นหนึ่งลงระบบแล้ว ครั้งถัดไประบบใช้หมวดของเครื่องเดิม (registry-plan.js) ไม่ต้องพึ่งรายการนี้อีก
//
// รหัสหมวดตรงกับ meter_category.code ใน database/schema.sql

const CATALOG = [
  { pattern: /\bHL-?L5210DN\b/i, category: "a4-laser-bw", note: "Brother เลเซอร์ขาวดำ A4" },
  { pattern: /\bES5112\b/i, category: "a4-laser-bw", note: "OKI เลเซอร์ขาวดำ A4" },
  { pattern: /\bMFC-?L5915DW\b/i, category: "a4-mfp-bw", note: "Brother มัลติฟังก์ชันขาวดำ A4" },
  { pattern: /\bM430F\b/i, category: "a4-mfp-bw", note: "HP LaserJet MFP M430f ขาวดำ A4" },
  // ชื่อรุ่นมีตัวต่อท้ายชิดกัน (E73135DN, E73135dn) จึงไม่ปิดท้ายด้วย \b
  { pattern: /\bE73135/i, category: "a3-bw", note: "HP LaserJet Managed MFP E73135 ขาวดำ A3" },
  { pattern: /\bE731DN\b/i, category: "a3-bw", note: "HP LaserJet Managed MFP E731 ขาวดำ A3" },
  // มิเตอร์สีของรุ่นนี้เป็นอีกมิเตอร์หนึ่ง (a3-color) — หมวดของเครื่องคือหมวดของมิเตอร์หลัก
  { pattern: /\bE78635/i, category: "a3-bw", note: "HP Color LaserJet Managed MFP E78635 A3 (มิเตอร์หลักขาวดำ)" },
];

/** รหัสหมวดของรุ่น หรือ null ถ้าไม่รู้จัก */
function categoryCodeOf(brand, model) {
  const text = `${brand ?? ""} ${model ?? ""}`;
  return CATALOG.find((entry) => entry.pattern.test(text))?.category ?? null;
}

module.exports = { CATALOG, categoryCodeOf };
