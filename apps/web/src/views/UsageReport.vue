<script setup>
import { yearLabel } from "../lib/locale-format";
import { t } from "../lib/locale";
import Expense from "./Expense.vue";
import { activeFiscalYear } from "../store/fiscalYear";
import { UiPageHeader } from "../ui";
</script>

<template>
  <div>
    <UiPageHeader
      :title="t('ค่าใช้จ่ายตามสัญญา')"
      :description="t('ตรวจยอดพิมพ์หลังหัก 2% และข้อมูลประกอบใบแจ้งหนี้ของแต่ละสัญญา')"
    >
      <template v-if="activeFiscalYear?.year" #meta>
        <p data-topbar-context class="mt-1 text-sm text-ink-mute numeral">
          {{ t("ปีงบ {0}", [yearLabel(activeFiscalYear.year)]) }}
        </p>
      </template>
    </UiPageHeader>

    <Expense />
  </div>
</template>
