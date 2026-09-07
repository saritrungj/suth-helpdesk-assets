<script setup>
/**
 * UiMeter — แถบบอกสัดส่วนที่ใช้ไปเทียบกับเพดาน (งบที่ใช้ไป, โควตายอดพิมพ์)
 *
 * ต่างจาก progress bar ตรงที่ meter บอก "ระดับของค่าหนึ่งในช่วงที่รู้ขอบเขต"
 * ไม่ใช่ "ความคืบหน้าของงานที่กำลังทำ" จึงใช้ role="meter" ให้โปรแกรมอ่านหน้าจอ
 * อ่านออกมาถูกบริบท
 *
 * สีเปลี่ยนเองตามระดับ แต่ตัวเลขเปอร์เซ็นต์ยังแสดงเป็นข้อความคู่กันเสมอ เพราะ
 * คนตาบอดสีต้องอ่านค่าได้โดยไม่ต้องแยกเขียว/เหลือง/แดง
 */
import { computed } from "vue";

const props = defineProps({
  value: { type: Number, required: true },
  max: { type: Number, default: 100 },
  label: { type: String, default: "" },
  /** ซ่อนตัวเลขเปอร์เซ็นต์ ใช้เมื่อมีตัวเลขจริงแสดงอยู่ข้างๆ แล้ว */
  hideValue: { type: Boolean, default: false },
  size: { type: String, default: "md" },
  /**
   * "threshold" (ค่าเริ่มต้น) — สีเปลี่ยนตามระดับ เขียว/เหลือง/แดง ใช้เมื่อ max
   *   คือ "เพดานจริง" ที่เกินแล้วมีความหมาย เช่น งบที่ตั้งไว้หรือโควตาตามสัญญา
   * "brand" — สีเดียวตลอด ใช้เมื่อแถบเป็นแค่การเทียบสัดส่วนระหว่างรายการ
   *   (แผนกไหนใช้มากกว่ากัน) ซึ่งการที่รายการอันดับหนึ่งเต็มแถบไม่ได้แปลว่าผิดปกติ
   */
  tone: { type: String, default: "threshold" },
});

const pct = computed(() => {
  if (!props.max) return 0;
  return Math.max(0, Math.min(100, (props.value / props.max) * 100));
});

const barClass = computed(() => {
  if (props.tone !== "threshold") return "bg-brand";
  if (pct.value >= 100) return "bg-danger";
  if (pct.value >= 85) return "bg-warn";
  return "bg-brand";
});

const height = computed(() => (props.size === "sm" ? "h-1.5" : props.size === "lg" ? "h-3" : "h-2"));
</script>

<template>
  <div class="min-w-0">
    <div v-if="label || !hideValue" class="flex items-baseline justify-between gap-3 mb-1.5">
      <span v-if="label" class="text-xs text-ink-mute truncate">{{ label }}</span>
      <span v-if="!hideValue" class="text-xs font-semibold text-ink numeral shrink-0">
        {{ pct.toFixed(0) }}%
      </span>
    </div>

    <div
      class="w-full rounded-full bg-surface-3 overflow-hidden"
      :class="height"
      role="meter"
      :aria-valuenow="Math.round(pct)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="label || 'สัดส่วนที่ใช้ไป'"
    >
      <div
        class="h-full rounded-full transition-[width,background-color] duration-500 ease-out-quart"
        :class="barClass"
        :style="{ width: pct + '%' }"
      ></div>
    </div>
  </div>
</template>
