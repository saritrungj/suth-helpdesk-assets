import { ref } from "vue";
import { errorMessage } from "../lib/api-error";
import { t } from "../lib/locale";

/**
 * useExportTask — สถานะของปุ่มส่งออกที่ทุกหน้าใช้เหมือนกัน
 *
 * การสร้างไฟล์ Excel ใช้เวลา (โหลดไลบรารีครั้งแรก + เขียนไฟล์) เดิมปุ่มส่วนใหญ่ไม่มี
 * สถานะระหว่างนั้น กดซ้ำได้ไฟล์ซ้ำ และถ้าล้มก็เงียบ ผู้ใช้ไม่รู้ว่าไฟล์ไม่ได้ออกมา
 *
 * `run(task)` ไม่ทำงานซ้อนระหว่างที่งานก่อนยังไม่จบ และเก็บข้อความผิดพลาดไว้ให้หน้า
 * แสดงพร้อมปุ่มลองใหม่ ผู้เรียกต้องจับข้อมูลที่จะส่งออกไว้ก่อน await แรกเอง เพื่อให้
 * ไฟล์เป็นชุดที่ผู้ใช้กด แม้จะเปลี่ยนตัวกรองระหว่างรอ
 */
export function useExportTask() {
  const busy = ref(false);
  const error = ref("");

  async function run(task) {
    if (busy.value) return false;
    busy.value = true;
    error.value = "";
    try {
      await task();
      return true;
    } catch (err) {
      error.value = errorMessage(err, t("ส่งออกไม่สำเร็จ"));
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { busy, error, run };
}
