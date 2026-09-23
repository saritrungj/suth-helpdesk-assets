// apps/web/src/components/dashboard-kpi.js — ตัวเลขหลักของหน้าภาพรวม (#197)
//
// ตัวเลขหนึ่งตัวบอกอะไรไม่ได้ถ้าไม่มีอะไรให้เทียบ — ทุกการ์ดจึงมีสามอย่าง: ค่าตอนนี้ ผลต่างจากเดือนเดียวกัน
// ของปีงบก่อน และรูปร่างรายเดือน (เส้นแนวโน้มจิ๋ว) ใช้ summarize/periodChange ชุดเดียวกับตารางเปรียบเทียบ
// ตัวเลขบนการ์ดจึงตรงกับกราฟ ตาราง และไฟล์ที่ส่งออกเสมอ

import { periodChange, summarize } from "./comparison";

/** เดือนเดียวกันของปีงบก่อน ("2026-03" → "2025-03") — ปีงบ ต.ค.–ก.ย. เลื่อนทั้งปีพร้อมกัน ลำดับเดือนจึงคงเดิม */
export function previousYearMonths(months = []) {
  return months.map((month) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`);
}

/**
 * ค่ารายเดือนเรียงตาม `months` ตั้งแต่เดือนแรกถึงเดือนล่าสุดที่มีข้อมูล — ก่อนเดือนแรกคือยังไม่ได้เริ่มบันทึก
 * และหลังเดือนล่าสุดคือยังไม่เกิด ทั้งสองไม่ใช่ศูนย์ ถ้าวาดเป็นศูนย์เส้นจะดูเหมือนยอดพุ่งขึ้นกะทันหัน
 * เดือนที่อยู่ระหว่างกลางแต่ไม่มีข้อมูลนับเป็นศูนย์ (มีเครื่องแต่ไม่มียอด)
 */
export function monthlyTrend(rows, months, pick) {
  const byMonth = new Map();
  for (const row of rows) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, []);
    byMonth.get(row.month).push(row);
  }
  const ordered = [...months].sort();
  const first = ordered.findIndex((month) => byMonth.has(month));
  const last = ordered.findLastIndex((month) => byMonth.has(month));
  if (first < 0) return [];
  return ordered.slice(first, last + 1).map((month) => pick(summarize(byMonth.get(month) ?? [])) ?? 0);
}

const percentChange = (before, now) => (before ? ((now - before) / before) * 100 : null);

/**
 * @param {object[]} rows ยอดของช่วงที่เลือก (ผ่านตัวกรองแล้ว)
 * @param {object[]|null} previousRows ยอดของเดือนเดียวกันปีงบก่อน ตัวกรองเดียวกัน — null = ยังโหลดไม่เสร็จหรือโหลดไม่ได้
 * @param {string[]} months เดือนที่เลือก
 */
export function dashboardKpis({ rows, previousRows, months }) {
  const now = summarize(rows);
  const before = previousRows?.length ? summarize(previousRows) : null;
  const change = (metric) => (before ? periodChange(before, now, metric).percent : null);
  const perPage = (summary) => (summary.cost !== null && summary.netPages > 0 ? summary.cost / summary.netPages : null);
  const nowPerPage = perPage(now);
  const beforePerPage = before ? perPage(before) : null;
  return {
    comparable: Boolean(before),
    cost: { value: now.cost, delta: change("cost"), trend: monthlyTrend(rows, months, (s) => s.cost) },
    pages: {
      value: now.rawPages,
      billed: now.netPages,
      delta: change("rawPages"),
      trend: monthlyTrend(rows, months, (s) => s.rawPages),
    },
    devices: { value: now.devices, delta: before ? percentChange(before.devices, now.devices) : null },
    perPage: {
      value: nowPerPage,
      delta: nowPerPage !== null && beforePerPage ? percentChange(beforePerPage, nowPerPage) : null,
    },
  };
}

/**
 * อันดับต้นๆ ของแบบจำลองเปรียบเทียบ (buildComparison) พร้อมสัดส่วนจากทั้งหมด
 * @returns {{ entries: Array<{ key, label, value, share }>, others: number, total: number }}
 */
export function topShare(model, { limit = 5, metric = "cost" } = {}) {
  const pick = (summary) => (metric === "cost" ? summary.cost ?? 0 : summary.rawPages);
  const withData = (model?.entries ?? []).filter((entry) => entry.summary?.readings > 0);
  const total = withData.reduce((sum, entry) => sum + pick(entry.summary), 0);
  const sorted = [...withData].sort((a, b) => pick(b.summary) - pick(a.summary));
  const entries = sorted.slice(0, limit).map((entry) => ({
    key: entry.key,
    label: entry.displayLabel ?? entry.label,
    value: pick(entry.summary),
    share: total > 0 ? pick(entry.summary) / total : 0,
  }));
  return { entries, others: Math.max(0, sorted.length - limit), total };
}
