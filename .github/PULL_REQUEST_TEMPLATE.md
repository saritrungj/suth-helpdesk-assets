## Issue และผลลัพธ์ของผู้ใช้

Closes #

เส้นทางงานที่ได้รับผลกระทบ (ดู [แผนผัง workflow](../docs/explanation/workflows.md)):

เกณฑ์รับงานและผลที่พิสูจน์ได้:

## สิ่งที่เปลี่ยน

## หลักฐานตรวจของ commit นี้

| คำสั่ง / การตรวจ | ผลและจำนวนผ่าน-ล้ม-ข้าม | หลักฐานหรือเหตุผลที่ไม่ได้รัน |
|---|---|---|
| `npm run verify` (unit + build + fixture E2E) | | |
| `npm run verify:db` (เมื่องานแตะ API/DB/DB_SPECS) | | |
| smoke test: health และ authenticated flow ที่กระทบ | | |

รายการที่ **ไม่ได้ทดสอบ** และความเสี่ยงที่เหลือ:

## ส่งมอบ

- Migration / ลำดับการรัน / ผลทดสอบกับฐานสำเนา (ถ้ามี):
- Screenshot ก่อน-หลังสำหรับ UI (ถ้ามี):
- ขั้นตอนตรวจหลัง deploy และกู้คืน (ถ้ามี):

ดูเกณฑ์เต็มใน [CONTRIBUTING.md](../CONTRIBUTING.md) และ
[คู่มือตรวจการเปลี่ยนแปลง](../docs/how-to/verify-changes.md)
