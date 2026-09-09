const { normalizeMonth } = require("./month.cjs");
const { formatMonthTH, formatDateTH, fiscalYearLabel } = require("./format.cjs");

function formatMonth(month, options = {}) {
  if (options.locale !== "en") return formatMonthTH(month, options);
  const normalized = normalizeMonth(month);
  if (!normalized) return month == null ? "" : String(month);
  return new Intl.DateTimeFormat("en-GB", {
    month: options.long ? "long" : "short", year: options.shortYear ? "2-digit" : "numeric", timeZone: "UTC",
  }).format(new Date(`${normalized}-01T00:00:00Z`));
}

function formatDate(value, locale = "th") {
  if (locale !== "en") return formatDateTH(value);
  if (!value) return "";
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatFiscalYear(year, locale = "th") {
  const be = Number(year);
  if (!Number.isFinite(be) || !be) return "—";
  return locale === "en" ? `${be - 543} (B.E. ${be})` : String(be);
}

function formatFiscalYearRange(range, locale = "th") {
  const year = fiscalYearLabel(range);
  return year === "-" ? year : formatFiscalYear(year, locale);
}

module.exports = { formatMonth, formatDate, formatFiscalYear, formatFiscalYearRange };
