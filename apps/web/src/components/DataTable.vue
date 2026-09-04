<script setup>
/**
 * DataTable.vue — ตาราง generic แทน <table> ธรรมดา
 * ฟีเจอร์ในตัว: sort (คลิกหัวคอลัมน์), search (ค้นหาข้ามทุกคอลัมน์),
 * pagination, sticky header, export Excel (.xlsx)
 *
 * หมายเหตุ: ตัว filter เฉพาะทาง (เช่น dropdown อาคาร/แผนก) ยังทำที่หน้า parent
 * เหมือนเดิม แล้วส่ง "rows" ที่ filter แล้วเข้ามา — DataTable รับผิดชอบแค่
 * sort/search-ทั่วไป/pagination/export เท่านั้น เพื่อให้ยังคง logic เฉพาะทางเดิมไว้
 *
 * การใช้งาน:
 * <DataTable :rows="filteredAssets" :columns="columns" row-key="id" export-filename="assets">
 *   <template #cell-status="{ row }"> ... custom cell ... </template>
 *   <template #actions="{ row }"> <button>แก้ไข</button> </template>
 * </DataTable>
 *
 * columns: [{ key, label, align: 'left'|'right'|'center', sortable: true, csv: (row) => value }]
 */
import { ref, computed, watch } from "vue";
import * as XLSX from "xlsx";
import SortIcon from "./SortIcon.vue";

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  rowKey: { type: String, default: "id" },
  searchable: { type: Boolean, default: true },
  searchPlaceholder: { type: String, default: "ค้นหา..." },
  pageSizeOptions: { type: Array, default: () => [10, 20, 50, 100] },
  defaultPageSize: { type: Number, default: 10 },
  exportFilename: { type: String, default: "data" },
  emptyText: { type: String, default: "ไม่พบข้อมูล" },
  showExport: { type: Boolean, default: true },
  maxHeight: { type: String, default: "" }, // เช่น "70vh" ถ้าอยากให้ header sticky ภายในกล่อง scroll ของตัวเอง
  // ฟังก์ชัน (row) => string คืน class เพิ่มเติมให้แถวนั้นๆ — ใช้กรณีอยากไฮไลต์กลุ่มแถว
  // (เช่น Report.vue ใช้ไฮไลต์แถวที่แตกมาจากเครื่องเดียวกันตอนย้ายที่ตั้ง)
  rowClass: { type: Function, default: null },
});

const search = ref("");
const sortKey = ref(null);
const sortDir = ref("asc"); // asc | desc
const currentPage = ref(1);
const pageSize = ref(props.defaultPageSize);

function cellValue(row, col) {
  if (typeof col.value === "function") return col.value(row);
  return row[col.key];
}

// ค้นหาแบบ global ข้ามทุกคอลัมน์ (ใช้ค่าที่ render จริง ไม่ใช่ raw object)
const searchedRows = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return props.rows;

  return props.rows.filter((row) =>
    props.columns.some((col) => {
      const v = cellValue(row, col);
      return v !== null && v !== undefined && String(v).toLowerCase().includes(keyword);
    })
  );
});

function toggleSort(col) {
  if (col.sortable === false) return;

  if (sortKey.value !== col.key) {
    sortKey.value = col.key;
    sortDir.value = "asc";
  } else if (sortDir.value === "asc") {
    sortDir.value = "desc";
  } else {
    // คลิกรอบที่ 3 = เลิก sort กลับไปลำดับเดิม
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

  return [...searchedRows.value].sort((a, b) => {
    let va = cellValue(a, col);
    let vb = cellValue(b, col);

    const na = Number(va);
    const nb = Number(vb);
    const bothNumeric = va !== "" && vb !== "" && !Number.isNaN(na) && !Number.isNaN(nb);

    if (bothNumeric) return (na - nb) * dir;

    va = (va ?? "").toString().toLowerCase();
    vb = (vb ?? "").toString().toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value))
);

const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

// รีเซ็ตหน้าเป็น 1 ทุกครั้งที่ค้นหา/จำนวนแถวเปลี่ยน (เช่น filter ภายนอกเปลี่ยน) ไม่งั้นอาจค้างหน้าที่ไม่มีข้อมูล
watch([search, () => props.rows.length, pageSize], () => {
  currentPage.value = 1;
});

watch(totalPages, (tp) => {
  if (currentPage.value > tp) currentPage.value = tp;
});

// หน้าที่จะโชว์เป็นปุ่มตัวเลขได้โดยตรง — เอาแค่หน้าปัจจุบัน ±2 หน้า กัน pagination ยาวเกินไปเวลาข้อมูลเยอะๆ
// (null ในลิสต์ = จุดที่ควรโชว์ "…" แทนช่วงที่ข้ามไป)
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const current = currentPage.value;
  const delta = 2;
  const pages = [];

  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= current - delta && p <= current + delta)) {
      pages.push(p);
    }
  }

  const withEllipsis = [];
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) withEllipsis.push(null);
    withEllipsis.push(p);
    prev = p;
  }
  return withEllipsis;
});

function sortState(col) {
  if (col.sortable === false) return "none";
  if (sortKey.value !== col.key) return "none";
  return sortDir.value === "asc" ? "asc" : "desc";
}

// ข้อความอธิบายว่าคลิกแล้วจะเกิดอะไรขึ้นต่อไป (น้อย -> มาก / มาก -> น้อย / เลิกเรียง)
// เพื่อไม่ให้ผู้ใช้งงว่าทำไมคลิกรอบที่ 3 แล้วลำดับกลับไปเหมือนเดิม
function sortTooltip(col) {
  const state = sortState(col);
  if (state === "none") return `เรียงตาม "${col.label}" (น้อย → มาก)`;
  if (state === "asc") return `เรียงตาม "${col.label}" (มาก → น้อย)`;
  return "เลิกเรียงลำดับ";
}

// -------------------------------------------------------
// Export Excel (.xlsx) — ใช้ค่าที่ sort/search แล้ว ไม่ตัดตาม pagination
// -------------------------------------------------------
function exportExcel() {
  const header = props.columns.map((c) => c.label);

  const rows = sortedRows.value.map((row) =>
    props.columns.map((col) => {
      const raw = typeof col.csv === "function" ? col.csv(row) : cellValue(row, col);
      return raw === null || raw === undefined ? "" : raw;
    })
  );

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  XLSX.writeFile(workbook, `${props.exportFilename}.xlsx`);
}
</script>

<template>
  <div>
    <!-- Toolbar: ค้นหา + export + ที่ว่างให้ parent ใส่ filter เพิ่มเติม -->
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <input
        v-if="searchable"
        v-model="search"
        type="text"
        :placeholder="searchPlaceholder"
        class="input-base flex-1 min-w-[200px]"
      />

      <slot name="toolbar-extra" />

      <select v-model="pageSize" class="border rounded px-2 py-2 text-sm bg-gray-50">
        <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }} รายการ/หน้า</option>
      </select>

      <button
        v-if="showExport"
        type="button"
        @click="exportExcel"
        class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm whitespace-nowrap"
        title="ดาวน์โหลดเป็นไฟล์ Excel (.xlsx)"
      >
        ⬇ Export Excel
      </button>
    </div>

    <div class="text-sm text-gray-500 mb-2">
      พบ {{ sortedRows.length.toLocaleString() }} รายการ
      <span v-if="search"> (จากทั้งหมด {{ rows.length.toLocaleString() }})</span>
    </div>

    <!-- ตาราง (จอ >= sm) -->
    <div
      class="hidden sm:block overflow-auto border rounded-lg bg-gray-50"
      :style="maxHeight ? { maxHeight } : {}"
    >
      <table class="w-full text-sm border-collapse min-w-max">
        <thead>
          <tr class="bg-gray-100 sticky top-0 z-10">
            <th
              v-for="col in columns"
              :key="col.key"
              class="border-b p-2 select-none whitespace-nowrap"
              :class="[
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.sortable !== false ? 'cursor-pointer hover:bg-gray-200' : '',
              ]"
              :title="col.sortable !== false ? sortTooltip(col) : undefined"
              @click="toggleSort(col)"
            >
              <span class="inline-flex items-center gap-1">
                {{ col.label }}
                <SortIcon v-if="col.sortable !== false" :state="sortState(col)" />
              </span>
            </th>
            <th v-if="$slots.actions" class="border-b p-2 text-center whitespace-nowrap">จัดการ</th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="!paginatedRows.length">
            <td :colspan="columns.length + ($slots.actions ? 1 : 0)" class="p-10 text-center text-gray-400">
              <!-- parent สามารถใส่ #empty เพื่อแสดงปุ่มชวนทำต่อ (เช่น "นำเข้าอุปกรณ์") แทนข้อความเฉยๆ -->
              <slot name="empty" :search="search">
                <span>{{ search ? `ไม่พบข้อมูลที่ตรงกับ "${search}"` : emptyText }}</span>
              </slot>
            </td>
          </tr>

          <tr
            v-for="row in paginatedRows"
            :key="row[rowKey]"
            class="hover:bg-gray-50 border-b last:border-b-0"
            :class="rowClass ? rowClass(row) : ''"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="p-2"
              :class="col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="cellValue(row, col)">
                {{ cellValue(row, col) ?? "-" }}
              </slot>
            </td>
            <td v-if="$slots.actions" class="p-2 text-center whitespace-nowrap">
              <slot name="actions" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Card view (จอมือถือ < sm) — ตารางที่คอลัมน์เยอะเลื่อนดูลำบากบนจอเล็ก
         แปลงแต่ละแถวเป็นการ์ด label: value แนวตั้งแทน ใช้ cell slot เดียวกับตาราง -->
    <div v-if="!paginatedRows.length" class="sm:hidden border rounded-lg bg-gray-50 p-10 text-center text-gray-400">
      <slot name="empty" :search="search">
        <span>{{ search ? `ไม่พบข้อมูลที่ตรงกับ "${search}"` : emptyText }}</span>
      </slot>
    </div>

    <div v-else class="sm:hidden space-y-3">
      <div
        v-for="row in paginatedRows"
        :key="row[rowKey]"
        class="border rounded-lg bg-gray-50 p-3"
        :class="rowClass ? rowClass(row) : ''"
      >
        <dl class="space-y-1.5">
          <div
            v-for="col in columns"
            :key="col.key"
            class="flex items-baseline justify-between gap-3 text-sm"
          >
            <dt class="text-gray-500 shrink-0">{{ col.label }}</dt>
            <dd class="text-right min-w-0">
              <slot :name="`cell-${col.key}`" :row="row" :value="cellValue(row, col)">
                {{ cellValue(row, col) ?? "-" }}
              </slot>
            </dd>
          </div>
        </dl>
        <div v-if="$slots.actions" class="mt-2.5 pt-2.5 border-t flex justify-end gap-2">
          <slot name="actions" :row="row" />
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center flex-wrap gap-1.5 mt-4">
      <button
        class="border px-2.5 py-1 rounded text-sm disabled:opacity-40 hover:bg-gray-100"
        :disabled="currentPage === 1"
        @click="currentPage = 1"
        title="หน้าแรก"
      >
        « แรก
      </button>
      <button
        class="border px-2.5 py-1 rounded text-sm disabled:opacity-40 hover:bg-gray-100"
        :disabled="currentPage === 1"
        @click="currentPage--"
        title="ก่อนหน้า"
      >
        ‹
      </button>

      <template v-for="(p, i) in pageNumbers" :key="i">
        <span v-if="p === null" class="px-1 text-gray-400 select-none">…</span>
        <button
          v-else
          class="min-w-[2rem] px-2 py-1 rounded text-sm border"
          :class="p === currentPage
            ? 'bg-blue-600 border-blue-600 text-white font-semibold'
            : 'hover:bg-gray-100'"
          @click="currentPage = p"
        >
          {{ p }}
        </button>
      </template>

      <button
        class="border px-2.5 py-1 rounded text-sm disabled:opacity-40 hover:bg-gray-100"
        :disabled="currentPage === totalPages"
        @click="currentPage++"
        title="ถัดไป"
      >
        ›
      </button>
      <button
        class="border px-2.5 py-1 rounded text-sm disabled:opacity-40 hover:bg-gray-100"
        :disabled="currentPage === totalPages"
        @click="currentPage = totalPages"
        title="หน้าสุดท้าย"
      >
        สุดท้าย »
      </button>
    </div>
  </div>
</template>