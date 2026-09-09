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
      for (const match of source.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")/g)) {
        const key = JSON.parse(match[1]);
        if (!(key in english)) missing.add(key);
      }
    }
  }

  scan(sourceRoot);
  expect([...missing].sort()).toEqual([]);
});
