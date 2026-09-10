# database/migrations/

ไฟล์ในโฟลเดอร์นี้คือ**ประวัติ** การเปลี่ยนโครงสร้างฐานข้อมูลแบบมีลำดับ สำหรับฐานที่มีข้อมูล
อยู่แล้วและต้องอัปให้ทันโค้ด — วิธีรันอยู่ที่ [`docs/how-to/run-migrations.md`](../../docs/how-to/run-migrations.md)

**`database/schema.sql` คือ source of truth ของฐานข้อมูลใหม่** — มีทุกตารางและคีย์ล่าสุด
รวมของที่ migration ที่นี่เคยเพิ่มไว้แล้ว ตั้งฐานใหม่ (รวมฐาน CI) ให้รัน `schema.sql`
อย่างเดียว **ไม่ต้องไล่รัน migration ตามหลัง** — ดู [`docs/explanation/architecture.md`](../../docs/explanation/architecture.md)

ไฟล์ในนี้เป็น one-time change ไม่ได้ออกแบบให้รันซ้ำได้ และไม่มีตัวไหนถูกแก้ย้อนหลัง
หลังจากมีคนรันจริงแล้ว — ผิดพลาดต้องกู้จาก backup ไม่ใช่แก้ไฟล์เดิม
