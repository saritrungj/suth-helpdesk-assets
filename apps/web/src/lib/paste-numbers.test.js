// apps/web/src/lib/paste-numbers.test.js
//
// เทสของการวางตัวเลขจากตารางคำนวณ
//
// ทดสอบละเอียดเพราะนี่คือทางที่ข้อมูลจริงจะไหลเข้าระบบเป็นร้อยค่าในครั้งเดียว
// ความผิดพลาดตรงนี้ไม่ได้ทำให้หน้าจอพัง แต่ทำให้ยอดเงินของทั้งปีเพี้ยนแบบเงียบๆ
// ซึ่งไม่มีใครจับได้จนกว่าจะเอาไปเทียบกับใบแจ้งหนี้
//
// รัน: npm test --workspace @suth/web

import { describe, expect, it } from "vitest";
import { applyPaste, describePaste, parseNumbers } from "./paste-numbers";

describe("parseNumbers — อ่านข้อความจากคลิปบอร์ด", () => {
  it("อ่านคอลัมน์ที่คัดลอกมาจากตารางคำนวณ", () => {
    expect(parseNumbers("120\n340\n560")).toEqual([120, 340, 560]);
  });

  it("อ่านแถวที่คั่นด้วย tab ได้เหมือนกัน", () => {
    // คัดลอกแนวนอนจาก Excel จะได้ tab ไม่ใช่ขึ้นบรรทัด
    expect(parseNumbers("120\t340\t560")).toEqual([120, 340, 560]);
  });

  it("ตัดตัวคั่นหลักพันออก", () => {
    // นี่คือรูปแบบที่ออกมาจากการคัดลอกจริงเกือบทุกครั้ง ถ้าไม่รองรับ
    // ความสามารถทั้งหมดนี้จะใช้ไม่ได้เลยในทางปฏิบัติ
    expect(parseNumbers("12,480\n1,234,567")).toEqual([12480, 1234567]);
  });

  it("ตัดช่องว่างไม่ตัดคำที่ตารางคำนวณบางตัวใส่มา", () => {
    // U+00A0 ไม่ใช่ช่องว่างปกติ และ Number() แปลงไม่ได้ถ้าไม่ล้างออกก่อน
    expect(parseNumbers("9 300")).toEqual([9300]);
  });

  it("ช่องว่างคืน null ไม่ใช่ 0", () => {
    // ต่างกันจริงและสำคัญ: 0 = ตรวจแล้วไม่ได้พิมพ์ | null = ยังไม่ได้ตรวจ
    expect(parseNumbers("120\n\n560")).toEqual([120, null, 560]);
  });

  it("ข้อความที่ไม่ใช่ตัวเลขคืน undefined เพื่อให้ข้ามโดยไม่ทับค่าเดิม", () => {
    expect(parseNumbers("120\nไม่มีข้อมูล\n560")).toEqual([120, undefined, 560]);
  });

  it("ตัวเลขติดลบถือว่าใช้ไม่ได้", () => {
    // ยอดพิมพ์ติดลบไม่มีอยู่จริง มักมาจากการคัดลอกคอลัมน์ผลต่างมาผิด
    expect(parseNumbers("-50")).toEqual([undefined]);
  });

  it("ปัดทศนิยมเป็นจำนวนเต็ม เพราะมิเตอร์นับเป็นแผ่น", () => {
    expect(parseNumbers("120.4\n120.6")).toEqual([120, 121]);
  });

  it("รับมือกับขึ้นบรรทัดแบบ Windows", () => {
    expect(parseNumbers("120\r\n340")).toEqual([120, 340]);
  });

  it("ข้อความว่างคืนรายการที่มีค่าว่างหนึ่งช่อง ไม่พัง", () => {
    expect(parseNumbers("")).toEqual([null]);
    expect(parseNumbers(null)).toEqual([null]);
  });
});

describe("applyPaste — เติมค่าลงในช่องเดือน", () => {
  const empty = () => Array(12).fill(null);

  it("เติมจากช่องแรกเมื่อไม่ระบุตำแหน่ง", () => {
    const result = applyPaste(empty(), [10, 20, 30]);

    expect(result.values.slice(0, 3)).toEqual([10, 20, 30]);
    expect(result.filled).toBe(3);
  });

  it("เริ่มเติมจากช่องที่โฟกัสอยู่", () => {
    // กรณีที่เจอบ่อยพอๆ กับการวางทั้งปี คือ "เพิ่งได้ตัวเลขของสามเดือนหลังมา"
    const result = applyPaste(empty(), [10, 20], 9);

    expect(result.values[9]).toBe(10);
    expect(result.values[10]).toBe(20);
    expect(result.values[0]).toBeNull();
  });

  it("ค่าที่แปลงไม่ได้ต้องเว้นที่ไว้ ไม่ทำให้ค่าที่เหลือเลื่อน", () => {
    // นี่คือกฎที่สำคัญที่สุดในไฟล์นี้ — ถ้าเลื่อน ยอดของทุกเดือนหลังจุดนั้นจะ
    // ไปตกผิดเดือนทั้งหมด จากความผิดพลาดเล็กๆ ที่ต้นทางเพียงจุดเดียว
    const target = [1, 2, 3, 4];
    const result = applyPaste(target, [10, undefined, 30], 0);

    expect(result.values).toEqual([10, 2, 30, 4]);
    expect(result.filled).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it("ไม่แก้ไขรายการต้นฉบับ เพื่อให้กดเลิกทำได้", () => {
    const target = [1, 2, 3];
    applyPaste(target, [99], 0);

    expect(target).toEqual([1, 2, 3]);
  });

  it("นับค่าที่ล้นออกนอกจำนวนช่อง", () => {
    // มักแปลว่าคัดลอกมาผิดคอลัมน์หรือรวมหัวตารางมาด้วย ต้องบอก ไม่ใช่ทิ้งเงียบ
    const result = applyPaste(Array(3).fill(null), [1, 2, 3, 4, 5], 0);

    expect(result.filled).toBe(3);
    expect(result.overflow).toBe(2);
  });

  it("วางเลยช่องสุดท้ายไปแล้วต้องไม่พัง", () => {
    const result = applyPaste(Array(3).fill(null), [1, 2], 2);

    expect(result.values).toEqual([null, null, 1]);
    expect(result.overflow).toBe(1);
  });

  it("null จากช่องว่างในต้นทาง เขียนทับค่าเดิมเป็น 'ยังไม่กรอก'", () => {
    // ผู้ใช้ที่คัดลอกคอลัมน์ที่มีช่องว่างมา ตั้งใจให้เดือนนั้นว่างจริงๆ
    const result = applyPaste([5, 5, 5], [null, 10], 0);

    expect(result.values).toEqual([null, 10, 5]);
    expect(result.filled).toBe(2);
  });
});

describe("describePaste — สรุปผลให้ผู้ใช้ตรวจก่อนบันทึก", () => {
  it("บอกจำนวนที่วางสำเร็จ", () => {
    expect(describePaste({ filled: 7, skipped: 0, overflow: 0 })).toBe("วาง 7 เดือน");
  });

  it("บอกทุกอย่างที่ไม่เป็นไปตามคาด", () => {
    expect(describePaste({ filled: 7, skipped: 1, overflow: 2 })).toBe(
      "วาง 7 เดือน · ข้าม 1 ค่าที่ไม่ใช่ตัวเลข · เกินมา 2 ค่าไม่ถูกใช้"
    );
  });
});
