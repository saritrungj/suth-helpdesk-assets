import { onBeforeUnmount, onMounted, ref } from "vue";

/** Popups must stay inside the browser's fullscreen top layer. */
export function usePortalTarget() {
  const target = ref("body");
  const update = () => { target.value = document.fullscreenElement || "body"; };
  onMounted(() => {
    update();
    document.addEventListener("fullscreenchange", update);
  });
  onBeforeUnmount(() => document.removeEventListener("fullscreenchange", update));
  return target;
}
