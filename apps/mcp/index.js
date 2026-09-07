#!/usr/bin/env node
// apps/mcp/index.js
//
// เซิร์ฟเวอร์ MCP ของระบบทรัพย์สิน — ให้ถามข้อมูลเป็นภาษาพูดผ่านผู้ช่วย AI
//
// ## ปัญหาที่ตัวนี้แก้
//
// คำถามที่ผู้บริหารถามจริง เช่น "ไตรมาสที่แล้วแผนกไหนพิมพ์เพิ่มขึ้นมากที่สุด"
// หรือ "เครื่องที่ยังไม่ผูกสัญญามีกี่เครื่องและอยู่ตึกไหนบ้าง" ตอบได้จากข้อมูลที่
// มีอยู่แล้วทั้งนั้น แต่ต้องเปิดสามหน้า กดตัวกรองห้าครั้ง แล้วเอาตัวเลขมาเทียบเอง
// ซึ่งแปลว่าในทางปฏิบัติไม่มีใครถาม
//
// ## ขอบเขตที่ตั้งใจจำกัดไว้
//
// **อ่านอย่างเดียว ไม่มีเครื่องมือที่เขียนข้อมูลแม้แต่ตัวเดียว** — นี่เป็นการ
// ตัดสินใจเรื่องความปลอดภัย ไม่ใช่เพราะยังทำไม่เสร็จ ข้อมูลขาเข้าของเครื่องมือ MCP
// มาจากโมเดลภาษา ไม่ได้มาจากผู้ใช้โดยตรง การเปิดให้เขียนได้แปลว่าข้อความในเอกสาร
// หรือไฟล์ที่โมเดลอ่านเจอ อาจกลายเป็นคำสั่งแก้ยอดพิมพ์ได้ การบันทึกข้อมูลจึงยังคง
// ต้องทำผ่านหน้าเว็บที่มีคนกดยืนยันเสมอ
//
// ทุกคำขอไปที่ HTTP API เดิม ผ่านด่านสิทธิ์ชุดเดียวกับหน้าเว็บ (ดู ./api-client.js)
// สิทธิ์ของเครื่องมือนี้จึงเท่ากับสิทธิ์ของบัญชีที่ตั้งไว้ใน environment ไม่มากกว่า
//
// ## วิธีใช้
//
// ดู docs/how-to/connect-mcp.md

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";

import { apiGet, checkApi, BASE_URL } from "./api-client.js";
import { formatMonthTH } from "@suth/domain";

const server = new McpServer({
  name: "suth-helpdesk-assets",
  version: "1.0.0",
});

// ============================================================
// ตัวช่วยจัดรูปแบบคำตอบ
//
// คำตอบของเครื่องมือ MCP ถูกอ่านโดยโมเดลภาษา ไม่ใช่โดยโค้ด — ตารางข้อความที่มี
// หน่วยกำกับชัดเจนจึงมีประโยชน์กว่า JSON ดิบ เพราะโมเดลไม่ต้องเดาว่า 12500 คือ
// แผ่นหรือบาท และไม่ต้องแปลงปี ค.ศ. เป็น พ.ศ. เอง (ซึ่งเดาผิดได้)
// ============================================================

/** ห่อข้อความให้เป็นรูปแบบคำตอบของ MCP */
const text = (value) => ({ content: [{ type: "text", text: value }] });

/** จำนวนเต็มพร้อมคั่นหลักพันแบบไทย */
const count = (value) => Number(value || 0).toLocaleString("th-TH");

/**
 * จำนวนเงินหน่วย "บาท" ที่ API ส่งมา
 *
 * ⚠️ ห้ามใช้ formatBaht() จาก @suth/domain กับค่าเหล่านี้ — ฟังก์ชันนั้นรับ
 * **สตางค์** ไม่ใช่บาท (ดู packages/domain/money.cjs) การส่งค่าบาทเข้าไปทำให้
 * ตัวเลขเล็กลงร้อยเท่าโดยไม่มีอะไรฟ้อง เช่น 85,943.36 บาท กลายเป็น "859.43"
 * ซึ่งดูเหมือนจำนวนเงินที่สมเหตุสมผลจนอ่านผ่านไปได้
 */
const baht = (value) =>
  `${Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

/**
 * สร้างตารางข้อความจากรายการ
 * @param {object[]} rows
 * @param {{ key: string, label: string, format?: (value: unknown, row: object) => string }[]} columns
 */
function table(rows, columns) {
  if (!rows.length) return "(ไม่มีข้อมูล)";

  const header = columns.map((column) => column.label).join(" | ");
  const body = rows
    .map((row) =>
      columns.map((column) => (column.format ? column.format(row[column.key], row) : String(row[column.key] ?? "-"))).join(" | ")
    )
    .join("\n");

  return `${header}\n${"-".repeat(header.length)}\n${body}`;
}

/**
 * หา id ของปีงบจากเลขปี พ.ศ. ที่ผู้ใช้พูดถึง
 *
 * โมเดลจะได้รับคำถามแบบ "ปีงบ 2568" ไม่ใช่ "fiscal_year_id 3" — การบังคับให้
 * โมเดลรู้ id ภายในก่อนจึงจะถามได้ ทำให้ต้องเรียกเครื่องมือสองรอบทุกครั้ง
 * ตัวนี้แปลงให้เอง และถ้าไม่ระบุมาจะใช้ปีงบล่าสุดที่มีข้อมูล
 */
async function resolveFiscalYear(year) {
  const years = await apiGet("/fiscal-years");
  if (!years.length) throw new Error("ยังไม่มีปีงบประมาณในระบบ");

  if (!year) return years[years.length - 1];

  const wanted = String(year);
  const found = years.find((row) => String(row.year) === wanted);

  if (!found) {
    throw new Error(`ไม่พบปีงบประมาณ ${wanted} — ปีที่มีในระบบคือ ${years.map((y) => y.year).join(", ")}`);
  }

  return found;
}

// ============================================================
// เครื่องมือที่ 1 — ภาพรวมและสิ่งที่ต้องลงมือทำ
// ============================================================

server.registerTool(
  "get_overview",
  {
    title: "ภาพรวมการใช้งานและค่าใช้จ่าย",
    description:
      "สรุปยอดพิมพ์ ค่าใช้จ่าย จำนวนเครื่อง และ 'รายการที่ต้องลงมือทำ' ของปีงบประมาณที่ระบุ " +
      "ใช้ตอบคำถามกว้างๆ เช่น 'ตอนนี้ใช้ไปเท่าไหร่แล้ว' หรือ 'มีอะไรค้างอยู่บ้าง' " +
      "ถ้าไม่ระบุปีงบจะใช้ปีล่าสุดที่มีในระบบ",
    inputSchema: {
      fiscal_year: z.string().optional().describe("ปีงบประมาณเป็น พ.ศ. เช่น '2568' — ไม่ระบุ = ปีล่าสุด"),
      months: z
        .string()
        .optional()
        .describe("จำกัดเฉพาะบางเดือน คั่นด้วย comma รูปแบบ YYYY-MM รับได้ทั้ง พ.ศ. และ ค.ศ. เช่น '2568-10,2568-11'"),
    },
  },
  async ({ fiscal_year, months }) => {
    const fy = await resolveFiscalYear(fiscal_year);
    const data = await apiGet("/dashboard/overview", { fiscal_year_id: fy.id, month: months });

    const lines = [
      `## ภาพรวมปีงบประมาณ ${fy.year} (${formatMonthTH(fy.start_month)} – ${formatMonthTH(fy.end_month)})`,
      "",
      `ช่วงที่นับ: ${data.selected_months.length} เดือน (${formatMonthTH(data.selected_months[0])} – ${formatMonthTH(data.selected_months.at(-1))})`,
      `ยอดพิมพ์รวม: ${count(data.totals.total_pages)} แผ่นสุทธิ`,
      `ค่าใช้จ่ายรวม: ${baht(data.totals.total_cost)}`,
      `เครื่องที่ใช้งานอยู่: ${count(data.totals.active_devices)} จากทั้งหมด ${count(data.totals.total_devices)} เครื่อง`,
    ];

    if (data.comparison) {
      const pages = data.comparison.pages_change_percent;
      lines.push(
        `เทียบช่วงก่อนหน้า (${data.comparison.previous_months.map((m) => formatMonthTH(m)).join(", ")}): ` +
          (pages === null ? "ไม่มีข้อมูลให้เทียบ" : `${pages > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(pages).toFixed(1)}%`)
      );
    }

    if (data.attention.length) {
      lines.push("", "## สิ่งที่ต้องลงมือทำ");
      for (const item of data.attention) {
        lines.push(`- [${item.severity}] ${item.title} — ${item.detail}`);
      }
    } else {
      lines.push("", "ไม่มีรายการค้างที่ต้องจัดการ");
    }

    if (data.top_departments.length) {
      lines.push("", "## แผนกที่ใช้งบสูงสุด");
      lines.push(
        table(data.top_departments.slice(0, 5), [
          { key: "department_name", label: "แผนก" },
          { key: "division_name", label: "ฝ่าย" },
          { key: "total_pages", label: "แผ่น", format: count },
          { key: "total_cost", label: "ค่าใช้จ่าย", format: baht },
        ])
      );
    }

    return text(lines.join("\n"));
  }
);

// ============================================================
// เครื่องมือที่ 2 — ค้นหาเครื่องในทะเบียน
// ============================================================

server.registerTool(
  "find_devices",
  {
    title: "ค้นหาเครื่องในทะเบียนทรัพย์สิน",
    description:
      "ค้นหาเครื่องพิมพ์/เครื่องถ่ายเอกสารจากหมายเลขเครื่อง รุ่น ยี่ห้อ หรือที่ตั้ง " +
      "กรองตามสถานะหรือเลือกเฉพาะเครื่องที่ยังไม่ผูกสัญญาได้ " +
      "ใช้ตอบคำถามเช่น 'เครื่อง Canon มีกี่เครื่อง' หรือ 'เครื่องที่ยังไม่มีสัญญาอยู่ตึกไหน'",
    inputSchema: {
      query: z.string().optional().describe("คำค้น — ค้นในหมายเลขเครื่อง รุ่น ยี่ห้อ และที่ตั้งพร้อมกัน"),
      status: z.enum(["active", "repair", "retired"]).optional().describe("สถานะเครื่อง"),
      unassigned: z.boolean().optional().describe("true = เฉพาะเครื่องที่ยังไม่ผูกสัญญา"),
      limit: z.number().int().min(1).max(100).default(25).describe("จำนวนรายการสูงสุด"),
    },
  },
  async ({ query, status, unassigned, limit }) => {
    const rows = await apiGet("/devices", { q: query, status, unassigned, per_page: limit });

    if (!rows.length) return text("ไม่พบเครื่องที่ตรงกับเงื่อนไข");

    return text(
      `พบ ${rows.length} เครื่อง (แสดงสูงสุด ${limit})\n\n` +
        table(rows, [
          { key: "serial_number", label: "หมายเลขเครื่อง" },
          { key: "brand_name", label: "ยี่ห้อ" },
          { key: "model", label: "รุ่น" },
          { key: "building_name", label: "อาคาร" },
          { key: "department_name", label: "แผนก" },
          { key: "contract_no", label: "สัญญา", format: (value) => value || "ยังไม่ผูกสัญญา" },
          { key: "status", label: "สถานะ" },
        ])
    );
  }
);

// ============================================================
// เครื่องมือที่ 3 — ค่าใช้จ่ายแยกตามฝ่าย/แผนก พร้อมแนวโน้ม
// ============================================================

server.registerTool(
  "department_usage",
  {
    title: "ยอดพิมพ์และค่าใช้จ่ายแยกตามฝ่าย/แผนก",
    description:
      "สรุปตามผังองค์กร ฝ่าย → แผนก พร้อมเปรียบเทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน " +
      "ใช้ตอบคำถามเช่น 'แผนกไหนใช้เพิ่มขึ้นมากที่สุด' หรือ 'ฝ่ายการพยาบาลใช้ไปเท่าไหร่'",
    inputSchema: {
      fiscal_year: z.string().optional().describe("ปีงบประมาณเป็น พ.ศ. เช่น '2568'"),
      months: z.string().optional().describe("เดือนที่ต้องการเทียบ คั่นด้วย comma เช่น '2568-10,2568-11,2568-12'"),
      sort_by: z
        .enum(["cost", "change"])
        .default("cost")
        .describe("cost = เรียงตามค่าใช้จ่าย | change = เรียงตามการเปลี่ยนแปลงจากช่วงก่อน"),
    },
  },
  async ({ fiscal_year, months, sort_by }) => {
    const fy = await resolveFiscalYear(fiscal_year);
    const data = await apiGet("/dashboard/by-department", { fiscal_year_id: fy.id, month: months });

    const departments = data.divisions.flatMap((division) =>
      division.departments.map((department) => ({ ...department, division_name: division.name }))
    );

    if (sort_by === "change") {
      // แผนกที่ไม่มีข้อมูลให้เทียบ (change_percent เป็น null) ไปอยู่ท้ายสุดเสมอ
      // ไม่ใช่ปนอยู่กลางรายการเหมือนมีค่าเป็น 0
      departments.sort((a, b) => (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity));
    }

    const compared = data.previous_month
      ? `เทียบกับ ${data.previous_month.split(",").map((m) => formatMonthTH(m)).join(", ")}`
      : "ไม่ได้เลือกช่วงเวลาจึงไม่มีการเทียบ";

    return text(
      `## ยอดพิมพ์แยกตามแผนก — ปีงบ ${fy.year}\n${compared}\n\n` +
        table(departments.slice(0, 20), [
          // ผลจาก /dashboard/by-department ใช้คีย์ "name" (มาจากตาราง department
          // ตรงๆ) ไม่ใช่ "department_name" แบบที่ /dashboard/highlights ใช้
          { key: "name", label: "แผนก" },
          { key: "division_name", label: "ฝ่าย" },
          { key: "device_count", label: "เครื่อง", format: count },
          { key: "total_pages", label: "แผ่น", format: count },
          { key: "total_cost", label: "ค่าใช้จ่าย", format: baht },
          {
            key: "change_percent",
            label: "เทียบช่วงก่อน",
            format: (value) => (value === null || value === undefined ? "-" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`),
          },
        ])
    );
  }
);

// ============================================================
// เครื่องมือที่ 4 — งานกรอกยอดพิมพ์ที่ยังค้าง
// ============================================================

server.registerTool(
  "missing_readings",
  {
    title: "เดือนที่ยังกรอกยอดพิมพ์ไม่ครบ",
    description:
      "บอกว่าปีงบนี้กรอกยอดมิเตอร์ไปถึงไหนแล้ว เดือนไหนยังขาดและขาดกี่เครื่อง " +
      "ใช้ตอบคำถามเช่น 'ยังมีเดือนไหนที่ยังไม่ได้กรอก' หรือ 'กรอกครบหรือยัง'",
    inputSchema: {
      fiscal_year: z.string().optional().describe("ปีงบประมาณเป็น พ.ศ. เช่น '2568'"),
    },
  },
  async ({ fiscal_year }) => {
    const fy = await resolveFiscalYear(fiscal_year);
    const data = await apiGet("/print-transactions/coverage", { fiscal_year_id: fy.id });

    // เดือนที่ยังไม่จบไม่ใช่ "งานค้าง" — มิเตอร์ปิดยอดได้ก็ต่อเมื่อเดือนจบแล้ว
    // ต้องตัดออกให้ตรงกับที่แดชบอร์ดนับ ไม่งั้นเครื่องมือนี้กับหน้าเว็บจะตอบคนละเลข
    const overdue = data.months.filter((month) => !month.complete && !month.in_progress);
    const inProgress = data.months.filter((month) => month.in_progress && !month.complete);

    if (!overdue.length) {
      return text(`ปีงบ ${fy.year}: ไม่มีเดือนที่ค้าง กรอกครบทุกเดือนที่จบไปแล้ว (${count(data.total_devices)} เครื่องที่ใช้งานอยู่)` +
        (inProgress.length
          ? `
เดือนที่ยังไม่ถึงกำหนดกรอก: ${inProgress.map((m) => formatMonthTH(m.month)).join(", ")}`
          : ""));
    }

    return text(
      `## ปีงบ ${fy.year} — ยังกรอกไม่ครบ ${overdue.length} เดือน\n` +
        `เครื่องที่ต้องกรอกทั้งหมด ${count(data.total_devices)} เครื่อง\n\n` +
        table(overdue, [
          { key: "month", label: "เดือน", format: (value) => formatMonthTH(value, { long: true }) },
          { key: "filled", label: "กรอกแล้ว", format: count },
          { key: "total", label: "ทั้งหมด", format: count },
          { key: "filled", label: "ขาดอีก", format: (value, row) => count(row.total - value) },
        ])
    );
  }
);

// ============================================================
// เครื่องมือที่ 5 — สรุปตามสัญญา
// ============================================================

server.registerTool(
  "contract_summary",
  {
    title: "สรุปการใช้งานและค่าใช้จ่ายแยกตามสัญญา",
    description:
      "แจกแจงว่าแต่ละสัญญามีเครื่องกี่เครื่อง ใช้ไปกี่แผ่น และคิดเป็นเงินเท่าไหร่ในปีงบที่ระบุ " +
      "ใช้ตอบคำถามเช่น 'สัญญาไหนใช้งบมากที่สุด' หรือ 'สัญญานี้คุ้มไหม'",
    inputSchema: {
      fiscal_year: z.string().optional().describe("ปีงบประมาณเป็น พ.ศ. เช่น '2568'"),
    },
  },
  async ({ fiscal_year }) => {
    const fy = await resolveFiscalYear(fiscal_year);
    const data = await apiGet(`/expense/${fy.id}`);

    const lines = [
      `## ค่าใช้จ่ายแยกตามสัญญา — ปีงบ ${fy.year}`,
      `ยอดรวมทั้งหมด: ${baht(data.total_cost)}`,
      "",
      table(data.contracts, [
        { key: "contract_no", label: "เลขที่สัญญา" },
        { key: "price_per_page", label: "ราคา/แผ่น", format: (value) => (value === null ? "ยังไม่กำหนด" : baht(value)) },
        { key: "device_count", label: "เครื่อง", format: count },
        { key: "total_pages", label: "แผ่น", format: count },
        { key: "total_cost", label: "ค่าใช้จ่าย", format: baht },
      ]),
    ];

    // เครื่องที่ไม่ผูกสัญญาคือเงินที่หายไปจากรายงานนี้ทั้งก้อน ต้องบอกไว้ทุกครั้ง
    // ไม่งั้นยอดรวมด้านบนจะถูกเข้าใจว่าเป็นค่าใช้จ่ายทั้งหมดของโรงพยาบาล
    const unassigned = await apiGet("/expense/unassigned-devices");
    if (unassigned.devices.length) {
      lines.push(
        "",
        `⚠️ มีอีก ${count(unassigned.devices.length)} เครื่องที่ยังไม่ผูกกับสัญญาใด ` +
          `(คิดเป็น ${baht(unassigned.total_cost)} จากราคาเฉพาะเครื่องที่กรอกไว้) ` +
          "ยอดเหล่านี้ไม่ได้รวมอยู่ในตารางด้านบน"
      );
    }

    return text(lines.join("\n"));
  }
);

// ============================================================
// เริ่มทำงาน
// ============================================================

async function main() {
  // ล้มเร็วพร้อมข้อความที่บอกสาเหตุ ดีกว่าให้ผู้ใช้เจอ "เครื่องมือใช้ไม่ได้" ลอยๆ
  // ตอนถามคำถามแรก แล้วไม่รู้ว่าต้องไปแก้ตรงไหน
  try {
    await checkApi();
  } catch (err) {
    process.stderr.write(
      `[suth-mcp] ต่อ API ที่ ${BASE_URL} ไม่ได้: ${err.message}\n` +
        "ตรวจว่า API ทำงานอยู่ และตั้งค่า SUTH_API_URL ถูกต้องแล้ว\n"
    );
    process.exit(1);
  }

  // stdio คือช่องทางมาตรฐานของ MCP บนเครื่องเดียวกัน — ห้ามเขียนอะไรลง stdout
  // นอกจากข้อความของโปรโตคอล ข้อความสำหรับคนต้องออก stderr เท่านั้น
  await server.connect(new StdioServerTransport());
  process.stderr.write(`[suth-mcp] พร้อมใช้งาน เชื่อมกับ ${BASE_URL}\n`);
}

main().catch((err) => {
  process.stderr.write(`[suth-mcp] เริ่มไม่สำเร็จ: ${err.message}\n`);
  process.exit(1);
});
