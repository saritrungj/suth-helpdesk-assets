// apps/mcp/test/tools.test.js
//
// เทสของเซิร์ฟเวอร์ MCP — เชื่อมผ่านโปรโตคอลจริง ไม่ใช่เรียกฟังก์ชันตรงๆ
//
// ทำไมต้องผ่านโปรโตคอล: สิ่งที่พังได้จริงในเซิร์ฟเวอร์ MCP ส่วนใหญ่ไม่ใช่ตรรกะ
// ภายในเครื่องมือ แต่เป็นการประกาศ schema ที่ผิด การเขียนข้อความลง stdout จน
// โปรโตคอลเสีย หรือการห่อคำตอบผิดรูปแบบ — ทั้งหมดนี้เรียกฟังก์ชันตรงๆ ไม่มีทางเจอ
//
// ต้องมี API ทำงานอยู่จริง ถ้าไม่มีจะ **ข้าม** ไม่ใช่ล้มเหลว เพราะเทสชุดนี้เป็น
// การตรวจการเชื่อมต่อ ไม่ใช่เทสหน่วย และไม่ควรทำให้ `npm test` ที่รากพังเวลาคน
// รันโดยไม่ได้เปิดฐานข้อมูล
//
// รัน: npm test --workspace @suth/mcp

import test from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BASE_URL = (process.env.SUTH_API_URL || "http://localhost:3000/api").replace(/\/$/, "");

/** เครื่องมือทุกตัวที่เซิร์ฟเวอร์ต้องประกาศ — เพิ่มตัวใหม่แล้วต้องมาเพิ่มที่นี่ด้วย */
const EXPECTED_TOOLS = [
  "get_overview",
  "find_devices",
  "department_usage",
  "missing_readings",
  "contract_summary",
];

/**
 * API พร้อมใช้งานและมีบัญชีให้เข้าถึงหรือไม่
 * @returns {Promise<string|null>} เหตุผลที่ข้าม หรือ null ถ้ารันได้
 */
async function reasonToSkip() {
  if (!process.env.SUTH_API_TOKEN && !(process.env.SUTH_API_USERNAME && process.env.SUTH_API_PASSWORD)) {
    return "ยังไม่ได้ตั้งค่าบัญชี (SUTH_API_TOKEN หรือ SUTH_API_USERNAME/PASSWORD)";
  }

  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return `API ที่ ${BASE_URL} ตอบสถานะ ${response.status}`;
  } catch {
    return `ต่อ API ที่ ${BASE_URL} ไม่ได้`;
  }

  return null;
}

/** เปิดการเชื่อมต่อไปยังเซิร์ฟเวอร์ แล้วปิดให้เองเมื่อจบ */
async function withClient(work) {
  const client = new Client({ name: "suth-mcp-test", version: "1.0.0" });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../index.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
    env: { ...process.env },
  });

  await client.connect(transport);

  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

const skip = await reasonToSkip();

test("เซิร์ฟเวอร์ MCP", { skip: skip ? `ข้าม: ${skip}` : false }, async (t) => {
  await withClient(async (client) => {
    await t.test("ประกาศเครื่องมือครบทุกตัว", async () => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name).sort();

      assert.deepEqual(names, [...EXPECTED_TOOLS].sort());
    });

    await t.test("ทุกเครื่องมือมีคำอธิบายที่บอกว่าใช้ตอบคำถามแบบไหน", async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        // คำอธิบายคือสิ่งเดียวที่โมเดลใช้ตัดสินว่าจะเรียกเครื่องมือไหน คำอธิบาย
        // สั้นๆ อย่าง "ดึงข้อมูลเครื่อง" ทำให้โมเดลเดาผิดและเรียกเครื่องมือผิดตัว
        assert.ok(tool.description?.length > 40, `${tool.name} มีคำอธิบายสั้นเกินไป`);
      }
    });

    await t.test("ไม่มีเครื่องมือที่เขียนข้อมูล (ADR-0011)", async () => {
      const { tools } = await client.listTools();

      // ข้อจำกัดนี้คือสาระสำคัญของการตัดสินใจ ไม่ใช่รายละเอียดการติดตั้ง —
      // ถ้าวันหลังมีคนเพิ่มเครื่องมือที่เขียนข้อมูล ต้องสะดุดที่เทสนี้ก่อน
      // แล้วกลับไปแก้ ADR พร้อมเหตุผล ไม่ใช่เพิ่มเงียบๆ
      const writeVerbs = ["create", "update", "delete", "save", "set", "add", "remove", "import"];

      for (const tool of tools) {
        const looksLikeWrite = writeVerbs.some((verb) => tool.name.startsWith(`${verb}_`));
        assert.equal(looksLikeWrite, false, `${tool.name} ดูเหมือนเครื่องมือที่เขียนข้อมูล`);
      }
    });

    await t.test("get_overview ตอบเป็นข้อความที่มีหน่วยกำกับ", async () => {
      const result = await client.callTool({ name: "get_overview", arguments: {} });
      const text = result.content[0].text;

      assert.equal(result.isError, undefined, text);
      assert.match(text, /ยอดพิมพ์รวม/);
      // ตัวเลขเงินต้องมีหน่วยกำกับเสมอ ไม่งั้นโมเดลเดาไม่ออกว่าเป็นบาทหรือแผ่น
      assert.match(text, /บาท/);
    });

    await t.test("missing_readings ตอบเรื่องความครบถ้วนของการกรอก", async () => {
      const result = await client.callTool({ name: "missing_readings", arguments: {} });
      const text = result.content[0].text;

      assert.equal(result.isError, undefined, text);
      assert.match(text, /ปีงบ/);
    });

    await t.test("ปีงบที่ไม่มีอยู่ต้องได้ข้อความที่บอกว่ามีปีไหนบ้าง", async () => {
      const result = await client.callTool({
        name: "get_overview",
        arguments: { fiscal_year: "9999" },
      });

      // บอกทางออกเสมอ — "ไม่พบปีงบ 9999" เฉยๆ ทำให้โมเดลเดาต่อไปเรื่อยๆ
      // ส่วนการบอกว่ามีปีไหนบ้างทำให้มันถามใหม่ได้ถูกในครั้งเดียว
      assert.match(result.content[0].text, /ปีที่มีในระบบคือ/);
    });
  });
});
