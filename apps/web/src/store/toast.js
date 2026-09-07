import { reactive } from "vue";

/**
 * toast.js — ระบบแจ้งเตือนกลาง (แทน window.alert())
 *
 * ใช้งาน:
 *   import { toastSuccess, toastError, toastInfo } from "@/store/toast";
 *   toastSuccess("บันทึกสำเร็จ");
 *   toastError("บันทึกไม่สำเร็จ");
 *
 * ตัว UI จริงอยู่ที่ ui/UiToaster.vue ซึ่ง mount ไว้ครั้งเดียวใน App.vue
 * แล้วรับสถานะจาก toastState.items — หน้าไหนก็เรียกฟังก์ชันพวกนี้ได้เลยไม่ต้อง import component
 */

let nextId = 1;

export const toastState = reactive({
  items: [],
});

function push(type, message, timeout) {
  const id = nextId++;
  toastState.items.push({ id, type, message: String(message ?? "") });

  const ms = timeout ?? (type === "error" ? 5000 : 3200);
  if (ms > 0) {
    setTimeout(() => dismissToast(id), ms);
  }
  return id;
}

export function dismissToast(id) {
  const idx = toastState.items.findIndex((t) => t.id === id);
  if (idx !== -1) toastState.items.splice(idx, 1);
}

export function toastSuccess(message, timeout) {
  return push("success", message, timeout);
}

export function toastError(message, timeout) {
  return push("error", message, timeout);
}

export function toastInfo(message, timeout) {
  return push("info", message, timeout);
}
