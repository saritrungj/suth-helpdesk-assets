import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { t } from "../lib/locale";

export function useFullscreen(root) {
  const expanded = ref(false);
  const expandError = ref("");
  let opener = null;
  // Vue จะ unwrap ref เมื่อส่งค่าเป็น prop ใน template แต่ component บางตัว
  // เรียก composable ด้วย ref โดยตรง ดังนั้นต้องรองรับทั้งสองรูปแบบ
  const rootElement = () => root?.value ?? root;
  async function sync() {
    const wasExpanded = expanded.value;
    expanded.value = document.fullscreenElement === rootElement();
    if (wasExpanded && !expanded.value) {
      await nextTick();
      opener?.focus();
    }
  }
  async function toggleExpanded() {
    expandError.value = "";
    try {
      const element = rootElement();
      if (!element) throw new Error("fullscreen target is not mounted");
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else {
        opener = document.activeElement;
        await element.requestFullscreen();
      }
    } catch {
      expandError.value = t("เบราว์เซอร์นี้ไม่รองรับการขยายเต็มหน้าจอ");
    }
  }
  async function collapseExpanded({ restoreFocus = true } = {}) {
    if (!restoreFocus) opener = null;
    if (document.fullscreenElement !== rootElement()) return true;
    try {
      await document.exitFullscreen();
      return true;
    } catch {
      expandError.value = t("เบราว์เซอร์นี้ไม่รองรับการขยายเต็มหน้าจอ");
      return false;
    }
  }
  onMounted(() => document.addEventListener("fullscreenchange", sync));
  onBeforeUnmount(() => document.removeEventListener("fullscreenchange", sync));
  return { expanded, expandError, toggleExpanded, collapseExpanded };
}
