// apps/api/src/dashboard/routes.js
//
// รวมเส้นทางของรายงานทั้งหมดไว้ที่เดียว — ไฟล์นี้ไม่มีตรรกะของตัวเอง
//
// เดิมทุกอย่างอยู่ในไฟล์เดียวยาว 1,117 บรรทัด ซึ่งทำให้หาอะไรไม่เจอและแก้จุดหนึ่ง
// แล้วกระทบอีกจุดโดยไม่รู้ตัว แยกตามคำถามที่แต่ละกลุ่มตอบ
//
//   overview.js       "มีอะไรต้องทำไหม และภาพรวมตอนนี้เป็นยังไง" (หน้าแรก)
//   reports.js        ตัวเลขดิบที่หลายหน้าใช้ร่วมกัน
//   by-department.js  ผังองค์กร ฝ่าย → แผนก → เครื่อง พร้อมแนวโน้ม
//
// ทั้งหมดอ่านอย่างเดียวและต้องล็อกอินก่อน

const express = require("express");
const router = express.Router();

const requireAuth = require("../auth/require-auth");

router.use(requireAuth);

router.use(require("./overview"));
router.use(require("./reports"));
router.use(require("./by-department"));

module.exports = router;
