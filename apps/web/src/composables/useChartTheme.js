import { computed, ref, unref } from "vue";
import { modeState } from "../store/theme";

/**
 * ผู้ใช้ขอให้ลดการเคลื่อนไหวไว้ที่ระบบปฏิบัติการหรือยัง
 *
 * ## ทำไมต้องเช็คที่นี่ ทั้งที่ base.css มีกฎ prefers-reduced-motion อยู่แล้ว
 *
 * กฎใน CSS คุมได้แค่ CSS animation และ transition — แต่กราฟทุกอันในระบบวาดลงบน
 * `<canvas>` แล้วเคลื่อนไหวด้วย JavaScript ของ Chart.js เอง กฎนั้นจึงไม่มีผลกับ
 * กราฟแม้แต่นิดเดียว ผลคือระบบประกาศว่าเคารพการตั้งค่านี้ แต่ของที่เคลื่อนไหว
 * เยอะที่สุดบนแดชบอร์ดยังวิ่งเหมือนเดิมทุกครั้งที่เปลี่ยนตัวกรอง
 *
 * ## ผลพลอยได้ที่สำคัญพอกัน: กราฟกลายเป็นของที่วัดได้
 *
 * ระหว่างไล่ปัญหา "แท่งกราฟเตี้ยผิดปกติ" พบว่าสาเหตุคือการวัดตอนแอนิเมชันยัง
 * วิ่งอยู่ — สเกล ข้อมูล และการวาดถูกต้องทั้งหมด แต่ภาพ ณ วินาทีที่วัดยังโตไม่สุด
 * (วัดได้ 6px จากความสูงจริง 212px) เวลาจริงที่ใช้ไปกับการไล่หา "บั๊ก" ที่ไม่มีอยู่
 * คือต้นทุนของการที่กราฟไม่มีสถานะนิ่งที่แน่นอน
 */
const reducedMotion = ref(
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false
);

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  // ผู้ใช้เปลี่ยนการตั้งค่าระหว่างที่เปิดหน้าอยู่ได้ และไม่ควรต้องรีเฟรชเพื่อให้มีผล
  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", (event) => (reducedMotion.value = event.matches));
}

/**
 * useChartTheme.js — สีและค่าตั้งต้นของกราฟ Chart.js ให้เข้ากับธีมของระบบ
 *
 * ปัญหา: กราฟวาดลงบน <canvas> ซึ่งไม่รู้จัก CSS variable หรือคลาสของ Tailwind
 * ต้องส่งค่าสีเป็นตัวเลขให้ตอนสร้างกราฟทุกครั้ง ถ้า hardcode ไว้ในแต่ละไฟล์
 * กราฟจะไม่เปลี่ยนตามโหมด และสีจะเพี้ยนจากส่วนอื่นของหน้าเมื่อธีมถูกปรับ
 *
 * วิธีแก้: อ่านค่าจริงของ CSS variable ที่เบราว์เซอร์คำนวณไว้แล้ว แล้วสร้าง
 * options ใหม่ทุกครั้งที่โหมดเปลี่ยน (ผูก reactive ผ่าน modeState.current)
 *
 * ชุดสีของเส้น/แท่งมาจาก --chart-1..8 ซึ่งไล่เฉดสีให้ห่างกันพอที่คนตาบอดสี
 * แยกออก และคุมความสว่างให้ใกล้กัน เพื่อไม่ให้ชุดข้อมูลใดเด่นกว่าเพื่อนโดย
 * ไม่ได้ตั้งใจ (ดู tokens.css)
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
    // Read the chart's own surface so a scoped workspace palette also applies
    // to the canvas, grid and tooltip. Callers without a root retain defaults.
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

  /**
   * options พื้นฐานที่ทุกกราฟใช้ร่วมกัน — ให้แต่ละกราฟ spread ทับด้วยของตัวเอง
   *
   * ตัวเลือกที่ตั้งใจกำหนดไว้ตรงนี้และเหตุผล
   *   - ปิด legend เมื่อมีชุดข้อมูลเดียว: กล่องคำอธิบายที่บอกสิ่งที่หัวข้อการ์ด
   *     บอกอยู่แล้ว เป็นแค่สิ่งกินพื้นที่
   *   - tooltip โหมด index: ชี้ตรงไหนก็เห็นค่าของทุกเส้น ณ เดือนนั้น ไม่ต้อง
   *     จ่อให้โดนจุดพอดี ซึ่งบนหน้าจอสัมผัสแทบเป็นไปไม่ได้
   *   - เส้นกริดแนวตั้งถูกปิด: ข้อมูลรายเดือนอ่านจากแกน x ตรงๆ อยู่แล้ว
   *     เส้นตั้งมีแต่ทำให้กราฟดูเป็นตาราง
   */
  const baseChartOptions = computed(() => {
    const c = colors.value;

    return {
      responsive: true,
      maintainAspectRatio: false,
      // ปิดแอนิเมชันทั้งหมดเมื่อผู้ใช้ขอให้ลดการเคลื่อนไหว — Chart.js เคลื่อนไหว
      // ด้วย JavaScript บน canvas กฎ prefers-reduced-motion ใน CSS จึงคุมไม่ถึง
      animation: reducedMotion.value ? false : undefined,
      color: c.text,
      font: { family: "Anuphan, sans-serif" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: c.text,
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            padding: 16,
            font: { size: 12, family: "Anuphan, sans-serif" },
          },
        },
        tooltip: {
          backgroundColor: c.surfaceFloat,
          titleColor: c.ink,
          bodyColor: c.text,
          borderColor: c.border,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          usePointStyle: true,
          titleFont: { family: "Anuphan, sans-serif", size: 12, weight: "600" },
          bodyFont: { family: "Anuphan, sans-serif", size: 12 },
        },
      },
      scales: {
        x: {
          ticks: { color: c.text, font: { size: 11, family: "Anuphan, sans-serif" } },
          grid: { display: false },
          border: { color: c.grid },
        },
        y: {
          beginAtZero: true,
          ticks: { color: c.text, font: { size: 11, family: "Anuphan, sans-serif" } },
          grid: { color: c.grid, drawTicks: false },
          border: { display: false },
        },
      },
    };
  });

  return { colors, baseChartOptions };
}
