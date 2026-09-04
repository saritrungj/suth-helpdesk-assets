import { computed } from "vue";
import { modeState } from "../store/theme";

/**
 * useChartTheme.js — สีสำหรับกราฟ Chart.js ให้เข้ากับโหมดมืด/สว่าง
 *
 * ปัญหา: style.css ทำให้ class ปกติของ Tailwind (bg-gray-*, text-gray-*) พลิกสีเอง
 * ตามโหมดผ่าน CSS variable อยู่แล้ว แต่ Chart.js วาดด้วย <canvas> ซึ่งไม่รู้จัก
 * CSS variable/class เหล่านั้น ต้องกำหนดสีให้ตรงๆ ผ่าน JS ทุกครั้งที่สร้างกราฟ
 * ไม่งั้นตัวหนังสือ/เส้นกริด/legend จะใช้สีดำ default ของ Chart.js ซึ่งมองไม่เห็น
 * บนพื้นหลังโทนมืดของระบบ
 *
 * วิธีใช้: อ่านค่าจริงจาก CSS variable (--neutral-*) ที่คำนวณไว้แล้วใน style.css
 * ทุกครั้งที่โหมดเปลี่ยน (reactive ผ่าน modeState.current) แทนที่จะ hardcode สีซ้ำ
 * ในแต่ละไฟล์กราฟ เพื่อให้เปลี่ยนธีมแล้วกราฟที่เปิดอยู่อัปเดตสีตามทันที
 */

function cssVar(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function useChartTheme() {
  // อ่าน modeState.current ในนี้เพื่อให้ computed ด้านล่างรู้ว่าต้องคำนวณใหม่ทุกครั้งที่สลับโหมด
  const colors = computed(() => {
    void modeState.current;

    return {
      text: cssVar("--neutral-600", "#4b5563"),
      textStrong: cssVar("--neutral-700", "#374151"),
      grid: cssVar("--neutral-200", "#e5e7eb"),
      tooltipBg: cssVar("--neutral-100", "#f3f4f6"),
      tooltipText: cssVar("--neutral-800", "#1f2937"),
      border: cssVar("--neutral-300", "#d1d5db"),
    };
  });

  // ส่วนกลางที่ทุกกราฟใช้ร่วมกัน (สีตัวหนังสือ/เส้นกริด/legend/tooltip)
  // ให้แต่ละไฟล์กราฟ spread ทับกับ options เฉพาะของตัวเอง (callbacks, beginAtZero ฯลฯ)
  const baseChartOptions = computed(() => {
    const c = colors.value;
    return {
      color: c.text,
      plugins: {
        legend: {
          labels: { color: c.text },
        },
        tooltip: {
          backgroundColor: c.tooltipBg,
          titleColor: c.tooltipText,
          bodyColor: c.tooltipText,
          borderColor: c.border,
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: c.text },
          grid: { color: c.grid },
        },
        y: {
          ticks: { color: c.text },
          grid: { color: c.grid },
        },
      },
    };
  });

  return { colors, baseChartOptions };
}
