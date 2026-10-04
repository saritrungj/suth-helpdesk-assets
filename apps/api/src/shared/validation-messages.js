// apps/api/src/shared/validation-messages.js
//
// ข้อความตรวจข้อมูลที่ schema ไม่ได้เขียนเป็นภาษาไทยเอง (#257)
//
// zod ใส่ข้อความอังกฤษของตัวเองให้ทุกกฎที่ไม่มีข้อความกำกับ เช่น "Invalid input: expected nonoptional,
// received undefined" หรือ "Too small: expected number to be >0" ผู้ใช้เห็นข้อความพวกนี้ใต้ช่องและใน
// ข้อความ error รวม ไฟล์นี้แปลงเป็นข้อความไทยกลางตามชนิดของปัญหา — ข้อความไทยที่ schema เขียนเองยังชนะ

const THAI = /[฀-๿]/;

const UNIT = { string: "ตัวอักษร", array: "รายการ", set: "รายการ" };

function size(issue, limit) {
  const unit = UNIT[issue.origin];
  return unit ? `${limit} ${unit}` : String(limit);
}

/**
 * @param {import("zod").core.$ZodIssue} issue
 * @returns {string} ข้อความภาษาไทยสำหรับผู้ใช้
 */
function thaiMessage(issue) {
  if (typeof issue.message === "string" && THAI.test(issue.message)) return issue.message;

  switch (issue.code) {
    case "invalid_type":
      // ไม่ส่งช่องนี้มาเลย = ลืมกรอก ซึ่งเป็นกรณีที่เจอบ่อยที่สุด
      return /received (undefined|null)/.test(String(issue.message)) ? "จำเป็นต้องกรอก" : "ชนิดของข้อมูลไม่ถูกต้อง";
    case "too_small":
      if (issue.origin === "string" && Number(issue.minimum) <= 1) return "จำเป็นต้องกรอก";
      return UNIT[issue.origin]
        ? `ต้องมีอย่างน้อย ${size(issue, issue.minimum)}`
        : `ต้อง${issue.inclusive === false ? "มากกว่า" : "ไม่น้อยกว่า"} ${issue.minimum}`;
    case "too_big":
      return UNIT[issue.origin]
        ? `ต้องไม่เกิน ${size(issue, issue.maximum)}`
        : `ต้อง${issue.inclusive === false ? "น้อยกว่า" : "ไม่เกิน"} ${issue.maximum}`;
    case "invalid_format":
      return "รูปแบบไม่ถูกต้อง";
    case "invalid_value":
      return "ค่าที่เลือกไม่อยู่ในตัวเลือกที่ใช้ได้";
    case "not_multiple_of":
      return `ต้องเป็นจำนวนที่หารด้วย ${issue.divisor} ลงตัว`;
    case "unrecognized_keys":
      return "มีช่องที่ระบบไม่รู้จัก";
    default:
      return "ข้อมูลไม่ถูกต้อง";
  }
}

module.exports = { thaiMessage };
