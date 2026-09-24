<script setup>
/**
 * UiSparkline — เส้นจิ๋วในแถวตาราง แบบรายการหุ้น (watchlist) (#212)
 *
 * บอกแค่รูปทรงของแนวโน้ม ไม่มีแกน ไม่มีตัวเลข — ตัวเลขอยู่ในคอลัมน์ข้างๆ แล้ว ค่า null = ช่องว่าง ไม่ลากผ่าน
 * สีตามทิศของจุดสุดท้ายเทียบจุดแรก ส่วนความหมายของ "ขึ้น" (ดีหรือไม่ดี) เป็นของผู้เรียก
 */
import { computed } from "vue";

const props = defineProps({
  values: { type: Array, default: () => [] },
  width: { type: Number, default: 96 },
  height: { type: Number, default: 24 },
  /** สีของเส้น (CSS) — ไม่ระบุ = สีหมึกรอง */
  color: { type: String, default: "" },
  label: { type: String, default: "" },
});

const path = computed(() => {
  const points = props.values.map((value, index) => ({ value, index })).filter((p) => p.value !== null && p.value !== undefined);
  if (points.length < 2) return "";
  const max = Math.max(...points.map((p) => p.value), 0);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const step = props.values.length > 1 ? (props.width - 2) / (props.values.length - 1) : 0;
  const y = (value) => 1 + (props.height - 2) * (1 - (value - min) / span);
  let d = "";
  let previous = null;
  for (const point of points) {
    const command = previous !== null && point.index === previous + 1 ? "L" : "M";
    d += `${command}${(1 + point.index * step).toFixed(1)},${y(point.value).toFixed(1)} `;
    previous = point.index;
  }
  return d.trim();
});
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="block overflow-visible"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  >
    <path v-if="path" :d="path" fill="none" :stroke="color || 'currentColor'" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
    <line v-else x1="1" :y1="height / 2" :x2="width - 1" :y2="height / 2" stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="3 3" />
  </svg>
</template>
