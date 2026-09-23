<script setup>
/**
 * ImportDecisions — ชื่อยี่ห้อ/อาคาร/ฝ่ายที่ยังไม่รู้จัก และหมวดมิเตอร์ของรุ่นใหม่ (#180)
 *
 * สิ่งที่ระบบไม่เดาให้ (ADR-0025, ADR-0026) ค่าที่เลือกอยู่ใน choices ของหน้า ซึ่งบันทึกเข้า session ทุกครั้งที่เปลี่ยน
 * ออกจากหน้าแล้วกลับมาจึงได้ค่าเดิม (ADR-0027)
 */
import { computed } from "vue";
import { formatCount } from "../../lib/format";
import { t } from "../../lib/locale";
import { UiButton, UiCheckbox, UiInput, UiSelect } from "../../ui";
import { KIND_LABEL, NAME_KINDS, nameOptions } from "../device-import";

const props = defineProps({
  registry: { type: Object, required: true },
  /** { names, models, renames } — reactive ของหน้า แก้ที่นี่ได้ตรงๆ */
  choices: { type: Object, required: true },
  editable: { type: Boolean, default: true },
});

const unresolvedKinds = computed(() => NAME_KINDS.filter((kind) => props.registry.unresolved?.[kind]?.length));
const models = computed(() => props.registry.models ?? []);
const kindLabel = (kind) => t(KIND_LABEL[kind]);

function createAllUnchosen(kind) {
  for (const name of Object.keys(props.choices.names[kind] ?? {})) {
    if (!props.choices.names[kind][name]) props.choices.names[kind][name] = "create";
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <section v-for="kind in unresolvedKinds" :id="`decide-${kind}`" :key="kind" class="rounded-lg border border-line-soft p-3" :data-testid="`unresolved-${kind}`">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <p class="text-sm font-semibold text-ink mr-auto">{{ t("{0}ที่ยังไม่มีในระบบ", [kindLabel(kind)]) }}</p>
        <UiButton size="sm" variant="ghost" :disabled="!editable" @click="createAllUnchosen(kind)">{{ t("สร้างใหม่ทุกชื่อที่ยังไม่เลือก") }}</UiButton>
      </div>
      <p class="mb-2 text-xs text-ink-mute">{{ t("ชื่อที่เขียนต่างกันแต่เป็นที่เดียวกัน ให้เลือก “ชื่อเรียกอื่นของ…” ระบบจะจำไว้ ไฟล์ครั้งหน้าไม่ต้องเลือกซ้ำ") }}</p>
      <div class="grid gap-2">
        <div v-for="entry in registry.unresolved[kind]" :key="entry.name" class="grid gap-2 sm:grid-cols-[1fr_auto_18rem] sm:items-center">
          <span class="text-sm text-ink break-words">{{ entry.name }}</span>
          <span class="text-xs text-ink-mute numeral">{{ t("{0} แถว", [formatCount(entry.rows)]) }}</span>
          <UiSelect
            v-model="choices.names[kind][entry.name]"
            :options="nameOptions(kind, entry.name, registry.choices[kind], choices.names)"
            value-key="value"
            label-key="label"
            :placeholder="t('— เลือก —')"
            :aria-label="t('ตัดสินชื่อ {0}', [entry.name])"
            :disabled="!editable"
          />
          <UiInput
            v-if="choices.names[kind][entry.name] === 'create'"
            v-model="choices.renames[kind][entry.name]"
            class="sm:col-start-3"
            :placeholder="entry.name"
            :aria-label="t('ชื่อที่จะใช้ในระบบสำหรับ {0}', [entry.name])"
            :disabled="!editable"
          />
        </div>
      </div>
    </section>

    <section v-if="models.length" id="decide-models" class="rounded-lg border border-line-soft p-3" data-testid="registry-models">
      <p class="text-sm font-semibold text-ink mb-1">{{ t("หมวดมิเตอร์ของแต่ละรุ่น") }}</p>
      <p class="mb-2 text-xs text-ink-mute">{{ t("ใช้คิดเงินตามรายการราคาของสัญญา รุ่นที่เคยลงแล้วระบบเลือกให้ตามเครื่องเดิม") }}</p>
      <div class="grid gap-2">
        <div v-for="model in models" :key="model.key" class="grid gap-2 sm:grid-cols-[1fr_auto_14rem_auto] sm:items-center">
          <span class="text-sm text-ink">{{ model.brand }} {{ model.model }}</span>
          <span class="text-xs text-ink-mute numeral">{{ t("{0} เครื่อง", [formatCount(model.rows)]) }}</span>
          <UiSelect
            v-if="choices.models[model.key]"
            v-model="choices.models[model.key].category"
            :options="registry.choices.meter_categories"
            value-key="id"
            label-key="name"
            :placeholder="model.required ? t('— เลือกหมวด —') : t('หมวดทั่วไป (ขาวดำ)')"
            :aria-label="t('หมวดมิเตอร์ของรุ่น {0}', [model.model])"
            :disabled="!editable"
          />
          <UiCheckbox v-if="choices.models[model.key]" v-model="choices.models[model.key].color" :label="t('มีมิเตอร์สี')" :disabled="!editable" />
        </div>
      </div>
    </section>
  </div>
</template>
