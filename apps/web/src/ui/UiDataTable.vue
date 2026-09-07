<script setup>
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
 * นิยามคอลัมน์: { key, label, align?, sortable?, hidden?, width?,
 *                 value?: (row) => any, csv?: (row) => any }
 */
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { refDebounced } from "@vueuse/core";
import * as XLSX from "xlsx";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Search,
} from "lucide-vue-next";
import UiButton from "./UiButton.vue";
import UiCheckbox from "./UiCheckbox.vue";
import UiEmpty from "./UiEmpty.vue";
import UiInput from "./UiInput.vue";
import UiMenu from "./UiMenu.vue";
import UiSelect from "./UiSelect.vue";
import UiSkeleton from "./UiSkeleton.vue";

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  rowKey: { type: String, default: "id" },
  loading: { type: Boolean, default: false },
  searchable: { type: Boolean, default: true },
  searchPlaceholder: { type: String, default: "ค้นหาในตาราง..." },
  pageSizeOptions: { type: Array, default: () => [10, 20, 50, 100] },
  defaultPageSize: { type: Number, default: 20 },
  exportFilename: { type: String, default: "data" },
  emptyText: { type: String, default: "ยังไม่มีข้อมูลในตารางนี้" },
  emptyHint: { type: String, default: "" },
  showExport: { type: Boolean, default: true },
  /** ให้ผู้ใช้ซ่อน/แสดงคอลัมน์เองได้ — ช่วยมากกับตารางที่มีสิบกว่าคอลัมน์ */
  showColumnPicker: { type: Boolean, default: true },
  /** ความสูงสูงสุดของกล่องตาราง เช่น "65vh" ทำให้หัวตารางปักหมุดอยู่ในกล่อง */
  maxHeight: { type: String, default: "" },
  /** ตรึงคอลัมน์แรกไว้ตอนเลื่อนแนวนอน สำหรับตารางที่กว้างมาก */
  stickyFirst: { type: Boolean, default: false },
  rowClass: { type: Function, default: null },
});

const search = ref("");

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

watch([searchTerm, () => props.rows.length, pageSize], () => {
  currentPage.value = 1;
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
  if (state === "none") return `เรียงตาม ${col.label} จากน้อยไปมาก`;
  if (state === "ascending") return `เรียงตาม ${col.label} จากมากไปน้อย`;
  return "เลิกเรียงลำดับ กลับไปลำดับเดิม";
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
function exportExcel() {
  const cols = visibleColumns.value;
  const header = cols.map((c) => c.label);

  const body = sortedRows.value.map((row) =>
    cols.map((col) => {
      const raw = typeof col.csv === "function" ? col.csv(row) : cellValue(row, col);
      return raw === null || raw === undefined ? "" : raw;
    })
  );

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);

  // ตั้งความกว้างคอลัมน์ตามความยาวข้อความจริง ไม่งั้นเปิดไฟล์มาเจอ ##### ทุกช่อง
  worksheet["!cols"] = cols.map((col, i) => {
    const longest = body.reduce((max, r) => Math.max(max, String(r[i] ?? "").length), col.label.length);
    return { wch: Math.min(Math.max(longest + 2, 8), 48) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ข้อมูล");
  XLSX.writeFile(workbook, `${props.exportFilename}.xlsx`);
}
</script>

<template>
  <div class="flex flex-col min-w-0">
    <!-- แถบเครื่องมือ -->
    <div class="flex flex-wrap items-center gap-2 mb-3" data-print="hide">
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

      <div class="flex items-center gap-2 ml-auto">
        <UiMenu v-if="showColumnPicker" label="แสดงคอลัมน์">
          <template #trigger>
            <UiButton size="sm" variant="secondary" label="เลือกคอลัมน์ที่จะแสดง">
              <template #icon><Columns3 :size="15" /></template>
              <span class="hidden sm:inline">คอลัมน์</span>
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
          label="ดาวน์โหลดข้อมูลที่กรองไว้เป็นไฟล์ Excel"
          :disabled="!sortedRows.length"
          @click="exportExcel"
        >
          <template #icon><Download :size="15" /></template>
          <span class="hidden sm:inline">Excel</span>
        </UiButton>
      </div>
    </div>

    <!-- สรุปจำนวน — เป็น live region ให้โปรแกรมอ่านหน้าจอประกาศเมื่อผลลัพธ์เปลี่ยน -->
    <p class="text-xs text-ink-mute mb-2" aria-live="polite">
      <template v-if="loading">กำลังโหลดข้อมูล…</template>
      <template v-else-if="sortedRows.length">
        แสดง <span class="numeral font-medium text-ink-soft">{{ rangeStart.toLocaleString("th-TH") }}–{{ rangeEnd.toLocaleString("th-TH") }}</span>
        จาก <span class="numeral font-medium text-ink-soft">{{ sortedRows.length.toLocaleString("th-TH") }}</span> รายการ
        <span v-if="search" class="text-ink-mute">(กรองจากทั้งหมด {{ rows.length.toLocaleString("th-TH") }})</span>
      </template>
      <template v-else>ไม่มีรายการที่ตรงกับเงื่อนไข</template>
    </p>

    <!-- ตาราง (จอ >= sm) -->
    <div
      ref="scrollBox"
      class="hidden sm:block relative overflow-auto rounded-lg border border-line-soft bg-surface"
      :class="!maxHeight && 'scroll-hint-x'"
      :style="maxHeight ? { maxHeight } : {}"
    >
      <table class="w-full text-sm border-collapse min-w-max">
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
            >
              จัดการ
            </th>
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
                  :title="search ? `ไม่พบรายการที่ตรงกับ “${search}”` : emptyText"
                  :description="search ? 'ลองใช้คำที่สั้นลง หรือล้างตัวกรองด้านบน' : emptyHint"
                >
                  <template v-if="search" #actions>
                    <UiButton size="sm" variant="secondary" @click="search = ''">ล้างคำค้นหา</UiButton>
                  </template>
                </UiEmpty>
              </slot>
            </td>
          </tr>

          <template v-else>
            <tr
              v-for="(row, pageIndex) in paginatedRows"
              :key="row[rowKey]"
              class="border-b border-line-soft last:border-0 hover:bg-surface-2 transition-colors duration-100"
              :class="rowClass ? rowClass(row) : ''"
            >
              <td
                v-for="(col, i) in visibleColumns"
                :key="col.key"
                class="px-[var(--row-px)] py-[var(--row-py)] text-ink-soft"
                :class="[
                  alignClass(col),
                  col.align === 'right' && 'numeral',
                  stickyFirst && i === 0 && 'sticky left-0 bg-surface shadow-[1px_0_0_var(--line-soft)]',
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
                class="px-[var(--row-px)] py-[var(--row-py)] text-center whitespace-nowrap"
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
          :title="search ? 'ไม่พบรายการที่ตรงกัน' : emptyText"
          :description="search ? 'ลองใช้คำที่สั้นลง หรือล้างตัวกรอง' : emptyHint"
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

    <!-- แบ่งหน้า -->
    <nav
      v-if="totalPages > 1 && !loading"
      class="flex flex-wrap items-center justify-between gap-3 mt-4"
      aria-label="แบ่งหน้าของตาราง"
      data-print="hide"
    >
      <div class="flex items-center gap-2 order-2 sm:order-1">
        <span class="text-xs text-ink-mute whitespace-nowrap">แสดงหน้าละ</span>
        <UiSelect
          :model-value="pageSize"
          size="sm"
          class="w-auto"
          aria-label="จำนวนรายการต่อหน้า"
          @update:model-value="pageSize = Number($event)"
        >
          <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
        </UiSelect>
      </div>

      <ul class="flex items-center gap-1 order-1 sm:order-2 list-none mx-auto sm:mx-0">
        <li>
          <UiButton size="sm" variant="ghost" icon-only label="ไปหน้าแรก" :disabled="currentPage === 1" @click="goToPage(1)">
            <ChevronsLeft :size="16" />
          </UiButton>
        </li>
        <li>
          <UiButton size="sm" variant="ghost" icon-only label="หน้าก่อนหน้า" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
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
            :label="`ไปหน้า ${p}`"
            :aria-current="p === currentPage ? 'page' : undefined"
            @click="goToPage(p)"
          >
            {{ p }}
          </UiButton>
        </li>

        <li>
          <UiButton size="sm" variant="ghost" icon-only label="หน้าถัดไป" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
            <ChevronRight :size="16" />
          </UiButton>
        </li>
        <li>
          <UiButton size="sm" variant="ghost" icon-only label="ไปหน้าสุดท้าย" :disabled="currentPage === totalPages" @click="goToPage(totalPages)">
            <ChevronsRight :size="16" />
          </UiButton>
        </li>
      </ul>

      <p class="text-xs text-ink-mute numeral order-3 hidden sm:block">
        หน้า {{ currentPage }} / {{ totalPages }}
      </p>
    </nav>
  </div>
</template>
