# STATE — Issue #301

อัปเดต: 2026-10-09 (Asia/Bangkok)

## Scope and authority

[Issue #301](https://github.com/saritrungj/suth-helpdesk-assets/issues/301) ปรับ finish-issue ให้ resume จากสถานะจริง รักษาหลักฐาน cleanup และตรวจ frozen candidate ตาม playbook D:/ai-playbook ใช้สกิลรุ่นที่แก้ใน worktree นี้เดินงานจริง

- Branch: codex/301-finish-issue
- Worktree: C:/Users/wayuo/.codex/worktrees/finish-issue-research/suth-helpdesk-assets
- Frozen base: cd6cbaa47be4d1a88a5d929c5f12b307fd82a45b
- Do: แก้สกิล/docs/inspector/tests; commit, feature push และเปิด PR หลัง verified frozen-candidate review
- Don't: merge/deploy, auth/secrets/schema, business data, เปลี่ยน API/web/domain หรือ cleanup branch/worktree ของ #298
- Durable evidence: <git-common-dir>/finish-issue/301/codex%2F301-finish-issue/

## Acceptance evidence

1. Resume merged/partial cleanup, source binding และ limits — SKILL.md, CONTRIBUTING; synthetic forward snapshots A/B ทั้งรุ่นเก่าและใหม่
2. Candidate identity และ pre-push gate — bound review-candidate.mjs; captured JSON และ verdict ของ candidate จะเก็บใน durable evidence หลัง commit
3. Durable checkpoint/receipt/reports, managed archive และ idempotent exact refs — CONTRIBUTING; fixture ทดสอบลบ worktree แล้วยังอ่านหลักฐานได้
4. Read-only inspector, report counts และ unresolved manual gates — 25 inspector regressions; ไม่มี phase DONE และ grantsAuthority=false
5. Checks + independent review — 37 tests ผ่าน, 0 fail/skip (25 inspector + 12 existing script tests), syntax/diff checks และ 55 local link targets ผ่าน; frozen delivery reviews ต้องยืนยัน candidate นี้ก่อน push

## Checks and limits

คำสั่งชุดตรวจ: node --test --test-reporter=tap .agents/skills/finish-issue/scripts/inspect-state.test.cjs scripts/playwright-report.test.cjs scripts/check-bundle-budget.test.cjs scripts/web-vitals-report.test.cjs; report ใน durable checks.tap

Live read-only inspector กับ #298/#300 ยืนยัน PR merged และ Issue closed แล้ว เสนอ update-main ตามสถานะปัจจุบัน โดยไม่แก้ main, refs หรือ worktree ของ #298

ยังไม่ได้รัน full application/API/web/domain/DB/browser suites, live archive/delete/recovery หรือ general model-compliance benchmark ตัว quick validator มาตรฐานรันไม่ได้เพราะไม่มี PyYAML และไม่รองรับ legacy invocation flag เดิม; ตรวจ flat frontmatter และ local links แยก ไม่ติดตั้ง dependency

## Current phase and next action

Freeze complete scoped candidate → capture base/mergeBase/candidate/changedFiles/diffCommand → independent Standards/Spec/Security review (round 1, delivery verdict ยังไม่มี)

หลัง review ผ่าน: รัน pre-push --expect กับ candidate ที่ review แล้ว, push exact feature branch, ยืนยัน remote SHA, เปิด PR อ้าง #301 และแนบ current evidence/limits หยุดก่อน merge

Post-review receipts อยู่ใน durable ignored evidence หรือ PR body; ไม่เพิ่ม tracked bookkeeping commit ที่ยังไม่ผ่าน review
