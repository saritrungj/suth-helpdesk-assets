import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ยามกันก้อน xlsx หลุดกลับเข้า chunk ที่โหลดตั้งแต่เปิดเว็บ
 *
 * `import * as XLSX from "xlsx"` ที่หัวไฟล์ไหนก็ตาม จะทำให้ Vite รวมไลบรารี
 * ~490 kB เข้ากับ chunk ของไฟล์นั้น ซึ่งเคยทำให้ทุกหน้าที่มีตารางต้องโหลด
 * ไปด้วยทั้งที่ผู้ใช้ไม่ได้กดส่งออก (issue #30)
 *
 * เทสนี้อ่านซอร์สจริง ไม่ได้อ่านผล build — จับได้ตั้งแต่ตอนเขียนโค้ด
 */
const SRC = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function sourceFiles(dir) {
  const found = [];

  for (const name of readdirSync(dir)) {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }

    if (/\.(vue|js)$/.test(name) && !name.endsWith(".test.js")) found.push(path);
  }

  return found;
}

describe("การส่งออก Excel ต้องโหลดไลบรารีตอนกดปุ่มเท่านั้น", () => {
  test("ห้ามมีไฟล์ไหน import xlyx แบบ static นอกจาก lib/export-xlsx.js", () => {
    const offenders = sourceFiles(SRC).filter((path) => {
      if (path.endsWith("export-xlsx.js")) return false;
      return /^\s*import[^\n]*["']xlsx["']/m.test(readFileSync(path, "utf8"));
    });

    expect(offenders).toEqual([]);
  });

  test("ตัว helper เองต้องใช้ dynamic import", () => {
    const source = readFileSync(join(SRC, "lib", "export-xlsx.js"), "utf8");

    expect(source).toMatch(/await import\(["']xlsx["']\)/);
    expect(source).not.toMatch(/^\s*import .* from ["']xlsx["']/m);
  });
});
