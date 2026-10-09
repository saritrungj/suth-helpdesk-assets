# STATE — Issue #298

อัปเดต: 2026-10-09 (Asia/Bangkok)

## Scope และสถานะ

Implementation ของ [#298](https://github.com/saritrungj/suth-helpdesk-assets/issues/298) ตรวจพฤติกรรมและ checks แล้ว ตาม skill `implement` ที่ผูกกับ `D:/ai-playbook` จบ invocation นี้หลัง independent code-review ของ frozen candidate; ยังไม่ร้องขอ feature push, PR, merge หรือ deploy

- Branch: `codex/298-login`
- Worktree: `C:/Users/wayuo/.codex/worktrees/298-login/suth-helpdesk-assets`
- Frozen base: `71da92acbce61f31af0629bb9c24eb948f812098` (`main` ตอนเริ่มงาน)
- ต้นแบบที่รับ: `14e2e6789dbb0d99bc7e55768560c3735de42bb3`
- Do: นำเฉพาะ Login พร้อมภาพ/สไตล์ที่ใช้จริง, เพิ่ม regression และปรับ tests/คำแปล/เอกสารที่ได้รับผล
- Don't: sidebar, topbar, Dashboard, shared UI components, API, auth policy, roles, session, schema และสีของหน้าหลังเข้าสู่ระบบ

## Done criteria และหลักฐาน

1. Split/stack ตาม breakpoint และพอดีจอ 10 ขนาดทั้งสองธีม ไม่มีร่องขวา; จอเตี้ยกว่าเนื้อหาขั้นต่ำยังเลื่อนได้ — `login-layout.spec.js`, `login-options.spec.js`
2. หัวเรื่อง/บรรทัดรอง, แถวจำชื่อผู้ใช้กับลืมรหัสผ่าน, เบอร์ที่ยืนยัน, ผู้ดูแล และลิขสิทธิ์ พ.ศ. — E2E และ [แบบ Login](docs/explanation/design-system.md#หน้า-login-แบบที่เจ้าของงานรับ-2026-10-09)
3. Caps Lock ใช้สถานะแป้นที่เบราว์เซอร์รายงาน คงคำเตือนผ่านการพิมพ์/โฟกัส ไม่เดาจาก Shift/ตัวพิมพ์ใหญ่ และไม่รับ events ปลอม — unit boundary/composable tests และ E2E; แป้นจริงใน candidate นี้ยังไม่ตรวจซ้ำ
4. ปุ่มแสดง/ซ่อนรหัสผ่าน, ชื่อปุ่มที่ไม่ซ้ำ `aria-pressed`, autocomplete/id, opted-in username only, pending/error และ redirect — Login E2E, authenticated DB flows; Edge มีปุ่มเดียวหลังพิมพ์จริงผ่าน keyboard automation และเมื่อบังคับ native reveal กลับมาภาพแสดงสองปุ่ม
5. ไม่เปลี่ยน palette/shell หลังเข้าสู่ระบบ; ภาพ Login ทั้ง 8 ไฟล์ตรงกับต้นแบบทุก byte — E2E palette restore และ Git byte comparison; [brand provenance](docs/assets/brand/README.md)

## Verification (2026-10-09)

- RED ก่อน implementation: `login-layout.spec.js` ที่ 1920×940 light ล้มเพราะ h1 เดิมเป็น “เข้าสู่ระบบ”
- `npm test`: API 297 + web 351 + domain 41 + scripts 12 = 701 ผ่าน; ไม่มี skip
- `npm run build` และ `node scripts/check-bundle-budget.cjs`: ผ่าน, initial JS 196.3/200 KB gzip; repo ไม่มี typecheck script แยก
- `npm run test:e2e:fixture --workspace @suth/web -- --workers=3 --output ../../output/fixture-artifacts`: 370 ผ่าน, 0 fail/skip; report validator ผ่าน ใช้ preview พอร์ต 5698 เฉพาะงาน
- `node output/verify-db-isolated.cjs`: 201 ผ่าน, 0 fail/skip/flaky; MySQL ชั่วคราวถูกลบแล้ว ใช้ instance `issue-298` และพอร์ต 3398/3399/5399 แยกจากฐานพัฒนา
- DB adapter เป็นสำเนา `scripts/verify-db.cjs` ที่เปลี่ยนเพียง require path และที่อยู่ report/artifacts เพื่อไม่ให้ชุด fixture ลบ trace ของ DB; ไม่มีการเปลี่ยน test/assertion/seed หรือพฤติกรรม harness
- Microsoft Edge: Login/layout/options/identity 43 ผ่าน; ภาพ A/B ของ native reveal เพิ่มเติมอยู่ใน `output/edge-password-reveal{,-forced}.png`
- `git diff --check`: ผ่าน

รอบแรกพบ locator ของ details/summary เดิม, ชื่อผู้ใช้ที่ match checkbox ใหม่, คำแปลใหม่ที่ขาด และ trace ชนกัน; ปรับ locator แบบ exact/aria-expanded เพิ่มคำแปล และแยก artifacts แล้ว รอบ fixture ถัดมาพบการวัด contrast ระหว่าง opacity=0 ของ route fade จึงรอ animation ของ ancestor ก่อนวัด โดยคงเกณฑ์ contrast เดิมและรัน fixture ทั้งชุดซ้ำจนผ่าน

หลักฐานที่สร้างใหม่ได้ไม่ถูก track: `output/unit-final.log`, `output/build-final.log`, `output/fixture-final.log`, `output/fixture-results.json`, `output/verify-db-final.log`, `output/db-results.json`, `output/edge.log`, ภาพใน `output/` และ review receipts ด้านล่าง

## Review และขั้นต่อไป

Candidate identity / exact diff อยู่ใน `output/review-candidate.json`; independent Standards, Spec และ Security/robustness verdict อยู่ใน `output/review-results.md` หลังจบรอบ review (receipts เป็นไฟล์ ignored ตาม playbook core)

ขั้นถัดไปเมื่อ verdict ผ่าน: สั่ง “เปิด PR ของ #298” เพื่ออนุญาต feature push/PR ตาม delivery gate; ยังไม่ merge

## ขอบเขตที่ไม่ได้ทดสอบ

ยังไม่ได้ตรวจ Caps Lock ด้วยแป้นจริงซ้ำบน candidate (Playwright ส่ง CapsLock แล้วสถานะ modifier ไม่เปลี่ยน); ต้นแบบมีหลักฐานแป้นจริง Chromium/Windows อยู่แล้ว Unit test จำลองการส่งสถานะจากเบราว์เซอร์จึงไม่ใช่หลักฐาน hardware

ยังไม่ได้ตรวจ Firefox, Safari, อุปกรณ์จริง, screen reader, โปรแกรมจัดการรหัสผ่าน, Voice Control, Windows forced-colors จริง, production และ migration paths (ไม่มี schema diff) ขอบเขต accessibility อยู่ที่ [หน้าล็อกอิน](docs/reference/accessibility.md#หน้าล็อกอิน)
