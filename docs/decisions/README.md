# Architecture Decision Records

บันทึกการตัดสินใจที่ **ย้อนกลับยาก** — หนึ่งไฟล์ต่อหนึ่งการตัดสินใจ

## กติกา

- เขียนตอนตัดสินใจ ไม่ใช่ตอนสรุปทีหลัง คุณค่าอยู่ที่ทางเลือกที่ถูกตัดทิ้ง ซึ่งเป็นสิ่งแรกที่ลืม
- เลขเรียงต่อกัน ไม่ใช้ซ้ำ ไม่แก้ไฟล์เก่าเมื่อเปลี่ยนใจ — เขียนฉบับใหม่แล้วตั้งสถานะฉบับเก่าเป็น `Superseded by ADR-XXXX`
- ยาวหนึ่งหน้าพอ ถ้ายาวกว่านั้นแปลว่าเป็นเอกสารออกแบบ ไม่ใช่บันทึกการตัดสินใจ
- เขียนเฉพาะเรื่องที่กลับตัวแล้วเจ็บ — เลือกฐานข้อมูล รูปแบบวันที่ โมเดลสิทธิ์ ส่วนการเลือก utility library ไม่ต้อง

## สถานะที่ใช้

| สถานะ | ความหมาย |
|---|---|
| `Proposed` | เสนอแล้ว ยังไม่ตัดสิน |
| `Accepted` | ตัดสินแล้ว และมีผลกับโค้ดปัจจุบัน |
| `Superseded by ADR-XXXX` | ถูกแทนที่ด้วยการตัดสินใจใหม่ |
| `Deferred` | ยังไม่ผิด แต่สมมติฐานที่ตั้งไว้เปลี่ยนไป ต้องตัดสินใหม่เมื่อจะใช้จริง |

## รายการ

| # | เรื่อง | สถานะ |
|---|---|---|
| [0001](0001-thai-fiscal-year-oct-sep.md) | ปีงบประมาณไทยคือ ต.ค. ถึง ก.ย. | Accepted |
| [0002](0002-store-months-in-common-era.md) | เก็บเดือนเป็น ค.ศ. รับเข้าได้ทั้ง พ.ศ. และ ค.ศ. | Accepted |
| [0003](0003-sheetjs-from-vendor-registry.md) | ติดตั้ง SheetJS จาก registry ของผู้พัฒนา ไม่ใช่ npm | Accepted |
| [0004](0004-workspace-and-feature-folders.md) | จัด repository เป็น workspace และแบ่งโค้ดตามความสามารถ | Accepted |
| [0005](0005-database-engine.md) | เลือก database engine สำหรับระบบที่เขียนใหม่ — PostgreSQL | Deferred |
| [0006](0006-session-cookie-instead-of-localstorage.md) | เก็บ token ของ session ใน cookie แบบ httpOnly | Accepted |
| [0007](0007-improve-in-place-instead-of-rewriting.md) | ปรับปรุงระบบเดิมต่อ ไม่เขียนใหม่ | Accepted |
| [0011](0011-read-only-mcp-server.md) | เซิร์ฟเวอร์ MCP แบบอ่านอย่างเดียว | Accepted |
