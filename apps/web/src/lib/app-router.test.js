import { expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const asName = (file) => relative(SOURCE_ROOT, file).replaceAll("\\", "/");

/**
 * ตัดคอมเมนต์ออกก่อนค้น — เอกสารในโค้ดยกรูปแบบที่ห้ามใช้มาเป็นตัวอย่างได้
 *
 * ตัดเฉพาะบล็อกคอมเมนต์กับบรรทัดที่ขึ้นต้นด้วยเครื่องหมายคอมเมนต์ ไม่ไล่ตัดกลางบรรทัด
 * เพราะจะไปกิน URL ใน string แล้วซ่อน import จริงที่อยู่บรรทัดเดียวกันได้
 */
const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*)/.test(line))
  .join("\n");

/** เนื้อโค้ดที่รันจริง — ของ .vue เอาเฉพาะบล็อก script */
function moduleSource(file) {
  const raw = readFileSync(file, "utf8");
  const code = file.endsWith(".vue")
    ? [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join("\n")
    : raw;
  return withoutComments(code);
}

function sourceFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(file, found);
    else if ([".js", ".vue"].includes(extname(entry.name)) && !/\.(test|spec)\.js$/.test(entry.name)) found.push(file);
  }
  return found;
}

/** เฉพาะ static import — `import()` แบบ dynamic ตัดวงอยู่แล้วโดยธรรมชาติ */
const STATIC_IMPORT = /^\s*import\s[^;]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  return [base, `${base}.js`, `${base}.vue`, join(base, "index.js")]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function importGraph() {
  const graph = new Map();
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const deps = [];
    for (const match of moduleSource(file).matchAll(STATIC_IMPORT)) {
      const target = resolveSpec(file, match[1] ?? match[2]);
      if (target) deps.push(target);
    }
    graph.set(file, deps);
  }
  return graph;
}

/**
 * วง static import ทำให้ hot reload พังเป็น **จอขาว**
 *
 * วงที่เคยมีจริงคือ `services/api.js → router/index.js → views/Login.vue → services/api.js`
 * ตอนเปิดเว็บครั้งแรกมันรอดเพราะลำดับการรันลงตัวพอดี แต่ตอน Vite รันโมดูลในวงใหม่หลังมีคน
 * แก้ไฟล์ ลำดับเปลี่ยนได้ ถ้า `services/api.js` ถูกรันก่อนที่ `router/index.js` จะประกาศ
 * `const router` เสร็จ จะได้ `ReferenceError: Cannot access 'router' before initialization`
 * แล้วแอปไม่ mount ทั้งหน้า
 *
 * เดิมแก้ด้วยการเลื่อนจังหวะ (โหลดหน้าแบบ lazy, เลื่อน watch ไปเรียกจาก main.js) ซึ่งกันได้
 * แค่ตอนเปิดครั้งแรก วงยังอยู่ อาการจึงกลับมาทุกครั้งที่แก้โค้ดขณะเปิด dev server ค้างไว้
 * ตอนนี้ตัดวงด้วย `lib/app-router.js` ที่ไม่ import อะไรเลย เทสนี้เฝ้าไม่ให้วงกลับมา
 */
test("ไม่มีวง static import ใน apps/web/src", () => {
  const graph = importGraph();
  const cycles = new Set();
  const done = new Set();

  function walk(node, stack) {
    if (done.has(node)) return;
    const at = stack.indexOf(node);
    if (at >= 0) {
      cycles.add([...stack.slice(at), node].map(asName).join(" → "));
      return;
    }
    stack.push(node);
    for (const dep of graph.get(node) ?? []) walk(dep, stack);
    stack.pop();
    done.add(node);
  }

  for (const node of graph.keys()) walk(node, []);
  expect([...cycles]).toEqual([]);
});

/**
 * กฎที่อ่านง่ายกว่าเดิม และชี้ทางแก้ได้ตรงกว่าเมื่อมีคนเผลอสร้างวงขึ้นมาอีก
 *
 * โค้ดที่อยู่นอก component ต้องหยิบ router จาก `lib/app-router.js` ส่วน component ใช้
 * `useRouter()` ของ vue-router ตามปกติ
 */
test("มีแต่ main.js ที่ import โมดูล router ได้ — ที่เหลือใช้ lib/app-router.js", () => {
  const ROUTER_IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/(?:\.\.\/)*router)(?:\/index(?:\.js)?)?["']/g;
  const offenders = [];

  for (const file of sourceFiles(SOURCE_ROOT)) {
    const name = asName(file);
    if (name === "main.js" || name.startsWith("router/")) continue;
    for (const match of moduleSource(file).matchAll(ROUTER_IMPORT)) {
      if (resolve(dirname(file), match[1]) === join(SOURCE_ROOT, "router")) offenders.push(`${name} → ${match[1]}`);
    }
  }

  expect(offenders).toEqual([]);
});

test("lib/app-router.js ไม่ import อะไรเลย จึงอยู่ในวงกับใครไม่ได้", () => {
  expect(readFileSync(join(SOURCE_ROOT, "lib/app-router.js"), "utf8")).not.toMatch(/^\s*import\s/m);
});
