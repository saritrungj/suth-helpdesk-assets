# ขอบเขต API

prefix และความรับผิดชอบ — รายละเอียด endpoint, payload และ response ให้อ่านจาก `apps/api/src/<feature>/routes.js` โดยตรง เพื่อไม่ให้เอกสารกลายเป็นสำเนาของโค้ดที่ล้าสมัย

ทุกเส้นยกเว้น `/api/auth/login` ต้องมี `Authorization: Bearer <token>`

| Prefix | หน้าที่ | โค้ด |
|---|---|---|
| `/api/auth` | Login และออก JWT | `src/auth/` |
| `/api/devices` | ทะเบียนอุปกรณ์ การย้าย และประวัติ | `src/devices/` |
| `/api/contracts` | สัญญาและราคาต่อหน้า | `src/contracts/` |
| `/api/print-transactions` | ยอดพิมพ์และสรุปตามปีงบ | `src/print-usage/` |
| `/api/dashboard` | KPI รายงาน และการเปรียบเทียบ | `src/dashboard/` |
| `/api/expense` | ค่าใช้จ่ายตามปีงบ และอุปกรณ์ที่ไม่มีสัญญา | `src/expense/` |
| `/api/users` | จัดการผู้ใช้ (admin เท่านั้น) | `src/users/` |
| `/api/devices/import`<br>`/api/print-transactions/import` | นำเข้าไฟล์ (admin เท่านั้น) | `src/import/` |

Master Data ใช้ prefix แยกกันแต่อยู่ในโฟลเดอร์เดียว (`src/master-data/`) — `/api/brands`, `/api/buildings`, `/api/floors`, `/api/divisions`, `/api/departments` และ `/api/fiscal-years`

## Health check

```text
GET http://localhost:3000/
```

ไม่ต้องมี token คืน JSON บอกชื่อและเวอร์ชันของ API

## รหัสตอบกลับที่ใช้

| รหัส | ความหมาย |
|---|---|
| `400` | ข้อมูลที่ส่งมาไม่ถูกต้อง เช่น รูปแบบเดือนผิด หรือกรอกไม่ครบ |
| `401` | ไม่มี token, token หมดอายุ หรือรหัสผ่านผิด |
| `403` | ล็อกอินแล้วแต่สิทธิ์ไม่พอ |
| `404` | ไม่พบข้อมูลที่อ้างถึง |
| `500` | ข้อผิดพลาดฝั่งเซิร์ฟเวอร์ |

การล็อกอินจำกัดไว้ 10 ครั้งต่อ 15 นาทีต่อ IP โดยนับเฉพาะครั้งที่ล้มเหลว
