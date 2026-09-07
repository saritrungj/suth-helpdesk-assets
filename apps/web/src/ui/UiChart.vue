<script setup>
/**
 * UiChart — กราฟทุกกราฟในระบบผ่านตัวนี้ตัวเดียว
 *
 * เหตุผลที่รวมไว้ที่เดียวแทนที่จะให้แต่ละหน้าตั้งค่า Chart.js เอง: กฎของการทำ
 * data visualization ที่ถูกต้องมีรายละเอียดเยอะและตกหล่นง่ายมาก ถ้ากระจายอยู่ใน
 * แต่ละไฟล์ กราฟที่เพิ่มทีหลังจะค่อยๆ หลุดกฎไปทีละข้อ พอรวมมาที่นี่ กราฟใหม่ทุกอัน
 * ได้ของพวกนี้มาให้ฟรีและถูกต้องตั้งแต่ต้น
 *
 * สิ่งที่บังคับไว้ในนี้
 *
 *   - **มุมมองตารางคู่กับกราฟทุกอัน** ไม่ใช่ของเสริม สลับได้จากหัวการ์ด
 *     จำเป็นจริงๆ ไม่ใช่ทำเผื่อ: สีในชุดกราฟบางสลอตมี contrast ต่ำกว่า 3:1 เทียบกับ
 *     พื้น (ผลจากตัวตรวจ palette) ซึ่งกติกาบอกว่าต้องมีช่องทางอ่านค่าที่ไม่พึ่งสี
 *     ควบคู่เสมอ — ตารางคือช่องทางนั้น และคนที่ใช้โปรแกรมอ่านหน้าจอก็อ่านได้จริง
 *
 *   - **คำอธิบายสีจะมีก็ต่อเมื่อมีตั้งแต่ 2 ชุดข้อมูลขึ้นไป** ชุดเดียวไม่ต้องมี
 *     เพราะหัวการ์ดบอกอยู่แล้วว่ากำลังพล็อตอะไร กล่องสีอันเดียวเป็นการพูดซ้ำ
 *
 *   - **ไม่มีแกน y สองแกนเด็ดขาด** สองหน่วยที่สเกลต่างกันให้แยกเป็นสองกราฟ
 *     การเอาสองสเกลมาซ้อนบนกราฟเดียวสร้างความสัมพันธ์ที่ไม่มีอยู่จริงในข้อมูล
 *
 *   - **สีผูกกับตัวตน ไม่ผูกกับอันดับ** สลอตสีถูกกำหนดจาก key ของชุดข้อมูล
 *     กรองบางเส้นออกแล้วเส้นที่เหลือไม่เปลี่ยนสี คนที่จำได้ว่า "ฝ่ายการพยาบาลสีเขียว"
 *     ยังจำได้เหมือนเดิม
 *
 *   - **ตอนโหลดข้อมูลใหม่ กราฟเดิมค้างไว้แบบจางลง** ไม่ใช่กระพริบเป็นโครงร่าง
 *     เพื่อไม่ให้เลย์เอาต์กระโดดทุกครั้งที่เปลี่ยนตัวกรอง
 *
 *   - ขนาดของเส้น จุด แท่ง และเส้นกริด ถูกกำหนดตายตัวตามสเปก: เส้น 2px,
 *     จุดเส้นผ่านศูนย์กลาง >= 8px พร้อมวงแหวนสีพื้น 2px, แท่งหนาไม่เกิน 24px
 *     ปลายมน 4px ฐานเหลี่ยม, เส้นกริดเป็นเส้นทึบบางหนึ่งขั้นจากสีพื้น (ไม่ใช่เส้นประ)
 *
 * โครงสร้างข้อมูลที่รับ
 *   labels : ["ต.ค. 2567", ...]                     ป้ายแกนนอน
 *   series : [{ key, label, data: [1,2,...], slot }] slot = สลอตสี 1–8 (ไม่ใส่ = ตามลำดับ)
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { Bar, Line } from "vue-chartjs";
/* ดู "บังคับให้กราฟย่อตามกล่อง" ท้ายไฟล์นี้ */
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { ChartColumnBig, Table2 } from "lucide-vue-next";
import { useChartTheme } from "../composables/useChartTheme";
import UiSegmented from "./UiSegmented.vue";

ChartJS.register(BarElement, CategoryScale, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip);

const props = defineProps({
  labels: { type: Array, default: () => [] },
  /** [{ key, label, data, slot? }] */
  series: { type: Array, default: () => [] },
  kind: { type: String, default: "line" },
  /** แท่งแนวนอน — ใช้เมื่อป้ายกำกับเป็นข้อความยาว เช่นชื่ออาคารภาษาไทย */
  horizontal: { type: Boolean, default: false },
  height: { type: String, default: "18rem" },
  /** (value) => string สำหรับ tooltip และตาราง */
  formatValue: { type: Function, default: (v) => Number(v ?? 0).toLocaleString("th-TH") },
  /** (value) => string สำหรับป้ายบนแกน — ปกติย่อให้สั้นกว่า */
  formatAxis: { type: Function, default: null },
  unit: { type: String, default: "" },
  /** หัวคอลัมน์แรกของมุมมองตาราง */
  categoryLabel: { type: String, default: "ช่วงเวลา" },
  loading: { type: Boolean, default: false },
});

const { baseChartOptions, colors } = useChartTheme();

const view = ref("chart");
const VIEW_OPTIONS = [
  { value: "chart", label: "กราฟ", icon: ChartColumnBig },
  { value: "table", label: "ตาราง", icon: Table2 },
];

/** สลอตสีผูกกับ key ของชุดข้อมูล ไม่ใช่ตำแหน่งในอาเรย์ */
const painted = computed(() =>
  props.series.map((s, index) => ({
    ...s,
    color: colors.value.series[((s.slot ?? index + 1) - 1) % colors.value.series.length],
  }))
);

const hasLegend = computed(() => painted.value.length >= 2);

const chartData = computed(() => ({
  labels: props.labels,
  datasets: painted.value.map((s) => {
    const base = {
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: s.color,
      spanGaps: true,
    };

    if (props.kind === "bar") {
      return {
        ...base,
        // ปลายมนเฉพาะด้านที่เป็นยอดของแท่ง ฐานยังเหลี่ยมและอยู่บนเส้นศูนย์เดียวกัน
        borderRadius: 4,
        borderSkipped: "start",
        maxBarThickness: 24,
        // ช่องว่างสีพื้นระหว่างแท่งที่ติดกัน — ใช้ช่องว่างแยก ไม่ใช่ตีเส้นขอบ
        categoryPercentage: 0.82,
        barPercentage: 0.9,
        hoverBackgroundColor: s.color,
      };
    }

    return {
      ...base,
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: s.color,
      // วงแหวนสีพื้นรอบจุด ทำให้จุดยังอ่านออกตรงที่เส้นทับกัน
      pointBorderColor: colors.value.surface,
      pointBorderWidth: 2,
      pointHitRadius: 24,
      fill: painted.value.length === 1,
      backgroundColor: `color-mix(in oklab, ${s.color} 10%, transparent)`,
    };
  }),
}));

const chartOptions = computed(() => {
  const base = baseChartOptions.value;
  const value = (v) => `${props.formatValue(v)}${props.unit ? ` ${props.unit}` : ""}`;
  const axisFormat = props.formatAxis ?? props.formatValue;

  const valueScale = {
    ...base.scales.y,
    // แท่งต้องเริ่มจากศูนย์เสมอ เพราะ "ความยาว" คือค่า การตัดแกนทำให้แท่งที่ต่างกัน
    // 5% ดูเหมือนต่างกันเท่าตัว — ส่วนกราฟเส้นอ่านจาก "ความชัน" ไม่ใช่ระยะจากฐาน
    // การบังคับให้เริ่มที่ศูนย์จึงอัดเส้นไปกองอยู่แถบบนจนมองไม่เห็นว่าขึ้นหรือลง
    beginAtZero: props.kind === "bar",
    ticks: { ...base.scales.y.ticks, callback: (v) => axisFormat(v) },
  };
  const categoryScale = { ...base.scales.x, ticks: { ...base.scales.x.ticks, autoSkip: !props.horizontal } };

  return {
    ...base,
    indexAxis: props.horizontal ? "y" : "x",
    plugins: {
      ...base.plugins,
      // คำอธิบายสีถูกวาดเป็น HTML เองด้านล่างหัวการ์ด ไม่ใช้ของ Chart.js
      // เพื่อให้ตัวหนังสือใช้สีตัวอักษรของธีม ไม่ใช่สีของเส้น
      legend: { display: false },
      tooltip: {
        ...base.plugins.tooltip,
        callbacks: {
          label: (ctx) =>
            ctx.raw === null || ctx.raw === undefined
              ? `${ctx.dataset.label}: ไม่มีข้อมูล`
              : `${ctx.dataset.label}: ${value(ctx.raw)}`,
        },
      },
    },
    scales: props.horizontal
      ? { x: valueScale, y: categoryScale }
      : { x: categoryScale, y: valueScale },
  };
});

/** ตารางคู่กับกราฟ — แถวคือหมวด คอลัมน์คือชุดข้อมูล */
const tableRows = computed(() =>
  props.labels.map((label, index) => ({
    label,
    values: painted.value.map((s) => s.data[index]),
  }))
);

// เปลี่ยนชนิดกราฟหรือชุดข้อมูลแล้วให้กลับมาที่มุมมองกราฟเสมอ
watch(() => props.kind, () => (view.value = "chart"));

/**
 * บังคับให้กราฟย่อตามกล่องเมื่อจอเล็กลง
 *
 * Chart.js ตั้ง `responsive: true` ไว้แล้ว (ดู composables/useChartTheme.js)
 * แต่ในหน้านี้มันขยายอย่างเดียว ไม่ยอมย่อ
 *
 * วัดจากหน้าจริงที่ 320px: กล่องทุกชั้นเหนือ canvas ย่อลงเหลือ 252px ถูกต้องหมด
 * แต่ตัว `<canvas>` ยังค้างที่ 725px (มี `width="724"` และ `style="width:724.7px"`
 * ติดอยู่) และค้างแบบนั้นแม้รอถึงสี่วินาที — ไม่ใช่เรื่องช้า แต่คือไม่ทำงาน
 *
 * ผลคือหน้าแดชบอร์ดกว้าง 754px บนจอกว้าง 320px ซึ่งบังคับให้ต้องเลื่อนซ้ายขวา
 * เพื่ออ่านทุกบรรทัด — ตกข้อ 1.4.10 (Reflow) และเป็นสิ่งที่คนซูม 400% เจอจริง
 * เพราะการซูมทำให้เกิด resize ไม่ใช่การโหลดหน้าใหม่
 *
 * ที่มันรอดสายตามาตลอดเพราะการ "เปิดหน้าที่ 320px ตั้งแต่แรก" ไม่เจออาการนี้
 * ต้องเปิดที่จอใหญ่ก่อนแล้วค่อยย่อถึงจะเห็น
 *
 * จึงเฝ้าขนาดกล่องเอง แล้วสั่ง resize() ให้ Chart.js ตรงๆ
 */
const plotEl = useTemplateRef("plotEl");
const chartEl = useTemplateRef("chartEl");
let sizeWatcher = null;

onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !plotEl.value) return;
  sizeWatcher = new ResizeObserver(() => chartEl.value?.chart?.resize());
  sizeWatcher.observe(plotEl.value);
});

onBeforeUnmount(() => sizeWatcher?.disconnect());
</script>

<template>
  <div class="flex flex-col min-w-0">
    <!-- แถวหัว: คำอธิบายสี (ถ้ามีตั้งแต่ 2 ชุด) + ปุ่มสลับมุมมอง -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <ul v-if="hasLegend" class="flex flex-wrap items-center gap-x-4 gap-y-1.5 list-none min-w-0">
        <li v-for="s in painted" :key="s.key ?? s.label" class="flex items-center gap-1.5 min-w-0">
          <span
            class="shrink-0 rounded-full"
            :class="kind === 'bar' ? 'w-2.5 h-2.5' : 'w-4 h-[3px]'"
            :style="{ backgroundColor: s.color }"
            aria-hidden="true"
          ></span>
          <span class="text-xs text-ink-mute truncate">{{ s.label }}</span>
        </li>
      </ul>
      <span v-else></span>

      <UiSegmented
        v-model="view"
        :options="VIEW_OPTIONS"
        size="sm"
        label="สลับระหว่างกราฟกับตาราง"
        class="shrink-0"
      />
    </div>

    <!-- มุมมองกราฟ — ตอนโหลดใหม่ให้ค้างของเดิมไว้แบบจาง ไม่กระพริบเป็นโครงร่าง -->
    <div
      v-show="view === 'chart'"
      ref="plotEl"
      :style="{ height }"
      class="relative transition-opacity duration-200"
      :class="loading && 'opacity-45'"
    >
      <Bar v-if="kind === 'bar'" ref="chartEl" :data="chartData" :options="chartOptions" />
      <Line v-else ref="chartEl" :data="chartData" :options="chartOptions" />
    </div>

    <!-- มุมมองตาราง — ช่องทางอ่านค่าที่ไม่ต้องพึ่งสีและไม่ต้องชี้เมาส์ -->
    <div v-show="view === 'table'" class="overflow-auto rounded-lg border border-line-soft" :style="{ maxHeight: height }">
      <table class="w-full text-sm">
        <caption class="sr-only">ค่าตัวเลขของกราฟด้านบน</caption>
        <thead class="sticky top-0 bg-surface-2">
          <tr>
            <th scope="col" class="text-left text-xs font-semibold text-ink-mute px-3 py-2 border-b border-line-soft">
              {{ categoryLabel }}
            </th>
            <th
              v-for="s in painted"
              :key="s.key ?? s.label"
              scope="col"
              class="text-right text-xs font-semibold text-ink-mute px-3 py-2 border-b border-line-soft whitespace-nowrap"
            >
              <span class="inline-flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: s.color }" aria-hidden="true"></span>
                {{ s.label }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in tableRows" :key="row.label" class="border-b border-line-soft last:border-0">
            <th scope="row" class="text-left font-normal text-ink-soft px-3 py-1.5 whitespace-nowrap">
              {{ row.label }}
            </th>
            <td
              v-for="(v, i) in row.values"
              :key="i"
              class="text-right px-3 py-1.5 text-ink numeral whitespace-nowrap"
            >
              {{ v === null || v === undefined ? "—" : formatValue(v) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* ตาข่ายชั้นสองของเรื่อง resize ในสคริปต์ — ต่อให้ Chart.js พลาดรอบไหนไป
   ตัว canvas ก็กว้างเกินกล่องไม่ได้ หน้าเว็บจึงล้นออกด้านข้างไม่ได้ */
:deep(canvas) {
  max-width: 100%;
}
</style>
