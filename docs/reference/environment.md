# ตัวแปร environment

source of truth คือ `apps/api/.env.example` ตารางนี้อธิบายความหมาย ถ้าสองที่ไม่ตรงกันให้เชื่อไฟล์

ไฟล์อยู่ที่ `apps/api/.env` และอยู่ใน `.gitignore` แล้ว **ห้าม commit**

| ตัวแปร | จำเป็น | ความหมาย |
|---|---|---|
| `DB_HOST` | ใช่ | โฮสต์ของ MySQL/MariaDB ปกติ `localhost` |
| `DB_USER` | ใช่ | ผู้ใช้ฐานข้อมูล |
| `DB_PASSWORD` | ใช่ | รหัสผ่านฐานข้อมูล ว่างได้เฉพาะบนเครื่องพัฒนา |
| `DB_NAME` | ใช่ | ชื่อฐานข้อมูล |
| `JWT_SECRET` | ใช่ | กุญแจเซ็น JWT — ต้องเป็นค่าสุ่มที่ยาวและไม่ซ้ำใคร |
| `PORT` | ไม่ | พอร์ตของ API ค่าเริ่มต้น `3000` |

## ข้อควรระวัง

- `JWT_SECRET` ที่อ่อนหรือใช้ค่าตัวอย่าง = ใครก็ปลอม token เข้าระบบได้ ต้องเปลี่ยนก่อนขึ้น production เสมอ
- token มีอายุ 8 ชั่วโมงและ **revoke ก่อนหมดอายุไม่ได้** การเปลี่ยน `JWT_SECRET` จะทำให้ทุก token ที่ออกไปแล้วใช้ไม่ได้ทันที
- ค่าฝั่งเว็บ เช่น API base URL ยังไม่ได้เป็น environment configuration — ดู [เตรียมขึ้น production](../how-to/prepare-for-production.md)
