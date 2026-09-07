// packages/domain/index.mjs
//
// ตัวห่อ ESM สำหรับฝั่ง apps/web (Vite) — ต้นฉบับเป็น CommonJS ที่ index.cjs
// เพื่อให้ apps/api ซึ่งเป็น CommonJS require ได้ตรงๆ โดยไม่ต้องมี build step

import domain from "./index.cjs";

export const {
  BE_OFFSET,
  BE_YEAR_THRESHOLD,
  CE_YEAR_MIN,
  CE_YEAR_MAX,
  isBuddhistYear,
  normalizeMonth,
  toBuddhistMonth,
  parseMonths,
  getFiscalYearRange,
  fiscalYearMonths,
  MONTHS_TH,
  MONTHS_TH_FULL,
  toBuddhistYear,
  formatMonthTH,
  formatDateTH,
  fiscalYearLabel,
  BILLABLE_NUMERATOR,
  BILLABLE_DENOMINATOR,
  SATANG_PER_BAHT,
  toSatang,
  fromSatang,
  billablePages,
  costSatang,
  costSatangAt,
  effectivePriceSatang,
  sumSatang,
  formatBaht,
  USER_ROLES,
  USER_ROLE_LABELS,
  DEVICE_STATUSES,
  DEVICE_STATUS_LABELS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  MAX_LENGTH,
  MAX_PAGES_PER_MONTH,
  MAX_PAGE_SIZE,
} = domain;

export default domain;
