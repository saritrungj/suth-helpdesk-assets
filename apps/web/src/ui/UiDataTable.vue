<script setup>
import { t } from "../lib/locale";

/**
 * UiDataTable — ตารางข้อมูลของทั้งระบบ
 *
 * รับผิดชอบเฉพาะการ "แสดงผล" ชุดแถวที่ได้รับมา: ค้นหาข้ามคอลัมน์, เรียงลำดับ,
 * แบ่งหน้า, ซ่อน/แสดงคอลัมน์ และส่งออก Excel ส่วนตัวกรองเฉพาะทาง (เลือกอาคาร
 * เลือกเดือน) ยังเป็นหน้าที่ของหน้าที่เรียกใช้ แล้วส่ง rows ที่กรองแล้วเข้ามา
 *
 * สิ่งที่ทำเพิ่มจากตารางเดิม และเหตุผล
 *
 *   - หัวคอลัมน์ที่เรียงได้เป็น <button> จริงใน <th> พร้อม aria-sort
 *     เดิมเป็น <th @click> ซึ่งกดด้วยคีย์บอร์ดไม่ได้เลย และโปรแกรมอ่านหน้าจอ
 *     ไม่รู้ว่าตอนนี้เรียงตามคอลัมน์ไหน (WCAG 2.1.1 และ 4.1.2)
 *
 *   - ประกาศจำนวนผลลัพธ์ผ่าน aria-live เมื่อค้นหา/เรียง/เปลี่ยนหน้า
 *     คนที่ใช้เสียงจะได้รู้ว่าการพิมพ์เมื่อกี้ทำให้เหลือกี่รายการ
 *
 *   - เลื่อนกลับขึ้นหัวตารางเมื่อเปลี่ยนหน้า ไม่ใช่ค้างอยู่ที่ปุ่มด้านล่าง
 *     (WCAG 2.4.3) ไม่งั้นกด "ถัดไป" แล้วยังเห็นท้ายตารางเหมือนเดิม
 *
 *   - หัวตารางที่ปักหมุดใช้ z-index ต่ำกว่าแถบเครื่องมือ และมีพื้นทึบเสมอ
 *     ป้องกันแถวที่โฟกัสอยู่ถูกบังจนมองไม่เห็น (WCAG 2.4.11 Focus Not Obscured)
 *
 *   - บนจอเล็กเปลี่ยนเป็นการ์ดแนวตั้งแทนตารางที่ต้องเลื่อนซ้ายขวา
 *
 *   รอบที่ 3 ของ #51
 *   - จำนวน "แสดง 1–20 จาก 45" อยู่ท้ายตารางคู่ตัวแบ่งหน้า ตาม Carbon ("pagination
 *     is always placed at the bottom") ท้ายตารางแสดงเสมอแม้มีหน้าเดียว ส่วนปุ่มเปลี่ยน
 *     หน้าแสดงเมื่อมีมากกว่าหนึ่งหน้า
 *   - แถวสลับสี (NHS) เป็นเงาในบนเซลล์ จึงซ้อนกับสีแถวที่หน้ากำหนดเองผ่าน rowClass ได้
 *   - ปุ่มขยายตารางเป็นไอคอนพร้อม tooltip ส่วนคอลัมน์/Excel คงข้อความ
 *   - caption ของตาราง (GOV.UK / NHS) เป็นหัวเรื่องตอนขยายเต็มจอด้วย
 *   - toolsTarget ย้ายกลุ่มเครื่องมือ (ขยาย/คอลัมน์/Excel) ไปวางในแถบตัวกรองของหน้า
 *     ด้วย Teleport ให้ตัวกรองกับเครื่องมือตารางอยู่แถวเดียวกัน โดยหน้าไม่ต้องย้าย
 *     ตัวกรองเข้ามาในตาราง — ตอนขยายตารางแบบไม่มี fullscreenTarget แถบตัวกรองอยู่
 *     นอกจอ เครื่องมือจึงกลับมาอยู่ในตารางเอง
 *
 * นิยามคอลัมน์: { key, label, align?, sortable?, hidden?, width?,
 *                 value?: (row) => any, csv?: (row) => any }
 */
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useFullscreen } from "./use-fullscreen";
import { refDebounced } from "@vueuse/core";
import { exportSheet } from "../lib/export-xlsx";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Maximize2,
  Minimize2,
  Search,
} from "lucide-vue-next";
import UiButton from "./UiButton.vue";
import UiCheckbox from "./UiCheckbox.vue";
import UiEmpty from "./UiEmpty.vue";
import UiInput from "./UiInput.vue";
import UiMenu from "./UiMenu.vue";
import UiSelect from "./UiSelect.vue";
import UiSkeleton from "./UiSkeleton.vue";
import UiTooltip from "./UiTooltip.vue";

const tableRoot = useTemplateRef("tableRoot");
const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  rowKey: { type: String, default: "id" },
  loading: { type: Boolean, default: false },
  searchable: { type: Boolean, default: true },
  searchPlaceholder: { type: String, default: t("ค้นหาในตาราง...") },
  pageSizeOptions: { type: Array, default: () => [10, 20, 50, 100] },
  defaultPageSize: { type: Number, default: 20 },
  exportContext: { type: Array, default: () => [] },
  exportFilename: { type: String, default: "data" },
  emptyText: { type: String, default: t("ยังไม่มีข้อมูลในตารางนี้") },
  emptyHint: { type: String, default: "" },
  showExport: { type: Boolean, default: true },
  /** ให้ผู้ใช้ซ่อน/แสดงคอลัมน์เองได้ — ช่วยมากกับตารางที่มีสิบกว่าคอลัมน์ */
  showColumnPicker: { type: Boolean, default: true },
  /** ความสูงสูงสุดของกล่องตาราง เช่น "65vh" ทำให้หัวตารางปักหมุดอยู่ในกล่อง */
  maxHeight: { type: String, default: "" },
  /** ตรึงคอลัมน์แรกไว้ตอนเลื่อนแนวนอน สำหรับตารางที่กว้างมาก */
  stickyFirst: { type: Boolean, default: false },
  rowClass: { type: Function, default: null },
  /** Optional search owner; existing callers keep their local search. */
  searchValue: { type: String, default: undefined },
  preservePageOnRefresh: { type: Boolean, default: false },
  fullscreenTarget: { type: Object, default: null },
  /** ชื่อตาราง — เป็น <caption> ให้โปรแกรมอ่านหน้าจอ และเป็นหัวเรื่องตอนขยายเต็มจอ */
  caption: { type: String, default: "" },
  /** selector ของจุดวางกลุ่มเครื่องมือในแถบตัวกรองของหน้า เช่น "#registry-table-tools" */
  toolsTarget: { type: String, default: "" },
});
const fullscreenRoot = computed(() => props.fullscreenTarget || tableRoot.value);
const { expanded, expandError, toggleExpanded } = useFullscreen(fullscreenRoot);
const toolsInline = computed(() => !props.toolsTarget || (expanded.value && !props.fullscreenTarget));
const emit = defineEmits(["update:searchValue"]);
const localSearch = ref("");
const search = computed({
  get: () => props.searchValue ?? localSearch.value,
  set: (value) => { localSearch.value = value; emit("update:searchValue", value); },
});

/**
 * คำค้นที่ใช้กรองจริง — หน่วงจากช่องกรอก 180 มิลลิวินาที
 *
 * การกรองทำฝั่งเว็บกับข้อมูลได้ถึงหลักพันแถว ถ้ากรองใหม่ทุกครั้งที่กดปุ่มหนึ่งตัว
 * เครื่องรุ่นเก่าจะสะดุดจนพิมพ์ตามไม่ทัน — หน่วงสั้นๆ ทำให้พิมพ์ลื่นโดยที่ผู้ใช้
 * ไม่รู้สึกว่าผลลัพธ์มาช้า (ช่องกรอกยังตอบสนองทันทีเพราะผูกกับ search ตัวเดิม)
 */
const searchTerm = refDebounced(search, 180);

const sortKey = ref(null);
const sortDir = ref("asc");
const currentPage = ref(1);
const pageSize = ref(props.defaultPageSize);
const hiddenKeys = ref(new Set(props.columns.filter((c) => c.hidden).map((c) => c.key)));
const scrollBox = useTemplateRef("scrollBox");

const visibleColumns = computed(() => props.columns.filter((c) => !hiddenKeys.value.has(c.key)));

function cellValue(row, col) {
  if (typeof col.value === "function") return col.value(row);
  return row[col.key];
}

/* --------------------------------------------------------------------------
   ค้นหา — ค้นจากค่าที่แสดงจริง ไม่ใช่ raw object เพื่อให้พิมพ์สิ่งที่ตาเห็นแล้วเจอ
   ค้นเฉพาะคอลัมน์ที่มองเห็นอยู่ ถ้าซ่อนคอลัมน์ไว้แล้วยังค้นเจอจะงงว่าเจอเพราะอะไร
   -------------------------------------------------------------------------- */
const searchedRows = computed(() => {
  const keyword = searchTerm.value.trim().toLowerCase();
  if (!keyword) return props.rows;

  return props.rows.filter((row) =>
    visibleColumns.value.some((col) => {
      const v = cellValue(row, col);
      return v !== null && v !== undefined && String(v).toLowerCase().includes(keyword);
    })
  );
});

/* --------------------------------------------------------------------------
   เรียงลำดับ — สามสถานะ: น้อย→มาก, มาก→น้อย, แล้วกลับไปลำดับเดิมของข้อมูล
   สถานะที่สามสำคัญ เพราะลำดับเดิมมักมีความหมาย (เช่น เรียงตามที่นำเข้ามา)
   และถ้าไม่มีทางกลับ ผู้ใช้ต้องรีเฟรชหน้าทั้งหน้า
   -------------------------------------------------------------------------- */
function toggleSort(col) {
  if (col.sortable === false) return;

  if (sortKey.value !== col.key) {
    sortKey.value = col.key;
    sortDir.value = "asc";
  } else if (sortDir.value === "asc") {
    sortDir.value = "desc";
  } else {
    sortKey.value = null;
    sortDir.value = "asc";
  }
  currentPage.value = 1;
}

const sortedRows = computed(() => {
  if (!sortKey.value) return searchedRows.value;

  const col = props.columns.find((c) => c.key === sortKey.value);
  if (!col) return searchedRows.value;

  const dir = sortDir.value === "asc" ? 1 : -1;
  const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

  return [...searchedRows.value].sort((a, b) => {
    const va = cellValue(a, col);
    const vb = cellValue(b, col);

    const na = Number(va);
    const nb = Number(vb);
    const bothNumeric =
      va !== "" && vb !== "" && va !== null && vb !== null && !Number.isNaN(na) && !Number.isNaN(nb);

    if (bothNumeric) return (na - nb) * dir;

    // Intl.Collator เรียงภาษาไทยได้ถูกตามพจนานุกรม ซึ่งต่างจากการเทียบรหัสตัวอักษร
    // ตรงๆ ที่จะจัดสระนำ (เ แ ไ ใ โ) ผิดตำแหน่ง
    return collator.compare(String(va ?? ""), String(vb ?? "")) * dir;
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)));

const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

const rangeStart = computed(() =>
  sortedRows.value.length ? (currentPage.value - 1) * pageSize.value + 1 : 0
);
const rangeEnd = computed(() =>
  Math.min(currentPage.value * pageSize.value, sortedRows.value.length)
);

watch([searchTerm, pageSize], () => {
  currentPage.value = 1;
});
watch(() => props.rows.length, () => {
  if (!props.preservePageOnRefresh) currentPage.value = 1;
});

watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = tp;
});

/** เปลี่ยนหน้าแล้วต้องพากลับไปหัวตาราง ไม่ใช่ทิ้งไว้ที่ปุ่มด้านล่าง */
async function goToPage(page) {
  currentPage.value = Math.min(Math.max(1, page), totalPages.value);
  await nextTick();
  scrollBox.value?.scrollTo({ top: 0, behavior: "smooth" });
  scrollBox.value?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** หน้าที่แสดงเป็นปุ่มตัวเลข — เอาแค่ปัจจุบัน ±1 บวกหัวและท้าย (null = "…") */
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const current = currentPage.value;
  const pages = [];

  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= current - 1 && p <= current + 1)) pages.push(p);
  }

  const out = [];
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
});

function sortState(col) {
  if (col.sortable === false || sortKey.value !== col.key) return "none";
  return sortDir.value === "asc" ? "ascending" : "descending";
}

function sortHint(col) {
  const state = sortState(col);
  if (state === "none") return t("เรียงตาม {0} จากน้อยไปมาก", [col.label]);
  if (state === "ascending") return t("เรียงตาม {0} จากมากไปน้อย", [col.label]);
  return t("เลิกเรียงลำดับ กลับไปลำดับเดิม");
}

function alignClass(col) {
  return col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left";
}

function toggleColumn(key) {
  const next = new Set(hiddenKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hiddenKeys.value = next;
}

/* --------------------------------------------------------------------------
   ส่งออก Excel — ใช้ผลที่ค้นหาและเรียงแล้ว แต่ไม่ตัดตามหน้า เพราะคนกด export
   ต้องการทั้งชุดที่กรองไว้ ไม่ใช่แค่ 20 แถวที่เห็นอยู่
   -------------------------------------------------------------------------- */
async function exportExcel() {
  const cols = visibleColumns.value;
  const header = cols.map((c) => c.label);

  const body = sortedRows.value.map((row) =>
    cols.map((col) => {
      const raw = typeof col.csv === "function" ? col.csv(row) : cellValue(row, col);
      return raw === null || raw === undefined ? "" : raw;
    })
  );

  // ความกว้างคอลัมน์คำนวณให้เองจากความยาวข้อความจริง (ดู lib/export-xlsx.js)
  await exportSheet({
    header,
    rows: body,
    sheetName: t("ข้อมูล"),
    filename: props.exportFilename,
    context: [...props.exportContext, [t("ค้นหา"), search.value]],
  });
}
defineExpose({
  containsRow: (key) => searchedRows.value.some((row) => row[props.rowKey] === key),
});
</script>

<template>
  <div ref="tableRoot" class="flex flex-col min-w-0" :class="expanded && !fullscreenTarget && 'bg-surface h-screen overflow-auto p-5'">
    <p v-if="expandError" role="status">{{ expandError }}</p>
    <!-- แถบเครื่องมือ -->
    <div
      class="flex flex-wrap items-center gap-2 mb-3"
      :class="!searchable && !$slots['toolbar-extra'] && !toolsInline && !(expanded && caption) && 'hidden'"
      data-print="hide"
    >
      <h2 v-if="expanded && caption" class="text-lg font-semibold text-ink mr-2">{{ caption }}</h2>
      <div v-if="searchable" class="min-w-[13rem] flex-1 max-w-sm">
        <!-- ต้องมี aria-label ไม่ใช่พึ่ง placeholder อย่างเดียว — placeholder หายไป
             ทันทีที่เริ่มพิมพ์ คนที่ใช้โปรแกรมอ่านหน้าจอจึงได้ยินแค่ "ช่องกรอก"
             เฉยๆ ทั้งที่ตารางในหน้าหนึ่งอาจมีมากกว่าหนึ่งช่อง (WCAG 3.3.2) -->
        <UiInput
          v-model="search"
          :placeholder="searchPlaceholder"
          :aria-label="searchPlaceholder"
          clearable
        >
          <template #icon><Search :size="15" /></template>
        </UiInput>
      </div>

      <slot name="toolbar-extra" />

      <Teleport defer :to="toolsTarget || 'body'" :disabled="toolsInline">
      <div role="group" :aria-label="t('เครื่องมือตาราง')" class="flex items-center gap-2 ml-auto">
        <UiTooltip :content="expanded ? t('ย่อตาราง') : t('ขยายตาราง')">
          <UiButton
            size="sm"
            variant="secondary"
            icon-only
            :label="expanded ? t('ย่อตาราง') : t('ขยายตาราง')"
            @click="toggleExpanded"
          >
            <component :is="expanded ? Minimize2 : Maximize2" :size="15" />
          </UiButton>
        </UiTooltip>
        <UiMenu v-if="showColumnPicker" :label="t(&quot;แสดงคอลัมน์&quot;)">
          <template #trigger>
            <UiButton size="sm" variant="secondary" :label="t(&quot;เลือกคอลัมน์ที่จะแสดง&quot;)">
              <template #icon><Columns3 :size="15" /></template>
              <span class="hidden sm:inline"> {{ t("คอลัมน์") }} </span>
            </UiButton>
          </template>

          <div class="px-2.5 py-1.5 flex flex-col gap-2 max-h-[16rem] overflow-y-auto">
            <UiCheckbox
              v-for="col in columns"
              :key="col.key"
              :model-value="!hiddenKeys.has(col.key)"
              :label="col.label"
              :disabled="visibleColumns.length === 1 && !hiddenKeys.has(col.key)"
              @update:model-value="toggleColumn(col.key)"
            />
          </div>
        </UiMenu>

        <UiButton
          v-if="showExport"
          size="sm"
          variant="secondary"
          :label="t(&quot;ดาวน์โหลดข้อมูลที่กรองไว้เป็นไฟล์ Excel&quot;)"
          :disabled="!sortedRows.length || search !== searchTerm"
          @click="exportExcel"
        >
          <template #icon><Download :size="15" /></template>
          <span class="hidden sm:inline">Excel</span>
        </UiButton>
      </div>
      </Teleport>
    </div>

    <!-- ตาราง (จอ >= sm) -->
    <div
      ref="scrollBox"
      class="hidden sm:block relative overflow-auto rounded-t-lg border border-line-soft bg-surface"
      :class="!maxHeight && 'scroll-hint-x'"
      :style="maxHeight ? { maxHeight } : {}"
    >
      <table class="w-full text-sm border-collapse min-w-max">
        <caption v-if="caption" class="sr-only">{{ caption }}</caption>
        <thead class="sticky top-0 z-[2]">
          <tr class="bg-surface-2">
            <th
              v-for="(col, i) in visibleColumns"
              :key="col.key"
              scope="col"
              class="border-b border-line-soft font-semibold text-ink-mute text-xs whitespace-nowrap bg-surface-2"
              :class="[
                alignClass(col),
                stickyFirst && i === 0 && 'sticky left-0 z-[1] shadow-[1px_0_0_var(--line-soft)]',
              ]"
              :style="col.width ? { width: col.width } : {}"
              :aria-sort="sortState(col)"
            >
              <button
                v-if="col.sortable !== false"
                type="button"
                class="group w-full inline-flex items-center gap-1.5 px-[var(--row-px)] py-[var(--row-py)] hover:text-ink transition-colors"
                :class="col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'"
                :title="sortHint(col)"
                @click="toggleSort(col)"
              >
                {{ col.label }}
                <ArrowUp v-if="sortState(col) === 'ascending'" :size="13" class="text-brand-ink shrink-0" aria-hidden="true" />
                <ArrowDown v-else-if="sortState(col) === 'descending'" :size="13" class="text-brand-ink shrink-0" aria-hidden="true" />
                <ChevronsUpDown v-else :size="13" class="opacity-0 group-hover:opacity-40 shrink-0 transition-opacity" aria-hidden="true" />
              </button>

              <span
                v-else
                class="block px-[var(--row-px)] py-[var(--row-py)]"
              >
                {{ col.label }}
              </span>
            </th>

            <th
              v-if="$slots.actions"
              scope="col"
              class="border-b border-line-soft bg-surface-2 px-[var(--row-px)] py-[var(--row-py)] text-center text-xs font-semibold text-ink-mute whitespace-nowrap"
            > {{ t("จัดการ") }} </th>
          </tr>
        </thead>

        <tbody>
          <!-- โครงร่างระหว่างโหลด: จองที่ไว้เท่าจำนวนแถวที่กำลังจะมา หน้าจึงไม่กระโดด -->
          <template v-if="loading">
            <tr v-for="i in 6" :key="`sk-${i}`" class="border-b border-line-soft last:border-0">
              <td
                v-for="col in visibleColumns"
                :key="col.key"
                class="px-[var(--row-px)] py-[var(--row-py)]"
              >
                <UiSkeleton height="0.875rem" :width="col.align === 'right' ? '3.5rem' : '75%'" />
              </td>
              <td v-if="$slots.actions" class="px-[var(--row-px)] py-[var(--row-py)]">
                <UiSkeleton height="0.875rem" width="3rem" />
              </td>
            </tr>
          </template>

          <tr v-else-if="!paginatedRows.length">
            <td :colspan="visibleColumns.length + ($slots.actions ? 1 : 0)">
              <slot name="empty" :search="search">
                <UiEmpty
                  :variant="search ? 'search' : 'empty'"
                  :title="search ? t(&quot;ไม่พบรายการที่ตรงกับ “{0}”&quot;, [search]) : emptyText"
                  :description="search ? t(&quot;ลองใช้คำที่สั้นลง หรือล้างตัวกรองด้านบน&quot;) : emptyHint"
                >
                  <template v-if="search" #actions>
                    <UiButton size="sm" variant="secondary" @click="search = ''"> {{ t("ล้างคำค้นหา") }} </UiButton>
                  </template>
                </UiEmpty>
              </slot>
            </td>
          </tr>

          <template v-else>
            <tr
              v-for="(row, pageIndex) in paginatedRows"
              :key="row[rowKey]"
              class="group/row border-b border-line-soft last:border-0 hover:bg-row-hover transition-colors duration-100"
              :class="rowClass ? rowClass(row) : ''"
            >
              <td
                v-for="(col, i) in visibleColumns"
                :key="col.key"
                class="px-[var(--row-px)] py-[var(--row-py)] text-ink-soft group-even/row:[box-shadow:inset_0_0_0_100vmax_var(--row-stripe)]"
                :class="[
                  alignClass(col),
                  col.align === 'right' && 'numeral',
                  stickyFirst && i === 0 && 'sticky left-0 bg-surface border-r border-line-soft',
                ]"
              >
                <slot
                  :name="`cell-${col.key}`"
                  :row="row"
                  :value="cellValue(row, col)"
                  :index="(currentPage - 1) * pageSize + pageIndex"
                  :rows="sortedRows"
                >
                  {{ cellValue(row, col) ?? "—" }}
                </slot>
              </td>

              <td
                v-if="$slots.actions"
                class="px-[var(--row-px)] py-[var(--row-py)] text-center whitespace-nowrap group-even/row:[box-shadow:inset_0_0_0_100vmax_var(--row-stripe)]"
                data-print="hide"
              >
                <div class="inline-flex items-center gap-1">
                  <slot name="actions" :row="row" />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- การ์ด (จอ < sm) — ตารางหลายคอลัมน์บนมือถือต้องเลื่อนซ้ายขวาซึ่งอ่านยากมาก
         แปลงหนึ่งแถวเป็นหนึ่งการ์ดแบบ label: value แนวตั้งแทน ใช้ slot ชุดเดียวกัน -->
    <div v-if="loading" class="sm:hidden flex flex-col gap-2">
      <div v-for="i in 3" :key="`mk-${i}`" class="card p-3">
        <UiSkeleton :lines="3" height="0.875rem" />
      </div>
    </div>

    <div v-else-if="!paginatedRows.length" class="sm:hidden card">
      <slot name="empty" :search="search">
        <UiEmpty
          :variant="search ? 'search' : 'empty'"
          :title="search ? t(&quot;ไม่พบรายการที่ตรงกัน&quot;) : emptyText"
          :description="search ? t(&quot;ลองใช้คำที่สั้นลง หรือล้างตัวกรอง&quot;) : emptyHint"
          compact
        />
      </slot>
    </div>

    <ul v-else class="sm:hidden flex flex-col gap-2 list-none">
      <li
        v-for="(row, pageIndex) in paginatedRows"
        :key="row[rowKey]"
        class="card p-3"
        :class="rowClass ? rowClass(row) : ''"
      >
        <dl class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          <template v-for="col in visibleColumns" :key="col.key">
            <dt class="text-xs text-ink-mute">{{ col.label }}</dt>
            <dd class="text-sm text-ink-soft text-right min-w-0 break-words">
              <slot
                :name="`cell-${col.key}`"
                :row="row"
                :value="cellValue(row, col)"
                :index="(currentPage - 1) * pageSize + pageIndex"
                :rows="sortedRows"
              >
                {{ cellValue(row, col) ?? "—" }}
              </slot>
            </dd>
          </template>
        </dl>

        <div
          v-if="$slots.actions"
          class="flex flex-wrap justify-end gap-1.5 mt-3 pt-3 border-t border-line-soft"
        >
          <slot name="actions" :row="row" />
        </div>
      </li>
    </ul>

    <!-- ท้ายตาราง — จำนวนคู่ตัวแบ่งหน้า (Carbon / Primer) แสดงเสมอแม้มีหน้าเดียว
         จำนวนเป็น live region ให้โปรแกรมอ่านหน้าจอประกาศเมื่อค้นหา/เรียง/เปลี่ยนหน้า -->
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-surface text-xs text-ink-mute
             mt-2 sm:mt-0 sm:border sm:border-t-0 sm:border-line-soft sm:rounded-b-lg"
    >
      <p class="min-w-0" aria-live="polite">
        <template v-if="loading"> {{ t("กำลังโหลดข้อมูล…") }} </template>
        <template v-else-if="sortedRows.length"> {{ t("แสดง") }} <span class="numeral font-semibold text-ink">{{ rangeStart.toLocaleString("th-TH") }}–{{ rangeEnd.toLocaleString("th-TH") }}</span> {{ t("จาก") }} <span class="numeral font-semibold text-ink">{{ sortedRows.length.toLocaleString("th-TH") }}</span> {{ t("รายการ") }} <span v-if="search"> {{ t("(กรองจากทั้งหมด") }} {{ rows.length.toLocaleString("th-TH") }})</span>
        </template>
        <template v-else> {{ t("ไม่มีรายการที่ตรงกับเงื่อนไข") }} </template>
      </p>

    <nav
      v-if="totalPages > 1 && !loading"
      class="flex flex-wrap items-center gap-x-4 gap-y-2 ml-auto"
      :aria-label="t(&quot;แบ่งหน้าของตาราง&quot;)"
      data-print="hide"
    >
      <div class="flex items-center gap-2">
        <span class="whitespace-nowrap"> {{ t("แสดงหน้าละ") }} </span>
        <UiSelect
          :model-value="pageSize"
          size="sm"
          class="w-auto"
          :aria-label="t(&quot;จำนวนรายการต่อหน้า&quot;)"
          @update:model-value="pageSize = Number($event)"
        >
          <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
        </UiSelect>
      </div>

      <!-- ไม่มีปุ่มไปหน้าแรก/สุดท้ายแยก — เลขหน้าแรกและหน้าสุดท้ายแสดงอยู่ในแถวเสมอ -->
      <ul class="flex items-center gap-1 list-none">
        <li>
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;หน้าก่อนหน้า&quot;)" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
            <ChevronLeft :size="16" />
          </UiButton>
        </li>

        <li v-for="(p, i) in pageNumbers" :key="`p-${i}`">
          <span v-if="p === null" class="px-1 text-ink-faint select-none" aria-hidden="true">…</span>
          <UiButton
            v-else
            size="sm"
            :variant="p === currentPage ? 'primary' : 'ghost'"
            class="min-w-8 numeral"
            :label="t(&quot;ไปหน้า {0}&quot;, [p])"
            :aria-current="p === currentPage ? 'page' : undefined"
            @click="goToPage(p)"
          >
            {{ p }}
          </UiButton>
        </li>

        <li>
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;หน้าถัดไป&quot;)" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
            <ChevronRight :size="16" />
          </UiButton>
        </li>
      </ul>
    </nav>
    </div>
  </div>
</template>
