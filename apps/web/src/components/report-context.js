import { activeFiscalYear } from "../store/fiscalYear";
import { yearLabel, formatMonth } from "../lib/locale-format";
import { t } from "../lib/locale";

/** Build export context at the report boundary, never inside a generic table. */
export function reportContext({ months = [], filters = {}, labels = {} } = {}) {
  const defaultLabels = { building: t("อาคาร"), floor: t("ชั้น"), division: t("ฝ่าย"), department: t("แผนก"), brand: t("ยี่ห้อ"), status: t("สถานะ"), search: t("ค้นหา") };
  return [
    [t("ปีงบประมาณ"), yearLabel(activeFiscalYear.value?.year)],
    [t("ช่วงเวลา"), months.length ? months.map((m) => formatMonth(m)).join(", ") : t("ทั้งปีงบ")],
    ...Object.entries(filters).filter(([, value]) => value !== "" && value != null)
      .map(([key, value]) => [labels[key] || defaultLabels[key] || key, String(value)]),
  ];
}
