// สคริปต์แปลงรหัสผ่าน plaintext ใน DB ให้เป็น bcrypt hash (รันครั้งเดียว)
// ใช้กับเครื่องที่ seed users ด้วย schema เวอร์ชันเก่า (รหัสยังเป็น plaintext)
//
//   cd backend
//   node scripts/hash-passwords.js
//
// รหัสที่เป็น bcrypt hash อยู่แล้ว (ขึ้นต้น $2a$/$2b$/$2y$) จะถูกข้าม รันซ้ำได้ปลอดภัย

const bcrypt = require("bcrypt");
const db = require("../db");

const BCRYPT_PREFIX = /^\$2[aby]\$/;

async function main() {
  const [users] = await db.query("SELECT id, username, password FROM users");

  let updated = 0;
  for (const user of users) {
    if (BCRYPT_PREFIX.test(user.password)) {
      console.log(`- ${user.username}: เป็น hash อยู่แล้ว ข้าม`);
      continue;
    }

    const hash = await bcrypt.hash(user.password, 10);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hash, user.id]);
    console.log(`✅ ${user.username}: แปลงเป็น bcrypt hash แล้ว`);
    updated++;
  }

  console.log(`\nเสร็จสิ้น — อัปเดต ${updated}/${users.length} users`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
