// apps/api/src/import/brand-model.js — แยกยี่ห้อออกจากข้อความรุ่นของไฟล์ผู้ให้เช่า
//
// ไฟล์ของผู้ให้เช่าไม่มีคอลัมน์ยี่ห้อ ยี่ห้ออยู่หน้าชื่อรุ่น เช่น "HP MFP M430F",
// "Brother HL-L5210DN", "OKI ES5112" และบางแถวเขียนติดกันอย่าง "HP-MFP E73135DN"
// ตัวนำเข้าทะเบียนและสคริปต์ลงข้อมูลใช้กติกาเดียวกัน รุ่นของเครื่องเดียวกันจึงเก็บเป็น
// ข้อความเดียวกันไม่ว่าเข้ามาทางไหน — หมวดมิเตอร์ที่ผูกกับรุ่นจับคู่กันได้

const { normalizeName } = require("../master-data/names");

const KNOWN_BRANDS = [
  ["fuji xerox", "Fuji Xerox"],
  ["brother", "Brother"],
  ["kyocera", "Kyocera"],
  ["lexmark", "Lexmark"],
  ["canon", "Canon"],
  ["epson", "Epson"],
  ["ricoh", "Ricoh"],
  ["oki", "OKI"],
  ["hp", "HP"],
];

/**
 * @param {unknown} text ข้อความรุ่นตามที่เขียนในไฟล์
 * @returns {{ brand: string, model: string }} brand ว่าง = ไม่รู้จักยี่ห้อ (ผู้เรียกตัดสินเอง)
 */
function splitBrandModel(text) {
  const value = normalizeName(text);
  const lower = value.toLowerCase();
  for (const [prefix, brand] of KNOWN_BRANDS) {
    if (!lower.startsWith(prefix)) continue;
    const rest = value.slice(prefix.length);
    // ต้องมีตัวคั่นหรือจบข้อความ — "OKIDATA" ไม่ใช่ "OKI" + "DATA" แต่ "HPE72535DN" คือ HP
    if (rest && !/^[\s-]/.test(rest) && !(brand === "HP" && /^[A-Z0-9]/.test(rest))) continue;
    return { brand, model: rest.replace(/^[\s-]+/, "").trim() };
  }
  return { brand: "", model: value };
}

module.exports = { splitBrandModel };
