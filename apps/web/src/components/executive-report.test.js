import { describe, expect, test } from 'vitest';
import { groupReport, reportTotals, scopeReport } from './executive-report';

describe('executive report drill-down', () => {
  const rows = [
    { month: '2025-10', device_id: 1, department_id: 10, department_name: 'A', total_cost: '0.10', net_pages: 1 },
    { month: '2025-11', device_id: 1, department_id: 20, department_name: 'B', total_cost: '0.20', net_pages: 2 },
    { month: '2026-02', device_id: 2, department_id: null, total_cost: '0.00', net_pages: 0 },
  ];
  test('uses final API amounts in satang and retains recorded zero months', () => {
    expect(reportTotals(rows)).toEqual({ cost: 0.3, pages: 3, rawPages: 0, devices: 2, unpriced: 0 });
    expect(groupReport(rows, 'month').map(row => [row.key, row.cost])).toEqual([
      ['2025-10', 0.1], ['2025-11', 0.2], ['2026-02', 0],
    ]);
  });
  test('keeps historical department assignments when a device moves', () => {
    expect(scopeReport(rows, { dimension: 'department', key: '10' })).toEqual([rows[0]]);
    expect(groupReport(rows, 'department').map(row => [row.key, row.cost])).toEqual([['20', 0.2], ['10', 0.1], ['unassigned', 0]]);
  });
  test('unknown assignments remain drillable and grouping reconciles', () => {
    expect(scopeReport(rows, { dimension: 'department', key: 'unassigned' })).toEqual([rows[2]]);
    expect(groupReport(rows, 'device')).toHaveLength(2);
  });
  test('drill-down uses the billing contract and division of that month, and scopes several items at once', () => {
    const billed = [
      { month: '2025-10', device_id: 1, contract_id: 9, contract_no: 'CURRENT', billing_contract_id: 3, billing_contract_no: 'OLD', division_id: 1, division_name: 'X', total_cost: '1.00' },
      { month: '2025-11', device_id: 2, contract_id: 9, contract_no: 'CURRENT', billing_contract_id: 4, billing_contract_no: 'NEW', division_id: 2, division_name: 'Y', total_cost: '2.00' },
    ];
    expect(groupReport(billed, 'contract').map(row => row.label)).toEqual(['NEW', 'OLD']);
    expect(groupReport(billed, 'division').map(row => row.key)).toEqual(['2', '1']);
    expect(scopeReport(billed, { dimension: 'contract', keys: ['3', '4'] })).toHaveLength(2);
    expect(scopeReport(billed, { dimension: 'contract', key: '3' })).toEqual([billed[0]]);
  });
  test('unconfirmed prices are never represented as zero or a complete total', () => {
    const unknown = { ...rows[0], total_cost: null };
    expect(reportTotals([unknown]).cost).toBeNull();
    expect(reportTotals([unknown, rows[1]])).toMatchObject({ cost: 0.2, unpriced: 1 });
    expect(groupReport([unknown, rows[1]], 'department').map(row => row.label)).toEqual(['A', 'B']);
    expect(groupReport([{ ...rows[0], total_cost: 0 }], 'department')[0]).toMatchObject({ cost: 0, unpriced: 0 });
  });
});
