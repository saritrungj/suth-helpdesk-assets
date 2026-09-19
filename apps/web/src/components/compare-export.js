import { FORMATS } from "../lib/export-xlsx";
import { comparisonSheet } from "./comparison-export";
import { formatMonth } from "../lib/locale-format";

/**
 * Compare has five metrics; Dashboard rankings intentionally have only two.
 * Keep the shared summary/detail layout, but bind the report chart to the exact
 * series drawn by Compare, including gaps for incomplete prices. No aggregation
 * or price decision is repeated here.
 */
export function compareSheet(model, metric, series) {
  const sheet = comparisonSheet(model);
  const format = metric.key === "netPages" ? FORMATS.pages
    : metric.key === "costPerPage" ? FORMATS.price
    : metric.needsPrice ? FORMATS.baht : FORMATS.count;
  const heading = `${metric.label} (${metric.unit})`;
  sheet.chart.title = metric.label;
  sheet.chart.valueTitle = heading;
  sheet.chart.valueFormat = format;
  sheet.chart.type = "line";

  if (model.view === "select" && model.months.length >= 2) {
    const first = sheet.header.length - model.months.length;
    sheet.rows.forEach((row, index) => {
      model.months.forEach((_, month) => { row[first + month] = series[index]?.data[month] ?? null; });
    });
    for (let column = first; column < sheet.columns.length; column += 1) sheet.columns[column].format = format;
    return sheet;
  }

  // Keep known subtotals separately labeled; the selected chart metric can be
  // null even when that known subtotal is positive. Keep status as the last
  // column of the monthly overview, as in the shared export.
  const column = model.view === "overall" ? sheet.header.length - 1 : sheet.header.length;
  sheet.header.splice(column, 0, model.view === "overall" ? heading : formatMonth(model.months[0]));
  sheet.columns.splice(column, 0, { format });
  sheet.rows.forEach((row, index) => {
    const value = model.view === "overall" ? series[0]?.data[index] : series[index]?.data[0];
    row.splice(column, 0, value ?? null);
  });
  sheet.chart.series = model.view === "overall" ? [{
    name: { c1: column, r1: 0 },
    categories: { c1: 0, r1: 1, r2: sheet.rows.length },
    values: { c1: column, r1: 1, r2: sheet.rows.length },
  }] : sheet.rows.map((_, index) => ({
    name: { c1: 0, r1: index + 1 },
    categories: { c1: column, r1: 0 },
    values: { c1: column, r1: index + 1 },
  }));
  return sheet;
}
