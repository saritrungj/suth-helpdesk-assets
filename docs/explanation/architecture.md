# สถาปัตยกรรม

เอกสารนี้อธิบาย **ทำไม** โครงสร้างถึงเป็นแบบนี้ ส่วน **มีอะไรบ้าง** ให้อ่านจากโค้ดโดยตรง เพราะรายการไฟล์ที่ copy มาไว้ในเอกสารจะล้าสมัยเสมอโดยไม่มีอะไรเตือน

## ภาพรวมระบบ

```text
Vue SPA (:5173)
    │ Axios + Bearer JWT
    ▼
Express API (:3000)
    │ mysql2 connection pool
    ▼
MySQL
```

ระบบทำงานภายในโรงพยาบาล ข้อมูลไม่ออกนอกเครือข่าย จึงไม่พึ่ง managed service ใดๆ

## repository เป็น workspace เดียว

```text
apps/api/          Express API
apps/web/          Vue SPA
packages/domain/   กฎธุรกิจที่ทั้งสองฝั่งใช้ร่วมกัน
database/          schema, migration, seed
docs/              เอกสารชุดนี้
```

เดิม backend และ frontend เป็นสองโปรเจกต์แยกกันที่แชร์โค้ดไม่ได้เลย ตรรกะปีงบจึงถูกเขียนสองรอบแล้วเพี้ยนคนละทาง — ฝั่ง API ใช้ ต.ค.–ก.ย. ถูก ส่วนฝั่งเว็บเดาเป็น ม.ค.–ธ.ค. ผิด `packages/domain` มีอยู่เพื่อไม่ให้เกิดเรื่องนี้อีก ดู [ADR-0004](../decisions/0004-workspace-and-feature-folders.md)

**กฎ:** ถ้าคำตอบต้องเหมือนกันทั้งสองฝั่ง มันต้องอยู่ใน `packages/domain` ห้าม copy ไปเขียนซ้ำ

## โค้ดฝั่ง API แบ่งตามความสามารถ

`apps/api/index.js` เป็น entry ที่ mount route เท่านั้น โค้ดจริงอยู่ใน `apps/api/src/` แบ่งเป็นโฟลเดอร์ตามสิ่งที่ระบบทำ — `auth/`, `devices/`, `print-usage/`, `expense/`, `dashboard/`, `contracts/`, `master-data/`, `users/`, `import/` และ `shared/`

เหตุผลคือชื่อโฟลเดอร์ควรบอกว่าระบบนี้ทำอะไร ไม่ใช่บอกว่าเขียนด้วยอะไร และการแก้ความสามารถหนึ่งควรเปิดโฟลเดอร์เดียว ไม่ใช่ไล่เปิดสามโฟลเดอร์ตามชนิดของไฟล์

**กฎ:** เพิ่มความสามารถใหม่ = เพิ่มโฟลเดอร์ใหม่ ห้ามเอา `routes/` หรือ `controllers/` กลับมา และถ้าโค้ดถูกใช้แค่ feature เดียว ให้อยู่ในโฟลเดอร์ของ feature นั้น อย่ายัดเข้า `shared/`

middleware ตรวจสิทธิ์อยู่ใต้ `auth/` เพราะ auth เป็นเจ้าของ feature อื่นยืมไปใช้ ชื่อไฟล์ตั้งเป็น `require-auth` / `require-admin` / `require-staff` ให้อ่านแล้วรู้ทันทีว่าบรรทัดนั้นบังคับอะไร

## โค้ดฝั่งเว็บ

- route และ navigation อยู่ใน `apps/web/src/router/`
- HTTP client กลางอยู่ที่ `apps/web/src/services/api.js` — จุดเดียวที่แนบ token และดัก 401
- state ที่ใช้ร่วมหลายหน้าอยู่ใน `apps/web/src/store/` เขียนด้วย reactive ของ Vue ตรงๆ ยังไม่มี state manager

## ฐานข้อมูล

`database/schema.sql` เป็น source of truth ของฐานข้อมูลใหม่ ส่วน `database/migration_*.sql` เป็นการเปลี่ยนแปลงแบบมีลำดับสำหรับฐานข้อมูลที่มีอยู่แล้ว — ดู [วิธีรัน](../how-to/run-migrations.md)

กฎที่บังคับได้ในระดับฐานข้อมูลให้บังคับที่นั่น เช่น `UNIQUE KEY (device_id, month)` และ `CHECK` ที่กันเดือน พ.ศ. หลุดเข้ามา เพราะการบังคับในโค้ดอย่างเดียวข้ามได้ทุกครั้งที่มีคนเปิด phpMyAdmin
