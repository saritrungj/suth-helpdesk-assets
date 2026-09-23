// @vitest-environment jsdom
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
 * แบบที่สามคือคำพูดคู่ที่ถูก escape เป็น HTML entity ซึ่งเกิดขึ้นเองเมื่อเขียน
 * attribute ที่ผูกค่าแล้วข้อความข้างในต้องใช้คำพูดคู่ รูปแบบนี้เคยหลุดทั้งหมด
 * เช่นกัน และหลุดแบบที่ตัวตรวจยัง "ผ่าน" อยู่ ซึ่งอันตรายกว่าไม่มีตัวตรวจเลย —
 * เทสสีเขียวคือคำสัญญาว่าตรวจครบแล้ว
 *
 * (เลี่ยงการเขียนตัวอย่างการเรียกจริงไว้ในคอมเมนต์นี้ เพราะตัวตรวจอ่านไฟล์ตัวเอง
 * ด้วย แล้วจะนับตัวอย่างในคอมเมนต์เป็นข้อความที่ต้องแปล)
 */
const TRANSLATION_CALLS = [
  /\bt\(\s*("(?:[^"\\]|\\.)*")/g,
  /\bt\(\s*('(?:[^'\\]|\\.)*')/g,
  /\bt\(\s*(&quot;(?:(?!&quot;).)*&quot;)/g,
];

/** อ่านค่า string literal ของ JavaScript ทั้งแบบ " และ ' ให้เป็นข้อความจริง */
function literalValue(text) {
  if (text.startsWith("&quot;")) {
    const decoder = document.createElement("textarea");
    decoder.innerHTML = text;
    text = decoder.value;
  }
  return text.startsWith("'")
    ? text.slice(1, -1).replace(/\\(['\\])/g, "$1")
    : JSON.parse(text);
}

test("translation scanner decodes entity-escaped template literals", () => {
  const source = 't' + '(&quot;Say \\"hello\\" &amp; goodbye&quot;)';
  const matches = [...source.matchAll(TRANSLATION_CALLS[2])];
  expect(matches).toHaveLength(1);
  expect(literalValue(matches[0][1])).toBe('Say "hello" & goodbye');
});

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

// คำแปลของหน้าที่ถูกลบไปแล้วค้างอยู่เงียบๆ (#192 พบ 175 รายการ) — คำแปลต้องมีที่ใช้จริงในซอร์ส
// ข้อความภาษาไทยมาได้จากเว็บ ข้อความ error ของ API ค่าจาก packages/domain และข้อมูลตั้งต้นใน database/
test("every English entry is still used somewhere in the source", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const roots = ["apps/web/src", "apps/api/src", "apps/api/index.js", "packages/domain", "database"].map((p) => join(repoRoot, p));
  const chunks = [];
  function collect(path) {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      chunks.push(readFileSync(path, "utf8"));
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "locales") continue;
      const file = join(path, entry.name);
      if (entry.isDirectory()) collect(file);
      else if ([".js", ".cjs", ".mjs", ".vue", ".sql"].includes(extname(entry.name)) && !/\.(test|spec)\.[cm]?js$/.test(entry.name)) {
        chunks.push(readFileSync(file, "utf8").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      }
    }
  }
  roots.forEach(collect);
  const source = chunks.join("\n");
  const forms = (key) => [key, JSON.stringify(key).slice(1, -1), key.replace(/"/g, '\\"'), key.replace(/'/g, "\'")];
  const unused = Object.keys(english).filter((key) => !forms(key).some((form) => source.includes(form)));
  expect(unused).toEqual([]);
});
