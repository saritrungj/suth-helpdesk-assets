<script setup>
/**
 * ImportContracts — สัญญาที่ไฟล์อ้างถึง (#180)
 *
 * ยังไม่มีในระบบ → ฟอร์มสร้างที่เติมจากหัวไฟล์ (อายุสัญญา ค่าเช่า VAT ราคาต่อหน้าจากคอลัมน์ Cost/Click)
 * มีแล้วแต่ไม่ตรงกับไฟล์ → แสดงค่าทั้งสองฝั่ง ให้แก้สัญญาที่หน้าสัญญา (งานนี้รออยู่ที่เดิม) หรือยอมรับพร้อมเหตุผล
 *
 * ผู้ใช้ในการตรวจ audit 2026-09-23 พิมพ์สัญญาเองแล้วไม่มีค่าเช่า/VAT และวันสิ้นสุดผิด ยอดตามใบแจ้งหนี้จึงต่างจาก
 * ของผู้ให้เช่าโดยไม่มีอะไรเตือน — ที่นี่จึงไม่ให้พิมพ์จากศูนย์ถ้าไฟล์บอกได้
 *
 * ฟอร์มนี้ไม่สร้างสัญญาทันที (#207, ADR-0034) — เก็บเป็นแผน "สร้างเมื่อกดยืนยัน" แก้หรือเอาออกจากแผนได้จนกว่าจะยืนยัน
 * ยกเลิกงานนำเข้า = สัญญาไม่ถูกสร้าง
 */
import { reactive, watch } from "vue";
import { ExternalLink } from "lucide-vue-next";
import { formatDate } from "../../lib/locale-format";
import { formatBahtValue } from "../../lib/format";
import { t } from "../../lib/locale";
import { UiAlert, UiBadge, UiButton, UiField, UiInput } from "../../ui";
import { contractBodyFromForm, contractFormFromPrefill } from "./import-session";

const props = defineProps({
  contracts: { type: Array, default: () => [] },
  /** คีย์ความต่าง → เหตุผลที่ยอมรับ (แก้ในที่เดียวกับการตัดสินใจอื่นของงานนี้) */
  acknowledged: { type: Object, required: true },
  editable: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  /** ข้อผิดพลาดรายช่องจาก API ของการสร้างครั้งล่าสุด (field → ข้อความ) */
  errors: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["create", "unplan"]);

const forms = reactive({});
/** สัญญาในแผนที่กำลังแก้ — เปิดฟอร์มเดิมด้วยค่าที่วางแผนไว้ */
const editing = reactive({});

// ฟอร์มเริ่มจากค่าในไฟล์ครั้งแรกที่เห็นสัญญานั้น ราคาของหมวดที่เพิ่งเลือกเพิ่มทีหลังถูกเติมให้ ค่าที่ผู้ใช้แก้แล้วไม่ถูกทับ
watch(
  () => props.contracts,
  (contracts) => {
    for (const contract of contracts) {
      // แผนถูกเก็บแล้ว = ปิดฟอร์มแก้ ค่าบนหน้าคือค่าที่อยู่ในแผนจริง
      if (contract.planned && editing[contract.key] === "sent") delete editing[contract.key];
    }
    for (const contract of contracts.filter((c) => c.state === "missing")) {
      const fresh = contractFormFromPrefill(contract.prefill);
      const form = forms[contract.key];
      if (!form) {
        forms[contract.key] = fresh;
        continue;
      }
      for (const line of fresh.price_lines) {
        if (!form.price_lines.some((l) => l.category_id === line.category_id)) form.price_lines.push(line);
      }
    }
  },
  { immediate: true, deep: true }
);

/** สร้างได้เมื่อรู้หมวดของทุกรุ่นแล้วและมีราคาอย่างน้อยหนึ่งหมวด — API ปฏิเสธสัญญาที่ไม่มีรายการราคา */
function whyCannotCreate(contract) {
  if (contract.prefill?.unmapped_models?.length) return t("เลือกหมวดมิเตอร์ของทุกรุ่นก่อน ราคาต่อหน้าจึงจะขึ้นครบ");
  if (!forms[contract.key]?.price_lines.some((line) => String(line.price_per_page ?? "").trim())) return t("ต้องมีราคาต่อหน้าอย่างน้อยหนึ่งหมวด");
  return "";
}

function resetFromFile(contract) {
  forms[contract.key] = contractFormFromPrefill(contract.prefill);
}

function startEdit(contract) {
  forms[contract.key] = contractFormFromPrefill(contract.planned_body);
  editing[contract.key] = true;
}

function submit(contract) {
  if (editing[contract.key]) editing[contract.key] = "sent";
  emit("create", contractBodyFromForm(forms[contract.key]));
}

const SOURCE = {
  title: "อายุสัญญาจากหัวแผ่น",
  installments: "อายุสัญญาคำนวณจากเลขงวดในหัวแผ่น",
};
const FIELD = { term: "อายุสัญญา", rental: "ค่าเช่าคงที่/เดือน", vat: "อัตรา VAT (%)" };
</script>

<template>
  <div class="flex flex-col gap-3">
    <section
      v-for="contract in contracts"
      :key="contract.key"
      class="rounded-lg border border-line-soft p-3"
      :data-testid="`contract-${contract.state}`"
    >
      <p class="text-sm font-semibold text-ink mb-2">{{ t("สัญญา {0}", [contract.contract_no]) }}</p>

      <!-- ยังไม่มีในระบบ หรือกำลังแก้สัญญาในแผน -->
      <template v-if="(contract.state === 'missing' || (contract.planned && editing[contract.key])) && forms[contract.key]">
        <p class="text-xs text-ink-mute mb-3">
          {{ contract.prefill?.term_source ? t(SOURCE[contract.prefill.term_source]) : t("ไฟล์ไม่ได้บอกอายุสัญญา — กรอกจากเอกสารสัญญา") }}
          · {{ t("ตรวจทุกช่องกับเอกสารสัญญา — สัญญาจะถูกสร้างเมื่อกดยืนยันบันทึกงานนี้เท่านั้น") }}
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <UiField :label="t('เลขที่สัญญา')"><UiInput v-model="forms[contract.key].contract_no" disabled /></UiField>
          <div class="hidden sm:block"></div>
          <UiField :label="t('เริ่มสัญญา')" required><UiInput v-model="forms[contract.key].effective_from" type="date" :disabled="!editable" data-testid="contract-from" /></UiField>
          <UiField :label="t('สิ้นสุดสัญญา')" required><UiInput v-model="forms[contract.key].effective_to" type="date" :disabled="!editable" data-testid="contract-to" /></UiField>
          <UiField :label="t('ค่าเช่าคงที่ต่อเดือน (บาท)')" :hint="t('เว้นว่าง = สัญญานี้ไม่มีค่าเช่าคงที่')">
            <UiInput v-model="forms[contract.key].monthly_rental" inputmode="decimal" :disabled="!editable" data-testid="contract-rental" />
          </UiField>
          <UiField :label="t('อัตรา VAT (%)')" :hint="t('เว้นว่าง = ใบแจ้งหนี้ไม่แยก VAT')">
            <UiInput v-model="forms[contract.key].vat_rate" inputmode="decimal" :disabled="!editable" data-testid="contract-vat" />
          </UiField>
        </div>
        <p class="text-sm font-medium text-ink mt-3 mb-1">{{ t("ราคาต่อหน้าของแต่ละหมวด") }}</p>
        <p v-if="contract.prefill?.unmapped_models?.length" class="text-xs text-warn-ink mb-2">
          {{ t("ยังไม่รู้หมวดของรุ่น {0} — เลือกหมวดมิเตอร์ของรุ่นด้านล่างก่อน ราคาของรุ่นนั้นจะขึ้นเอง", [contract.prefill.unmapped_models.join(", ")]) }}
        </p>
        <div class="grid gap-2">
          <div v-for="line in forms[contract.key].price_lines" :key="line.category_id" class="grid gap-2 sm:grid-cols-[1fr_12rem] sm:items-center">
            <span class="text-sm text-ink">
              {{ line.category_name }}
              <span v-if="line.conflicting_prices" class="block text-xs text-warn-ink">
                {{ t("ไฟล์มีหลายราคาในหมวดนี้: {0} — ตรวจหมวดของรุ่นหรือราคาพิเศษเฉพาะเครื่อง", [line.conflicting_prices.join(", ")]) }}
              </span>
            </span>
            <UiInput v-model="line.price_per_page" inputmode="decimal" :suffix="t('บาท/หน้า')" :disabled="!editable" :aria-label="t('ราคาต่อหน้า {0}', [line.category_name])" />
          </div>
        </div>
        <UiAlert v-if="Object.keys(errors).length" tone="danger" class="mt-3" data-testid="contract-errors">
          <ul class="list-disc pl-5 text-sm"><li v-for="(message, field) in errors" :key="field">{{ message }}</li></ul>
        </UiAlert>
        <div class="flex flex-wrap items-center justify-end gap-2 mt-3">
          <p v-if="contract.state === 'missing' && whyCannotCreate(contract)" class="text-xs text-warn-ink mr-auto">{{ whyCannotCreate(contract) }}</p>
          <UiButton v-if="contract.planned" variant="ghost" size="sm" :disabled="busy" @click="delete editing[contract.key]">{{ t("ยกเลิกการแก้") }}</UiButton>
          <UiButton v-else variant="ghost" size="sm" :disabled="!editable || busy" @click="resetFromFile(contract)">{{ t("ใช้ค่าจากไฟล์อีกครั้ง") }}</UiButton>
          <UiButton
            variant="primary"
            size="sm"
            :disabled="!editable || busy || (contract.state === 'missing' && Boolean(whyCannotCreate(contract)))"
            data-testid="create-contract"
            @click="submit(contract)"
          >
            {{ contract.planned ? t("เก็บการแก้") : t("ใช้สัญญานี้ — สร้างเมื่อยืนยัน") }}
          </UiButton>
        </div>
      </template>

      <!-- อยู่ในแผน: จะสร้างเมื่อกดยืนยัน -->
      <template v-else-if="contract.planned">
        <div class="flex flex-wrap items-center gap-2 mb-2" data-testid="contract-planned">
          <UiBadge tone="info" dot>{{ t("จะสร้างเมื่อกดยืนยัน") }}</UiBadge>
          <span class="text-xs text-ink-mute">{{ t("ยังไม่อยู่ในระบบ — ยกเลิกงานนี้แล้วสัญญาจะไม่ถูกสร้าง") }}</span>
        </div>
        <dl class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt class="inline text-ink-mute">{{ t("อายุสัญญา") }}: </dt><dd class="inline">{{ formatDate(contract.planned_body.effective_from) }} – {{ formatDate(contract.planned_body.effective_to) }}</dd></div>
          <div><dt class="inline text-ink-mute">{{ t("ค่าเช่าคงที่ต่อเดือน (บาท)") }}: </dt><dd class="inline">{{ contract.planned_body.monthly_rental == null ? "—" : formatBahtValue(contract.planned_body.monthly_rental) }}</dd></div>
          <div><dt class="inline text-ink-mute">{{ t("อัตรา VAT (%)") }}: </dt><dd class="inline">{{ contract.planned_body.vat_rate ?? "—" }}</dd></div>
          <div v-for="line in contract.planned_body.price_lines" :key="line.category_id">
            <dt class="inline text-ink-mute">{{ line.category_name || t("หมวด {0}", [line.category_id]) }}: </dt><dd class="inline">{{ t("{0} บาท/หน้า", [line.price_per_page]) }}</dd>
          </div>
        </dl>
        <div v-for="issue in contract.issues" :key="issue.key" class="rounded-lg p-2 mt-2" :class="issue.severity === 'blocking' ? 'bg-danger-soft' : 'bg-surface-2'">
          <p class="text-sm font-medium text-ink">{{ t(FIELD[issue.field] ?? issue.field) }}: {{ t("ไฟล์ {0} · แผน {1}", [issue.file ?? "—", issue.system ?? "—"]) }}</p>
          <p class="text-xs text-ink-soft">{{ issue.message }}</p>
        </div>
        <div v-if="editable" class="flex flex-wrap justify-end gap-2 mt-3">
          <UiButton variant="ghost" size="sm" :disabled="busy" data-testid="unplan-contract" @click="emit('unplan', contract.key)">{{ t("ไม่สร้างสัญญานี้") }}</UiButton>
          <UiButton variant="secondary" size="sm" :disabled="busy" data-testid="edit-planned-contract" @click="startEdit(contract)">{{ t("แก้") }}</UiButton>
        </div>
      </template>

      <!-- มีแล้ว — เทียบกับไฟล์ -->
      <template v-else-if="contract.system">
        <p class="text-xs text-ink-mute mb-2">
          {{ t("ในระบบ: {0} – {1}", [formatDate(contract.system.effective_from), formatDate(contract.system.effective_to)]) }}
          <template v-if="contract.system.monthly_rental"> · {{ t("ค่าเช่า {0} บาท/เดือน", [contract.system.monthly_rental]) }}</template>
          <template v-if="contract.system.vat_rate"> · {{ t("VAT {0}%", [contract.system.vat_rate]) }}</template>
        </p>
        <p v-if="!contract.issues.length" class="text-sm text-ok-ink">{{ t("ตรงกับไฟล์") }}</p>
        <div v-for="issue in contract.issues" :key="issue.key" class="rounded-lg p-2 mb-2" :class="issue.severity === 'blocking' ? 'bg-danger-soft' : 'bg-surface-2'">
          <p class="text-sm font-medium text-ink">{{ t(FIELD[issue.field] ?? issue.field) }}: {{ t("ไฟล์ {0} · ระบบ {1}", [issue.file ?? "—", issue.system ?? "—"]) }}</p>
          <p class="text-xs text-ink-soft">{{ issue.message }}</p>
          <UiField
            v-if="issue.field !== 'term'"
            :label="t('ยอมรับความต่างนี้ เพราะ…')"
            :hint="t('เช่น มีบันทึกแก้ไขสัญญา — เหตุผลถูกเก็บในประวัติของงานนี้ ต้องมีอย่างน้อย 3 ตัวอักษร')"
            class="mt-2"
          >
            <UiInput v-model="acknowledged[issue.key]" :disabled="!editable" :data-testid="`ack-${issue.field}`" />
          </UiField>
        </div>
        <UiAlert v-if="contract.issues.length" tone="info" class="mt-2">
          {{ t("แก้สัญญาได้ที่หน้าสัญญา แล้วกลับมากด “ตรวจอีกครั้ง” — งานนำเข้านี้รออยู่ที่เดิม ไม่ต้องอัปโหลดใหม่") }}
          <template #actions>
            <UiButton size="sm" variant="secondary" to="/admin/contracts">
              <template #icon><ExternalLink :size="14" /></template>{{ t("ไปหน้าสัญญา") }}
            </UiButton>
          </template>
        </UiAlert>
      </template>
    </section>
  </div>
</template>
