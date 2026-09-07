// apps/api/src/dashboard/filters.js
//
// ตัวกรองที่ทุกรายงานบนแดชบอร์ดใช้ร่วมกัน — เดือน และอาคาร
//
// เดิมทุก endpoint ในไฟล์ dashboard เขียนโค้ดต่อ SQL ชุดเดียวกันเองซ้ำๆ
// (สร้าง array conditions, push เงื่อนไข, ต่อ " WHERE " + join(" AND ")) รวมกัน
// หกรอบในไฟล์เดียว แล้วต่างกันจริงในรายละเอียด — บางที่กรองเดือนด้วย `IN (?)`
// บางที่ใช้ `= ?` ตัวเดียว ผลคือหน้า "ค่าใช้จ่ายรายเครื่อง" กรองได้แค่เดือนเดียว
// ขณะที่หน้าอื่นบนแดชบอร์ดเดียวกันกรองได้ทั้งไตรมาส ทั้งที่ผู้ใช้กดตัวเลือกอันเดียวกัน

const { z } = require("zod");
const { monthListQuery } = require("../shared/validate");

/**
 * พารามิเตอร์มาตรฐานของรายงานบนแดชบอร์ด
 *
 * ทุกตัวไม่บังคับ — ไม่ส่งอะไรมา = ดูภาพรวมทั้งหมด
 */
const reportQuery = z.object({
  month: monthListQuery,
  building_name: z.string().trim().max(255).optional(),
  fiscal_year_id: z.coerce.number().int().positive().optional(),

  // ทิศทางการเรียงของอันดับบนแดชบอร์ด — "asc" = น้อยที่สุดก่อน (เครื่อง/แผนกที่
  // แทบไม่ถูกใช้) ค่าอื่นหรือไม่ส่งมา = มากที่สุดก่อน ซึ่งเป็นค่าเริ่มต้น
  department_order: z.enum(["asc", "desc"]).optional(),
  device_order: z.enum(["asc", "desc"]).optional(),
});

/**
 * สร้างเงื่อนไข WHERE จากพารามิเตอร์ที่ผ่านการตรวจแล้ว
 *
 * @param {object} query ผลจาก reportQuery
 * @param {object} columns ชื่อคอลัมน์จริงในคำสั่งนั้นๆ — ต่างกันไปตามตาราง/วิว
 *   ที่ใช้ (บางคำสั่ง join กับตาราง building บางคำสั่งมีชื่ออาคารอยู่ในวิวแล้ว)
 * @returns {{ clauses: string[], params: unknown[] }}
 */
function reportFilters(query, columns) {
  const clauses = [];
  const params = [];

  if (query.month?.length && columns.month) {
    // ใช้ IN (?) เสมอ ไม่ใช่ = ? — ตัวเลือกช่วงเวลาส่งมาได้ทั้งเดือนเดียวและหลายเดือน
    // (ไตรมาส ครึ่งปี ทั้งปีงบ) การรองรับแค่เดือนเดียวคือที่มาของตัวเลขที่ไม่ตรงกัน
    // ระหว่างการ์ดสองใบบนหน้าเดียวกัน
    clauses.push(`${columns.month} IN (?)`);
    params.push(query.month);
  }

  if (query.building_name && columns.building) {
    clauses.push(`${columns.building} = ?`);
    params.push(query.building_name);
  }

  return { clauses, params };
}

/**
 * ต่อเงื่อนไขเข้ากับคำสั่งที่ลงท้ายด้วย WHERE อยู่แล้วหรือยังไม่มี WHERE เลย
 *
 * @param {string[]} clauses
 * @param {"where"|"and"} mode "where" = ยังไม่มี WHERE | "and" = คำสั่งมี WHERE 1=1 อยู่แล้ว
 */
function joinClauses(clauses, mode = "where") {
  if (!clauses.length) return "";
  return mode === "where" ? ` WHERE ${clauses.join(" AND ")} ` : ` AND ${clauses.join(" AND ")} `;
}

/**
 * ทิศทางการเรียงที่รับจาก query string
 *
 * ORDER BY ใช้พารามิเตอร์ ? ไม่ได้ ค่านี้จึงถูกต่อเข้า SQL ตรงๆ — ต้องผ่าน
 * รายการที่อนุญาตเท่านั้น ห้ามส่งค่าจากผู้ใช้เข้าไปโดยไม่แปลง
 *
 * @param {string|undefined} value
 * @returns {"ASC"|"DESC"}
 */
const sortDirection = (value) => (value === "asc" ? "ASC" : "DESC");

module.exports = { reportQuery, reportFilters, joinClauses, sortDirection };
