import { computed, ref } from "vue";

/**
 * "แก้ไปแล้วหรือยัง" ของฟอร์มในแผงข้าง เทียบกับค่าที่โหลดมาครั้งล่าสุด
 *
 * ทั้งฟอร์มแก้ไขเครื่องและฟอร์มย้ายถามคำถามเดียวกัน และเคยตอบด้วยโค้ดชุดเดียวกัน
 * คนละไฟล์ `ready` ต้องแยกจาก `dirty` เพราะระหว่างโหลด master data ค่าในฟอร์มยัง
 * ขยับเองได้ ถ้านับช่วงนั้นเป็นการแก้ ผู้ใช้จะโดนถามว่า "ทิ้งที่แก้ไว้ไหม" ทั้งที่
 * ยังไม่ได้พิมพ์อะไร
 */
export function useDraftSnapshot(form) {
  const ready = ref(false);
  const baseline = ref("");
  const dirty = computed(() => ready.value && JSON.stringify(form.value) !== baseline.value);

  /** ตรึงค่าปัจจุบันเป็นจุดอ้างอิงใหม่ — ใช้ตอนโหลดเสร็จ บันทึกสำเร็จ และตอนยอมทิ้ง */
  function capture() {
    baseline.value = JSON.stringify(form.value);
  }

  return { ready, dirty, capture };
}
