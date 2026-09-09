import { t } from "../lib/locale";
import { reactive } from "vue";

/**
 * confirmDialog.js — แทน window.confirm() ด้วย modal ที่ใช้ธีมเดียวกับระบบ
 *
 * ใช้งาน (เหมือน confirm() เดิมแทบทุกจุด แค่เติม await):
 *   import { askConfirm } from "@/store/confirmDialog";
 *   if (!(await askConfirm("ต้องการลบรายการนี้ใช่หรือไม่?"))) return;
 *
 * ตัว UI จริงอยู่ที่ ui/UiConfirm.vue ซึ่ง mount ไว้ครั้งเดียวใน App.vue
 */

export const confirmState = reactive({
  visible: false,
  title: t("ยืนยันการทำรายการ"),
  message: "",
  confirmText: t("ยืนยัน"),
  cancelText: t("ยกเลิก"),
  danger: true,
  _resolve: null,
});

export function askConfirm(message, options = {}) {
  return new Promise((resolve) => {
    // ถ้ามี dialog ค้างอยู่ (ไม่ควรเกิดในการใช้งานปกติ) ให้ยกเลิกอันเก่าก่อน ไม่ให้ promise ค้าง
    if (confirmState._resolve) {
      confirmState._resolve(false);
    }

    confirmState.title = options.title ?? t("ยืนยันการทำรายการ");
    confirmState.message = message;
    confirmState.confirmText = options.confirmText ?? t("ยืนยัน");
    confirmState.cancelText = options.cancelText ?? t("ยกเลิก");
    confirmState.danger = options.danger ?? true;
    confirmState._resolve = resolve;
    confirmState.visible = true;
  });
}

export function resolveConfirm(result) {
  confirmState.visible = false;
  const resolve = confirmState._resolve;
  confirmState._resolve = null;
  if (resolve) resolve(result);
}
