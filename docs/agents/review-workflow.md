# Workflow ตรวจบั๊กและรีวิวการเปลี่ยนแปลงสำหรับ agent

ใช้ workflow นี้เมื่อแก้บั๊ก รีวิว diff หรือเตรียมส่งมอบ implementation เป้าหมายคือให้ทุกไฟล์และทุก finding มีข้อสรุปที่ตรวจสอบได้ โดยไม่ผูกกับเครื่องมือรีวิวภายนอกตัวใดตัวหนึ่ง

## 1. ทำ change map

1. อ่านคำขอ, Issue, `AGENTS.md` และเอกสารโดเมน/ADR ที่ตรงกับงาน
2. ตรวจ branch, working tree และ diff ทั้งหมด
3. จัดไฟล์ที่เปลี่ยนเป็น source, test, docs/config แล้วทำบัญชีให้ครบทุกไฟล์

ขั้นนี้เสร็จเมื่ออธิบายได้ว่าแต่ละไฟล์เปลี่ยนเพราะอะไร และไม่มีไฟล์ใน diff ที่ยังไม่ได้อ่านพร้อมบริบทรอบข้าง

## 2. ทำ bug loop ให้เป็นสีแดงก่อน

สร้าง reproduction ที่เล็กและกำหนดผลได้แน่นอนก่อนแก้ ถ้าเป็นพฤติกรรมผ่านหน้าเว็บให้ใช้ E2E เมื่อบั๊กข้าม component, router หรือ API และใช้ unit/component test เมื่อแยกพฤติกรรมได้ในชั้นเดียว

เคส state จาก URL ต้องตรวจอย่างน้อยการเปิด URL โดยตรง, เปลี่ยน query, Back/Forward และ query ที่ไม่รู้จัก สำหรับ allow-list ใน JavaScript ให้เทียบกับสมาชิกที่ประกาศไว้โดยตรง เช่น `some`, `includes` หรือ `Set.has`; อย่าใช้การมี property บน object เป็นตัวตัดสิน เพราะ inherited key อย่าง `constructor` และ `toString` อยู่บน prototype chain

ขั้นนี้เสร็จเมื่อ test ล้มด้วยสาเหตุเดียวกับบั๊กที่รายงาน ไม่ใช่เพราะ setup หรือ service ขาด

## 3. รีวิวสามมิติ

รีวิว diff ทุกไฟล์แยกเป็นสามรอบ เพื่อไม่ให้ความสนใจเรื่องหนึ่งกลบอีกเรื่องหนึ่ง

1. **Repository standards** — โครงสร้าง, naming, design tokens, API conventions และกฎในเอกสารที่เกี่ยวข้อง
2. **Specification** — คำขอและ acceptance criteria ครบหรือไม่ มี partial implementation, wrong behavior หรือ scope creep หรือไม่
3. **Security and robustness** — input/query ที่เชื่อไม่ได้, auth/role, error และ empty state, race/stale state, prototype inheritance และข้อมูลละเอียดอ่อน

ย้อนอ่าน caller, callee และ test ที่เกี่ยวข้องเมื่อ diff อย่างเดียวตอบไม่ได้ ทุก finding ต้องมีหลักฐาน, ผลกระทบ และตำแหน่งที่แก้ได้จริง ข้อสังเกตเชิงรสนิยมที่ไม่ขัดกฎหรือไม่เปลี่ยนพฤติกรรมให้ตัดออก

ขั้นนี้เสร็จเมื่อทุกไฟล์ผ่านครบสามรอบ และทุก finding ถูกยืนยันหรือปัดตกพร้อมเหตุผล

## 4. แก้และพิสูจน์

แก้ confirmed finding ที่อยู่ใน scope และเพิ่ม regression test ก่อนหรือพร้อมการแก้ ถ้าผู้ใช้อนุญาตให้แก้ปัญหาข้างเคียง ให้แก้เฉพาะปัญหาที่พิสูจน์ได้และอยู่ในบริบทเดียวกัน; การ refactor เชิงคาดเดาให้อยู่นอก diff

รัน test แคบให้เขียวก่อน แล้วเลือกชุดตรวจตาม [ตรวจการเปลี่ยนแปลงก่อนส่งมอบ](../how-to/verify-changes.md) งานที่แตะหน้าซึ่งอยู่ใน `DB_SPECS` ต้องรัน `npm run verify:db` เมื่อ Docker พร้อม

## 5. ด่านส่งมอบ

ก่อนสรุปงาน ต้องครบทุกข้อ:

- ทุกไฟล์ใน diff มีเหตุผลและผ่าน review สามมิติ
- regression test ของบั๊กที่ยืนยันแล้วผ่าน
- `git diff --check` ผ่าน และไม่มี debug marker หรือ artifact ชั่วคราว
- รายงานผล test, test ที่ skip/ไม่ได้รัน และความเสี่ยงคงเหลือ
- รักษา authority ของ Git lifecycle ตาม `CONTRIBUTING.md`; การแก้เสร็จไม่ได้แปลว่าได้รับอนุญาตให้ commit หรือ push
