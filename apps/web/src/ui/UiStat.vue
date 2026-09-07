<script setup>
/**
 * UiStat — การ์ดตัวเลขสรุปหนึ่งตัว
 *
 * บางทีคำตอบของคำถามหนึ่งคือ "ตัวเลขเดียว" ไม่ใช่กราฟ — การเอาเลขตัวเดียวไปวาด
 * เป็นกราฟแท่งอันเดียวคือการทำให้อ่านยากขึ้นโดยไม่ได้อะไรกลับมา การ์ดนี้คือรูปแบบ
 * ที่ถูกต้องสำหรับกรณีนั้น
 *
 * ลำดับในการ์ด: ป้ายกำกับ -> ตัวเลข -> ผลต่าง -> เส้นแนวโน้มจิ๋ว
 * ป้ายอยู่ "เหนือ" ตัวเลขเพราะคนกวาดสายตาจากบนลงล่าง เจอบริบทก่อนแล้วค่อยเจอค่า
 *
 * ตัวเลขหลักใช้ตัวเลขแบบสัดส่วนปกติ **ไม่ใช่ tabular-nums** — การบังคับให้ทุกหลัก
 * กว้างเท่ากับเลข 0 ทำให้เลขอย่าง 121 ดูหลวมผิดปกติที่ขนาดใหญ่ ความกว้างคงที่มี
 * ประโยชน์เฉพาะตอนที่ตัวเลขต้องเรียงตรงกันในแนวตั้ง คือในตารางกับแกนกราฟเท่านั้น
 *
 * ระหว่างโหลดแสดงโครงร่างแทนเลข 0 — เลข 0 ที่ค้างอยู่แวบหนึ่งอันตรายกว่าไม่มีอะไร
 * เพราะคนอ่านทันแล้วเข้าใจผิดว่าเดือนนี้ไม่มียอด
 */
import { computed } from "vue";
import UiSkeleton from "./UiSkeleton.vue";

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: "" },
  /** หน่วยต่อท้ายตัวเลข เช่น "บาท" "แผ่น" — เล็กกว่าและจางกว่าตัวเลข */
  unit: { type: String, default: "" },
  hint: { type: String, default: "" },
  loading: { type: Boolean, default: false },
  /** เน้นการ์ดนี้ให้เด่นกว่าใบอื่นในแถวเดียวกัน (ใช้ได้ใบเดียวต่อแถว) */
  emphasis: { type: Boolean, default: false },
  tone: { type: String, default: "brand" },
  /** ผลต่างจากช่วงก่อนหน้าเป็นเปอร์เซ็นต์ */
  delta: { type: Number, default: null },
  /** true = การเพิ่มขึ้นเป็นเรื่องไม่ดี (ค่าใช้จ่าย) จึงกลับสี */
  deltaInverse: { type: Boolean, default: false },
  /** ชุดตัวเลขสำหรับเส้นแนวโน้มจิ๋ว — ไม่มีแกน ไม่มีตัวเลข บอกแค่รูปร่าง */
  trend: { type: Array, default: () => [] },
});

const VALUE_TONE = {
  brand: "text-brand-ink",
  ink: "text-ink",
  accent: "text-accent-ink",
  ok: "text-ok-ink",
  warn: "text-warn-ink",
  danger: "text-danger-ink",
};

const deltaTone = computed(() => {
  if (props.delta === null || props.delta === 0) return "text-ink-mute bg-surface-3";
  const good = props.deltaInverse ? props.delta < 0 : props.delta > 0;
  return good ? "text-ok-ink bg-ok-soft" : "text-danger-ink bg-danger-soft";
});

const deltaLabel = computed(() => {
  if (props.delta === null) return "";
  const sign = props.delta > 0 ? "+" : props.delta < 0 ? "−" : "";
  return `${sign}${Math.abs(props.delta).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
});

/**
 * เส้นแนวโน้มจิ๋ว — วาดเป็น path เดียวใน viewBox 100x28 แล้วให้ CSS ยืดเต็มกล่อง
 * ตั้งใจไม่มีแกน ไม่มีตัวเลข ไม่มี tooltip เพราะหน้าที่ของมันคือบอก "รูปร่าง"
 * (ขึ้น ลง หรือนิ่ง) ไม่ใช่ให้อ่านค่า ค่าจริงอยู่ในกราฟเต็มของหน้านั้นอยู่แล้ว
 */
const sparkPath = computed(() => {
  const points = props.trend.filter((n) => n !== null && n !== undefined).map(Number);
  if (points.length < 2) return "";

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = 100 / (points.length - 1);

  return points
    .map((n, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${(26 - ((n - min) / span) * 24).toFixed(2)}`)
    .join(" ");
});
</script>

<template>
  <div
    class="card px-4 py-3.5 flex flex-col gap-1 min-w-0 h-full transition-shadow duration-200 ease-out-quart hover:shadow-e2"
    :class="emphasis && 'ring-1 ring-brand-line bg-brand-soft/35'"
    :aria-busy="loading ? 'true' : undefined"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="eyebrow truncate">{{ label }}</p>
      <slot name="icon" />
    </div>

    <UiSkeleton v-if="loading" width="4.5rem" height="1.75rem" class="my-0.5" />

    <p v-else class="flex items-baseline gap-1.5 min-w-0">
      <span class="text-2xl font-semibold truncate" :class="VALUE_TONE[tone] ?? VALUE_TONE.brand">
        <slot>{{ value }}</slot>
      </span>
      <span v-if="unit" class="text-xs text-ink-mute shrink-0">{{ unit }}</span>
    </p>

    <div class="flex items-start gap-2 min-w-0">
      <span
        v-if="delta !== null && !loading"
        class="text-2xs font-semibold px-1.5 py-0.5 rounded-xs numeral shrink-0"
        :class="deltaTone"
      >
        {{ deltaLabel }}
      </span>
      <!--
        คำอธิบายต้องขึ้นบรรทัดใหม่ได้ ห้าม truncate

        `truncate` เหมาะกับ "ชื่อ" ที่ยาวเกิน เพราะเดาส่วนที่หายได้จากบริบท
        แต่ hint เป็นประโยคที่อธิบายว่าตัวเลขข้างบนหมายถึงอะไร ตัดท้ายทิ้งแล้ว
        ข้อมูลหายจริงและไม่มีทางเรียกกลับมาดู (ไม่มี tooltip ไม่มี title)

        เจอจากเทสข้อ 1.4.12: พอเพิ่มระยะห่างตัวอักษรตามที่ข้อกำหนดระบุ
        ประโยค "กรอกยอดพิมพ์ครบทุกเครื่องแล้ว จาก N เดือน…" ถูกตัดหาย
        items-start แทน items-center เพราะตอนนี้ข้อความสูงได้หลายบรรทัด
      -->
      <p v-if="hint" class="text-xs text-ink-mute leading-snug">{{ hint }}</p>
    </div>

    <svg
      v-if="sparkPath && !loading"
      class="w-full h-7 mt-auto pt-1 overflow-visible"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        :d="sparkPath"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
        :class="VALUE_TONE[tone] ?? VALUE_TONE.brand"
        opacity="0.55"
      />
    </svg>
  </div>
</template>
