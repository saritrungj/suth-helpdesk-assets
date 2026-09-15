# เอกสารโดเมนสำหรับ agent

วิธีที่ agent skill (`/domain-modeling`, `/grill-with-docs`, `/improve-codebase-architecture` ฯลฯ) ควรอ่านเอกสารโดเมนของ repo นี้ก่อนเริ่มสำรวจโค้ด

## อ่านก่อนเริ่มสำรวจ

- **[`CONTEXT.md`](../../CONTEXT.md)** ที่ root — glossary ของคำที่ตกลงความหมายแล้ว ส่วน `docs/explanation/domain.md` อธิบายกฎธุรกิจและพฤติกรรมปัจจุบัน
- **`docs/decisions/`** — ที่เก็บ ADR ของ repo นี้ รายการและสถานะอยู่ใน [สารบัญ ADR](../decisions/README.md) อ่าน ADR ที่เกี่ยวกับส่วนที่กำลังจะแก้ก่อนเสมอ **ไม่ใช่** `docs/adr/` — repo นี้ไม่มีโฟลเดอร์นั้น ใช้ `docs/decisions/` แทนที่เดิมทั้งหมด
- **`docs/README.md`** — ดัชนีเอกสารแบบ Diátaxis ชี้ไปยัง `explanation/`, `how-to/`, `reference/`, `decisions/`

นิยามคำและข้อสรุปที่ตกลงแล้วไม่ได้แปลว่าโค้ดทำตามครบแล้ว ตรวจสถานะ implementation และประเด็นรอยืนยันใน ADR ที่เกี่ยวข้องด้วย

## โครงสร้างไฟล์ (single-context)

repo นี้เป็น npm workspace (`apps/api`, `apps/web`, `packages/domain`) แต่กฎโดเมนและ ADR รวมอยู่ที่เดียวไม่แยกตาม package — `packages/domain` มีขึ้นมาเพื่อให้กฎธุรกิจ (ปีงบ เงิน การแสดงผลไทย) มีบ้านเดียวที่ทุกแอปใช้ร่วมกัน (ดู ADR-0004) จึงถือเป็น single-context:

```text
/
├── CONTEXT.md              ← glossary ของคำที่ตกลงความหมายแล้ว
├── docs/
│   ├── decisions/           ← ADR log (เทียบเท่า docs/adr/ ของ skill นี้)
│   ├── explanation/         ← เอกสารอธิบายโดเมนและสถาปัตยกรรม
│   ├── how-to/
│   └── reference/
├── apps/
│   ├── api/
│   └── web/
└── packages/
    └── domain/              ← กฎธุรกิจร่วม — ดู ADR-0004
```

## ใช้คำศัพท์ตาม glossary

ใช้คำตามที่นิยามใน `CONTEXT.md` ห้ามเบี่ยงไปใช้คำพ้องที่ glossary จงใจเลี่ยง คำที่ยังไม่มีนิยามให้ดูการใช้ใน `docs/explanation/domain.md` และ `packages/domain` แล้วแยกข้อเท็จจริงที่พบออกจากความหมายที่ยังต้องถามผู้ใช้

ถ้าเทอมที่ต้องการยังไม่ถูกบันทึกไว้ที่ไหนเลย นั่นคือสัญญาณ — อาจเป็นเพราะกำลังคิดคำที่ระบบไม่ได้ใช้ (ควรทบทวน) หรือมีช่องว่างจริงที่ต้องบันทึกให้ `/domain-modeling`

## แจ้งเมื่อขัดกับ ADR

ถ้าผลลัพธ์ที่จะเสนอขัดกับ ADR ใน `docs/decisions/` ให้บอกตรงๆ ไม่ทับเงียบๆ:

> _ขัดกับ ADR-0002 (เก็บเดือนเป็น ค.ศ.) แต่น่าจะคุ้มที่จะทบทวนใหม่เพราะ…_
