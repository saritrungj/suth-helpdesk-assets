// backend/utils/fiscalYear.js
//
// ปีงบประมาณราชการไทยเริ่ม 1 ต.ค. ของปี ค.ศ. ก่อนหน้า ถึง 30 ก.ย. ของปีที่ตรงกับปีงบ
// เช่น ปีงบ พ.ศ. 2569 = 1 ต.ค. 2568 (ค.ศ. 2025) - 30 ก.ย. 2569 (ค.ศ. 2026)
//
// เดิมระบบไม่มีจุดคำนวณนี้เลย (ตาราง fiscal_year เก็บแค่เลขปี พ.ศ. เฉยๆ) ทำให้แต่ละหน้า
// ต้องเดาเอาเองว่าปีงบครอบคลุมเดือนไหนบ้าง — บางจุดเดาผิดเป็น ม.ค.-ธ.ค. (ปีปฏิทิน) แทนที่จะเป็น
// ต.ค.-ก.ย. จริง ทำให้ยอดพิมพ์/ค่าใช้จ่ายรายเดือนที่ดึงมาไม่ตรงกับปีงบที่เลือก
//
// ฟังก์ชันนี้เป็น single source of truth ของการแปลง "ปีงบ พ.ศ." เป็นช่วงเดือน "YYYY-MM"
// ให้ backend ทุกจุดเรียกใช้ร่วมกัน (ดูการใช้งานใน routes/master-data.js ตอนสร้าง/แก้ไขปีงบ
// ซึ่งจะคำนวณแล้วเก็บผลลัพธ์ไว้ในคอลัมน์ start_month/end_month ของตาราง fiscal_year เลย
// เพื่อให้ routes อื่นๆ อ่านค่าที่เก็บไว้ได้ตรงๆ ไม่ต้องคำนวณซ้ำทุกครั้ง)

const BE_OFFSET = 543;

/**
 * แปลงปีงบ พ.ศ. เป็นช่วงเดือน "YYYY-MM" (ค.ศ.) ที่ปีงบนั้นครอบคลุม (รวมทั้งสองปลาย)
 * @param {number|string} beYear ปีงบประมาณ พ.ศ. เช่น 2569
 * @returns {{ startMonth: string, endMonth: string }}
 */
function getFiscalYearRange(beYear) {
  const y = Number(beYear);
  if (!Number.isInteger(y) || y < BE_OFFSET) {
    throw new Error(`ปีงบไม่ถูกต้อง: ${beYear}`);
  }

  const ceEnd = y - BE_OFFSET; // ปี ค.ศ. ที่ปีงบสิ้นสุด (ม.ค.-ก.ย.)
  const ceStart = ceEnd - 1; // ปี ค.ศ. ที่ปีงบเริ่ม (ต.ค.-ธ.ค.)

  return {
    startMonth: `${ceStart}-10`,
    endMonth: `${ceEnd}-09`,
  };
}

module.exports = { getFiscalYearRange, BE_OFFSET };
