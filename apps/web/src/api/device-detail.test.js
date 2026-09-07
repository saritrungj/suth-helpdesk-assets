// apps/web/src/api/device-detail.test.js
//
// เทสของชั้นดึงข้อมูลหน้ารายละเอียดเครื่อง
//
// ## สองอาการที่เทสชุดนี้มีไว้กัน
//
// 1. **คำตอบมาสลับลำดับ (request race)** — กดจากเครื่อง 17 ไป 18 เร็วๆ ถ้าคำตอบ
//    ของ 17 มาช้ากว่า โค้ดที่เขียนผลลง ref ตรงๆ จะเอาข้อมูลของ 17 ไปทับ 18
//    หน้าจอจึงขึ้นหัวเรื่องเป็นเครื่อง 18 แต่ตัวเลขเป็นของเครื่อง 17
//    ผิดแบบที่ **ไม่มีอะไรฟ้อง** — ไม่มี error ไม่มีหน้าขาว มีแต่ตัวเลขที่ผิดเจ้าของ
//
// 2. **ข้อมูลปีเก่าค้างใต้ป้ายปีใหม่** — สลับปีงบแล้วยอดพิมพ์ของปีเดิมยังแสดงอยู่
//    พร้อมหัวข้อ "ปีงบ 2569"
//
// ## วิธีทดสอบ
//
// เทสที่ระดับ **key** ไม่ใช่ระดับ component — เพราะสิ่งที่ป้องกันทั้งสองอาการคือ
// การที่ข้อมูลถูกผูกกับ queryKey ที่มี deviceId และ fiscalYearId อยู่ข้างใน
// ถ้า key ถูก TanStack Query รับประกันเรื่องที่เหลือให้เอง ถ้า key ผิด ต่อให้
// เขียน component ระวังแค่ไหนก็ยังพังอยู่ดี
//
// รัน: npm test --workspace @suth/web

import { describe, expect, test, vi, beforeEach } from "vitest";
import { ref } from "vue";

const get = vi.fn();
vi.mock("../services/api", () => ({ default: { get } }));

const { keys } = await import("./queries");

beforeEach(() => get.mockReset());

describe("queryKey ของหน้ารายละเอียดเครื่อง", () => {
  test("key ของคนละเครื่องต้องไม่ชนกัน", () => {
    // ถ้าสองอันนี้เท่ากัน คำตอบของเครื่องหนึ่งจะถูกเก็บทับอีกเครื่องใน cache
    expect(keys.device(17)).not.toEqual(keys.device(18));
    expect(keys.deviceHistory(17)).not.toEqual(keys.deviceHistory(18));
  });

  test("key ของยอดพิมพ์ต้องมีทั้งเครื่องและปีงบ", () => {
    // เปลี่ยนเครื่อง -> key เปลี่ยน
    expect(keys.deviceUsage(17, 1)).not.toEqual(keys.deviceUsage(18, 1));
    // เปลี่ยนปีงบ -> key เปลี่ยน (นี่คือตัวกันข้อมูลปีเก่าค้างใต้ป้ายปีใหม่)
    expect(keys.deviceUsage(17, 1)).not.toEqual(keys.deviceUsage(17, 2));
  });

  test("id ที่เป็นสตริงกับตัวเลขต้องได้ key เดียวกัน", () => {
    // route params มาเป็นสตริงเสมอ ("17") ส่วนโค้ดอื่นส่งตัวเลข ถ้าไม่แปลงให้
    // ตรงกัน จะได้ cache สองก้อนของเครื่องเดียวกัน ยิง API ซ้ำโดยไม่จำเป็น
    expect(keys.device("17")).toEqual(keys.device(17));
    expect(keys.deviceUsage("17", 1)).toEqual(keys.deviceUsage(17, 1));
  });

  test("ปีงบที่ยังไม่ได้เลือกต้องได้ key ที่คงที่ ไม่ใช่ undefined ลอยๆ", () => {
    // undefined ใน key ทำให้ TanStack Query เตือนและ cache ไม่นิ่ง
    expect(keys.deviceUsage(17, undefined)).toEqual(keys.deviceUsage(17, null));
    expect(keys.deviceUsage(17, undefined).at(-1)).toBe(null);
  });

  test("key ของรายละเอียดกับของประวัติต้องแยกกัน แม้เป็นเครื่องเดียวกัน", () => {
    expect(keys.device(17)).not.toEqual(keys.deviceHistory(17));
  });

  test("key อยู่ใต้ namespace 'devices' เพื่อให้ล้าง cache ทั้งกลุ่มได้ทีเดียว", () => {
    // ตอนบันทึกการแก้ไขเครื่อง ต้องล้าง cache ของทั้งรายการและรายละเอียด
    // การมี prefix ร่วมกันทำให้ invalidateQueries({ queryKey: ["devices"] }) ครอบได้หมด
    expect(keys.device(17)[0]).toBe("devices");
    expect(keys.deviceHistory(17)[0]).toBe("devices");
    expect(keys.devices()[0]).toBe("devices");
  });
});

describe("การสลับเครื่องเร็วๆ (request race)", () => {
  /**
   * จำลองพฤติกรรมของ cache ที่ผูกข้อมูลกับ key — คำตอบที่มาถึงถูกเก็บเข้า key
   * ที่ *คำขอนั้น* ระบุไว้ ไม่ใช่ key ที่กำลังแสดงอยู่บนหน้าจอ
   */
  function cacheByKey() {
    const store = new Map();
    return {
      resolve: (key, value) => store.set(JSON.stringify(key), value),
      read: (key) => store.get(JSON.stringify(key)),
    };
  }

  test("คำตอบของเครื่องเก่าที่มาช้า ต้องไม่ทับข้อมูลของเครื่องที่กำลังดูอยู่", () => {
    const cache = cacheByKey();
    const viewing = ref(18);

    // ผู้ใช้กดเครื่อง 17 แล้วเปลี่ยนไป 18 ทันที จากนั้นคำตอบของ 17 เพิ่งกลับมา
    cache.resolve(keys.device(17), { id: 17, serial_number: "PRN-ADM-001" });
    cache.resolve(keys.device(18), { id: 18, serial_number: "PRN-ER-001" });

    // หน้าจออ่านจาก key ของเครื่องที่กำลังดูอยู่เท่านั้น
    expect(cache.read(keys.device(viewing.value)).serial_number).toBe("PRN-ER-001");

    // คำตอบของ 17 ที่มาช้ายังอยู่ใน cache ของมันเอง ไม่หายและไม่ไปทับใคร
    expect(cache.read(keys.device(17)).serial_number).toBe("PRN-ADM-001");
  });

  test("สลับปีงบแล้วยอดพิมพ์ของปีเก่าต้องไม่ถูกอ่านมาแสดงใต้ปีใหม่", () => {
    const cache = cacheByKey();

    cache.resolve(keys.deviceUsage(17, 1), [{ month: "2025-10", pages: 585 }]);

    // เปลี่ยนไปปีงบ 2 ซึ่งยังไม่มีข้อมูลใน cache
    expect(cache.read(keys.deviceUsage(17, 2))).toBeUndefined();

    // สำคัญ: ต้องเป็น undefined (= ยังไม่รู้ ต้องโหลด) ไม่ใช่ข้อมูลของปี 1
    // ถ้าอ่านได้เป็นข้อมูลปี 1 แปลว่า key ไม่มีปีงบอยู่ข้างใน
    expect(cache.read(keys.deviceUsage(17, 2))).not.toEqual(cache.read(keys.deviceUsage(17, 1)));
  });
});
