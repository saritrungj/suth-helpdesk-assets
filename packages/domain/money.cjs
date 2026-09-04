// packages/domain/money.cjs
//
// การคิดเงินทั้งหมดของระบบ — คิดด้วย "จำนวนเต็มสตางค์" ไม่ใช่ทศนิยมลอยตัว
//
// ปัญหาเดิม: ค่าใช้จ่ายถูกคำนวณด้วย float ทั้งฝั่ง SQL และ JS แล้วบวกสะสมด้วย
// reduce() ผลคือ API คืนค่าอย่าง 1209.6000000000001 และยอดรวมของหลายเครื่อง
// จะคลาดจากที่ผู้ตรวจสอบคำนวณมือทีละสตางค์ โดยไม่มีอะไรเตือน
//
// ตัวเลขพวกนี้คืองบประมาณโรงพยาบาลที่ต้องตรวจสอบย้อนหลังได้ ความคลาดเคลื่อน
// ระดับเศษสตางค์จึงรับไม่ได้ แม้จะไม่กระทบการตัดสินใจก็ตาม เพราะมันทำลายความเชื่อถือ
// ของตัวเลขทั้งชุด
//
// วิธีคิด: ราคาต่อหน้าในฐานข้อมูลเป็น DECIMAL(10,2) แปลงเป็นจำนวนเต็มสตางค์ได้เป๊ะ
// ส่วนหน้าสุทธิคือ pages x 0.8 ซึ่งมีทศนิยมได้หนึ่งตำแหน่ง จึงคิดเป็น "สิบเท่าของหน้า"
// แล้วหารสิบตอนท้ายครั้งเดียว ทุกขั้นเป็นจำนวนเต็มล้วน
//
//   สตางค์ = ปัดครึ่งขึ้น( pages x 8 x ราคาต่อหน้าเป็นสตางค์ / 10 )

/** สัดส่วนหน้าที่คิดเงินจริง หลังหักส่วนลดตามสัญญา 20% (8/10) */
const BILLABLE_NUMERATOR = 8;
const BILLABLE_DENOMINATOR = 10;

/** จำนวนหลักทศนิยมของเงินบาท */
const SATANG_PER_BAHT = 100;

/**
 * แปลงจำนวนเงินบาทเป็นจำนวนเต็มสตางค์ โดยไม่ผ่านทศนิยมลอยตัว
 *
 * รับ string จาก mysql2 (คอลัมน์ DECIMAL คืนเป็น string) หรือ number ก็ได้
 * ทศนิยมเกินสองตำแหน่งถูกปัดครึ่งขึ้น
 *
 * @param {string|number|null|undefined} value
 * @returns {number} จำนวนเต็มสตางค์ — 0 ถ้าค่าว่างหรือแปลงไม่ได้
 */
function toSatang(value) {
  if (value === null || value === undefined || value === "") return 0;

  const text = String(value).trim();
  const match = text.match(/^(-?)(\d*)(?:\.(\d+))?$/);
  if (!match) return 0;

  const [, sign, wholePart, fractionPart] = match;
  const whole = wholePart === "" ? 0 : Number(wholePart);
  if (!Number.isFinite(whole)) return 0;

  // เติม/ตัดทศนิยมให้เหลือสองตำแหน่ง โดยปัดครึ่งขึ้นจากตำแหน่งที่สาม
  const fraction = (fractionPart || "").padEnd(3, "0");
  let satang = whole * SATANG_PER_BAHT + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) satang += 1;

  return sign === "-" ? -satang : satang;
}

/**
 * แปลงจำนวนเต็มสตางค์กลับเป็นบาท สำหรับส่งออก API และแสดงผล
 * @param {number} satang
 * @returns {number} บาท ทศนิยมสองตำแหน่ง
 */
function fromSatang(satang) {
  return Math.round(satang) / SATANG_PER_BAHT;
}

/**
 * หน้าที่คิดเงินจริงหลังหักส่วนลด 20%
 * @param {number|string} pages จำนวนหน้าดิบจากมิเตอร์
 * @returns {number} หน้าสุทธิ (มีทศนิยมได้หนึ่งตำแหน่ง)
 */
function billablePages(pages) {
  const raw = Math.round(Number(pages) || 0);
  return (raw * BILLABLE_NUMERATOR) / BILLABLE_DENOMINATOR;
}

/**
 * ค่าใช้จ่ายของยอดพิมพ์หนึ่งรายการ คิดเป็นจำนวนเต็มสตางค์
 *
 * @param {number|string} pages จำนวนหน้าดิบ
 * @param {string|number|null} pricePerPage ราคาต่อหน้าเป็นบาท (รับ string จาก DECIMAL ได้)
 * @returns {number} จำนวนเต็มสตางค์
 */
function costSatang(pages, pricePerPage) {
  return costSatangAt(pages, toSatang(pricePerPage));
}

/**
 * เหมือน costSatang() แต่รับราคาที่แปลงเป็นสตางค์มาแล้ว
 * ใช้ตอนที่ resolve ราคา (override -> สัญญา -> 0) ไปก่อนหน้าแล้ว จะได้ไม่ต้องแปลงกลับไปกลับมา
 *
 * @param {number|string} pages จำนวนหน้าดิบ
 * @param {number} priceSatang ราคาต่อหน้าเป็นจำนวนเต็มสตางค์
 * @returns {number} จำนวนเต็มสตางค์
 */
function costSatangAt(pages, priceSatang) {
  const rawPages = Math.round(Number(pages) || 0);
  const price = Math.round(Number(priceSatang) || 0);
  if (rawPages === 0 || price === 0) return 0;

  const scaled = rawPages * BILLABLE_NUMERATOR * price;

  // ถ้าตัวเลขใหญ่จนเกินช่วงที่จำนวนเต็มของ JS แม่นยำ ให้ล้มดังๆ ดีกว่าคืนค่าที่เพี้ยนเงียบๆ
  if (!Number.isSafeInteger(scaled)) {
    throw new Error(
      `คำนวณค่าใช้จ่ายเกินช่วงที่คำนวณได้แม่นยำ (pages=${rawPages}, priceSatang=${price})`
    );
  }

  // ปัดครึ่งขึ้นตอนหารสิบ ครั้งเดียวตอนท้าย
  return Math.floor(scaled / BILLABLE_DENOMINATOR + 0.5);
}

/**
 * ราคาต่อหน้าที่มีผลจริง เรียงลำดับความสำคัญ:
 * ราคาเฉพาะเครื่อง -> ราคาตามสัญญา -> ไม่มีราคา (0)
 *
 * @param {string|number|null|undefined} priceOverride devices.price_override
 * @param {string|number|null|undefined} contractPrice contracts.price_per_page
 * @returns {number} ราคาต่อหน้าเป็นจำนวนเต็มสตางค์
 */
function effectivePriceSatang(priceOverride, contractPrice) {
  if (priceOverride !== null && priceOverride !== undefined && priceOverride !== "") {
    return toSatang(priceOverride);
  }
  if (contractPrice !== null && contractPrice !== undefined && contractPrice !== "") {
    return toSatang(contractPrice);
  }
  return 0;
}

/**
 * รวมจำนวนเงินหลายก้อน — บวกกันในหน่วยสตางค์ที่เป็นจำนวนเต็ม
 * ห้ามรวมเงินด้วยการบวก float ของบาท เพราะความคลาดจะสะสมตามจำนวนรายการ
 *
 * @param {Array<number|string|null>} values รายการที่เป็นสตางค์อยู่แล้ว
 * @returns {number} จำนวนเต็มสตางค์
 */
function sumSatang(values) {
  let total = 0;
  for (const value of values || []) {
    total += Math.round(Number(value) || 0);
  }
  return total;
}

/**
 * จัดรูปแบบเงินสำหรับแสดงผล เช่น "1,209.60"
 * @param {number} satang
 * @returns {string}
 */
function formatBaht(satang) {
  return fromSatang(satang).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

module.exports = {
  BILLABLE_NUMERATOR,
  BILLABLE_DENOMINATOR,
  SATANG_PER_BAHT,
  toSatang,
  fromSatang,
  billablePages,
  costSatang,
  costSatangAt,
  effectivePriceSatang,
  sumSatang,
  formatBaht,
};
