// apps/api/src/dashboard/fiscal-year-gap.js
//
// เดือนปัจจุบันไม่อยู่ในปีงบใดเลย — งานที่ต้องติดตามต้องบอก (#256)
//
// ปีงบใหม่ไม่ถูกสร้างเอง (ADR-0001: ช่วงปีงบเป็นสิ่งที่ผู้ดูแลตั้ง) วันที่ 1 ต.ค. จึงมาถึงโดยระบบยังมีแค่
// ปีงบเดิม หน้าบันทึกจำนวนพิมพ์เลือกเดือนใหม่ไม่ได้ และไม่มีอะไรบอกว่าทำไม เจ้าหน้าที่จะรู้ก็ต่อเมื่อ
// หาเดือนที่จะกรอกไม่เจอ

const { fiscalYearOfMonth, formatMonthTH } = require("@suth/domain");

/**
 * @param {string} today เดือนปัจจุบัน "YYYY-MM" (ค.ศ.)
 * @param {Array<{ start_month: string, end_month: string }>} fiscalYears ปีงบทั้งหมดในระบบ
 * @returns {object|null} รายการสำหรับ "งานที่ต้องติดตาม" หรือ null ถ้ามีปีงบครอบเดือนนี้แล้ว
 */
function missingFiscalYearAttention(today, fiscalYears) {
  const covered = fiscalYears.some((year) => year.start_month <= today && today <= year.end_month);
  if (covered) return null;

  const year = fiscalYearOfMonth(today);
  return {
    code: "missing_fiscal_year",
    severity: "critical",
    title: `ยังไม่มีปีงบ ${year} ในระบบ`,
    detail:
      `${formatMonthTH(today, { long: true })}ยังไม่อยู่ในปีงบใด จึงยังเลือกเดือนนี้เพื่อบันทึกจำนวนพิมพ์ไม่ได้ ` +
      `และรายงานยังเปิดที่ปีงบเดิม — ผู้ดูแลระบบเพิ่มปีงบ ${year} ที่หน้าปีงบประมาณ`,
    count: 1,
    params: { month: today, year },
    // หน้าเว็บตัดปุ่มที่ไปหน้า /admin ออกให้ผู้ใช้ที่ไม่ใช่ผู้ดูแล ข้อความด้านบนจึงต้องบอกเองว่าใครเป็นคนทำ
    action: { label: "ไปเพิ่มปีงบ", to: "/admin/fiscal-years" },
  };
}

module.exports = { missingFiscalYearAttention };
