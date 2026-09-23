# การทำงานร่วมกันใน repository นี้

เอกสารนี้เขียนให้ **คน** อ่านครั้งเดียวตอนเข้าทีม ถ้าคุณเป็น AI agent ให้อ่าน [AGENTS.md](AGENTS.md) แทน — ที่นั่นเป็นกฎที่ต้องใช้ทุกครั้งที่แก้โค้ด

## ลำดับการทำงาน

1. เริ่มจาก GitHub Issue เสมอ แล้วแตก branch ที่ผูกกับ Issue นั้น
2. ตรวจ branch และ `git status` ก่อนแก้ไฟล์ — **ห้ามแก้หรือ commit บน `main`** ถ้าเป็นคำสั่ง implementation, branch ปัจจุบันคือ `main` และ working tree สะอาด ให้สร้าง/ผูก Issue และแตก branch ตามรูปแบบด้านล่างได้ทันทีโดยไม่ถามผู้ใช้ซ้ำ การสร้าง branch เป็นขั้นตอน local ที่ย้อนกลับได้; ถ้าอยู่บน branch อื่น ให้ตรวจว่า branch นั้นผูกกับงานนี้อยู่แล้วหรือไม่ ถ้ามีงานค้างหรือ Issue/branch เป้าหมายไม่ชัด ให้หยุดเพื่อรักษางานเดิม
3. อ่าน source ที่เกี่ยวข้อง วิเคราะห์ แล้วเสนอแผนก่อนลงมือ
4. ทำเฉพาะสิ่งที่อยู่ใน scope ของ Issue และรักษาการเปลี่ยนแปลงที่ผู้อื่นค้างไว้
5. ตรวจ `git diff` และรัน check ที่สัมพันธ์กับความเสี่ยงของการเปลี่ยนแปลง
6. สรุปไฟล์ที่เปลี่ยน ผลตรวจ และความเสี่ยงที่ยังเหลือ

## ชื่อ branch

```
<type>/<issue>-<คำอธิบายสั้น>

fix/12-expense-fiscal-year-filter
docs/7-simplify-documentation
refactor/15-workspace-structure
```

## ข้อความ commit

ใช้ [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) — subject เป็นประโยคคำสั่ง ไม่ใส่จุดท้าย

```
<type>(<scope>): <คำอธิบาย>

fix(expense): กรองยอดพิมพ์ตามช่วงเดือนของปีงบจริง
feat(devices)!: เปลี่ยน endpoint มารับ fiscal_year_id
docs: simplify project documentation (#7)
```

| type | ใช้เมื่อ |
|---|---|
| `feat` | เพิ่มความสามารถใหม่ |
| `fix` | แก้บั๊ก |
| `docs` | แก้เฉพาะเอกสาร |
| `refactor` | ย้าย/จัดโค้ดใหม่โดยพฤติกรรมไม่เปลี่ยน |
| `test` | เพิ่มหรือแก้เทส |
| `chore` | dependency, config, เครื่องมือ |
| `db` | schema และ migration |

เครื่องหมาย `!` หลัง scope หมายถึง breaking change และต้องอธิบายไว้ใน body ด้วย

**กฎที่สำคัญที่สุดข้อเดียว:** commit ที่ย้ายไฟล์ ห้ามเปลี่ยนพฤติกรรมไปด้วย diff ที่ปนกันระหว่าง "ย้ายที่" กับ "แก้ตรรกะ" review ไม่ได้จริง และเวลามีบั๊กจะ bisect หาสาเหตุไม่ได้

## ทำงานหลาย session พร้อมกัน

เมื่อมีมากกว่าหนึ่ง session (คนหรือ AI agent) แก้ repo นี้พร้อมกัน ทุก session ใช้ [git worktree](https://git-scm.com/docs/git-worktree) ของตัวเอง เพราะ branch ที่ checkout อยู่เป็นของโฟลเดอร์ ไม่ใช่ของ session — การ `checkout` ในโฟลเดอร์ที่อีกคนใช้อยู่จะสลับ branch ของเขาออกไปทั้งที่เขายังทำงานไม่เสร็จ และไฟล์ที่ยังไม่ commit จะติดไปอยู่บน branch ผิด

```powershell
git fetch origin
git worktree add -b fix/12-expense-fiscal-year-filter D:/suth-worktrees/12-expense origin/main
cd D:/suth-worktrees/12-expense
npm ci
```

- โฟลเดอร์หลักของ repo ใช้อยู่บน `main` เพื่อ `pull` ตามเท่านั้น ไม่สลับ branch และไม่แก้ไฟล์ในนั้น
- หนึ่ง worktree ต่อหนึ่ง Issue แต่ละ worktree ต้อง `npm ci` ของตัวเอง
- แบ่งงานให้แตะไฟล์ไม่ซ้ำกัน ถ้าต้องแตะไฟล์เดียวกัน ให้ทำทีละฝั่ง — รอฝั่งแรก merge แล้วอีกฝั่งเริ่มจาก `origin/main` ใหม่
- ก่อนเริ่ม แจ้งอีก session ว่าจะทำ Issue ไหน branch อะไร แตะไฟล์ไหน
- merge เข้า `main` ทีละ PR อีกฝั่ง rebase ตามก่อนเปิด PR ของตัวเอง
- merge แล้วลบ worktree ด้วย `git worktree remove <path>` ก่อนลบ branch

ของที่ใช้ร่วมกันข้าม worktree ได้ทีละคน:

- **พอร์ตเว็บของ E2E (ค่าเริ่มต้น 5173)** — Playwright ใช้เซิร์ฟเวอร์ที่เปิดอยู่แล้วบนพอร์ตนั้นซ้ำ (`reuseExistingServer`) ถ้าอีก worktree เปิดค้างไว้ เทสจะตรวจ build ของอีกฝั่งโดยไม่มีอะไรเตือน รัน E2E พร้อมกันให้ตั้งพอร์ตแยกด้วย `SUTH_WEB_URL` เช่น `$env:SUTH_WEB_URL = "http://localhost:5174"`
- **`npm run verify:db`** — ใช้พอร์ต 3317/3310/5310 ตายตัว และจะหยุดเองถ้ามีคนใช้อยู่ รันได้ทีละ worktree
- **ฐานข้อมูลพัฒนาและ API ที่พอร์ต 3000** — ใช้ร่วมกันทุก worktree ชุดที่เขียนข้อมูล (`SUTH_E2E_ALLOW_WRITES=1`) ห้ามรันพร้อมกัน

## Pull request

ระบุให้ครบ: Issue ต้นทาง, สิ่งที่เปลี่ยน, check ที่รันแล้วพร้อมผล, ลำดับ migration ถ้าเกี่ยวข้อง และ screenshot ถ้าเป็นงาน UI

รายงานสิ่งที่ **ไม่ได้** ทดสอบทุกครั้ง

## Authority สำหรับ Git lifecycle

ปกติ commit, push, merge และลบ branch ต้องมีคำสั่งชัดเจน แต่คำสั่งให้ **“ปิดงาน”**, **“finish end-to-end”** หรือความหมายเทียบเท่า ถือเป็น authorization ชุดเดียวให้ทำ Git lifecycle จนครบหลัง acceptance criteria, checks และ review ผ่าน โดยไม่หยุดถามซ้ำทุกขั้น:

1. commit เฉพาะ diff ใน scope แล้ว push feature branch
2. เปิด PR ที่อ้าง Issue พร้อมผลตรวจและสิ่งที่ไม่ได้ทดสอบ
3. merge PR และยืนยันว่า Issue ปิดตามที่ตั้งใจ
4. กลับ `main` และอัปเดตแบบ fast-forward แต่ยังเก็บ local branch และ checkpoint ไว้
5. ตรวจ resolved path ให้อยู่ใต้ workspace แล้วล้างเฉพาะ generated artifacts ของงาน **ยกเว้น checkpoint** ห้ามลบ source, credential หรือข้อมูลผู้ใช้
6. ทำ pre-cleanup verification ว่า PR merge แล้ว, Issue อยู่ในสถานะที่ตั้งใจ, merge commit อยู่บน `main`/`origin/main`, working tree สะอาด และ generated artifacts เป้าหมายหาย แล้วบันทึกหลักฐานนี้ไว้ใน PR/Issue และ checkpoint
7. ลบ exact remote branch, ตรวจด้วย `git ls-remote --heads <remote> <exact-branch>` และถ้า remote-tracking ref เดิมยังค้างให้ลบเฉพาะ ref นั้น ห้ามใช้ global `fetch --prune` เป็น cleanup ของงานเดียว ถ้าขั้นนี้ล้ม local branch และ checkpoint ต้องยังอยู่
8. ลบ exact local branch หลัง remote cleanup ผ่าน แล้วตรวจว่า ref หายจริง
9. ลบ checkpoint เป็นรายการสุดท้าย จากนั้นทำ read-only audit ว่า working tree สะอาด, branch เป้าหมายหายทั้ง local/remote และ `main` ตรงกับ `origin/main`; ถ้า audit ล้มให้หยุดโดยไม่ทำ destructive action เพิ่ม และใช้หลักฐานถาวรใน PR/Issue/main กู้สถานะ

ถ้าขั้นตอนใดใน lifecycle, issue closure, main update, branch cleanup, artifact cleanup หรือ final verification ล้ม ให้หยุดขั้นตอนถัดไปทันทีและรักษา branch/หลักฐานที่ยังเหลือไว้สำหรับกู้หรือแก้ปัญหา ห้ามถือว่า partial cleanup คือความสำเร็จ ข้อจำกัดล่าสุดของผู้ใช้ เช่น “ห้าม push” หรือ “ไม่ต้อง merge” ชนะ authorization แบบชุดเสมอ

## เรื่องที่ต้องขออนุมัติก่อนทำ

- เปลี่ยน schema หรือเพิ่ม migration
- แตะ auth, สิทธิ์ หรือ secret
- operation ที่ลบหรือเขียนทับข้อมูลธุรกิจ, source, credential หรือไฟล์ผู้ใช้ (ไม่รวม generated artifacts/checkpoint ที่ workflow ระบุให้ล้างหลัง merge)
- deploy หรือเปลี่ยนอะไรบน production

คำสั่งปิดงานแบบ end-to-end **ไม่ครอบคลุม** รายการข้างบน และไม่อนุญาต destructive business-data operation โดยปริยาย

## การตัดสินใจที่ย้อนกลับยาก

ถ้าเป็นเรื่องที่กลับตัวแล้วเจ็บ — เลือกฐานข้อมูล รูปแบบวันที่ โมเดลสิทธิ์ — เขียน ADR ไว้ที่ [`docs/decisions/`](docs/decisions/) **ตอนที่ตัดสิน** ไม่ใช่ตอนสรุปทีหลัง คุณค่าอยู่ที่ทางเลือกที่ถูกตัดทิ้ง ซึ่งเป็นสิ่งแรกที่ทุกคนลืม

## Changelog

การเปลี่ยนแปลงที่ผู้ใช้สังเกตเห็นได้ ให้เพิ่มบรรทัดใน [CHANGELOG.md](CHANGELOG.md) หัวข้อ `Unreleased` ในรอบเดียวกับ PR — อย่ารอไปเขียนตอนออกรุ่น เพราะจะกลายเป็นการ dump `git log` ซึ่งเต็มไปด้วยสิ่งที่ผู้ใช้ไม่ต้องรู้
