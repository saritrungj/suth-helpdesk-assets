import { toCsv } from "../lib/export-csv";

export function dashboardCsv(rows) {
  const header = [
    "เดือน", "Serial", "ฝ่าย", "แผนก", "สัญญาที่คิดเงิน", "อาคาร", "ชั้น",
    "ยอดพิมพ์จริง", "หน้าสุทธิหลังหัก 2%", "ค่าใช้จ่ายที่ยืนยันแล้ว", "สถานะราคา",
  ];
  const body = (rows ?? []).map((row) => [
    row.calendar_month ?? row.month,
    row.serial_number,
    row.division_name,
    row.department_name,
    row.billing_contract_no,
    row.building_name,
    row.floor_name,
    row.pages_printed,
    row.net_pages,
    row.total_cost ?? "",
    row.total_cost == null ? "ยังยืนยันราคาไม่ได้" : "ยืนยันราคาแล้ว",
  ]);
  return toCsv([header, ...body]);
}

