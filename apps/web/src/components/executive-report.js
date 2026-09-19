import { fromSatang, toSatang } from '@suth/domain';

// Aggregate the API's final amounts. Never recalculate a price or deduction here.
export function reportTotals(rows) {
  const priced = rows.filter(row => row.total_cost !== null && row.total_cost !== undefined);
  return {
    cost: rows.length && !priced.length ? null : fromSatang(priced.reduce((sum, row) => sum + toSatang(row.total_cost), 0)),
    unpriced: rows.length - priced.length,
    // หน้าสุทธิรวมเป็นหน่วยร้อยของหน้า ไม่ทิ้งเศษทศนิยมลอยไว้บนจอ
    pages: rows.reduce((sum, row) => sum + Math.round(Number(row.net_pages || 0) * 100), 0) / 100,
    rawPages: rows.reduce((sum, row) => sum + Number(row.pages_printed || 0), 0),
    devices: new Set(rows.map(row => row.device_id)).size,
  };
}

// หน่วยงานและสัญญาเป็นของเดือนนั้น (ประวัติการย้ายและสัญญาที่คิดเงิน) ไม่ใช่ค่าปัจจุบันของเครื่อง
const FIELDS = {
  month: ['month', 'month'],
  division: ['division_id', 'division_name'],
  department: ['department_id', 'department_name'],
  contract: ['billing_contract_id', 'billing_contract_no'],
  building: ['building_id', 'building_name'],
  device: ['device_id', 'serial_number'],
  fiscalYear: ['fiscal_year', 'fiscal_year_label'],
};

export function groupReport(rows, dimension) {
  const [id, name] = FIELDS[dimension];
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[id] ?? 'unassigned');
    if (!groups.has(key)) groups.set(key, { key, label: row[name] || '', rows: [] });
    groups.get(key).rows.push(row);
  }
  const complete = rows.every(row => row.total_cost !== null && row.total_cost !== undefined);
  return [...groups.values()].map(group => ({ ...group, ...reportTotals(group.rows) }))
    .sort(dimension === 'month' ? (a, b) => a.key.localeCompare(b.key)
      : complete ? (a, b) => b.cost - a.cost : (a, b) => a.label.localeCompare(b.label));
}

/** ขอบเขตของแผงรายละเอียด — `key` เดียว หรือ `keys` หลายรายการ (รายการที่เลือกมาเทียบ) */
export function scopeReport(rows, scope) {
  if (!scope) return rows;
  const [id] = FIELDS[scope.dimension];
  const keys = new Set((scope.keys ?? [scope.key]).map(String));
  return rows.filter(row => keys.has(String(row[id] ?? 'unassigned')));
}
