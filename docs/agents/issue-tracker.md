# Issue tracker: GitHub

Issue และ spec ของ repo นี้อยู่ใน GitHub Issues ใช้ `gh` CLI สำหรับทุกการทำงาน

## ข้อตกลง

- **สร้าง issue**: `gh issue create --title "..." --body "..."` ใช้ heredoc ถ้า body หลายบรรทัด
- **อ่าน issue**: `gh issue view <number> --comments` กรอง comment ด้วย `jq` และดึง label มาด้วย
- **แสดงรายการ issue**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` ใส่ `--label` / `--state` ตามต้องการ
- **comment บน issue**: `gh issue comment <number> --body "..."`
- **ติด/ถอด label**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **ปิด**: `gh issue close <number> --comment "..."`

`gh` เดา repo จาก `git remote -v` เองเมื่อรันในเครื่องที่ clone ไว้แล้ว (repo นี้คือ `saritrungj/suth-helpdesk-assets`)

## PR เป็นช่องทาง triage ไหม

**ไม่ใช้** _(เปลี่ยนเป็น "ใช้" ถ้า repo นี้เริ่มรับ PR จากภายนอกเป็น feature request — `/triage` จะอ่านค่านี้)_

เมื่อเปิดใช้ PR จะผ่าน label/state ชุดเดียวกับ issue โดยใช้คำสั่งเทียบเท่าของ `gh pr`:

- **อ่าน PR**: `gh pr view <number> --comments` และ `gh pr diff <number>` สำหรับ diff
- **แสดงรายการ PR ภายนอกสำหรับ triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` แล้วกรองเฉพาะ `authorAssociation` เป็น `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, หรือ `NONE` (ตัด `OWNER`/`MEMBER`/`COLLABORATOR` ออก)
- **comment / label / ปิด**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`

GitHub ใช้เลขชุดเดียวกันระหว่าง issue กับ PR ดังนั้น `#42` เฉยๆ อาจเป็นได้ทั้งคู่ — เช็คด้วย `gh pr view 42` ก่อน แล้วค่อย fallback ไป `gh issue view 42`

## เมื่อ skill บอกว่า "publish ไปที่ issue tracker"

สร้าง GitHub issue

## เมื่อ skill บอกว่า "ดึง ticket ที่เกี่ยวข้อง"

รัน `gh issue view <number> --comments`

## การทำงานของ Wayfinding

ใช้โดย `/wayfinder` — **map** คือ issue เดียวที่มี **child** เป็น issue ย่อย

- **Map**: issue เดียวติด label `wayfinder:map` เก็บเนื้อหา Notes / Decisions-so-far / Fog — `gh issue create --label wayfinder:map`
- **Child ticket**: issue ที่ผูกกับ map แบบ GitHub sub-issue (`gh api` บน sub-issues endpoint) ถ้า sub-issue ใช้ไม่ได้ ให้เพิ่ม child เข้า task list ใน body ของ map แล้วใส่ `Part of #<map>` ไว้บนสุดของ body child — label: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`) พอมีคน claim แล้วให้ assign ให้คนนั้น
- **Blocking**: ใช้ **native issue dependencies** ของ GitHub — เป็นตัวแทนหลักที่มองเห็นได้บน UI เพิ่ม edge ด้วย `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` โดย `<blocker-db-id>` คือ **database id** ตัวเลขของ blocker (`gh api repos/<owner>/<repo>/issues/<n> --jq .id` ไม่ใช่ `#number` หรือ `node_id`) GitHub รายงาน `issue_dependencies_summary.blocked_by` (นับเฉพาะ blocker ที่ยังเปิดอยู่) ถ้าใช้ dependencies ไม่ได้ ให้ fallback เป็นบรรทัด `Blocked by: #<n>, #<n>` บนสุดของ body — child ticket จะพ้น block เมื่อ blocker ทุกตัวถูกปิดหมด
- **Frontier query**: แสดง child ที่ยังเปิดของ map (`gh issue list --state open` scope เฉพาะ sub-issue/task list ของ map) ตัดตัวที่มี blocker เปิดอยู่ (`issue_dependencies_summary.blocked_by > 0` หรือมี issue เปิดอยู่ใน `Blocked by`) หรือมีคน assign แล้วออก เลือกตัวแรกตามลำดับใน map
- **Claim**: `gh issue edit <n> --add-assignee @me` — งานเขียนแรกของ session
- **Resolve**: `gh issue comment <n> --body "<answer>"` แล้ว `gh issue close <n>` แล้วต่อท้าย context pointer (gist + link) เข้าไปใน Decisions-so-far ของ map
