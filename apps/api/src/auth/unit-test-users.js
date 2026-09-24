// apps/api/src/auth/unit-test-users.js — เทสระดับหน่วยไม่ต่อฐานจริง: ทุก id คือบัญชี admin ที่ยังอยู่ (#208)
//
// require-auth อ่านบทบาทปัจจุบันจากฐานทุกคำขอ (current-user.js) บทบาทที่ใช้ = ต่ำกว่าระหว่าง token กับฐาน
// token ของเทสจึงยังกำหนดบทบาท staff/viewer ได้เหมือนเดิม — require ไฟล์นี้ก่อนยิงคำขอผ่าน router จริง
const { setUserSource } = require("./current-user");

setUserSource(async (id) => ({ id, username: "admin", role: "admin", password: "unit-test" }));
