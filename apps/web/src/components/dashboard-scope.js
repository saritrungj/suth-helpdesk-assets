const DIMENSIONS = {
  divisions: "division_id",
  departments: "department_id",
  contracts: "billing_contract_id",
  buildings: "building_id",
  devices: "device_id",
};

const keyOf = (value) => String(value ?? "unassigned");

/**
 * กรองแถวรายเครื่องรายเดือนด้วยขอบเขตเดียวของ Dashboard
 *
 * สัญญาใช้ `billing_contract_id` ที่ API resolve ตามเดือนแล้วตาม ADR-0019 ห้ามใช้
 * `contract_id` ซึ่งเป็นสัญญาปัจจุบันของเครื่องย้อนทับอดีต
 */
export function filterDashboardRows(rows, scope = {}) {
  const selected = Object.fromEntries(
    Object.keys(DIMENSIONS).map((dimension) => [dimension, new Set((scope[dimension] ?? []).map(String))])
  );

  return (rows ?? []).filter((row) => Object.entries(DIMENSIONS).every(([dimension, field]) => (
    selected[dimension].size === 0 || selected[dimension].has(keyOf(row[field]))
  )));
}

export const emptyDashboardScope = () => ({
  divisions: [],
  departments: [],
  contracts: [],
  buildings: [],
  devices: [],
});

const QUERY_KEYS = {
  divisions: "filterDivisions",
  departments: "filterDepartments",
  contracts: "filterContracts",
  buildings: "filterBuildings",
  devices: "filterDevices",
};

const valuesFromQuery = (value) => [...new Set(String(Array.isArray(value) ? value[0] ?? "" : value ?? "")
  .split(",").map((item) => item.trim()).filter((item) => /^(\d+|unassigned)$/.test(item)))];

export function dashboardScopeFromQuery(query = {}) {
  return Object.fromEntries(Object.entries(QUERY_KEYS).map(([dimension, key]) => [dimension, valuesFromQuery(query[key])]));
}

export function dashboardScopeToQuery(scope = {}) {
  return Object.fromEntries(Object.entries(QUERY_KEYS).map(([dimension, key]) => [
    key,
    scope[dimension]?.length ? [...new Set(scope[dimension].map(String))].join(",") : undefined,
  ]));
}
