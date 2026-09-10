# เปิดและทดสอบ QA แยกสำหรับ #48

ใช้เฉพาะฐาน `hospital_it_asset_qa48` ที่เตรียมด้วยข้อมูลจำลองไว้แล้ว บัญชี runtime
`suth_qa48@localhost`, API `3001`, web `5174` ไม่ใช้ฐาน `hospital_it_asset`
หรือแก้ `.env` เดิม เครื่องนี้ต้องมี MySQL localhost:3306, Node/npm และ dependencies
ของ workspace ติดตั้งแล้ว คำสั่งต่อไปนี้รันจากราก repo บน Windows

## เปิดใช้งานซ้ำ

```powershell
powershell -NoProfile -File scripts/qa48/session.ps1 start
```

เปิด terminal นี้ค้างไว้ แล้วเข้า `http://localhost:5174/assets` ใน browser profile
แยกจากระบบเดิม เพราะ cookie ของ localhost ไม่แยกตามพอร์ต ปิดด้วย Ctrl+C;
ตัวเปิดจะหยุดเฉพาะ child processes ของตน ไม่หยุดบริการพอร์ตอื่น
ถ้าพอร์ตถูกใช้อยู่จะปฏิเสธ ไม่ adopt หรือ kill process อัตโนมัติ

บัญชี `qa48-admin`, `qa48-staff`, `qa48-viewer` ใช้รหัส QA ที่จัดเตรียมไว้
ผู้ใช้เรียกคำสั่งนี้เองเพื่อคัดลอกรหัสไป clipboard โดยไม่พิมพ์ลง log:

```powershell
powershell -NoProfile -File scripts/qa48/session.ps1 password
# หลังวางรหัสแล้ว ล้าง clipboard
Set-Clipboard -Value ''
```

รหัสถูกเก็บเป็น SecureString ใน `output/qa48/credentials.clixml` ผ่าน Windows
DPAPI ผูกกับบัญชี Windows และเครื่องนี้ อยู่ใน gitignore ห้ามนำ vault ไปแนบรายงาน
หรือคัดลอก credentials ลง checkpoint; ไม่ใช่ secret manager สำหรับ production
การล้าง clipboard ไม่รับรองการลบ clipboard history หรือข้อมูลที่ sync ไปแล้ว

## ทดสอบ

```powershell
# เขียนเฉพาะข้อมูลจำลอง QA48 ผ่านเว็บ/API เดิม
powershell -NoProfile -File scripts/qa48/session.ps1 verify

# WCAG/registry/shared-page regression; ไม่เปิด write guard ของชุดทั่วไป
powershell -NoProfile -File scripts/qa48/session.ps1 regression
```

ทุกครั้งตรวจ runtime identity, health, ล็อกอินจริง และ sentinel เครื่อง QA48
25 รายการก่อนรัน ไม่ fallback ไปฐานหรือ API เดิม ไม่ bootstrap ระหว่างทดสอบ
ชุด live-write ปิด trace/video/ภาพตอนล้มเพื่อไม่เก็บรหัสล็อกอิน
ผลแต่ละรอบแยกที่ `output/qa48/verify-<timestamp>/` หรือ `regression-<timestamp>/`
ดู `tests.log` และ `artifacts/`; exit nonzero คือไม่ผ่าน ไม่ใช้ skip แทนผลสำเร็จ

Live-write เปลี่ยนรุ่น QA48-021 และย้าย QA48-001 ไป Origin แล้ว Destination
เพิ่มประวัติสองช่วงต่อรอบและเก็บข้อมูลไว้ ไม่ reset หรือล้างฐาน ตรวจจำนวนประวัติ
เพิ่มสอง/ช่วงปัจจุบันหนึ่ง, ยอดสุทธิ 800 หน้า/360 บาท และ staff/viewer ถูกปฏิเสธ
ครอบคลุมข้อมูล 1,000 หน้าของเดือน ก.ย. 2026 ใน fixture นี้ ไม่อ้างว่าครอบคลุม
ประวัติย้อนหลังหรือขอบปีงบทั้งหมด

## สิ่งที่ฐาน QA48 เปิดเผยต่างจากฐานเดิม

ข้อมูลจำลองชุดนี้ต่างจากฐานพัฒนาเดิมสองอย่างที่ทำให้ regression ให้ผลต่างกัน คือ
ชื่อแผนกยาวผิดปกติ (`QA48 Department long synthetic name…`) และเครื่องที่มีประวัติ
ย้ายจากรอบ live-write ก่อนหน้า ไม่ใช่ความไม่เสถียรของเทส รอบ
`regression-2026-09-10T02-52-46-323Z` และ `-02-55-44-444Z` ล้มสามรายการเดียวกันทั้งคู่

- **2.5.8 · รายงานสรุป** ปุ่ม "ดูประวัติ" สูง 15px เห็นเฉพาะแถวที่มีประวัติย้าย
  ฐานเดิมไม่มีแถวแบบนั้นจึงไม่เคยล้ม — เป็นบั๊กจริง แก้แล้วใน `Report.vue`
- **1.4.12 · แดชบอร์ด** สองปัญหาซ้อนกัน ตัวเทสเดิมวัดครั้งเดียวหลังใส่สไตล์ จึงจับ
  `truncate` ของ "ชื่อ" ที่มีอยู่ก่อนแล้วด้วย ทั้งที่
  [หลักเกณฑ์ของ repo](../reference/accessibility.md) อนุญาตไว้ แก้ให้วัดก่อน/หลังแล้ว
  เทียบส่วนต่างตามสิ่งที่ข้อกำหนดถามจริง เมื่อวัดแบบนั้นแล้วยังเหลือของจริงคือชื่อแผนก
  ในการ์ด "เครื่องที่ใช้งานมากที่สุด" ที่พอดีบรรทัดตอนปกติแต่ถูกตัดเมื่อเพิ่มระยะห่าง
  แก้ด้วยการให้ขึ้นบรรทัดใหม่แทน `truncate`
- **filtered Excel export** เทสค้นคำคงที่ `"HP"` ซึ่งไม่มีในฐาน QA48 ปุ่ม export จึง
  ถูก disable อย่างถูกต้องและเทสหมดเวลารอ event `download` แก้ให้ดึงคำค้นจาก
  `/devices` ของฐานที่กำลังทดสอบ

เมื่อเพิ่มเทสใหม่ อย่าผูกกับ serial, ยี่ห้อ หรือชื่อหน่วยงานที่มีเฉพาะฐานใดฐานหนึ่ง
ให้ดึงค่าจาก API ก่อนใช้ มิฉะนั้นผลจะเปลี่ยนตามฐาน ไม่ใช่ตามโค้ด

## Provisioning และ recovery

ไม่ต้อง provision ทุกครั้งที่เปิดระบบ ขั้นนี้ต้องอนุมัติแยก เพราะเปลี่ยน secrets:

```powershell
powershell -NoProfile -File scripts/qa48/session.ps1 provision -ApproveQaCredentialRotation
```

ใช้ credentials ผู้ดูแลจาก `.env` เดิมเฉพาะ bootstrap ที่อนุมัติ แต่ connection
เลือกฐาน QA ชัดเจน ตรวจบัญชีจำลองสามรายก่อนหมุนรหัส QA เท่านั้น ไม่สร้างฐาน,
เปลี่ยน schema/grants หรือ seed ข้อมูลธุรกิจ ตัว runtime ใช้บัญชี QA สิทธิ์จำกัด

หาก vault มีอยู่จะปฏิเสธ overwrite หาก provisioning สะดุด vault อาจถูกบันทึกแล้ว
แต่การหมุนรหัสยังไม่ครบ อย่าลบ vault หรือ rerun bootstrap เดิมแบบสุ่ม ให้ตรวจ
สถานะ QA แบบอ่านอย่างเดียวและขออนุมัติ recovery เฉพาะบัญชีที่จำเป็น
ห้ามรัน `output/qa48/run.cjs` รุ่นทดลองเพื่อเปิดซ้ำ เพราะเป็น bootstrap ครั้งเดียว

สำหรับการเดินงานแก้–ทดสอบ–รีวิวจนพร้อมส่งมอบ เรียก
[finish-issue](../../.agents/skills/finish-issue/SKILL.md) พร้อม Issue และ baseline
workflow นี้ไม่ใช่บริการ background และไม่อนุมัติ commit/push หรือข้าม human gate
