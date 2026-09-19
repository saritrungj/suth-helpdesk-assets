import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { t } from "../lib/locale";

const KEYS = ["building", "floor", "division", "department", "brand"];

/** Resolve old links only after every reference list has loaded successfully. */
export function useReferenceQuery(filters, ready, normalizeReferences) {
  const route = useRoute();
  const router = useRouter();
  const notice = ref("");
  const queryValues = computed(() => Object.fromEntries(KEYS
    .filter((key) => key in filters.value)
    .map((key) => [key, route?.query[key] ?? ""])));
  watch([() => JSON.stringify(queryValues.value), ready], () => {
    if (!ready.value || !route) return;
    const { values, rejected } = normalizeReferences(queryValues.value);
    if (rejected.length) notice.value = t("ล้างตัวกรองจากลิงก์ที่ไม่พบหรือระบุได้ไม่แน่ชัด: {0}", [rejected.join(", ")]);
    filters.value = { ...filters.value, ...values };
    const query = { ...route.query };
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      if (!(key in query)) continue;
      if (query[key] !== value) changed = true;
      if (value) query[key] = value;
      else { delete query[key]; changed = true; }
    }
    if (changed) void router.replace({ query });
  }, { immediate: true });
  return notice;
}
