import { onBeforeUnmount, onMounted, ref, unref, watch } from "vue";

/** ต่ำกว่านี้ตารางเหลือไม่กี่แถว เลื่อนดูในกล่องเล็กๆ ยากกว่าเลื่อนทั้งหน้า */
const MIN_HEIGHT = 320;

/** ค่า token ที่เก็บเป็น rem เช่น "3.5rem" -> พิกเซลตามขนาดตัวอักษรราก */
function tokenPx(name) {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const rem = parseFloat(style.getPropertyValue(name));
  const base = parseFloat(style.fontSize) || 16;
  return rem ? rem * base : 0;
}

/**
 * ความสูงสูงสุดของกล่องตารางที่พอดี "พื้นที่จอที่เหลือ" ทุกหน้าเท่ากัน
 *
 * เดิมแต่ละหน้าใส่ 60vh / 68vh / 70vh เอง ผลคือขอบล่างของตารางอยู่คนละระดับ
 * และหน้าที่ใส่น้อยไปเหลือที่ว่างใต้ตารางเปล่าๆ แนวทางของ MUI Data Grid
 * (flex parent) และ AG Grid (ความสูงตามคอนเทนเนอร์) คือให้ตารางกินพื้นที่ที่
 * เหลืออยู่จริง แล้วเลื่อนแถวในกล่องโดยหัวตารางปักหมุด — ที่นี่คำนวณจากตำแหน่ง
 * ของกล่องบนหน้า เพราะหน้าเลื่อนด้วย window ไม่ใช่คอนเทนเนอร์ที่สูงตายตัว
 *
 *   - ตารางที่อยู่บนสุดของหน้า: ขอบล่างของท้ายตารางชนขอบล่างของพื้นที่เนื้อหาพอดี
 *     แม้มีไม่กี่แถว (stretch) ท้ายตารางจึงอยู่ตำแหน่งเดิมทุกหน้า ไม่ลอยขึ้นลงตามจำนวนแถว
 *   - ตารางที่อยู่ลึกลงไป (มีการ์ดอื่นอยู่ข้างบน): สูงได้หนึ่งจอใต้แถบบน
 *     เมื่อเลื่อนลงไปถึงจะเห็นทั้งกล่องพร้อมท้ายตารางในจอเดียว
 *
 * @param {import("vue").Ref<HTMLElement|null>} box กล่องที่เลื่อนแถว
 * @param {import("vue").Ref<HTMLElement|null>} footer ท้ายตาราง (จำนวน + แบ่งหน้า)
 * @param {import("vue").Ref<boolean>|boolean} enabled
 */
export function useFillHeight(box, footer, enabled) {
  const height = ref("");
  const stretch = ref(false);
  let frame = 0;
  let observer = null;

  function measure() {
    frame = 0;
    const element = box.value;
    // กล่องถูกซ่อนบนจอเล็ก (แสดงเป็นการ์ดแทน) — ไม่มีอะไรให้วัด
    if (!unref(enabled) || !element || !element.offsetParent) return;

    // อ่านจาก token กลางเท่านั้น ไม่รู้จัก element ของเปลือกแอป และไม่พิมพ์ตัวเลข
    // ชุดเดียวกันซ้ำ (design-system.md — App shell contract, สามชั้น)
    const bottomGap = tokenPx("--shell-content-padding");
    const topbar = tokenPx("--shell-topbar-height");
    const footerHeight = footer.value?.offsetHeight ?? 0;
    const reserved = footerHeight + bottomGap;

    const top = element.getBoundingClientRect().top + window.scrollY;
    const fromPageTop = window.innerHeight - top - reserved;
    const oneScreen = window.innerHeight - topbar - bottomGap - reserved;
    const fits = fromPageTop >= MIN_HEIGHT;
    // ปัดลงเสมอ — ปัดขึ้นแม้ครึ่งพิกเซลก็ทำให้หน้ามีแถบเลื่อนโผล่มา 1px
    const next = `${Math.floor(Math.max(MIN_HEIGHT, fits ? fromPageTop : oneScreen))}px`;
    if (next !== height.value) height.value = next;
    if (fits !== stretch.value) stretch.value = fits;
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  onMounted(() => {
    window.addEventListener("resize", schedule, { passive: true });
    // เนื้อหาเหนือตารางเปลี่ยนความสูงได้เรื่อยๆ (แจ้งเตือน, แผงที่กางออก, ข้อมูลโหลดเสร็จ)
    // ตำแหน่งของกล่องจึงต้องวัดใหม่ทุกครั้งที่หน้าเปลี่ยนขนาด ค่าที่ได้ไม่ขึ้นกับความสูง
    // ของตัวกล่องเอง จึงไม่วนลูป
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(schedule);
      observer.observe(document.body);
    }
    schedule();
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", schedule);
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
  });

  watch(() => unref(enabled), schedule);

  return { height, stretch };
}
