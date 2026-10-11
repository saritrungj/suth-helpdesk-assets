import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * กวาดข้อความของหน้านำเข้าไฟล์ว่าไม่ใช้คำที่ docs/reference/ui-words.md ระบุว่า "ไม่ใช้" (#330)
 *
 * ข้อความที่ผู้ใช้เห็นมาจากสองที่: component ฝั่งเว็บ และหัวรายการตรวจ/คำเตือนที่ API ส่งมาให้หน้านั้นแสดงตรงๆ
 * (apps/api/src/import) เทสนี้อ่านไฟล์ทั้งสองฝั่งอย่างเดียว ไม่ import โค้ดข้าม workspace
 *
 * ตรวจเฉพาะบรรทัดที่ไม่ใช่คอมเมนต์ — คอมเมนต์เป็นภาษาของนักพัฒนา และ ADR/คำศัพท์โดเมนยังใช้ "ยอด" ได้
 * เทสนี้ไม่ตัดสินความหมาย ถ้าต้องการคำใหม่ให้เพิ่มแถวใน ui-words.md ก่อนแล้วแก้รายการด้านล่างนี้
 */

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = join(here, "../..");
const apiImport = join(here, "../../../../api/src/import");

/** คำจากคอลัมน์ "ไม่ใช้" ของ ui-words.md ที่ปรากฏในหน้านำเข้า พร้อมคำที่ต้องใช้แทน */
const FORBIDDEN = [
  { pattern: /ยอด/, use: "จำนวนพิมพ์ / ตัวเลข / เลขมิเตอร์ / เงินตามใบแจ้งหนี้ (ตามความหมาย)" },
  { pattern: /เขียนทับ/, use: "แทนที่" },
];

function files(directory, accept) {
  return readdirSync(directory)
    .filter((name) => accept.test(name) && !/\.(test|spec)\./.test(name))
    .map((name) => join(directory, name));
}

const SOURCES = [
  ...files(join(webSrc, "components/import"), /\.(vue|js)$/),
  ...files(join(webSrc, "views/admin"), /^ImportSessions?\.vue$/),
  join(webSrc, "components/device-import.js"),
  join(webSrc, "components/print-usage-import.js"),
  join(webSrc, "components/audit-log.js"),
  ...files(apiImport, /\.js$/),
];

/** ตัดคอมเมนต์ block, HTML และท้ายบรรทัดออก เหลือเฉพาะโค้ดและข้อความที่ผู้ใช้เห็น */
function withoutComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line.replace(/\s\/\/\s.*$/, "")));
}

test("หน้านำเข้าไฟล์ไม่ใช้คำที่ ui-words.md ระบุว่าไม่ใช้", () => {
  const found = [];
  for (const file of SOURCES) {
    withoutComments(readFileSync(file, "utf8")).forEach((line, index) => {
      for (const { pattern, use } of FORBIDDEN) {
        if (pattern.test(line)) found.push(`${basename(file)}:${index + 1} ใช้ "${line.match(pattern)[0]}" — ใช้ ${use} แทน: ${line.trim().slice(0, 110)}`);
      }
    });
  }
  expect(found).toEqual([]);
});

test("เทสกวาดคำเห็นไฟล์ที่ต้องตรวจครบ (กันรายการไฟล์หลุดเงียบๆ)", () => {
  const names = SOURCES.map((file) => basename(file));
  for (const expected of ["ImportPreview.vue", "ImportReadings.vue", "ImportSession.vue", "session-service.js", "auto-resolve.js", "registry-plan.js"]) {
    expect(names, expected).toContain(expected);
  }
});
