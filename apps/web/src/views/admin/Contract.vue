<script setup>
import { t } from "../../lib/locale";
import { formatDate, formatMonth } from "../../lib/locale-format";
import { formatBahtValue, formatCount, formatUnitPrice } from "../../lib/format";

/**
 * Contract — สัญญาเช่า อายุสัญญา รายการราคา ค่าเช่าคงที่ และ VAT (ADR-0021, ADR-0023)
 *
 * ## ราคามีผลทันทีที่บันทึก
 *
 * ไม่มีขั้น "ยืนยันราคา" แยกแล้ว ราคาในรายการราคาใช้คิดเงินทุกงวดในอายุสัญญาทันทีที่
 * กดบันทึก ทางกันราคาผิดจึงอยู่ที่ปุ่ม "ดูผลกระทบ" — API ลองบันทึกจริงแล้วย้อนกลับ
 * และคืนยอดเงินก่อน/หลังของทุกงวดที่เปลี่ยน ตัวเลขที่เห็นคือตัวเลขเดียวกับที่รายงาน
 * จะแสดงหลังบันทึก
 *
 * ## ทำไมบังคับดูผลกระทบก่อนบันทึกทุกครั้งที่แก้สัญญาเดิม
 *
 * สัญญาที่มียอดพิมพ์แล้ว การแก้ราคาหนึ่งหลักเปลี่ยนยอดย้อนหลังทั้งอายุสัญญา การให้
 * กดบันทึกได้ทันทีคือการเปลี่ยนเงินหลายแสนบาทโดยไม่เห็นตัวเลขสักตัว
 */
import { computed, onMounted, ref } from "vue";
import { FileSignature, Plus, Trash2 } from "lucide-vue-next";
import { fiscalYearOfMonth, fromSatang, toSatang } from "@suth/domain";
import api from "../../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateAfterWrite } from "../../api/invalidate";
import { takeRevalidationHeaders } from "../../api/http-cache";
import { askConfirm } from "../../store/confirmDialog";
import { toastError, toastSuccess } from "../../store/toast";
import { errorMessage } from "../../lib/api-error";
import {
  UiAlert,
  UiButton,
  UiDataTable,
  UiField,
  UiInput,
  UiModal,
  UiPageHeader,
  UiSelect,
} from "../../ui";

const contracts = ref([]);
const categories = ref([]);
const loading = ref(true);
const loadError = ref("");

const dialogOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const deleting = ref(false);
const previewing = ref(false);
const formError = ref("");
const formErrors = ref([]);
const impact = ref(null);
const form = ref(blankForm());

function blankForm() {
  return {
    contract_no: "",
    effective_from: "",
    effective_to: "",
    monthly_rental: "",
    vat_rate: "",
    price_lines: [{ category_id: "", price_per_page: "" }],
  };
}

/** ปีงบที่อายุสัญญาคร่อม เช่น "2569–2572" */
function fiscalYearsLabel(row) {
  const from = fiscalYearOfMonth(String(row.effective_from ?? "").slice(0, 7));
  const to = fiscalYearOfMonth(String(row.effective_to ?? "").slice(0, 7));
  if (!from || !to) return "—";
  return from === to ? String(from) : `${from}–${to}`;
}

const priceLinesLabel = (row) =>
  (row.price_lines ?? [])
    .map((line) => `${line.category_name} ${formatUnitPrice(line.price_per_page)}`)
    .join(" · ");

const columns = [
  { key: "contract_no", label: t("เลขที่สัญญา") },
  {
    key: "term",
    label: t("อายุสัญญา"),
    value: (row) => `${formatDate(row.effective_from)} – ${formatDate(row.effective_to)}`,
  },
  { key: "fiscal_years", label: t("ปีงบ"), value: fiscalYearsLabel },
  { key: "price_lines", label: t("ราคาต่อหน้า (บาท)"), value: priceLinesLabel, sortable: false },
  {
    key: "monthly_rental",
    label: t("ค่าเช่า/เดือน"),
    align: "right",
    value: (row) => (row.monthly_rental == null ? "—" : formatBahtValue(row.monthly_rental)),
  },
  {
    key: "vat_rate",
    label: t("VAT"),
    align: "right",
    value: (row) => (row.vat_rate == null ? "—" : `${Number(row.vat_rate)}%`),
  },
  { key: "device_count", label: t("เครื่อง"), align: "right", value: (row) => formatCount(row.device_count) },
];

/**
 * แก้สัญญาเดิมทุกครั้งต้องดูผลกระทบก่อนบันทึก — ไม่ใช้จำนวนเครื่องที่ผูกอยู่ตอนนี้เป็นเกณฑ์
 * เพราะเครื่องที่ย้ายออกไปแล้วยังมียอดเก่าที่คิดเงินใต้สัญญานี้ได้
 */
const needsPreview = computed(() => Boolean(editing.value));
const canSave = computed(() => !needsPreview.value || impact.value !== null);

const queryClient = useQueryClient();

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    // /contracts ตอบ max-age=60 — หลังบันทึก ต้องถามเซิร์ฟเวอร์ใหม่ ไม่งั้นเบราว์เซอร์คืนรายการเดิม
    // (ราคาเก่า) ให้หน้านี้และหน้าอื่นที่อ่าน /contracts ต่อจากนี้ในหนึ่งนาที (#152)
    const headers = takeRevalidationHeaders("/contracts");
    const [list, cats] = await Promise.all([
      api.get("/contracts", headers ? { headers } : undefined),
      api.get("/contracts/meter-categories"),
    ]);
    contracts.value = list.data;
    categories.value = cats.data;
  } catch (err) {
    console.error(err);
    loadError.value = errorMessage(err, t("โหลดรายการสัญญาไม่สำเร็จ"));
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = blankForm();
  resetFeedback();
  dialogOpen.value = true;
}

function openEdit(row) {
  editing.value = row;
  form.value = {
    contract_no: row.contract_no,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    monthly_rental: row.monthly_rental ?? "",
    vat_rate: row.vat_rate == null ? "" : String(Number(row.vat_rate)),
    price_lines: row.price_lines.map((line) => ({
      category_id: line.category_id,
      price_per_page: String(Number(line.price_per_page)),
    })),
  };
  resetFeedback();
  dialogOpen.value = true;
}

function resetFeedback() {
  formError.value = "";
  formErrors.value = [];
  impact.value = null;
}

/** แก้ช่องไหนก็ตาม ผลกระทบที่ดูไว้ไม่ใช่ของค่าชุดนี้แล้ว */
function touched() {
  impact.value = null;
}

function addLine() {
  form.value.price_lines.push({ category_id: "", price_per_page: "" });
  touched();
}

function removeLine(index) {
  form.value.price_lines.splice(index, 1);
  touched();
}

function payload(preview) {
  return {
    contract_no: form.value.contract_no,
    effective_from: form.value.effective_from,
    effective_to: form.value.effective_to,
    monthly_rental: form.value.monthly_rental === "" ? null : form.value.monthly_rental,
    vat_rate: form.value.vat_rate === "" ? null : form.value.vat_rate,
    price_lines: form.value.price_lines.map((line) => ({
      category_id: line.category_id,
      price_per_page: line.price_per_page,
    })),
    ...(preview ? { preview: true } : {}),
  };
}

function showError(err, fallback) {
  formError.value = errorMessage(err, fallback);
  formErrors.value = err?.response?.data?.errors ?? [];
}

async function preview() {
  previewing.value = true;
  resetFeedback();
  try {
    const { data } = await api.put(`/contracts/${editing.value.id}`, payload(true));
    impact.value = data.impact ?? [];
  } catch (err) {
    console.error(err);
    showError(err, t("คำนวณผลกระทบไม่สำเร็จ"));
  } finally {
    previewing.value = false;
  }
}

async function save() {
  saving.value = true;
  formError.value = "";
  formErrors.value = [];
  try {
    if (editing.value) {
      await api.put(`/contracts/${editing.value.id}`, payload(false));
    } else {
      await api.post("/contracts", payload(false));
    }
    toastSuccess(t("บันทึกสัญญา {0} แล้ว", [form.value.contract_no]));
    dialogOpen.value = false;
    // ราคาสัญญาอยู่ในทะเบียนเครื่อง ฟอร์มเครื่อง และทุกยอดเงินบนแดชบอร์ด — ล้างแคชทุกชั้นก่อนโหลดใหม่
    await invalidateAfterWrite(queryClient, "contracts");
    await load();
  } catch (err) {
    console.error(err);
    showError(err, t("บันทึกสัญญาไม่สำเร็จ"));
  } finally {
    saving.value = false;
  }
}

async function removeContract() {
  if (!editing.value || saving.value || previewing.value || deleting.value) return;

  const contract = editing.value;
  const confirmed = await askConfirm(
    t("สัญญา {0} และรายการราคาทั้งหมดจะถูกลบถาวร รายงานค่าเช่าย้อนหลังและประวัติที่มีการใช้งานจะทำให้ลบไม่ได้", [contract.contract_no]),
    { title: t("ลบสัญญานี้"), confirmText: t("ลบสัญญา"), danger: true }
  );
  if (!confirmed) return;

  deleting.value = true;
  formError.value = "";
  formErrors.value = [];
  try {
    await api.delete(`/contracts/${contract.id}`);
    toastSuccess(t("ลบสัญญา {0} แล้ว", [contract.contract_no]));
    dialogOpen.value = false;
    editing.value = null;
    await invalidateAfterWrite(queryClient, "contracts");
    await load();
  } catch (err) {
    console.error(err);
    // Conflict title/detail from the API explains which reference or invoice month blocks deletion.
    formError.value = errorMessage(err, t("ลบสัญญาไม่สำเร็จ"));
    toastError(formError.value);
  } finally {
    deleting.value = false;
  }
}

const impactTotal = computed(() => {
  if (!impact.value) return null;
  const total = (key) => fromSatang(impact.value.reduce((sum, row) => sum + toSatang(row[key]), 0));
  return { before: total("before"), after: total("after") };
});

onMounted(load);
</script>

<template>
  <div>
    <UiPageHeader
      :eyebrow="t(&quot;ตั้งค่าระบบ&quot;)"
      :title="t(&quot;สัญญาเช่า&quot;)"
      :description="t(&quot;อายุสัญญาและราคาต่อหน้าของแต่ละหมวด ใช้คิดเงินทุกงวดในอายุสัญญาทันทีที่บันทึก&quot;)"
    >
      <template #actions>
        <UiButton variant="primary" @click="openCreate">
          <template #icon><Plus :size="14" /></template>
          {{ t("เพิ่มสัญญา") }}
        </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="load">{{ t("ลองใหม่") }}</UiButton>
      </template>
    </UiAlert>

    <UiDataTable
      :rows="contracts"
      :columns="columns"
      :loading="loading"
      :caption="t(&quot;สัญญาเช่า&quot;)"
      row-key="id"
      export-filename="contracts"
      :search-placeholder="t(&quot;ค้นหาเลขที่สัญญา…&quot;)"
      :empty-text="t(&quot;ต้องมีสัญญาก่อน ระบบถึงจะคิดค่าใช้จ่ายจากยอดพิมพ์ได้&quot;)"
    >
      <template #actions="{ row }">
        <UiButton size="sm" variant="secondary" @click="openEdit(row)">
          <template #icon><FileSignature :size="14" /></template>
          {{ t("แก้ไข") }}
        </UiButton>
      </template>
    </UiDataTable>

    <UiModal
      v-model:open="dialogOpen"
      :title="editing ? t(&quot;แก้ไขสัญญา&quot;) : t(&quot;เพิ่มสัญญา&quot;)"
      :description="editing ? editing.contract_no : ''"
    >
      <div class="flex flex-col gap-4">
        <UiField :label="t(&quot;เลขที่สัญญา&quot;)" required>
          <UiInput v-model="form.contract_no" :maxlength="100" :placeholder="t(&quot;เช่น SUTH192/2568&quot;)" @update:model-value="touched" />
        </UiField>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UiField :label="t(&quot;วันเริ่มสัญญา&quot;)" required>
            <UiInput v-model="form.effective_from" type="date" @update:model-value="touched" />
          </UiField>
          <UiField :label="t(&quot;วันสิ้นสุดสัญญา&quot;)" required>
            <UiInput v-model="form.effective_to" type="date" @update:model-value="touched" />
          </UiField>
        </div>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm font-medium text-ink">{{ t("ราคาต่อหน้า (บาท)") }}</legend>
          <div
            v-for="(line, index) in form.price_lines"
            :key="index"
            class="grid grid-cols-[1fr_8rem_auto] items-end gap-2"
          >
            <UiField :label="t(&quot;หมวดมิเตอร์&quot;)" required>
              <UiSelect
                v-model="line.category_id"
                :options="categories"
                :placeholder="t(&quot;เลือกหมวด&quot;)"
                @update:model-value="touched"
              />
            </UiField>
            <UiField :label="t(&quot;บาท/หน้า&quot;)" required>
              <UiInput
                v-model="line.price_per_page"
                inputmode="decimal"
                placeholder="0.365"
                @update:model-value="touched"
              />
            </UiField>
            <UiButton
              variant="ghost"
              :aria-label="t(&quot;ลบรายการราคา&quot;)"
              :disabled="form.price_lines.length === 1"
              @click="removeLine(index)"
            >
              <template #icon><Trash2 :size="14" /></template>
            </UiButton>
          </div>
          <UiButton variant="secondary" size="sm" class="self-start" @click="addLine">
            <template #icon><Plus :size="14" /></template>
            {{ t("เพิ่มหมวด") }}
          </UiButton>
        </fieldset>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UiField :label="t(&quot;ค่าเช่าคงที่ต่อเดือน (บาท)&quot;)" :hint="t(&quot;เว้นว่างถ้าสัญญาไม่มี&quot;)">
            <UiInput v-model="form.monthly_rental" inputmode="decimal" @update:model-value="touched" />
          </UiField>
          <UiField :label="t(&quot;อัตรา VAT (%)&quot;)" :hint="t(&quot;เว้นว่างถ้าใบแจ้งหนี้ไม่คิด VAT&quot;)">
            <UiInput v-model="form.vat_rate" inputmode="decimal" @update:model-value="touched" />
          </UiField>
        </div>

        <div v-if="impact" class="flex flex-col gap-2">
          <p v-if="!impact.length" class="text-sm text-ink-soft">{{ t("ยอดเงินทุกงวดไม่เปลี่ยน") }}</p>
          <table v-else class="w-full text-sm tabular-nums">
            <caption class="mb-1 text-left font-medium text-ink">{{ t("ยอดตามใบแจ้งหนี้ที่จะเปลี่ยน (รวมค่าเช่าและ VAT)") }}</caption>
            <thead class="text-ink-mute">
              <tr>
                <th class="text-left font-normal">{{ t("งวด") }}</th>
                <th class="text-right font-normal">{{ t("ก่อน") }}</th>
                <th class="text-right font-normal">{{ t("หลัง") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in impact" :key="row.month">
                <td>{{ formatMonth(row.month) }}</td>
                <td class="text-right">{{ row.before == null ? "—" : formatBahtValue(row.before) }}</td>
                <td class="text-right">{{ row.after == null ? "—" : formatBahtValue(row.after) }}</td>
              </tr>
            </tbody>
            <tfoot class="font-medium">
              <tr>
                <td>{{ t("รวม") }}</td>
                <td class="text-right">{{ formatBahtValue(impactTotal.before) }}</td>
                <td class="text-right">{{ formatBahtValue(impactTotal.after) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <UiAlert v-if="formError" tone="danger">
          {{ formError }}
          <ul v-if="formErrors.length" class="mt-1 list-disc pl-5">
            <li v-for="(item, index) in formErrors.slice(0, 8)" :key="index">
              {{ item.month ? `${formatMonth(item.month)}: ` : "" }}{{ item.message ?? item.reason ?? t("{0} รายการ", [formatCount(item.unpriced)]) }}
            </li>
          </ul>
        </UiAlert>
      </div>

      <template #footer>
        <UiButton
          v-if="editing"
          variant="danger-ghost"
          class="mr-auto"
          :loading="deleting"
          :disabled="saving || previewing"
          @click="removeContract"
        >
          <template #icon><Trash2 :size="14" /></template>
          {{ t("ลบสัญญา") }}
        </UiButton>
        <UiButton variant="ghost" @click="dialogOpen = false">{{ t("ยกเลิก") }}</UiButton>
        <UiButton v-if="editing" variant="secondary" :loading="previewing" @click="preview">
          {{ t("ดูผลกระทบ") }}
        </UiButton>
        <UiButton variant="primary" :loading="saving" :disabled="!canSave" @click="save">
          {{ t("บันทึก") }}
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
