import { formatMonth } from "./locale-format";
import { t } from "./locale";

/** Historical rows retain their months; current registry rows have no month. */
export function deviceLocationLabel(locations = []) {
  const groups = new Map();
  for (const row of locations) {
    const label = [row.building_name, row.floor_name, row.location].filter(Boolean).join(" · ") || t("ไม่ระบุ");
    if (!groups.has(label)) groups.set(label, new Set());
    if (row.month) groups.get(label).add(row.month);
  }
  return [...groups].map(([label, months]) => {
    const period = [...months].sort().map((m) => formatMonth(m)).join(", ");
    return groups.size > 1 && period ? `${label} (${period})` : label;
  }).join("; ") || t("ไม่ระบุ");
}
