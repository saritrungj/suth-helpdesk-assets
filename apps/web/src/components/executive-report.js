import { fromSatang, toSatang } from '@suth/domain';

// Aggregate the API's final amounts. Never recalculate a price or deduction here.
export function reportTotals(rows) {
  const priced = rows.filter(row => row.total_cost !== null && row.total_cost !== undefined);
  return {
    cost: rows.length && !priced.length ? null : fromSatang(priced.reduce((sum, row) => sum + toSatang(row.total_cost), 0)),
    unpriced: rows.length - priced.length,
    pages: rows.reduce((sum, row) => sum + Number(row.net_pages || 0), 0),
    devices: new Set(rows.map(row => row.device_id)).size,
  };
}

export function groupReport(rows, dimension) {
  const fields = {
    month: ['month', 'month'],
    department: ['department_id', 'department_name'],
    contract: ['contract_id', 'contract_no'],
    device: ['device_id', 'serial_number'],
  };
  const [id, name] = fields[dimension];
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

export function scopeReport(rows, scope) {
  const fields = { month: 'month', department: 'department_id', contract: 'contract_id', device: 'device_id' };
  return scope ? rows.filter(row => String(row[fields[scope.dimension]] ?? 'unassigned') === scope.key) : rows;
}
