const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { findProblems, relativeLinks, schemaObjects, collectDocs } = require("./check-docs.cjs");

const SCHEMA = `
CREATE TABLE devices (
    id INT PRIMARY KEY,
    CONSTRAINT chk_devices_order CHECK (id > 0)
);
CREATE OR REPLACE VIEW v_monthly_kpi AS SELECT 1;
`;

const DATA_MODEL = { file: "docs/reference/data-model.md", text: "ตาราง `devices` และ view `v_monthly_kpi` กันด้วย `chk_devices_order`" };

/** รันตัวตรวจกับเอกสารชุดเล็ก โดยถือว่ามีเฉพาะไฟล์ใน existing */
function problemsOf(docs, existing = []) {
  const known = new Set([...docs.map((doc) => doc.file), ...existing]);
  return findProblems({ docs, schemaSql: SCHEMA, exists: (file) => known.has(file) });
}

test("เอกสารที่ตรงกับ schema และลิงก์ครบ ผ่านโดยไม่มีปัญหา", () => {
  const docs = [DATA_MODEL, { file: "docs/README.md", text: "ดู [โมเดลข้อมูล](reference/data-model.md#view) และ [เว็บ](https://example.com)" }];
  assert.deepEqual(problemsOf(docs), []);
});

test("ลิงก์ที่ชี้ไฟล์ซึ่งไม่มีแล้วถูกรายงานพร้อมไฟล์ต้นทาง", () => {
  const docs = [DATA_MODEL, { file: "docs/how-to/a.md", text: "ดู [เก่า](../explanation/gone.md)" }];
  assert.deepEqual(problemsOf(docs), ["docs/how-to/a.md: ลิงก์ชี้ไฟล์ที่ไม่มี — ../explanation/gone.md"]);
});

test("ลิงก์คิดจากโฟลเดอร์ของไฟล์ต้นทาง และชี้โฟลเดอร์ได้", () => {
  const docs = [DATA_MODEL, { file: "docs/explanation/a.md", text: "[โค้ด](../../apps/api/src/) [ADR](../decisions/0001-x.md)" }];
  assert.deepEqual(problemsOf(docs, ["apps/api/src/", "docs/decisions/0001-x.md"]), []);
});

test("ข้อความในบล็อกโค้ดไม่นับเป็นลิงก์", () => {
  const text = "```text\n[ตัวอย่าง](missing.md)\n```\nและ `[อีกอัน](missing-too.md)`";
  assert.deepEqual(relativeLinks(text), []);
});

test("ตารางหรือ view ใน schema ที่ data-model.md ไม่ได้เอ่ยถึงถูกรายงาน", () => {
  const docs = [{ file: "docs/reference/data-model.md", text: "มีแค่ `devices`" }];
  assert.deepEqual(problemsOf(docs), ["docs/reference/data-model.md: ไม่มี v_monthly_kpi ที่อยู่ใน schema.sql"]);
});

test("อ่านทั้ง CREATE TABLE และ CREATE OR REPLACE VIEW", () => {
  assert.deepEqual(schemaObjects(SCHEMA), ["devices", "v_monthly_kpi"]);
});

test("ชื่อ constraint ที่ไม่มีใน schema ถูกรายงาน แต่การอ้างทั้งกลุ่มด้วย _* ไม่ถูกนับ", () => {
  const docs = [DATA_MODEL, { file: "docs/reference/x.md", text: "`CHECK chk_devices_old_name` และกลุ่ม `chk_devices_`*" }];
  assert.deepEqual(problemsOf(docs), ["docs/reference/x.md: อ้าง constraint ที่ไม่มีใน schema.sql — chk_devices_old_name"]);
});

test("คำที่เลิกใช้ถูกจับในหน้าอธิบายกฎ แต่ไม่จับใน ADR ซึ่งเป็นบันทึก ณ วันตัดสิน", () => {
  const docs = [
    DATA_MODEL,
    { file: "docs/explanation/domain.md", text: "รวมหน้าสุทธิของรายการราคา" },
    { file: "docs/decisions/0017-x.md", text: "จำนวนหน้าสุทธิเท่ากับ 0.98" },
  ];
  assert.deepEqual(problemsOf(docs), ['docs/explanation/domain.md: ใช้คำที่ CONTEXT.md ให้เลิกใช้ — "หน้าสุทธิ"']);
});

test("ไม่มี data-model.md ถือเป็นปัญหา ไม่ใช่ผ่านเงียบๆ", () => {
  assert.deepEqual(problemsOf([{ file: "docs/README.md", text: "ว่าง" }]), ["docs/reference/data-model.md: ไม่พบไฟล์"]);
});

/** Filesystem จำลอง: ไม่สร้างไฟล์หรือ symlink บนเครื่องที่รัน tests */
function documentFilesystem(files, symlinks = [], directories = ["docs"]) {
  const root = path.resolve("virtual-context-repo");
  const entries = new Map([["", { type: "directory" }]]);
  const add = (file, entry) => {
    let parent = path.posix.dirname(file);
    while (parent !== ".") {
      if (!entries.has(parent)) entries.set(parent, { type: "directory" });
      parent = path.posix.dirname(parent);
    }
    entries.set(file, entry);
  };
  for (const dir of directories) add(dir, { type: "directory" });
  for (const [file, text] of Object.entries(files)) add(file, { type: "file", text });
  for (const { file, directory = false } of symlinks) {
    add(file, { type: directory ? "symlink-directory" : "symlink-file", text: "outside repository" });
  }
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const metadata = (entry) => ({
    isDirectory: () => entry.type === "directory" || entry.type === "symlink-directory",
    isFile: () => entry.type === "file",
    isSymbolicLink: () => entry.type.startsWith("symlink"),
  });
  const reads = [];
  const io = {
    existsSync: (file) => entries.has(relative(file)),
    lstatSync: (file) => {
      const entry = entries.get(relative(file));
      if (!entry) throw new Error(`ENOENT: ${file}`);
      return metadata(entry);
    },
    readdirSync: (dir, options = {}) => {
      const directory = relative(dir);
      if (!entries.has(directory)) throw new Error(`ENOENT: ${dir}`);
      const children = [...entries].filter(([file]) => file && path.posix.dirname(file) === (directory || "."));
      return children.map(([file, entry]) => options.withFileTypes
        ? { name: path.posix.basename(file), ...metadata(entry) }
        : path.posix.basename(file));
    },
    readFileSync: (file) => {
      const key = relative(file);
      const entry = entries.get(key);
      if (!entry || entry.text === undefined) throw new Error(`EISDIR or ENOENT: ${file}`);
      reads.push(key);
      return entry.text;
    },
  };
  return { root, io, reads };
}

test("collection อ่าน agent, nested skill, references และ brand แล้วรายงานลิงก์เสีย", () => {
  const files = {
    "AGENTS.md": "root instructions",
    "docs/reference/data-model.md": DATA_MODEL.text,
    ".agents/skills/finish/SKILL.md": "[reference](references/evidence.md)",
    ".agents/skills/finish/references/evidence.md": "reference",
    ".claude/agents/reviewer.md": "[missing](gone.md)",
    "apps/api/.claude/skills/api/SKILL.md": "api skill",
    "apps/web/.claude/skills/run/SKILL.md": "[missing](references/gone.md)",
    "brand/README.md": "brand history",
    "node_modules/unrelated/README.md": "[outside scope](gone.md)",
    "apps/web/.claude/skills/run/driver.mjs": "not markdown",
  };
  const { root, io } = documentFilesystem(files);
  const docs = collectDocs(root, io);
  assert.deepEqual(docs.map((doc) => doc.file), Object.keys(files).filter((file) => file.endsWith(".md") && !file.startsWith("node_modules/")).sort());
  assert.deepEqual(findProblems({ docs, schemaSql: SCHEMA, exists: (file) => io.existsSync(path.join(root, file)) }), [
    ".claude/agents/reviewer.md: ลิงก์ชี้ไฟล์ที่ไม่มี — gone.md",
    "apps/web/.claude/skills/run/SKILL.md: ลิงก์ชี้ไฟล์ที่ไม่มี — references/gone.md",
  ]);
});

test("collection ทำงานเมื่อไม่มี optional directories และอ่านเนื้อหา root/docs ตามเดิม", () => {
  const files = { "AGENTS.md": "instructions", "docs/README.md": "navigation" };
  const { root, io } = documentFilesystem(files);
  assert.deepEqual(collectDocs(root, io), Object.entries(files).map(([file, text]) => ({ file, text })));
});

test("collection ไม่อ่าน symlink Markdown ที่รากหรือใน docs และไม่เดิน symlink directory", () => {
  const { root, io, reads } = documentFilesystem({
    "AGENTS.md": "instructions",
    "docs/README.md": "navigation",
    "docs/external/secret.md": "must not read",
    ".agents/linked/secret.md": "must not read",
  }, [
    { file: "linked.md" },
    { file: "docs/linked.md" },
    { file: "docs/external", directory: true },
    { file: ".agents/linked", directory: true },
  ]);
  assert.deepEqual(collectDocs(root, io).map((doc) => doc.file), ["AGENTS.md", "docs/README.md"]);
  assert.deepEqual(reads, ["AGENTS.md", "docs/README.md"]);
});

test("collection ไม่ตาม symlink ที่ optional root หรือ ancestor ของ nested optional root", () => {
  const { root, io, reads } = documentFilesystem({
    "docs/README.md": "navigation",
    ".claude/agents/reviewer.md": "must not read",
    "apps/web/.claude/skills/run/SKILL.md": "must not read",
  }, [{ file: ".claude", directory: true }, { file: "apps", directory: true }]);
  assert.deepEqual(collectDocs(root, io), [{ file: "docs/README.md", text: "navigation" }]);
  assert.deepEqual(reads, ["docs/README.md"]);
});

test("collection ไม่ยอมรับ docs ที่หายหรือเป็น symlink แทน required directory", () => {
  const missing = documentFilesystem({ "AGENTS.md": "instructions" }, [], []);
  assert.throws(() => collectDocs(missing.root, missing.io), /docs/);
  const linked = documentFilesystem({ "docs/README.md": "must not read" }, [{ file: "docs", directory: true }]);
  assert.throws(() => collectDocs(linked.root, linked.io), /docs/);
  assert.deepEqual(linked.reads, []);
});
