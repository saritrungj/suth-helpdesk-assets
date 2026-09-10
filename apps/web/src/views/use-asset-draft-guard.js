import { onBeforeUnmount, onMounted } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { createDraftGuard } from "../lib/draft-guard";
import { t } from "../lib/locale";

/** One policy for drawer dismissal, router navigation and browser unload. */
export function useAssetDraftGuard({ open, dirty, pending, discard }) {
  const confirmDiscard = createDraftGuard({
    dirtyCount: () => dirty() ? 1 : 0,
    discard,
    describe: () => t("ข้อมูลที่แก้ไขยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่"),
  });
  async function mayLeave() {
    if (!open()) return true;
    if (pending()) return false;
    return confirmDiscard("");
  }
  onBeforeRouteLeave(mayLeave);
  onBeforeRouteUpdate(mayLeave);
  function beforeUnload(event) {
    if (open() && (dirty() || pending())) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  onMounted(() => window.addEventListener("beforeunload", beforeUnload));
  onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
  return mayLeave;
}
