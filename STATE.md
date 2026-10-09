# STATE — Issue #301

อัปเดต: 2026-10-10 (Asia/Bangkok)

## Scope and authority

[Issue #301](https://github.com/saritrungj/suth-helpdesk-assets/issues/301) ปรับ finish-issue ให้ resume จากสถานะจริง รักษาหลักฐาน cleanup และตรวจ frozen candidate ตาม playbook D:/ai-playbook

- Branch: codex/301-finish-issue
- Worktree: C:/Users/wayuo/.codex/worktrees/finish-issue-research/suth-helpdesk-assets
- Frozen base: cd6cbaa47be4d1a88a5d929c5f12b307fd82a45b
- Do: แก้สกิล/docs/inspector/tests; commit, feature push และเปิด PR หลัง verified frozen-candidate review
- Don't: merge/deploy, auth/secrets/schema, business data, เปลี่ยน API/web/domain หรือ cleanup branch/worktree ของ #298
- Durable evidence: <git-common-dir>/finish-issue/301/codex%2F301-finish-issue/

## Acceptance evidence

1. Resume merged/partial cleanup, source binding และ limits — SKILL.md, CONTRIBUTING; synthetic forward snapshots A/B
2. Candidate identity/pre-push gate — bound review-candidate.mjs; capture และ reviews ใช้ exact committed candidate
3. Durable evidence, managed archive และ idempotent exact refs — CONTRIBUTING; fixture ตรวจอ่านหลักฐานหลังลบ worktree
4. Read-only inspector, report counts/manual gates — inspector regressions; ไม่มี DONE และ grantsAuthority=false
5. Hook isolation — fixture และ inspector subprocesses ล้าง Git repository-local variables โดยไม่เปลี่ยน process.env; regression ใช้ hook-like environment ชี้ disposable decoy ตรวจ config ไม่เปลี่ยนและ resume ก่อน/หลัง merge ถูกต้อง
6. Checks + independent review — frozen candidate ต้องผ่าน full required hook และ Standards/Spec/Security แยกกันก่อน push

## Delivery scopes and failures

Scope แรกครบสอง review/fix rounds แล้ว แต่ mandatory pre-push เปิดเผย blocker: fixture รับ Git environment ของ hook และเปลี่ยน shared repo config; publication ถูกหยุด ไม่มี PR ค่า config คืนแล้วและ refs/worktrees เดิมปลอดภัย รายงาน: publication-blocker.md

ผู้ใช้อนุมัติ scope ใหม่ให้แก้ Git subprocess isolation, ตรวจและรีวิวใหม่ก่อน feature push/PR ส่วนเดิมยังอยู่ครบสำหรับการรีวิว full diff; ไม่สืบทอด verdict เดิม Counter ของ scope ใหม่นับแยกโดยบันทึก scope แรกไว้ ไม่ reset counter โดยเงียบ

RED: red-hook-isolation.log ยืนยัน fixture เปลี่ยน decoy config; red-hook-ancestry.log ยืนยัน merged route ผิดภายใต้ hook ทั้งคู่ใช้พื้นที่ชั่วคราวแทน repo จริง
GREEN: green-hook-isolation.tap ตรวจ open/merged child cases และ config คงเดิม; scope2-checks.tap ผ่าน 38/38 ไม่มี fail/skip (26 inspector + 12 existing scripts) ผล full hook และ frozen reviews เก็บแยกใน durable directory

## Checks and limits

คำสั่งเฉพาะ: node --test --test-reporter=tap .agents/skills/finish-issue/scripts/inspect-state.test.cjs scripts/playwright-report.test.cjs scripts/check-bundle-budget.test.cjs scripts/web-vitals-report.test.cjs

Required delivery gate: git hook run pre-push และ pre-push ของ feature push จริง รัน unit ทุก workspace, web build, bundle budget และ fixture E2E; ต้องอ่านรายงาน counts/skip และยืนยัน shared config ไม่เปลี่ยน ไม่ bypass hook

ไม่ได้ทดสอบ DB/API service flows, live cleanup/archive/recovery, หรือ general model compliance; ไม่มี API/web/domain changes ตัว quick validator มาตรฐานใช้ไม่ได้เพราะไม่มี PyYAML; flat frontmatter และ local targets ตรวจแยก การตั้ง worktree ใช้ npm ci --ignore-scripts ตาม lockfile ไม่อัปเกรด dependencies; npm รายงาน existing advisories ซึ่งไม่ได้แก้ใน scope นี้

## Current phase and next action

Scope ใหม่: verify → freeze complete candidate → capture เทียบ original base → independent review round 1 ทุกมิติ ถ้าแก้หลังรีวิวต้อง candidate ใหม่และนับ round 2 ตาม core

หลัง review ผ่าน: pre-push --expect → push exact branch → ยืนยัน remote SHA → เปิด PR #301 และแนบ current evidence/limits หยุดก่อน merge

Post-review receipts อยู่ใน durable ignored evidence หรือ PR body; ไม่เพิ่ม tracked bookkeeping commit ที่ยังไม่ผ่าน review
