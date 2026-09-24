import { computed, unref } from "vue";
import { modeState } from "../store/theme";

/**
 * useChartTheme.js — สีของกราฟให้เข้ากับธีมของระบบ
 *
 * ปัญหา: กราฟวาดลงบน <canvas> ซึ่งไม่รู้จัก CSS variable หรือคลาสของ Tailwind
 * ต้องส่งค่าสีเป็นตัวเลขให้ตอนสร้างกราฟทุกครั้ง ถ้า hardcode ไว้ในแต่ละไฟล์
 * กราฟจะไม่เปลี่ยนตามโหมด และสีจะเพี้ยนจากส่วนอื่นของหน้าเมื่อธีมถูกปรับ
 *
 * วิธีแก้: อ่านค่าจริงของ CSS variable ที่เบราว์เซอร์คำนวณไว้แล้ว และคำนวณใหม่
 * ทุกครั้งที่โหมดเปลี่ยน (ผูก reactive ผ่าน modeState.current)
 *
 * ชุดสีของเส้นมาจาก --chart-1..8 ซึ่งไล่เฉดสีให้ห่างกันพอที่คนตาบอดสีแยกออก
 * และคุมความสว่างให้ใกล้กัน เพื่อไม่ให้ชุดข้อมูลใดเด่นกว่าเพื่อนโดยไม่ได้ตั้งใจ (ดู tokens.css)
 *
 * เรื่องลดการเคลื่อนไหว: ตัววาดกราฟแบบหุ้น (#212) ไม่มีแอนิเมชันตอนเปลี่ยนข้อมูล
 * จึงไม่มีอะไรต้องปิดตาม prefers-reduced-motion อีก (เดิม Chart.js เคลื่อนไหวด้วย JavaScript
 * ที่กฎใน CSS คุมไม่ถึง)
 */

function cssVar(name, fallback, element) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(element || document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function useChartTheme(element) {
  const colors = computed(() => {
    // อ่านตรงนี้เพื่อบอก Vue ว่าต้องคำนวณใหม่ทุกครั้งที่สลับโหมด
    void modeState.current;
    // อ่านจากพื้นผิวของกราฟเอง ชุดสีเฉพาะของพื้นที่ทำงานจึงมีผลกับกราฟด้วย ไม่ส่ง root มา = ค่าของทั้งหน้า
    const color = (name, fallback) => cssVar(name, fallback, unref(element));

    return {
      ink: color("--ink", "#1f2937"),
      text: color("--ink-mute", "#4b5563"),
      grid: color("--line-soft", "#e5e7eb"),
      surface: color("--surface", "#ffffff"),
      surfaceFloat: color("--surface-float", "#ffffff"),
      border: color("--line", "#d1d5db"),
      series: [
        color("--chart-1", "#0f766e"),
        color("--chart-2", "#c2410c"),
        color("--chart-3", "#0369a1"),
        color("--chart-4", "#a16207"),
        color("--chart-5", "#6d28d9"),
        color("--chart-6", "#15803d"),
        color("--chart-7", "#b91c1c"),
        color("--chart-8", "#6b7280"),
      ],
    };
  });

  return { colors };
}
