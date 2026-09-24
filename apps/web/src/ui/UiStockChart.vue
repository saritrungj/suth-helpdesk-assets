<script setup>
import { t } from "../lib/locale";

/**
 * UiStockChart — กราฟเส้นแบบแอปหุ้น (TradingView Lightweight Charts™, Apache-2.0) (#212)
 *
 * ผู้ใช้เลือกแบบนี้แทนกราฟแท่ง/spline ของ Chart.js: เส้นเดียวมีพื้นไล่สีจางลง หลายเส้นเป็นเส้นล้วน
 * เลื่อนเมาส์มีเส้นเล็งและกล่องบอกค่าของทุกเส้น ณ จุดนั้น ป้ายค่าล่าสุดที่ขอบขวา แกนตัวเลขเริ่มที่ศูนย์เสมอ
 *
 * แกนนอนเป็น "ช่อง" ตามลำดับ (domain) ไม่ใช่เวลาจริง — ใช้ได้ทั้งเดือนจริงของปีงบ และตำแหน่งเดือนของหลายปีงบ
 * ที่วางซ้อนกัน ค่า null = ช่องว่าง (ไม่มีข้อมูล) ไม่ใช่ศูนย์ ไม่ลากเส้นผ่าน
 *
 * ชิ้นนี้ไม่รู้เรื่องธุรกิจ — ป้ายของแต่ละช่องและการจัดรูปแบบตัวเลขมาจากผู้เรียก
 *
 * ข้อกำหนดของสัญญาอนุญาต: แสดงโลโก้/ลิงก์ของ TradingView (`attributionLogo`) — ห้ามปิด
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from "vue";
import { AreaSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart, createSeriesMarkers } from "lightweight-charts";
import { ChartSpline, Table2 } from "lucide-vue-next";
import { useChartTheme } from "../composables/useChartTheme";
import UiSegmented from "./UiSegmented.vue";

const props = defineProps({
  /** ช่องของแกนนอนตามลำดับ เช่น ["2025-10", "2025-11", …] */
  domain: { type: Array, default: () => [] },
  /** ป้ายสั้นใต้แกน */
  axisLabel: { type: Function, default: (key) => String(key) },
  /** ป้ายเต็มในกล่องค่าและตาราง */
  pointLabel: { type: Function, default: null },
  /** [{ key, label, values: (number|null)[] ตาม domain, slot?: 1–8, area?: พื้นไล่สีใต้เส้น (เส้นเดียว = มีเสมอ) }] */
  series: { type: Array, default: () => [] },
  /** เครื่องหมายบนเส้นแรก [{ index, text, tone: "warn" }] */
  markers: { type: Array, default: () => [] },
  /** คำอธิบายเพิ่มในกล่องค่าของช่องนั้น { [index]: "ข้อความ" } */
  notes: { type: Object, default: () => ({}) },
  formatValue: { type: Function, default: (v) => Number(v ?? 0).toLocaleString("th-TH") },
  formatAxis: { type: Function, default: null },
  unit: { type: String, default: "" },
  height: { type: String, default: "16rem" },
  categoryLabel: { type: String, default: t("ช่วงเวลา") },
  selectable: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** ปิดสวิตช์กราฟ/ตาราง เมื่อหน้ามีตารางของตัวเองอยู่แล้ว */
  showTableToggle: { type: Boolean, default: true },
});
const emit = defineEmits(["select"]);

const root = useTemplateRef("root");
const canvasHost = useTemplateRef("canvasHost");
const { colors } = useChartTheme(root);

const view = ref("chart");
const VIEW_OPTIONS = [
  { value: "chart", label: t("กราฟ"), icon: ChartSpline },
  { value: "table", label: t("ตาราง"), icon: Table2 },
];

/* ---------------------------------------------------------------------------
   สี — CSS ของระบบเป็น oklch()/color-mix() ซึ่งตัววาดกราฟไม่รู้จัก แปลงผ่าน canvas เป็น rgba
   --------------------------------------------------------------------------- */
let probe = null;
function rgba(color, alpha = 1) {
  if (typeof document === "undefined") return color;
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${((a / 255) * alpha).toFixed(3)})`;
}

const painted = computed(() =>
  props.series.map((s, index) => ({
    ...s,
    color: colors.value.series[((s.slot ?? index + 1) - 1) % colors.value.series.length],
  }))
);
const single = computed(() => painted.value.length === 1);
const hasData = computed(() => painted.value.some((s) => s.values.some((v) => v !== null && v !== undefined)));

/* ช่อง i ↔ เวลาสมมติ (เดือนที่ i นับจาก ม.ค. 2000) — ตัววาดกราฟต้องการเวลา แต่ระยะห่างคิดตามลำดับอยู่แล้ว */
const timeOf = (index) => Date.UTC(2000, index, 1) / 1000;
const indexOf = (time) => {
  const date = new Date(Number(time) * 1000);
  return (date.getUTCFullYear() - 2000) * 12 + date.getUTCMonth();
};
const fullLabel = (index) => (props.pointLabel ?? props.axisLabel)(props.domain[index]);
const axisText = (value) => (props.formatAxis ?? props.formatValue)(value);

/* ---------------------------------------------------------------------------
   กราฟ
   --------------------------------------------------------------------------- */
const chart = shallowRef(null);
let handles = [];
let markerPlugin = null;

function chartOptions() {
  const c = colors.value;
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: rgba(c.text),
      fontFamily: "Anuphan, 'Noto Sans Thai', sans-serif",
      fontSize: 12,
      attributionLogo: true,
    },
    grid: { vertLines: { visible: false }, horzLines: { color: rgba(c.grid) } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.02 } },
    timeScale: {
      borderVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
      lockVisibleTimeRangeOnResize: true,
      tickMarkFormatter: (time) => props.axisLabel(props.domain[indexOf(time)] ?? ""),
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: rgba(c.text, 0.55), style: LineStyle.Dashed, width: 1, labelVisible: false },
      horzLine: { color: rgba(c.text, 0.35), style: LineStyle.Dotted, width: 1, labelBackgroundColor: rgba(c.ink) },
    },
    // ข้อมูลรายเดือนไม่กี่สิบช่อง — ลาก/ซูมไม่ช่วยอะไรและทำให้หน้าเลื่อนไม่ได้บนมือถือ
    handleScroll: false,
    handleScale: false,
    localization: { locale: "th-TH", priceFormatter: axisText, timeFormatter: (time) => fullLabel(indexOf(time)) },
  };
}

const isArea = (s) => single.value || Boolean(s.area);

function seriesOptions(s) {
  const common = {
    color: rgba(s.color),
    lineWidth: 2,
    pointMarkersVisible: true,
    pointMarkersRadius: 3,
    crosshairMarkerRadius: 5,
    crosshairMarkerBorderColor: rgba(colors.value.surface),
    lastValueVisible: true,
    priceLineVisible: false,
    title: "", // ชื่อเส้นอยู่ในคำอธิบายด้านบน — ป้ายยาวบนแกนราคาบังตัวเลข
    priceFormat: { type: "custom", formatter: axisText, minMove: 0.01 },
    // แกนตัวเลขเริ่มที่ศูนย์เสมอ — ยอดใช้จ่ายและยอดพิมพ์อ่านเป็น "ปริมาณ" การตัดแกนทำให้เดือนที่ต่างกันนิดเดียวดูต่างมาก
    autoscaleInfoProvider: (original) => {
      const info = original();
      if (info?.priceRange) info.priceRange.minValue = Math.min(0, info.priceRange.minValue);
      return info;
    },
  };
  if (!isArea(s)) return common;
  return {
    ...common,
    lineColor: rgba(s.color),
    topColor: rgba(s.color, 0.32),
    bottomColor: rgba(s.color, 0.02),
  };
}

function render() {
  if (!chart.value) return;
  markerPlugin?.detach();
  markerPlugin = null;
  for (const handle of handles) chart.value.removeSeries(handle);
  handles = [];
  for (const s of painted.value) {
    const handle = chart.value.addSeries(isArea(s) ? AreaSeries : LineSeries, seriesOptions(s));
    handle.setData(props.domain.map((_, index) => {
      const value = s.values[index];
      return value === null || value === undefined ? { time: timeOf(index) } : { time: timeOf(index), value: Number(value) };
    }));
    handles.push(handle);
  }
  if (handles[0] && props.markers.length) {
    const warn = rgba(getComputedStyle(root.value).getPropertyValue("--warn-ink").trim() || "#b45309");
    markerPlugin = createSeriesMarkers(handles[0], props.markers.map((marker) => ({
      time: timeOf(marker.index),
      // จุดสีเตือนทับจุดข้อมูล ไม่มีข้อความ — คำอธิบายอยู่ในกล่องค่าตอนชี้และใต้กราฟ ป้ายทุกเดือนรกจนอ่านเส้นไม่ออก
      // วางบนจุด (inBar) ไม่ใช่ใต้เส้น: เครื่องหมายใต้เส้นดันแกนลงไปติดลบ ("-1 แสน") ซึ่งไม่มีความหมาย
      position: "inBar",
      shape: "circle",
      color: warn,
      size: 0.6,
    })));
  }
  chart.value.timeScale().fitContent();
}

/* กล่องค่าตามเส้นเล็ง */
const tip = ref(null);
function onCrosshair(param) {
  if (!param.time || !param.point || param.point.x < 0) {
    tip.value = null;
    return;
  }
  const index = indexOf(param.time);
  const width = canvasHost.value?.clientWidth ?? 0;
  tip.value = {
    index,
    left: Math.min(Math.max(param.point.x + 14, 8), Math.max(8, width - 196)),
    top: 8,
    rows: painted.value.map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.values[index] })),
    note: props.notes[index] ?? "",
  };
}

function onClick(param) {
  if (!props.selectable || !param.time) return;
  emit("select", { index: indexOf(param.time) });
}

function mount() {
  if (!canvasHost.value || chart.value) return;
  chart.value = createChart(canvasHost.value, chartOptions());
  chart.value.subscribeCrosshairMove(onCrosshair);
  chart.value.subscribeClick(onClick);
  render();
}

function unmount() {
  if (!chart.value) return;
  chart.value.unsubscribeCrosshairMove(onCrosshair);
  chart.value.unsubscribeClick(onClick);
  chart.value.remove();
  chart.value = null;
  handles = [];
}

onMounted(() => {
  if (view.value === "chart" && hasData.value) mount();
});
onBeforeUnmount(unmount);

watch([() => props.domain, () => props.series, () => props.markers], async () => {
  if (view.value !== "chart") return;
  if (!hasData.value) { unmount(); return; }
  await nextTick();
  if (!chart.value) mount();
  else render();
}, { deep: true });

watch(colors, () => {
  if (!chart.value) return;
  chart.value.applyOptions(chartOptions());
  render();
});

watch(view, async (value) => {
  if (value === "chart") {
    await nextTick();
    if (hasData.value) mount();
  } else {
    unmount();
  }
});

/* ตาราง — ทางเลือกสำหรับโปรแกรมอ่านหน้าจอและคนที่อยากอ่านตัวเลข */
const tableRows = computed(() =>
  props.domain.map((key, index) => ({ key, label: fullLabel(index), values: painted.value.map((s) => s.values[index]), note: props.notes[index] ?? "" }))
);
const show = (value) => (value === null || value === undefined ? "—" : props.formatValue(value));
const ariaSummary = computed(() => {
  const s = painted.value[0];
  if (!s) return "";
  const last = [...s.values.keys()].reverse().find((index) => s.values[index] !== null && s.values[index] !== undefined);
  return last === undefined ? s.label : `${s.label} — ${fullLabel(last)}: ${show(s.values[last])}${props.unit ? ` ${props.unit}` : ""}`;
});
</script>

<template>
  <div ref="root" class="flex flex-col min-w-0" :aria-busy="loading">
    <div v-if="!single || showTableToggle" class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <ul v-if="!single" class="flex flex-wrap items-center gap-x-4 gap-y-1.5 list-none min-w-0">
        <li v-for="s in painted" :key="s.key ?? s.label" class="flex items-center gap-1.5 min-w-0 text-xs text-ink-soft">
          <span class="inline-block w-3 h-0.5 rounded-full shrink-0" :style="{ background: s.color }" aria-hidden="true"></span>
          <span class="truncate">{{ s.label }}</span>
        </li>
      </ul>
      <span v-else></span>
      <UiSegmented v-if="showTableToggle" v-model="view" :options="VIEW_OPTIONS" size="sm" :aria-label="t('รูปแบบการแสดงผล')" />
    </div>

    <!-- figure ไม่ใช่ img: ไลบรารีใส่ลิงก์ TradingView (เงื่อนไขสัญญาอนุญาต) ไว้ในกล่องนี้ และ img ห้ามมีลูกที่กดได้ -->
    <div v-show="view === 'chart'" class="relative" :style="{ height }" role="figure" :aria-label="ariaSummary">
      <div ref="canvasHost" class="absolute inset-0" :class="loading && 'opacity-45'"></div>
      <div
        v-if="tip"
        class="pointer-events-none absolute z-10 w-[11.5rem] rounded-lg border border-line bg-surface-float shadow-e2 px-3 py-2 text-xs"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
        data-testid="stock-chart-tip"
      >
        <p class="font-semibold text-ink mb-1">{{ fullLabel(tip.index) }}</p>
        <p v-for="row in tip.rows" :key="row.key ?? row.label" class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 min-w-0 text-ink-soft">
            <span class="inline-block w-2 h-2 rounded-full shrink-0" :style="{ background: row.color }" aria-hidden="true"></span>
            <span class="truncate">{{ single ? t("ค่า") : row.label }}</span>
          </span>
          <span class="numeral font-medium text-ink whitespace-nowrap">{{ show(row.value) }}</span>
        </p>
        <p v-if="tip.note" class="mt-1 text-warn-ink">{{ tip.note }}</p>
      </div>
    </div>

    <div v-if="view === 'table'" class="overflow-x-auto">
      <table class="w-full text-sm" :aria-label="t('ค่าตัวเลขของกราฟด้านบน')">
        <thead>
          <tr class="border-b border-line-soft text-left text-ink-mute">
            <th scope="col" class="py-2 pr-4 font-medium">{{ categoryLabel }}</th>
            <th v-for="s in painted" :key="s.key ?? s.label" scope="col" class="py-2 pr-4 font-medium text-right">{{ single ? `${s.label}${unit ? ` (${unit})` : ""}` : s.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in tableRows" :key="row.key" class="border-b border-line-soft last:border-0">
            <th scope="row" class="py-2 pr-4 font-normal text-ink">
              <button v-if="selectable" type="button" class="underline" @click="emit('select', { index })">{{ row.label }}</button>
              <template v-else>{{ row.label }}</template>
              <span v-if="row.note" class="block text-2xs text-warn-ink">{{ row.note }}</span>
            </th>
            <td v-for="(value, i) in row.values" :key="i" class="py-2 pr-4 text-right numeral">{{ show(value) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
