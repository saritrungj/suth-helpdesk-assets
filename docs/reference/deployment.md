# สถานะการติดตั้งและความพร้อม

ตรวจล่าสุด: **12 ตุลาคม 2026** — snapshot จากผล deploy และการตรวจในรอบนี้ ไม่ใช่ monitoring แบบสด อัปเดตหน้านี้เมื่อส่งรุ่นหรือมีผลตรวจใหม่; รายละเอียดปฏิบัติการและข้อมูลภายในเก็บในระบบของหน่วยงาน

## สถานะใช้งาน

ระบบอยู่ระหว่างทดลองใช้ด้วยข้อมูลจริงของหน่วยงาน รุ่นที่ส่งล่าสุดคือ [`100744e`](https://github.com/saritrungj/suth-helpdesk-assets/commit/100744eef97210e818500ef8902c870980cf6b20) รวม [PR #337](https://github.com/saritrungj/suth-helpdesk-assets/pull/337) ด้าน context/workflow และ [PR #338](https://github.com/saritrungj/suth-helpdesk-assets/pull/338) ด้านความสอดคล้องของ UI ยังไม่ออกเวอร์ชันอย่างเป็นทางการ (`0.0.0`)

รุ่นนี้ deploy และตรวจ health ผ่านแล้ว แต่ยังไม่ยืนยันความพร้อม production ครบทั้งระบบ งานตรวจรับและความพร้อมที่เหลือติดตามใน [#304](https://github.com/saritrungj/suth-helpdesk-assets/issues/304)

## ข้อเท็จจริงของการติดตั้ง

เลขข้ออ้างถึงส่วนที่ 1 ของ [คู่มือตรวจเซิร์ฟเวอร์](../how-to/audit-production-server.md) ข้อมูลนี้ครอบคลุม instance ที่ตรวจในรอบ deploy เท่านั้น

| ข้อ | รายการ | ผลตรวจ |
|---|---|---|
| 1.1 | การแยกเว็บ/API/ฐานข้อมูล | เว็บและ API รันบนเครื่องเดียวกับ Docker ของฐานข้อมูลที่ตรวจ; ยังไม่ยืนยันว่ามี instance อื่นหรือไม่ |
| 1.2 | ระบบปฏิบัติการ | Windows; ไม่แน่ใจ edition และเวอร์ชันของ OS |
| 1.3 | วิธีรัน | Task Scheduler ถือ Node.js supervisor; API เป็น Node.js process, เว็บเสิร์ฟ build ด้วย Vite preview และฐานข้อมูลเป็น MySQL ใน Docker |
| 1.4 | การกลับมาหลังรีสตาร์ต | คู่มือปฏิบัติการระบุว่าพึ่งการล็อกอินและ Docker Desktop; ยังไม่ได้พิสูจน์ reboot/logout recovery ดู [#340](https://github.com/saritrungj/suth-helpdesk-assets/issues/340) |
| 1.5 | รุ่นที่ตรวจ | commit `100744e`; checkout สะอาดหลัง deploy |
| 1.6 | วิธีส่งรุ่นและผู้ปฏิบัติ | หยุดผ่าน supervisor → เปลี่ยน detached checkout เป็น SHA ที่อนุมัติ → ติดตั้ง dependency/ตรวจ/build → resume; รอบนี้ agent ปฏิบัติตามคำสั่งเจ้าของงาน และเก็บ release record/rollback ในระบบของหน่วยงาน |
| 1.7 | HTTP/HTTPS | ตรวจ smoke ผ่าน HTTP บน loopback; ไม่แน่ใจช่องทางและ HTTPS ที่ผู้ใช้เข้าจริง ดู [#306](https://github.com/saritrungj/suth-helpdesk-assets/issues/306) |
| 1.8 | Reverse proxy | ไม่แน่ใจชนิดและจำนวนชั้น; ยังไม่ได้ตรวจเส้นทางเข้าใช้งานจริง |
| 1.9 | อินเทอร์เน็ต | เครื่องที่ปฏิบัติงานเรียก GitHub และติดตั้ง dependency สำเร็จ; ไม่ยืนยันนโยบายหรือความพร้อมของทุก instance |

## หลักฐานรอบส่งรุ่น

| การตรวจ | ผลและข้อจำกัด |
|---|---|
| หลัง deploy | API liveness และ database health เป็น 200; database readiness ผ่าน; เว็บและ assets 66 ไฟล์เป็น 200; served index ตรงกับ build |
| ขอบเขตสิทธิ์ที่ตรวจ | anonymous `/api/contracts` และ `/api/auth/me` เป็น 401; ยังไม่แทนการตรวจทุก role หลังล็อกอิน |
| เทสบน checkout ที่ deploy | API 296 ผ่าน/1 ข้าม, เว็บ 353 ผ่าน, domain 41 ผ่าน, scripts/workflow 52 ผ่าน; integration เดิมข้ามเพราะไม่มี `SUTH_API_TOKEN` |
| เอกสารและ build | docs check, build และ initial-JS budget ผ่าน (196.2/200 KB gzip) |
| ก่อนส่งมอบ | fixture 580/580; QA แยก 205/205 รันก่อน final test-only commit โดย application source ตรงกัน; ไม่ใช่ผล authenticated acceptance บนข้อมูล production |
| Backup/restore | backup ใหม่และซ้อม restore ลงฐานชั่วคราวผ่านครบ 22 ตาราง โดยจำนวนแถวและ checksum ตรงกับฐานจริง; ไม่ได้ restore ทับฐานจริง |
| Schema รอบนี้ | ไม่มี migration และไม่ได้รัน seed; schema/migration และ dependency lockfile ไม่เปลี่ยนจากรุ่นก่อนหน้า |

ผลตรวจทั้งหมดเป็นหลักฐานเฉพาะรอบนี้ ยังไม่ได้ตรวจ authenticated production flows ครบทุกบทบาท อุปกรณ์จริง และ screen reader ดูวิธีเลือก checks ใน [คู่มือตรวจการเปลี่ยนแปลง](../how-to/verify-changes.md)

## งานความพร้อมที่ยังค้าง

| ลำดับ | งาน | หลักฐานหรือสิ่งที่ยังไม่ยืนยัน | ติดตาม |
|---|---|---|---|
| สูง | ความต่อเนื่องของ backup อัตโนมัติ | งานรายวันล้มเหลว 5–11 ต.ค. เพราะ Docker ไม่พร้อม; manual backup/restore ที่ผ่านยังไม่แทน scheduled-run proof | [#307](https://github.com/saritrungj/suth-helpdesk-assets/issues/307) |
| สูงสำหรับการประเมิน | Dependency vulnerabilities | npm ci รายงาน 10 รายการ รวม critical 1; ยังไม่แน่ใจ runtime reachability และยังไม่ได้ triage ความเสี่ยงแต่ละรายการ | [#339](https://github.com/saritrungj/suth-helpdesk-assets/issues/339) |
| สูง | ตรวจรับหลังล็อกอิน | Dashboard, Compare, บันทึกจำนวนพิมพ์ และรายงานบน instance ที่ส่งจริงยังไม่ได้ตรวจครบ; ใบ deploy เดิม #308 ปิดและเก็บเป็นประวัติแล้ว | [#341](https://github.com/saritrungj/suth-helpdesk-assets/issues/341) |
| กลาง | การฟื้นตัวของบริการ | ยังไม่มีผลทดสอบ reboot/logout/Docker delayed-start | [#340](https://github.com/saritrungj/suth-helpdesk-assets/issues/340) |
| กลาง | ช่องทางใช้งานและ config | HTTPS, proxy, cookie และ config ที่ใช้จริงยังไม่ตรวจยืนยันครบ | [#306](https://github.com/saritrungj/suth-helpdesk-assets/issues/306) |

Issue เก็บเกณฑ์ปิดงานและผลติดตาม; [checklist production](../how-to/prepare-for-production.md) เป็นบ้านหลักของข้อกำหนด วิธี deploy/rollback อยู่ใน [คู่มือส่งรุ่นและกู้คืน](../how-to/release-and-recovery.md) การแก้ production, secrets, migration และข้อมูลจริงต้องมี approval ตาม [ข้อตกลงทีม](../../CONTRIBUTING.md)
