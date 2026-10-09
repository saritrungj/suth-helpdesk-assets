# STATE — #289 พื้นหลังพื้นที่ทำงาน

อัปเดต 2026-10-10 Asia/Bangkok ผู้ใช้เลือกแบบ B ก่อน implementation และอนุมัติ commit → review → feature push/PR โดยหยุดก่อน merge/deploy

## ขอบเขต

ใช้ครีม #FFFAF5 กับแสงพีช #FFE3CC (85%) และมิ้นต์ #D3EFEE (80%) วงรี 70% × 85% จางถึงโปร่งใสที่ 72% เฉพาะ light workspace บน screen ที่ forced-colors:none และไม่มี .auth-stage ตาม #289 ไม่เปลี่ยน opaque surfaces, status colors, Login, dark, print/forced-colors หรือ API/schema/auth/domain/data

Branch: codex/289-workspace-background ใน managed worktree C:/Users/wayuo/.codex/worktrees/289-background-preview/suth-helpdesk-assets ต้นแบบเก็บบน codex/289-background-preview commit 9b412b615240d754924ea23d079d844dcc95b5f9 ภาพก่อน implementation อ้าง base 595399f1cbd4d783f8f57018d8979edd4a807303 ปรับ implementation ตาม main ซึ่งเพิ่มเฉพาะเอกสาร #299/#305 ก่อน frozen review

## ผลตรวจ

- Full fixture: 378 ผ่าน ไม่มี fail/skip/flaky, workers 3, retries 0
- Built focused regressions: 10 ผ่าน (8 เคสใหม่และ Login palette สองธีม)
- Unit checks: 758 ผ่าน 1 skip (API completeness integration ไม่มี SUTH_API_TOKEN)
- Build/budget: ผ่าน initial JS 196.3/200 KB gzip
- ภาพ Overview/Registry/Print Entry ที่ 1440×900 และ 1280×800 พร้อม empty/error/pending/focus จาก HTTP fixtures
- Controlled pixel comparison: dark สามหน้าและ Login light/dark ตรง baseline ทั้งห้าตัวอย่าง
- Print/forced-colors fallback และ viewport 720×450 ไม่ล้น document พร้อม first-Tab skip link

รายงานใน ignored output/playwright และสำเนาคงทนที่ Git-common-directory finish-issue/289/codex%2F289-background-preview รวมภาพ approved-preview และ implementation-images รอบ npm run verify เดิมมี 5 failure จาก CSS minification spelling และ expected canvas เดิมของ Login; แก้การเทียบเป็น rendered RGBA และเปลี่ยนเฉพาะ approved light canvas expectation แล้ว focused/full fixture ผ่าน ไม่อ้างรอบล้มเหลวหรือยกเลิกว่า PASS ต้องรัน full verify ใน pre-push hook อีกครั้ง

## หลักฐานและข้อจำกัด

Gradient RGB bound [211,227,204] และ stacked saturation ≤1.56 bound [191,222,177] มี native Chromium raster และ nested translucent glass screenshot proof ไม่ลด AA thresholds แสดง measured count >0 และ unsupported แยกจาก PASS Registry มี unsupported เดิม 1 ตัวอย่าง Print Entry 2 ตัวอย่าง ขอบเขตนี้ไม่พิสูจน์ arbitrary dark content ที่เลื่อนใต้กระจก

ไม่ได้ตรวจ real DB/API flow, screen reader, password manager, Voice Control, physical devices, actual OS forced colors, browser zoom จริง หรือ usability กับเจ้าหน้าที่ และไม่รับรอง WCAG ครบทุกข้อ การตรวจด้วยคนยังเป็นด่านก่อน merge ตาม Issue และ #270

## ขั้นตอนต่อไป

ตรึง complete committed candidate ตรวจ Standards/Spec/Security แบบอ่านอย่างเดียว (WIP review ไม่นับเป็น approval) ผ่าน identity gate และ full pre-push verify แล้ว push SHA เดียวกับที่ตรวจ เปิด PR พร้อมหลักฐาน/ข้อจำกัด หยุดก่อน merge ไม่มีอำนาจ deploy หรือลบ branch/worktree ในขั้นตอนนี้
