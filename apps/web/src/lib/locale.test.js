import { afterEach, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { locale, t } from "./locale";
import english from "./locales/en.json";

afterEach(() => { locale.value = "th"; });

test("translation interpolates values without translating user data", () => {
  locale.value = "en";
  expect(t("สัญญา {0}", ["สัญญาต้นฉบับ"])).toBe("Contract สัญญาต้นฉบับ");
  locale.value = "th";
  expect(t("{0} เดือน", [6])).toBe("6 เดือน");
});

test("all translations preserve their interpolation placeholders", () => {
  for (const [source, translated] of Object.entries(english)) {
    expect(translated.trim(), source).not.toBe("");
    const placeholders = (value) => [...value.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
    expect(placeholders(translated), source).toEqual(placeholders(source));
  }
});

/**
 * รูปแบบการเรียก t() ที่นับว่าเป็นข้อความของแอป
 *
 * ต้องมีทั้งสองแบบ: โค้ดใน `<script setup>` ส่งข้อความในเครื่องหมายคำพูดคู่ ส่วน
 * attribute ใน template ที่ถูกครอบด้วยคำพูดคู่อยู่แล้ว ต้องใช้คำพูดเดี่ยวข้างใน
 *
 * ตอนที่ตัวตรวจจับแค่แบบคำพูดคู่ ข้อความใน attribute ทั้งหมดหลุดออกจากชุดตรวจ และ
 * ยังเป็นภาษาไทยในโหมดอังกฤษโดยไม่มีอะไรฟ้อง — ความผิดพลาดที่ไม่มีทางเห็นจนกว่า
 * จะมีคนสลับภาษาแล้วอ่านเจอเอง
 *
 * (เลี่ยงการเขียนตัวอย่างการเรียกจริงไว้ในคอมเมนต์นี้ เพราะตัวตรวจอ่านไฟล์ตัวเอง
 * ด้วย แล้วจะนับตัวอย่างในคอมเมนต์เป็นข้อความที่ต้องแปล)
 */
const TRANSLATION_CALLS = [
  /\bt\(\s*("(?:[^"\\]|\\.)*")/g,
  /\bt\(\s*('(?:[^'\\]|\\.)*')/g,
];

/** อ่านค่า string literal ของ JavaScript ทั้งแบบ " และ ' ให้เป็นข้อความจริง */
function literalValue(text) {
  return text.startsWith("'")
    ? text.slice(1, -1).replace(/\\(['\\])/g, "$1")
    : JSON.parse(text);
}

test("every literal translation used by the app has an English entry", () => {
  const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const missing = new Set();

  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(file);
        continue;
      }
      if (![".js", ".vue"].includes(extname(entry.name))) continue;

      const source = readFileSync(file, "utf8");
      for (const pattern of TRANSLATION_CALLS) {
        for (const match of source.matchAll(pattern)) {
          const key = literalValue(match[1]);
          if (!(key in english)) missing.add(key);
        }
      }
    }
  }

  scan(sourceRoot);
  expect([...missing].sort()).toEqual([]);
});
