<script setup>
/**
 * ImportPreview — "เมื่อกดยืนยัน ระบบจะทำอะไร" ของงานนำเข้าหนึ่งไฟล์ (#207, ADR-0034)
 *
 * ทุกตัวเลขมาจากการลองเขียนจริงใน transaction ที่ย้อนกลับ (validation.preview จาก API) ไม่ใช่การประมาณ
 * เดิมช่อง "บันทึกให้เลย" เขียนสัญญา ปีงบ เครื่อง และยอดลงระบบก่อนที่ผู้ใช้จะได้เห็นอะไร
 */
import { computed } from "vue";
import { formatBahtValue, formatCount } from "../../lib/format";
import { formatDate, formatMonth } from "../../lib/locale-format";
import { t } from "../../lib/locale";

const props = defineProps({ preview: { type: Object, required: true } });

const KIND = { brand: "ยี่ห้อ", building: "อาคาร", division: "ฝ่าย" };

const lines = computed(() => {
  const p = props.preview;
  const out = [];
  const add = (key, text, tone = "") => out.push({ key, text, tone });
  for (const c of p.contracts ?? []) {
    add(`contract:${c.contract_no}`, t("สร้างสัญญา {0} · {1} – {2} · ค่าเช่า {3} บาท/เดือน · VAT {4}% · ราคา {5} หมวด", [
      c.contract_no, formatDate(c.effective_from), formatDate(c.effective_to),
      c.monthly_rental == null ? "—" : formatBahtValue(c.monthly_rental), c.vat_rate ?? "—", formatCount(c.price_lines.length),
    ]));
  }
  if (p.fiscal_years?.length) add("fy", t("สร้างปีงบ {0}", [p.fiscal_years.join(", ")]));
  for (const kind of Object.keys(KIND)) {
    if (p.names?.[kind]) add(`name:${kind}`, t("เพิ่ม{0}ใหม่ {1} รายการ", [t(KIND[kind]), formatCount(p.names[kind])]));
    if (p.aliases?.[kind]) add(`alias:${kind}`, t("จำชื่อเรียกอื่นของ{0} {1} ชื่อ", [t(KIND[kind]), formatCount(p.aliases[kind])]));
  }
  if (p.floors) add("floors", t("เพิ่มชั้นใหม่ {0} ชั้น", [formatCount(p.floors)]));
  if (p.departments) add("departments", t("เพิ่มแผนกใหม่ {0} แผนก", [formatCount(p.departments)]));
  if (p.devices?.create) add("create", t("ลงทะเบียนเครื่องใหม่ {0} เครื่อง", [formatCount(p.devices.create)]));
  if (p.devices?.fill) add("fill", t("เติมช่องที่ว่างของเครื่องเดิม {0} เครื่อง", [formatCount(p.devices.fill)]));
  if (p.readings?.new) add("new", t("บันทึกยอดใหม่ {0} รายการ", [formatCount(p.readings.new)]));
  if (p.readings?.overwrite) add("overwrite", t("แทนที่ยอดเดิม {0} รายการ", [formatCount(p.readings.overwrite)]), "warn");
  if (p.look_alike) add("look", t("เลขซีเรียลคล้ายเครื่องที่มีอยู่ {0} รายการ — ถ้าเป็นเครื่องเดียวกันที่พิมพ์ผิด จะได้เครื่องซ้ำ", [formatCount(p.look_alike)]), "warn");
  return out;
});

const period = computed(() => {
  const months = props.preview.months ?? [];
  if (!months.length) return "";
  return months.length === 1 ? formatMonth(months[0]) : `${formatMonth(months[0])} – ${formatMonth(months.at(-1))}`;
});
</script>

<template>
  <section class="rounded-lg border border-line p-3 bg-surface" data-testid="import-preview" :aria-label="t('สิ่งที่จะเกิดเมื่อกดยืนยัน')">
    <p class="text-sm font-semibold text-ink">{{ t("เมื่อกดยืนยัน ระบบจะ") }}</p>
    <p class="text-xs text-ink-mute mb-2">
      {{ t("ยังไม่มีอะไรถูกบันทึก — ตัวเลขทั้งหมดมาจากการลองบันทึกแล้วย้อนกลับ ยกเลิกงานนี้ได้โดยไม่มีอะไรค้างในระบบ") }}
    </p>
    <ul v-if="lines.length" class="list-disc pl-5 text-sm flex flex-col gap-0.5">
      <li v-for="line in lines" :key="line.key" :class="line.tone === 'warn' ? 'text-warn-ink' : 'text-ink'" :data-testid="`preview-${line.key}`">{{ line.text }}</li>
    </ul>
    <p v-else class="text-sm text-ink-mute">{{ t("ไม่มีอะไรใหม่ในไฟล์นี้") }}</p>
    <p v-if="preview.invoice_total" class="text-sm text-ink mt-2" data-testid="preview-invoice">
      {{ t("ยอดตามใบแจ้งหนี้ของระบบหลังบันทึก {0} บาท ({1} งวด{2})", [formatBahtValue(preview.invoice_total), formatCount(preview.invoice_months), period ? ` · ${period}` : ""]) }}
    </p>
  </section>
</template>
