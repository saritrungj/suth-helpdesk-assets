const test = require("node:test");
const assert = require("node:assert");

const { rowFieldProblems, tooLong } = require("./row-rules");
const { MAX_LENGTH } = require("@suth/domain");

/*
 * เทสชุดนี้คุ้มกันบั๊ก #85 — ก่อนแก้ ไฟล์ที่มีเลขซีเรียลว่างและเลขซีเรียลยาว 150
 * ตัวอักษร ถูกบันทึกลงฐานข้อมูลทั้งคู่โดย API ตอบว่า "Import สำเร็จ" ตัวที่ยาวเกิน
 * ถูก MySQL ตัดเหลือ 100 ตัวอักษรเงียบๆ เพราะ sql_mode ไม่ได้เปิด STRICT_TRANS_TABLES
 */

test("แถวที่ครบถ้วนไม่มีเหตุผลให้ข้าม", () => {
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "PRN-OPD-001", model: "M404", location: "เคาน์เตอร์" }), []);
});

test("เลขซีเรียลว่างต้องถูกข้าม ไม่ใช่บันทึกเป็นเครื่องที่จับคู่ยอดไม่ได้ตลอดไป", () => {
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "" }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "   " }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({}), ["ไม่มีเลขซีเรียล"]);
});

test("เลขซีเรียลที่ยาวเกินขนาดคอลัมน์ต้องถูกปฏิเสธ ไม่ใช่ถูกตัดทิ้งเงียบๆ", () => {
  const serial = "P".repeat(MAX_LENGTH.serial_number + 1);
  const problems = rowFieldProblems({ serial_number: serial });

  assert.strictEqual(problems.length, 1);
  // เหตุผลต้องบอกความยาวจริงกับเพดาน ไม่ใช่แค่ "ยาวเกินไป" — คนแก้ไฟล์ต้องรู้ว่าต้องตัดเท่าไร
  assert.match(problems[0], new RegExp(`${serial.length}`));
  assert.match(problems[0], new RegExp(`${MAX_LENGTH.serial_number}`));
});

test("ความยาวพอดีเพดานยังผ่าน — เส้นแบ่งอยู่ที่ 'เกิน' ไม่ใช่ 'เท่ากับ'", () => {
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "P".repeat(MAX_LENGTH.serial_number) }), []);
});

test("ชื่อรุ่นและตำแหน่งที่ยาวเกินก็ถูกตัดเงียบได้เหมือนกัน จึงต้องดักด้วย", () => {
  const problems = rowFieldProblems({
    serial_number: "PRN-001",
    model: "M".repeat(MAX_LENGTH.model + 1),
    location: "ล".repeat(MAX_LENGTH.location + 1),
  });

  assert.strictEqual(problems.length, 2);
  assert.match(problems[0], /ชื่อรุ่น/);
  assert.match(problems[1], /ตำแหน่ง/);
});

test("ซีเรียลซ้ำในไฟล์เดียวกันรายงานรายแถว ไม่ปล่อยให้ทั้งไฟล์ล้มที่ UNIQUE KEY", () => {
  const seen = new Set(["PRN-OPD-001"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "PRN-OPD-001" }, seen), [
    "เลขซีเรียลนี้ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน",
  ]);
});

test("ฟังก์ชันไม่เพิ่มซีเรียลลง seenSerials เอง — ผู้เรียกเป็นคนตัดสินว่าแถวนี้นับหรือไม่", () => {
  const seen = new Set();
  rowFieldProblems({ serial_number: "PRN-OPD-001" }, seen);

  // ถ้าฟังก์ชันเพิ่มเอง แถวที่ถูกข้ามด้วยเหตุผลอื่น (เช่นหายี่ห้อไม่เจอ) จะไปกัน
  // แถวถัดไปที่มีซีเรียลเดียวกันและอาจจะถูกต้อง ให้ถูกข้ามตามไปด้วย
  assert.strictEqual(seen.size, 0);
});

test("เลขซีเรียลว่างที่ซ้ำกันหลายแถว รายงานว่า 'ไม่มีเลขซีเรียล' ทุกแถว ไม่ใช่ 'ซ้ำ'", () => {
  const seen = new Set([""]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "" }, seen), ["ไม่มีเลขซีเรียล"]);
});

test("tooLong คืนเพดานเมื่อเกิน และ null เมื่อไม่เกิน", () => {
  assert.strictEqual(tooLong("x".repeat(MAX_LENGTH.model + 1), "model"), MAX_LENGTH.model);
  assert.strictEqual(tooLong("x", "model"), null);
  // ช่องที่ไม่มีเพดานกำหนดไว้ ต้องไม่ถูกปฏิเสธเพราะเดาเอง
  assert.strictEqual(tooLong("x".repeat(9999), "ช่องที่ไม่มีในตาราง"), null);
});

/*
 * เทสชุดนี้คุ้มกันช่องโหว่ Formula Injection (CWE-1236) ตาม Issue #134
 * ป้องกันการใส่สูตรคำนวณที่ขึ้นต้นด้วย =, +, -, @, \t, \r, \n, | ในช่องที่ผู้ใช้กรอก
 * ซึ่งอาจถูกรันเป็นโค้ดเมื่อดาวน์โหลดข้อมูลออกไปเปิดด้วยโปรแกรมตาราง (Excel)
 */

test("ปฏิเสธเลขซีเรียลที่ขึ้นต้นด้วยอักขระสูตรคำนวณ (=, +, -, @) แม้มีช่องว่างหรือ \\t, \\r นำหน้า เพื่อป้องกัน Formula Injection (#134)", () => {
  const problemsEqual = rowFieldProblems({ serial_number: "=cmd|' /C calc'!A0" });
  assert.strictEqual(problemsEqual.length, 1);
  assert.match(problemsEqual[0], /อักขระสูตรคำนวณ/);
  assert.match(problemsEqual[0], /"="/);

  const problemsAt = rowFieldProblems({ serial_number: "@SUM(1,1)" });
  assert.strictEqual(problemsAt.length, 1);
  assert.match(problemsAt[0], /อักขระสูตรคำนวณ/);

  const problemsPlus = rowFieldProblems({ serial_number: "+12345" });
  assert.strictEqual(problemsPlus.length, 1);
  assert.match(problemsPlus[0], /อักขระสูตรคำนวณ/);

  const problemsMinus = rowFieldProblems({ serial_number: "-12345" });
  assert.strictEqual(problemsMinus.length, 1);
  assert.match(problemsMinus[0], /อักขระสูตรคำนวณ/);

  const problemsTab = rowFieldProblems({ serial_number: "\t+12345" });
  assert.strictEqual(problemsTab.length, 1);
  assert.match(problemsTab[0], /อักขระสูตรคำนวณ/);

  const problemsCr = rowFieldProblems({ serial_number: "\r=cmd" });
  assert.strictEqual(problemsCr.length, 1);
  assert.match(problemsCr[0], /อักขระสูตรคำนวณ/);
});

test("ปฏิเสธชื่อรุ่นและตำแหน่งที่ขึ้นต้นด้วยอักขระสูตรคำนวณ (#134)", () => {
  const problems = rowFieldProblems({
    serial_number: "PRN-001",
    model: "=1+1",
    location: "@LOCATION",
  });
  assert.strictEqual(problems.length, 2);
  assert.match(problems[0], /ชื่อรุ่นขึ้นต้นด้วยอักขระสูตรคำนวณ/);
  assert.match(problems[1], /ตำแหน่งขึ้นต้นด้วยอักขระสูตรคำนวณ/);
});

/*
 * เครื่องหมายขีดกลางหรือคำว่า -ไม่มี- ในภาษาไทยมักถูกใช้เป็นตัวแทน "ไม่มีข้อมูล"
 * ต้องไม่ถูกฟ้องว่าเป็นสูตรคำนวณ แต่ต้องดักจับหากมีสูตรซ่อนอยู่ข้างหลัง เช่น "-ไม่มี=1+1"
 */
test("เครื่องหมาย - ตัวเดียวหรือข้อความตัวแทนในตำแหน่งหรือชื่อรุ่นไม่ถือว่าเป็นสูตร (#134)", () => {
  assert.deepStrictEqual(
    rowFieldProblems({ serial_number: "PRN-001", model: "M404", location: "-" }),
    []
  );
  assert.deepStrictEqual(
    rowFieldProblems({ serial_number: "PRN-001", model: "M404", location: "--" }),
    []
  );
  assert.deepStrictEqual(
    rowFieldProblems({ serial_number: "PRN-001", model: "---", location: "-ไม่มี-" }),
    []
  );
  assert.deepStrictEqual(
    rowFieldProblems({ serial_number: "PRN-001", model: "-ไม่ระบุ-", location: "- ว่าง -" }),
    []
  );
});

test("ข้อความตัวแทนที่มีสูตรซ่อนอยู่ข้างหลังต้องถูกปฏิเสธ ไม่ให้หลุดรอด (#134)", () => {
  const p1 = rowFieldProblems({ serial_number: "PRN-001", model: "-ว่าง+cmd|x!A0", location: "เคาน์เตอร์" });
  assert.strictEqual(p1.length, 1);
  assert.match(p1[0], /ชื่อรุ่นขึ้นต้นด้วยอักขระสูตรคำนวณ/);

  const p2 = rowFieldProblems({ serial_number: "PRN-001", model: "M404", location: "- ไม่มี=1+1" });
  assert.strictEqual(p2.length, 1);
  assert.match(p2[0], /ตำแหน่งขึ้นต้นด้วยอักขระสูตรคำนวณ/);

  const p3 = rowFieldProblems({ serial_number: "PRN-001", model: "-ไม่มี-123", location: "เคาน์เตอร์" });
  assert.strictEqual(p3.length, 1);
  assert.match(p3[0], /ชื่อรุ่นขึ้นต้นด้วยอักขระสูตรคำนวณ/);
});

test("เลขซีเรียลที่เป็นขีดกลางล้วน (-, --, ---) หรือ zero-width ล้วน ต้องรายงานว่า 'ไม่มีเลขซีเรียล' (#134)", () => {
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "-" }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "--" }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "---" }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: " - " }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "\u200B" }), ["ไม่มีเลขซีเรียล"]);
  assert.deepStrictEqual(rowFieldProblems({ serial_number: "\u200B\u200C" }), ["ไม่มีเลขซีเรียล"]);
});

test("ดักจับการหลบเลี่ยงด้วย Zero-width space, ช่องว่างนำหน้า, หรือตัวอักษรแบบ Full-width (#134)", () => {
  const problemsZw = rowFieldProblems({ serial_number: "\u200B=cmd|' /C calc'!A0" });
  assert.strictEqual(problemsZw.length, 1);
  assert.match(problemsZw[0], /อักขระสูตรคำนวณ/);

  const problemsSpace = rowFieldProblems({ serial_number: "  @SUM(1,1)" });
  assert.strictEqual(problemsSpace.length, 1);
  assert.match(problemsSpace[0], /อักขระสูตรคำนวณ/);

  const problemsFullWidth = rowFieldProblems({ serial_number: "＝1+1" });
  assert.strictEqual(problemsFullWidth.length, 1);
  assert.match(problemsFullWidth[0], /อักขระสูตรคำนวณ/);

  const problemsPipe = rowFieldProblems({ serial_number: "|cmd" });
  assert.strictEqual(problemsPipe.length, 1);
  assert.match(problemsPipe[0], /อักขระสูตรคำนวณ/);
});

test("เลขซีเรียลปกติที่มีขีดกลางข้างใน (เช่น PRN-OPD-001) ต้องผ่านได้ปกติ", () => {
  assert.deepStrictEqual(
    rowFieldProblems({ serial_number: "PRN-OPD-001", model: "LaserJet-Pro", location: "ห้องตรวจ-1" }),
    []
  );
});
