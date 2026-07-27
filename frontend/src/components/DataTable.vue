<script setup>
/**
 * DataTable.vue — ตาราง generic แทน <table> ธรรมดา
 * ฟีเจอร์ในตัว: sort (คลิกหัวคอลัมน์), search (ค้นหาข้ามทุกคอลัมน์),
 * pagination, sticky header, export CSV/Excel
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
// Export CSV (เปิดด้วย Excel ได้ตรงๆ) — ใช้ค่าที่ sort/search แล้ว ไม่ตัดตาม pagination
// -------------------------------------------------------
function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv() {
  const header = props.columns.map((c) => csvEscape(c.label)).join(",");

  const lines = sortedRows.value.map((row) =>
    props.columns
      .map((col) => {
        const raw = typeof col.csv === "function" ? col.csv(row) : cellValue(row, col);
        return csvEscape(raw);
      })
      .join(",")
  );

  // ใส่ BOM กัน Excel เปิดภาษาไทยแล้วเพี้ยน
  const csvContent = "\uFEFF" + [header, ...lines].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.exportFilename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
        class="border rounded px-3 py-2 flex-1 min-w-[200px]"
      />

      <slot name="toolbar-extra" />

      <select v-model="pageSize" class="border rounded px-2 py-2 text-sm">
        <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }} รายการ/หน้า</option>
      </select>

      <button
        v-if="showExport"
        type="button"
        @click="exportCsv"
        class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm whitespace-nowrap"
        title="ดาวน์โหลดเป็น CSV / เปิดด้วย Excel ได้"
      >
        ⬇ Export CSV
      </button>
    </div>

    <div class="text-sm text-gray-500 mb-2">
      พบ {{ sortedRows.length.toLocaleString() }} รายการ
      <span v-if="search"> (จากทั้งหมด {{ rows.length.toLocaleString() }})</span>
    </div>

    <!-- ตาราง -->
    <div
      class="overflow-auto border rounded-lg bg-gray-50"
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

          <tr v-for="row in paginatedRows" :key="row[rowKey]" class="hover:bg-gray-50 border-b last:border-b-0">
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

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-4">
      <button
        class="border px-3 py-1 rounded disabled:opacity-40"
        :disabled="currentPage === 1"
        @click="currentPage = 1"
      >
        « แรก
      </button>
      <button
        class="border px-3 py-1 rounded disabled:opacity-40"
        :disabled="currentPage === 1"
        @click="currentPage--"
      >
        ก่อนหน้า
      </button>

      <span class="text-sm text-gray-600 px-2">หน้า {{ currentPage }} / {{ totalPages }}</span>

      <button
        class="border px-3 py-1 rounded disabled:opacity-40"
        :disabled="currentPage === totalPages"
        @click="currentPage++"
      >
        ถัดไป
      </button>
      <button
        class="border px-3 py-1 rounded disabled:opacity-40"
        :disabled="currentPage === totalPages"
        @click="currentPage = totalPages"
      >
        สุดท้าย »
      </button>
    </div>
  </div>
</template>