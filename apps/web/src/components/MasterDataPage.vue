<script setup>
import { t } from "../lib/locale";

/**
 * MasterDataPage — หน้าจัดการข้อมูลอ้างอิงหนึ่งชุด (ยี่ห้อ อาคาร ชั้น ฝ่าย แผนก ปีงบ สัญญา)
 *
 * ทุกหน้าเหล่านี้ทำสิ่งเดียวกันทุกประการ: โหลดรายการ เพิ่ม แก้ไข ลบ ต่างกันแค่
 * ชื่อ endpoint กับรายชื่อช่องกรอก เดิมเขียนแยกเป็นเจ็ดไฟล์ที่เกือบเหมือนกัน
 * ผลคือแต่ละไฟล์ค่อยๆ เพี้ยนไปคนละทาง — บางหน้าแก้ไขในตารางได้ บางหน้าเปิด
 * หน้าต่าง บางหน้าตรวจชื่อซ้ำ บางหน้าไม่ตรวจ ข้อความสำเร็จก็เขียนคนละแบบ
 *
 * รวมมาไว้ที่เดียวแล้วทุกหน้าได้พฤติกรรมชุดเดียวกันทันที และการปรับปรุงครั้งเดียว
 * มีผลกับทุกหน้าพร้อมกัน
 *
 * การแก้ไขเปลี่ยนจาก "แก้ในแถวตาราง" เป็น "เปิดหน้าต่างเดียวกับตอนเพิ่ม" เพราะ
 * การแก้ในแถวทำให้ตรวจความถูกต้องและแสดงข้อความผิดพลาดไม่ได้จริง (ไม่มีที่ว่าง)
 * และบนมือถือช่องกรอกในตารางแคบจนพิมพ์ไม่ได้
 *
 * นิยาม field: { key, label, type: "text"|"number"|"select", required, placeholder,
 *                hint, maxlength, unique, step, min, optionsFrom: "/buildings",
 *                optionValue: "id", optionLabel: "name" }
 */
import { computed, onMounted, reactive, ref } from "vue";
import { Pencil, Plus, Trash2 } from "lucide-vue-next";
import api from "../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { askConfirm } from "../store/confirmDialog";
import { invalidateAfterWrite, changeKindForEndpoint } from "../api/invalidate";
import { toastError, toastSuccess } from "../store/toast";
import { errorMessage } from "../lib/api-error";
import {
  UiAlert,
  UiButton,
  UiDataTable,
  UiField,
  UiInput,
  UiModal,
  UiPageHeader,
  UiSelect,
  UiTooltip,
} from "../ui";

const props = defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, default: t("ข้อมูลอ้างอิง") },
  description: { type: String, default: "" },
  /** เส้น API ของชุดข้อมูลนี้ เช่น "/brands" — ใช้ทั้ง GET/POST/PUT/DELETE */
  endpoint: { type: String, required: true },
  /** คำเรียกของหนึ่งรายการ ใช้ประกอบข้อความทั้งหน้า เช่น "ยี่ห้อ" */
  itemNoun: { type: String, required: true },
  columns: { type: Array, required: true },
  fields: { type: Array, required: true },
  exportFilename: { type: String, default: "master-data" },
  /** ข้อความชวนให้เริ่มต้น ตอนที่ยังไม่มีข้อมูลสักรายการ */
  emptyHint: { type: String, default: "" },
  /** เรียกหลังเพิ่ม/แก้/ลบสำเร็จ — ใช้ตอนที่ state กลางต้องรีเฟรชตาม (เช่น ปีงบ) */
  onChanged: { type: Function, default: null },
});

const rows = ref([]);
const loading = ref(true);
const loadError = ref("");

const queryClient = useQueryClient();

/** ตัวเลือกของช่องแบบ select ที่ต้องดึงจาก endpoint อื่น — โหลดครั้งเดียวตอนเปิดหน้า */
const optionSets = reactive({});

const dialogOpen = ref(false);
const editingId = ref(null);
const form = reactive({});
const formError = ref("");
const saving = ref(false);

const isEditing = computed(() => editingId.value !== null);

/**
 * คอลัมน์ที่อ้างถึงข้อมูลชุดอื่น (ชั้น -> อาคาร, แผนก -> ฝ่าย) มาจาก API เป็น id
 * ล้วนๆ เพราะ endpoint เหล่านี้เป็น SELECT * ตรงๆ ไม่ได้ JOIN ชื่อมาให้
 *
 * คอลัมน์ที่ระบุ optionKey จะถูกแปลง id เป็นชื่อให้อัตโนมัติจากรายการตัวเลือก
 * ที่โหลดมาแล้ว — ตารางจึงแสดง "อาคารรัตนเวชพัฒน์" ไม่ใช่ "3" ซึ่งไม่มีความหมาย
 * กับใครเลย และทำให้ค้นหา/เรียงลำดับตามชื่ออาคารได้จริงด้วย
 */
const tableColumns = computed(() =>
  props.columns.map((column) => {
    if (!column.optionKey) return column;

    return {
      ...column,
      value: (row) =>
        optionSets[column.optionKey]?.find((o) => String(o.value) === String(row[column.key]))
          ?.label ?? "—",
    };
  })
);

async function load() {
  loading.value = true;
  loadError.value = "";

  try {
    const res = await api.get(props.endpoint);
    rows.value = res.data ?? [];
  } catch (err) {
    console.error(`Load ${props.endpoint} error:`, err);
    loadError.value = t("โหลดรายการ{0}ไม่สำเร็จ", [props.itemNoun]);
  } finally {
    loading.value = false;
  }
}

async function loadOptions() {
  const sources = props.fields.filter((f) => f.optionsFrom);

  await Promise.all(
    sources.map(async (field) => {
      try {
        const res = await api.get(field.optionsFrom);
        optionSets[field.key] = (res.data ?? []).map((item) => ({
          value: item[field.optionValue ?? "id"],
          label: String(item[field.optionLabel ?? "name"] ?? ""),
        }));
      } catch (err) {
        console.error(`Load options ${field.optionsFrom} error:`, err);
        optionSets[field.key] = [];
      }
    })
  );
}

function openCreate() {
  editingId.value = null;
  formError.value = "";
  for (const field of props.fields) form[field.key] = "";
  dialogOpen.value = true;
}

function openEdit(row) {
  editingId.value = row.id;
  formError.value = "";
  for (const field of props.fields) form[field.key] = row[field.key] ?? "";
  dialogOpen.value = true;
}

/**
 * ตรวจก่อนส่ง — ตรวจฝั่งเว็บเพื่อให้ผู้ใช้รู้ผลทันทีโดยไม่ต้องรอเครือข่าย
 * ไม่ได้แทนการตรวจฝั่ง API ซึ่งยังเป็นด่านตัดสินจริงเสมอ
 */
function validate() {
  for (const field of props.fields) {
    const raw = form[field.key];
    const value = typeof raw === "string" ? raw.trim() : raw;

    if (field.required && (value === "" || value === null || value === undefined)) {
      return t("กรอก{0}ก่อน", [field.label]);
    }

    if (field.maxlength && String(value ?? "").length > field.maxlength) {
      return t("{0}ยาวเกิน {1} ตัวอักษร", [field.label, field.maxlength]);
    }

    if (field.type === "number" && value !== "" && Number.isNaN(Number(value))) {
      return t("{0}ต้องเป็นตัวเลข", [field.label]);
    }

    // ชื่อซ้ำ — เทียบแบบไม่สนตัวพิมพ์ใหญ่เล็กและตัดช่องว่างหัวท้าย เพราะ
    // "Canon " กับ "canon" คือของเดียวกันในสายตาคนใช้ แต่คนละค่าในฐานข้อมูล
    if (field.unique && value) {
      const duplicate = rows.value.some(
        (row) =>
          row.id !== editingId.value &&
          String(row[field.key] ?? "").trim().toLowerCase() === String(value).toLowerCase()
      );
      if (duplicate) return t("มี{0} \"{1}\" อยู่แล้ว", [field.label, value]);
    }
  }

  return "";
}

function payload() {
  const body = {};
  for (const field of props.fields) {
    const raw = form[field.key];
    body[field.key] = typeof raw === "string" ? raw.trim() : raw;
  }
  return body;
}

async function submit() {
  const problem = validate();
  if (problem) {
    formError.value = problem;
    return;
  }

  saving.value = true;
  formError.value = "";

  try {
    if (isEditing.value) {
      await api.put(`${props.endpoint}/${editingId.value}`, payload());
      toastSuccess(t("แก้ไข{0}เรียบร้อย", [props.itemNoun]));
    } else {
      await api.post(props.endpoint, payload());
      toastSuccess(t("เพิ่ม{0}เรียบร้อย", [props.itemNoun]));
    }

    dialogOpen.value = false;
    await Promise.all([load(), invalidateRelatedCaches()]);
    await props.onChanged?.();
  } catch (err) {
    console.error(err);
    formError.value = errorMessage(err, t("บันทึก{0}ไม่สำเร็จ", [props.itemNoun]));
  } finally {
    saving.value = false;
  }
}

/**
 * ล้างแคชของทุกหน้าที่ใช้ข้อมูลชนิดนี้ ตามตารางใน api/invalidate.js
 *
 * `load()` ข้างบนรีเฟรชแค่รายการในหน้านี้ ซึ่งไม่พอ — ชื่ออาคาร/แผนกไปโผล่ใน
 * ตัวกรองของแดชบอร์ดและในทะเบียนเครื่องด้วย และสองที่นั้นถือแคชไว้ 30 นาที
 */
function invalidateRelatedCaches() {
  const kind = changeKindForEndpoint(props.endpoint);

  // endpoint ที่ไม่มีในตาราง (เช่น /users) ไม่มีใครถือแคชไว้ ไม่ต้องล้างอะไร
  if (!kind) return Promise.resolve();

  return invalidateAfterWrite(queryClient, kind);
}

async function remove(row) {
  const label = row[props.fields[0].key] ?? row.id;

  const confirmed = await askConfirm(
    t("“{0}” จะถูกลบออกจากระบบ และรายการที่อ้างถึงอยู่อาจแสดงผลไม่ครบ", [label]),
    {
      title: t("ลบ{0}นี้", [props.itemNoun]),
      confirmText: t("ลบ{0}", [props.itemNoun]),
      danger: true,
    }
  );
  if (!confirmed) return;

  try {
    await api.delete(`${props.endpoint}/${row.id}`);
    toastSuccess(t("ลบ{0}เรียบร้อย", [props.itemNoun]));
    await Promise.all([load(), invalidateRelatedCaches()]);
    await props.onChanged?.();
  } catch (err) {
    console.error(err);
    toastError(errorMessage(err, t("ลบไม่สำเร็จ — อาจมีข้อมูลอื่นอ้างถึง{0}นี้อยู่", [props.itemNoun])));
  }
}

onMounted(async () => {
  await Promise.all([load(), loadOptions()]);
});
</script>

<template>
  <div>
    <UiPageHeader :eyebrow="eyebrow" :title="title" :description="description">
      <template #actions>
        <UiButton variant="primary" @click="openCreate">
          <template #icon><Plus :size="16" /></template> {{ t("เพิ่ม") }} {{ itemNoun }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="load"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <UiDataTable
      :rows="rows"
      :columns="tableColumns"
      :loading="loading"
      :export-filename="exportFilename"
      :empty-text="t(&quot;ยังไม่มี{0}ในระบบ&quot;, [itemNoun])"
      :empty-hint="emptyHint"
      :search-placeholder="t(&quot;ค้นหา{0}…&quot;, [itemNoun])"
      row-key="id"
    >
      <template #actions="{ row }">
        <UiTooltip :content="t(&quot;แก้ไข{0}&quot;, [itemNoun])">
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;แก้ไข {0}&quot;, [row[fields[0].key]])" @click="openEdit(row)">
            <Pencil :size="15" />
          </UiButton>
        </UiTooltip>

        <UiTooltip :content="t(&quot;ลบ{0}&quot;, [itemNoun])">
          <UiButton
            size="sm"
            variant="danger-ghost"
            icon-only
            :label="t(&quot;ลบ {0}&quot;, [row[fields[0].key]])"
            @click="remove(row)"
          >
            <Trash2 :size="15" />
          </UiButton>
        </UiTooltip>
      </template>

      <template #empty>
        <div class="py-12">
          <div class="text-center">
            <p class="text-md font-semibold text-ink"> {{ t("ยังไม่มี") }} {{ itemNoun }} {{ t("ในระบบ") }} </p>
            <p v-if="emptyHint" class="text-sm text-ink-mute mt-1">{{ emptyHint }}</p>
            <UiButton variant="primary" size="sm" class="mt-4" @click="openCreate">
              <template #icon><Plus :size="15" /></template> {{ t("เพิ่ม") }} {{ itemNoun }} {{ t("แรก") }} </UiButton>
          </div>
        </div>
      </template>
    </UiDataTable>

    <UiModal
      v-model:open="dialogOpen"
      :title="isEditing ? t(&quot;แก้ไข{0}&quot;, [itemNoun]) : t(&quot;เพิ่ม{0}&quot;, [itemNoun])"
      size="sm"
    >
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <UiField
          v-for="field in fields"
          :key="field.key"
          :label="field.label"
          :hint="field.hint"
          :required="field.required"
        >
          <UiSelect
            v-if="field.type === 'select'"
            v-model="form[field.key]"
            :options="optionSets[field.key] ?? []"
            value-key="value"
            label-key="label"
            :placeholder="field.placeholder || t(&quot;เลือก{0}&quot;, [field.label])"
          />

          <UiInput
            v-else
            v-model="form[field.key]"
            :type="field.type === 'number' ? 'number' : 'text'"
            :placeholder="field.placeholder"
            :step="field.step"
            :min="field.min"
            @enter="submit"
          />
        </UiField>

        <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>

        <!-- ปุ่ม submit ที่ซ่อนไว้ ทำให้กด Enter ในช่องไหนก็บันทึกได้ตามที่คนคาดหวังจากฟอร์ม -->
        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true"></button>
      </form>

      <template #footer>
        <UiButton variant="secondary" :disabled="saving" @click="dialogOpen = false"> {{ t("ยกเลิก") }} </UiButton>
        <UiButton variant="primary" :loading="saving" @click="submit">
          {{ isEditing ? t("บันทึกการแก้ไข") : t("เพิ่ม{0}", [itemNoun]) }}
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
