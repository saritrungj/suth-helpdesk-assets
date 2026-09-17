<script setup>
import { t } from "../../lib/locale";
import { formatDate } from "../../lib/locale-format";
import { formatBahtValue, formatCount } from "../../lib/format";

/**
 * ContractPriceReview — ยืนยันช่วงที่สัญญาและราคามีผลจริง (ADR-0019)
 *
 * ## หน้านี้มีไว้ทำไม
 *
 * ราคาต่อหน้าที่เก็บไว้ในสัญญา ไม่ใช่หลักฐานว่าราคานั้นมีผลกับเดือนไหนบ้าง (Q26)
 * ระบบจึงไม่คิดเงินให้เดือนใดจนกว่าจะมีคนยืนยันว่า "สัญญาฉบับนี้ครอบคลุมช่วงนี้
 * ด้วยราคานี้ ตามเอกสารฉบับนั้น"
 *
 * ระหว่างที่ยังไม่ยืนยัน ยอดพิมพ์ยังแสดงตามจริงทุกรายการ แต่ค่าใช้จ่ายขึ้นว่า
 * "ยังยืนยันราคาไม่ได้" ไม่ใช่ 0 บาท — ศูนย์บาทกับไม่รู้ราคาเป็นคนละเรื่อง และการ
 * แทนที่ด้วยศูนย์ทำให้ยอดพิมพ์จริงหายออกจากงบเงียบๆ (Q27)
 *
 * ## ช่วงที่เสนอให้ ไม่ใช่การยืนยันแทน
 *
 * ระบบเติมช่วง 1 ต.ค.–30 ก.ย. ของปีงบที่สัญญาผูกอยู่ไว้ให้ เพราะเอกสารสัญญาระบุ
 * ปีงบไว้อยู่แล้ว — เป็นการช่วยกรอก ไม่ใช่การตัดสินใจแทน ผู้ดูแลยังต้องอ่านและกด
 * และแก้ได้ถ้าสัญญาจริงไม่ตรงปีงบ
 *
 * ## ทำไมสัญญาที่ยืนยันแล้วยังโผล่ในรายการนี้ได้
 *
 * เมื่อเพิ่มหรือนำเข้าเครื่องเข้าสัญญาหลังยืนยันไปแล้ว เครื่องกลุ่มนั้นอาจยังไม่มี
 * ช่วงการคิดเงิน หรืออาจมียอดในปีงบที่อยู่นอกช่วงสัญญา รายการนี้จึงแสดงสัญญาที่
 * ต้องกลับมาตรวจด้วย ไม่ใช่เฉพาะที่ยังไม่เคยยืนยัน โดยไม่นับยอดจากปีงบเก่าตาม
 * สัญญาปัจจุบันมาปะปน
 */
import { computed, onMounted, ref } from "vue";
import { BadgeCheck } from "lucide-vue-next";
import api from "../../services/api";
import { toastSuccess } from "../../store/toast";
import { errorMessage } from "../../lib/api-error";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiDataTable,
  UiEmpty,
  UiField,
  UiInput,
  UiModal,
  UiPageHeader,
} from "../../ui";

const contracts = ref([]);
const loading = ref(true);
const loadError = ref("");

const dialogOpen = ref(false);
const target = ref(null);
const saving = ref(false);
const formError = ref("");
const form = ref({ effective_from: "", effective_to: "", price_source: "" });

const columns = [
  { key: "contract_no", label: t("เลขที่สัญญา") },
  { key: "fiscal_year", label: t("ปีงบประมาณ"), value: (row) => row.fiscal_year || "—" },
  {
    key: "price_per_page",
    label: t("ราคา/หน้า (บาท)"),
    align: "right",
    value: (row) => (row.price_per_page == null ? "—" : formatBahtValue(row.price_per_page)),
  },
  { key: "device_count", label: t("เครื่อง"), align: "right" },
  { key: "state", label: t("สถานะ") },
  { key: "actions", label: "" },
];

const pending = computed(() => contracts.value.length);

/**
 * กดยืนยันวันเดิมซ้ำแล้วไม่มีอะไรเปลี่ยน
 *
 * สัญญาที่ค้างเพราะยอดอยู่นอกช่วงเท่านั้น จะหายจากรายการได้ด้วยการแก้วันตามเอกสาร
 * หรือย้ายเครื่องเท่านั้น ผู้ใช้เคยกดยืนยันวันเดิมแล้วเข้าใจว่าระบบไม่ทำงาน (#96)
 * ยังยืนยันซ้ำได้เมื่อมียอดในช่วงที่รอยืนยัน เช่นเครื่องที่เพิ่งเพิ่มเข้าสัญญา
 */
const repeatsWithoutEffect = computed(() => {
  const row = target.value;
  return Boolean(
    row?.price_confirmed
    && Number(row.outside_term_readings) > 0
    && !Number(row.unpriced_readings)
    && form.value.effective_from === row.effective_from
    && form.value.effective_to === row.effective_to
  );
});

async function load() {
  loading.value = true;
  loadError.value = "";

  try {
    const { data } = await api.get("/contracts/price-review");
    contracts.value = data.contracts ?? [];
  } catch (err) {
    console.error(err);
    loadError.value = errorMessage(err, t("โหลดรายการสัญญาที่รอยืนยันไม่สำเร็จ"));
  } finally {
    loading.value = false;
  }
}

function openConfirm(row) {
  target.value = row;
  formError.value = "";
  form.value = {
    effective_from: row.proposed_effective_from || "",
    effective_to: row.proposed_effective_to || "",
    price_source: row.price_source || "",
  };
  dialogOpen.value = true;
}

async function save() {
  if (!form.value.effective_from || !form.value.effective_to) {
    formError.value = t("กรุณาระบุทั้งวันเริ่มและวันสิ้นสุดที่สัญญามีผล");
    return;
  }

  saving.value = true;
  formError.value = "";

  try {
    const { data } = await api.put(`/contracts/${target.value.id}/term`, {
      effective_from: form.value.effective_from,
      effective_to: form.value.effective_to,
      price_source: form.value.price_source || undefined,
    });

    toastSuccess(
      t("ยืนยัน {0} แล้ว · อัปเดตช่วงการคิดเงินให้ {1} เครื่อง", [
        target.value.contract_no,
        formatCount(data.devices_linked ?? 0),
      ])
    );
    dialogOpen.value = false;
    await load();
  } catch (err) {
    console.error(err);
    formError.value = errorMessage(err, t("ยืนยันช่วงที่สัญญามีผลไม่สำเร็จ"));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <UiPageHeader
      :eyebrow="t(&quot;ตั้งค่าระบบ&quot;)"
      :title="t(&quot;ยืนยันช่วงที่สัญญามีผล&quot;)"
      :description="t(&quot;ค่าใช้จ่ายของเดือนหนึ่งคิดจากราคาที่มีผลในเดือนนั้น ระบบจึงยังไม่คิดเงินให้จนกว่าจะมีคนยืนยันช่วงที่สัญญาครอบคลุม&quot;)"
    >
      <template #actions>
        <UiBadge v-if="!loading && pending" tone="warn" dot>
          {{ t("เหลืออีก {0} ฉบับ", [pending]) }}
        </UiBadge>
      </template>
    </UiPageHeader>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="load">{{ t("ลองใหม่") }}</UiButton>
      </template>
    </UiAlert>

    <UiEmpty
      v-else-if="!loading && !pending"
      :title="t(&quot;ยืนยันครบทุกสัญญาแล้ว&quot;)"
      :description="t(&quot;ไม่มีสัญญาที่ต้องยืนยันหรือยืนยันซ้ำภายในช่วงที่สัญญามีผล&quot;)"
    />

    <UiDataTable
      v-else
      :rows="contracts"
      :columns="columns"
      :loading="loading"
      :caption="t(&quot;สัญญาที่ต้องตรวจช่วงที่มีผล&quot;)"
      :show-fullscreen="false"
      row-key="id"
      export-filename="contract-price-review"
      :search-placeholder="t(&quot;ค้นหาเลขที่สัญญา…&quot;)"
      :empty-text="t(&quot;ไม่มีสัญญาที่รอยืนยัน&quot;)"
    >
      <template #cell-state="{ row }">
        <span class="flex flex-wrap items-center gap-2">
          <UiBadge :tone="row.price_confirmed ? 'ok' : 'warn'" dot>
            {{ row.price_confirmed ? t("ยืนยันแล้ว") : t("ยังไม่ยืนยัน") }}
          </UiBadge>
          <span v-if="row.unpriced_readings" class="text-xs text-ink-mute">
            {{ t("ยังยืนยันราคาไม่ได้ {0} รายการ", [formatCount(row.unpriced_readings)]) }}
          </span>
          <span v-if="row.outside_term_readings" class="text-xs text-ink-mute">
            {{ t("มี {0} รายการอยู่นอกช่วงสัญญา", [formatCount(row.outside_term_readings)]) }}
          </span>
          <span v-if="row.price_verified_at" class="text-xs text-ink-mute">
            {{ t("ยืนยันเมื่อ {0}", [formatDate(row.price_verified_at)]) }}
          </span>
        </span>
      </template>

      <template #cell-actions="{ row }">
        <UiButton size="sm" variant="secondary" @click="openConfirm(row)">
          <template #icon><BadgeCheck :size="14" /></template>
          {{ row.outside_term_readings
            ? t("ตรวจช่วงสัญญา")
            : row.price_confirmed ? t("ยืนยันอีกครั้ง") : t("ยืนยันช่วง") }}
        </UiButton>
      </template>
    </UiDataTable>

    <UiModal
      v-model:open="dialogOpen"
      :title="t(&quot;ยืนยันช่วงที่สัญญามีผล&quot;)"
      :description="target ? t(&quot;สัญญา {0}&quot;, [target.contract_no]) : ''"
    >
      <div class="flex flex-col gap-4">
        <UiAlert v-if="target?.outside_term_readings" tone="warn">
          <p>
            {{ t("มี {0} รายการในปีงบนี้อยู่นอกช่วงวันที่ที่ยืนยันไว้ โปรดตรวจเอกสารก่อนแก้วันเริ่มหรือวันสิ้นสุด", [
              formatCount(target.outside_term_readings),
            ]) }}
          </p>
          <!--
            ถ้าช่วงถูกต้องอยู่แล้ว ทางแก้อยู่ที่เครื่อง ไม่ใช่ที่สัญญา — ไม่มีลิงก์นี้
            สัญญาจะค้างในรายการตลอดไปโดยไม่มีปุ่มไหนแก้ได้ (#96)
          -->
          <p class="mt-1">
            {{ t("ถ้าช่วงนี้ถูกต้องตามเอกสารแล้ว ยอดหลังวันสิ้นสุดแก้ได้โดยย้ายเครื่องไปสัญญาที่ครอบคลุมเดือนนั้น พร้อมระบุวันที่เริ่มคิดเงินในฟอร์มเครื่อง") }}
            <RouterLink
              :to="{ path: '/assets', query: { contract_id: String(target.id) } }"
              class="font-medium underline"
            >
              {{ t("ดูเครื่องในสัญญานี้") }}
            </RouterLink>
          </p>
        </UiAlert>
        <UiAlert v-if="target" tone="info">
          {{ t("ราคาที่จะใช้คิดเงินคือ {0} บาทต่อหน้า กับเครื่อง {1} เครื่องที่ผูกกับสัญญานี้", [
            target.price_per_page == null ? "—" : formatBahtValue(target.price_per_page),
            formatCount(target.device_count),
          ]) }}
        </UiAlert>

        <UiField
          :label="t(&quot;มีผลตั้งแต่วันที่&quot;)"
          :hint="t(&quot;ระบบเติมช่วงของปีงบที่สัญญาผูกอยู่ให้ แก้ได้ถ้าเอกสารระบุต่างจากนี้&quot;)"
          required
        >
          <UiInput v-model="form.effective_from" type="date" />
        </UiField>

        <UiField :label="t(&quot;ถึงวันที่&quot;)" required>
          <UiInput v-model="form.effective_to" type="date" />
        </UiField>

        <UiField
          :label="t(&quot;เอกสารอ้างอิง&quot;)"
          :hint="t(&quot;เลขที่สัญญาหรือเอกสารเปลี่ยนราคาที่ใช้ยืนยันช่วงและราคานี้&quot;)"
        >
          <UiInput v-model="form.price_source" :maxlength="255" />
        </UiField>

        <p v-if="repeatsWithoutEffect" id="term-unchanged" class="text-sm text-ink-soft">
          {{ t("วันที่ยังเหมือนที่ยืนยันไว้ การยืนยันซ้ำจะไม่ทำให้ยอดนอกช่วงมีราคา แก้วันสิ้นสุดตามเอกสารก่อน") }}
        </p>

        <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="dialogOpen = false">{{ t("ยกเลิก") }}</UiButton>
        <UiButton
          variant="primary"
          :loading="saving"
          :disabled="repeatsWithoutEffect"
          :aria-describedby="repeatsWithoutEffect ? 'term-unchanged' : undefined"
          @click="save"
        >
          {{ t("ยืนยันช่วงที่มีผล") }}
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
