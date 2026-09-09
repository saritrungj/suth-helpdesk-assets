import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { t } from "../lib/locale";

export function useFullscreen(root) {
  const expanded = ref(false);
  const expandError = ref("");
  let opener = null;
  async function sync() {
    const wasExpanded = expanded.value;
    expanded.value = document.fullscreenElement === root.value;
    if (wasExpanded && !expanded.value) {
      await nextTick();
      opener?.focus();
    }
  }
  async function toggleExpanded() {
    expandError.value = "";
    try {
      if (document.fullscreenElement === root.value) await document.exitFullscreen();
      else {
        opener = document.activeElement;
        await root.value.requestFullscreen();
      }
    } catch {
      expandError.value = t("เบราว์เซอร์นี้ไม่รองรับการขยายเต็มหน้าจอ");
    }
  }
  onMounted(() => document.addEventListener("fullscreenchange", sync));
  onBeforeUnmount(() => document.removeEventListener("fullscreenchange", sync));
  return { expanded, expandError, toggleExpanded };
}
