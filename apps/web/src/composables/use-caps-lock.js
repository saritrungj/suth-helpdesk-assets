import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * สถานะ Caps Lock ของแป้นจริง หรือ null เมื่อเหตุการณ์นี้บอกไม่ได้
 *
 * ถามจาก getModifierState ไม่เดาจากตัวพิมพ์ใหญ่หรือ Shift เหตุการณ์ที่สคริปต์สร้างเอง (isTrusted=false)
 * ไม่รู้สถานะแป้นจริง ถ้ารับมาใช้ ส่วนขยายที่ยิง keydown ปลอมเข้าช่องกรอกจะทำให้คำเตือนหายทั้งที่ Caps Lock ยังเปิด
 */
export function capsLockState(event) {
  if (!event.isTrusted || typeof event.getModifierState !== "function") return null;
  return event.getModifierState("CapsLock");
}

/**
 * ติดตาม Caps Lock จากทุกการกดแป้นในหน้า ไม่ผูกกับช่องใดช่องหนึ่ง
 *
 * เดิมฟังเฉพาะช่องรหัสผ่านและล้างค่าเมื่อออกจากช่อง คำเตือนจึงหายทันทีที่กด Tab หรือคลิกปุ่มแสดงรหัสผ่าน
 * ทั้งที่ Caps Lock ยังเปิดอยู่
 *
 * คีย์บอร์ดเป็นตัวตัดสินทั้งเปิดและปิด ส่วนการคลิกใช้ "เปิด" คำเตือนได้อย่างเดียว: คนที่เปิด Caps Lock ค้างไว้ก่อนเข้าหน้า
 * จึงเห็นคำเตือนตั้งแต่คลิกเข้าช่อง ไม่ต้องพิมพ์ผิดไปหนึ่งตัวก่อน แต่ถ้าเบราว์เซอร์ใดไม่รายงาน Caps Lock บนเหตุการณ์เมาส์
 * การคลิกก็จะไม่ไปลบคำเตือนที่ถูกต้องทิ้ง
 */
export function useCapsLock() {
  const capsLock = ref(false);
  const sync = (event) => {
    const state = capsLockState(event);
    if (state !== null) capsLock.value = state;
  };
  const syncPointer = (event) => {
    if (capsLockState(event)) capsLock.value = true;
  };
  onMounted(() => {
    window.addEventListener("keydown", sync, true);
    window.addEventListener("keyup", sync, true);
    window.addEventListener("pointerdown", syncPointer, true);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", sync, true);
    window.removeEventListener("keyup", sync, true);
    window.removeEventListener("pointerdown", syncPointer, true);
  });
  return capsLock;
}
