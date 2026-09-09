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
