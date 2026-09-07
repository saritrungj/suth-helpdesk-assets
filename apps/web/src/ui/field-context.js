import { inject, provide } from "vue";

/**
 * field-context.js — สายเชื่อมระหว่าง UiField กับช่องกรอกที่อยู่ข้างใน
 *
 * ปัญหาที่แก้: การผูก label เข้ากับ input ให้ถูกต้องตามหลัก accessibility ต้องมี
 * id ที่ไม่ซ้ำกันทั้งหน้า แล้วโยง for/aria-describedby/aria-invalid ให้ครบ ถ้าปล่อยให้
 * แต่ละหน้าตั้ง id เอง จะมีบางที่ลืม บางที่ซ้ำ และไม่มีใครรู้จนกว่าจะมีคนใช้
 * โปรแกรมอ่านหน้าจอจริง
 *
 * ทางแก้: UiField สร้าง id เอง แล้วส่งลงมาทาง provide ช่องกรอกข้างในหยิบไปใช้
 * เองโดยที่ผู้เขียนหน้าไม่ต้องรู้เรื่องนี้เลย
 *
 *   <UiField label="ชื่อยี่ห้อ" :error="error" hint="ใช้ชื่อที่พิมพ์บนตัวเครื่อง">
 *     <UiInput v-model="name" />
 *   </UiField>
 */

const FIELD_KEY = Symbol("suth-field");

export function provideField(context) {
  provide(FIELD_KEY, context);
}

/** ค่าเริ่มต้นคือ "ไม่ได้อยู่ใน UiField" — ช่องกรอกเดี่ยวๆ นอกฟอร์มยังใช้งานได้ปกติ */
export function useField() {
  return inject(FIELD_KEY, {
    id: undefined,
    describedBy: undefined,
    invalid: false,
    required: false,
  });
}
