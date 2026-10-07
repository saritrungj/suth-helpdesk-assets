import { metricValue, summarize } from "./comparison";
import { formatCount } from "../lib/format";
import { t } from "../lib/locale";

export function costNote(summary) {
  if (!summary?.unpriced) return "";
  return summary.cost === null
    ? t("ค่าพิมพ์ยังคำนวณไม่ได้: ไม่มีราคา {0} รายการ", [formatCount(summary.unpriced)])
    : t("ค่าพิมพ์เฉพาะรายการที่มีราคา: ไม่มีราคา {0} รายการ", [formatCount(summary.unpriced)]);
}

export function comparisonPlot(model, selected, slots) {
  const byKey = new Map(model.entries.map((entry) => [entry.key, entry]));
  const entries = selected.map((key) => byKey.get(key)).filter(Boolean);
  const series = entries.map((entry) => ({
    key: entry.key,
    label: entry.displayLabel ?? entry.label,
    values: entry.monthly.map((summary) => metricValue(summary, model.metric)),
    slot: slots.get(entry.key),
  }));
  const reference = model.view === "group" && model.dimension !== "fiscalYear";
  const monthly = reference ? model.months.map((month) => summarize(model.scopeRows.filter((row) => row.month === month))) : [];
  if (reference) series.unshift({
    key: "scope-total",
    label: t("รวมทุกกลุ่มในตัวกรอง"),
    values: monthly.map((summary) => metricValue(summary, model.metric)),
    reference: true,
  });
  const notes = {};
  if (model.metric === "cost") model.months.forEach((_, index) => {
    const warnings = [];
    if (reference && monthly[index].unpriced) warnings.push(`${t("รวมทุกกลุ่มในตัวกรอง")} — ${costNote(monthly[index])}`);
    for (const entry of entries) {
      if (entry.monthly[index]?.unpriced) warnings.push(`${entry.displayLabel ?? entry.label} — ${costNote(entry.monthly[index])}`);
    }
    if (warnings.length) notes[index] = warnings.join("; ");
  });
  return { series, notes };
}
