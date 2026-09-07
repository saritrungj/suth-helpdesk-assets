/**
 * index.js — ทางเข้าเดียวของชุด component พื้นฐาน
 *
 * หน้าต่างๆ import จากที่นี่ที่เดียว (`import { UiButton, UiCard } from "../ui"`)
 * แทนการไล่ path ทีละไฟล์ ทำให้ย้ายไฟล์ภายในโฟลเดอร์ ui/ ได้โดยไม่กระทบหน้าไหนเลย
 *
 * กติกาของโฟลเดอร์นี้
 *   - ห้ามรู้จักเรื่องธุรกิจ: ไม่มีคำว่าเครื่องพิมพ์ ปีงบ หรือแผนกอยู่ในนี้
 *   - ห้ามเรียก API หรือ import store ที่ผูกกับข้อมูล (ยกเว้น toast/confirm ซึ่ง
 *     เป็นกลไกของ UI ล้วนๆ)
 *   - ทุกตัวต้องใช้ได้ทั้งโหมดสว่างและมืดโดยไม่ต้องมี prop มาบอก
 */
export { default as UiAlert } from "./UiAlert.vue";
export { default as UiBadge } from "./UiBadge.vue";
export { default as UiButton } from "./UiButton.vue";
export { default as UiCard } from "./UiCard.vue";
export { default as UiChart } from "./UiChart.vue";
export { default as UiCheckbox } from "./UiCheckbox.vue";
export { default as UiCombobox } from "./UiCombobox.vue";
export { default as UiConfirm } from "./UiConfirm.vue";
export { default as UiDataTable } from "./UiDataTable.vue";
export { default as UiEmpty } from "./UiEmpty.vue";
export { default as UiField } from "./UiField.vue";
export { default as UiFilterBar } from "./UiFilterBar.vue";
export { default as UiInput } from "./UiInput.vue";
export { default as UiMenu } from "./UiMenu.vue";
export { default as UiMenuItem } from "./UiMenuItem.vue";
export { default as UiMeter } from "./UiMeter.vue";
export { default as UiModal } from "./UiModal.vue";
export { default as UiPageHeader } from "./UiPageHeader.vue";
export { default as UiSegmented } from "./UiSegmented.vue";
export { default as UiSelect } from "./UiSelect.vue";
export { default as UiSkeleton } from "./UiSkeleton.vue";
export { default as UiSpinner } from "./UiSpinner.vue";
export { default as UiStat } from "./UiStat.vue";
export { default as UiSwitch } from "./UiSwitch.vue";
export { default as UiTabs } from "./UiTabs.vue";
export { default as UiTextarea } from "./UiTextarea.vue";
export { default as UiToaster } from "./UiToaster.vue";
export { default as UiTooltip } from "./UiTooltip.vue";
