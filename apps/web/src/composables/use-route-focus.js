import { nextTick, watch } from "vue";
import { useRoute } from "vue-router";

/** บอกตำแหน่งหน้าใหม่ผ่านหัวเรื่อง หลัง router resolve lazy component แล้ว (#284) */
export function useRouteFocus() {
  const route = useRoute();
  let navigation = 0;
  // ไม่ immediate: หน้าแรกคง autofocus ของ Login; query/hash ไม่ใช่หน้าใหม่
  watch(() => route.path, async () => {
    const current = ++navigation;
    await nextTick();
    if (current !== navigation) return;
    const main = document.querySelector("#main-content") ?? document.querySelector("main");
    const target = main ? main.querySelector("h1") ?? main : document.querySelector("h1");
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    // scrollBehavior เป็นเจ้าของตำแหน่งเลื่อน รวม savedPosition ของ Back/Forward
    target.focus({ preventScroll: true });
  }, { flush: "post" });
}
