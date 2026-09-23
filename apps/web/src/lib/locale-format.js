import {
  formatMonth as domainFormatMonth,
  formatDate as domainFormatDate,
  formatFiscalYear,
  formatFiscalYearRange as domainFormatFiscalYearRange,
  MONTHS_TH as thaiMonths,
} from "@suth/domain";
import { locale } from "./locale";

export const formatMonth = (month, options = {}) => domainFormatMonth(month, { ...options, locale: locale.value });
export const formatDate = (date) => domainFormatDate(date, locale.value);
export const formatFiscalYearRange = (range) => domainFormatFiscalYearRange(range, locale.value);
export const yearLabel = (year) => formatFiscalYear(year, locale.value);
export const MONTH_NAMES = locale.value === "en"
  ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]
  : thaiMonths;

/** เวลาแบบ "14:05" ตามเวลาไทย — ใช้บอกว่าข้อมูลบนจอถูกเก็บไว้เมื่อไร */
export const formatTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale.value === "en" ? "en-GB" : "th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
};
