# แนวทางปรับ finish-issue จากแหล่งต้นทาง

ตรวจแหล่งข้อมูลวันที่ 9 ตุลาคม 2026 — บันทึกวิจัยและแนวทางที่ประยุกต์สำหรับ finish-issue

โจทย์: ปรับสกิล finish-issue ให้ทำงานต่อจากสถานะที่มีอยู่ได้ถูกต้อง ตรวจผลได้ และเก็บหลักฐานจนจบ Git lifecycle โดยรักษาขอบเขตสิทธิ์ของผู้ใช้และกติกาของ repo

## ข้อเสนอหลัก

ให้สกิลเป็นทางเข้าที่สั้นและชี้ไปยังแหล่งกติกาหลัก เพิ่มการเลือกขั้นตอนจากสถานะจริง และใช้เครื่องมือขนาดเล็กตรวจข้อเท็จจริงที่ตรวจซ้ำได้ แยกการตัดสินด้านคุณภาพออกเป็นรีวิวอิสระ ข้อเสนอนี้เป็นการประยุกต์จากแหล่งด้านล่างเข้ากับ repo นี้ ไม่ใช่คำสั่งสำเร็จรูปจากบริษัทเหล่านั้น

## แหล่งต้นทางและสิ่งที่นำมาประยุกต์

| แหล่ง | สิ่งที่แหล่งนั้นเสนอ | ข้อเสนอสำหรับ repo นี้ |
|---|---|---|
| OpenAI — [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/), Ryan Lopopolo, 11 ก.พ. 2026 | ลงแรงกับสภาพแวดล้อมและวงจร feedback; ใช้เอกสารทางเข้าสั้นที่พาไปหาความรู้ใน repo; บังคับ invariant ที่ตรวจได้ด้วยเครื่องมือ | SKILL.md ชี้ไปยัง CONTRIBUTING และ review-workflow; ตรวจ SHA, refs, รายงานเทส และแหล่งสกิลด้วย helper แทนการฝากทุกอย่างไว้กับข้อความเตือน |
| poteto — [Verify and ship](https://github.com/cursor/plugins/blob/ccb5507cec1546dc88135c1139c811e6c59115ba/pstack/docs/guide/06-verify-and-ship.md), คู่มือ pstack | ต้องมีหลักฐานการทำงานจริงตามชนิดงาน เก็บคำสั่งและผลที่ตรวจต่อได้ แยกการพิสูจน์และรีวิวออกจากผู้เขียน | ทำ acceptance matrix: เกณฑ์ → public seam → คำสั่ง/flow → artifact → ผลและข้อจำกัด; ใช้ reviewer อิสระกับ candidate เดียวกัน |
| Anthropic — [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), Justin Young, 26 พ.ย. 2025 | Compaction อย่างเดียวไม่พอ; progress record และ Git history ช่วยรับงานต่อ; feature จะผ่านเมื่อมีการตรวจจริง | ทุกครั้งที่ resume อ่าน checkpoint แล้วตรวจ branch, diff, PR และ Issue ใหม่; ถ้า PR merge แล้วให้เข้าเส้นทางตรวจหลัง merge แทนการเริ่ม implementation ใหม่ |
| GitHub — [Validating agentic behavior when “correct” isn’t deterministic](https://github.blog/ai-and-ml/generative-ai/validating-agentic-behavior-when-correct-isnt-deterministic/), Gaurav Mittal และ Reshabh Kumar Sharma, 6 พ.ค. 2026; อัปเดต 26 พ.ค. | ตรวจผลสำคัญโดยอิสระจากเส้นทางที่ agent เลือก และใช้สัญญาณจากระบบประกอบ | ตัดสินว่าจบจาก PR/Issue/refs/หลักฐานจริง ยอมรับวิธีตรวจหลายแบบ แต่คงลำดับที่จำเป็นต่อการรักษางานและหลักฐาน |
| Anthropic — [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), 9 ม.ค. 2026 | แยกข้อความที่ agent พูดออกจากผลที่เกิดขึ้นจริง; เลือก code/model/human grader ให้เหมาะ และใช้ regression evals | ทดสอบสกิลเก่าเทียบใหม่ด้วยสถานการณ์จำลอง ใช้ code ตรวจ refs/SHA/การเก็บไฟล์ และคนหรือ reviewer อิสระตรวจ scope และการอ้างหลักฐาน |
| OpenAI — [Running Codex safely at OpenAI](https://openai.com/index/running-codex-safely/), 8 พ.ค. 2026 | ขอบเขตการทำงาน สิทธิ์ และ audit trail ต้องตรวจสอบได้; telemetry แสดงคำสั่ง การอนุมัติ และผลเครื่องมือ | receipt บันทึกการกระทำ เป้าหมาย ผล และที่มาของ authorization ที่เกี่ยวข้อง โดยไม่เก็บ secret; checkpoint เป็นข้อมูลสถานะ ไม่ให้สิทธิ์เพิ่ม |

แหล่งเสริมของ poteto ที่อ่านโดยตรง:

- [Verification skill example](https://github.com/poteto/verification-skill-example/blob/d5abe70d0d8c671672b6cef4069363f26c488feb/README.md): ตัวอย่าง feature map พร้อม entry points, วิธีขับ harness และสิ่งที่อาจทำให้เข้าใจผิด เป็นตัวอย่างสมมติ ไม่ใช่หลักฐานว่ามีผลิตภัณฑ์หรือ driver พร้อมใช้งาน
- [Session pickup](https://github.com/cursor/plugins/blob/ccb5507cec1546dc88135c1139c811e6c59115ba/pstack/skills/poteto-mode/playbooks/session-pickup.md): รับงานต่อจาก trail และ workspace ของงานโดยตรวจหลักฐานที่สืบทอดมา เสนอให้ใช้กับ phase detection; การรับข้อมูลเดิมไม่ได้เปลี่ยนขอบเขตสิทธิ์
- [Explain the Number](https://github.com/cursor/plugins/blob/ccb5507cec1546dc88135c1139c811e6c59115ba/pstack/skills/principle-explain-the-number/SKILL.md): ตรวจความหมายและที่มาของตัวเลข เสนอให้ดึง passed/failed/skipped จากรายงานเครื่องโดยตรง
- [Make operations idempotent](https://github.com/cursor/plugins/blob/ccb5507cec1546dc88135c1139c811e6c59115ba/pstack/skills/principle-make-operations-idempotent/SKILL.md): คิดถึงการรันซ้ำและการหยุดกลางทาง เสนอให้ resume cleanup จากสถานะปัจจุบัน และตรวจการกระทำที่ทำแล้วก่อนทำซ้ำ
- [Eval playbook](https://github.com/cursor/plugins/blob/ccb5507cec1546dc88135c1139c811e6c59115ba/pstack/skills/poteto-mode/playbooks/eval.md): เปรียบเทียบตัวเลือกด้วยโจทย์และ rubric ที่ควบคุมได้ เสนอให้ใช้ fixtures สังเคราะห์และ reviewer ที่ไม่รู้ว่าเป็นสกิลเก่าหรือใหม่

ลิงก์ pstack ตรึงที่ commit `ccb5507cec1546dc88135c1139c811e6c59115ba` (8 ต.ค. 2026) และตัวอย่าง verification ตรึงที่ `d5abe70d0d8c671672b6cef4069363f26c488feb` (30 ก.ค. 2026) เพื่อให้ตรวจย้อนกลับเนื้อหาเดียวกันได้ อ่านไฟล์ผ่าน GitHub API เมื่อหน้าเว็บอ่านไม่ได้

## ช่องว่างที่พบก่อนปรับ

ข้อสังเกตส่วนนี้บันทึก baseline ก่อนลงมือ มาจากไฟล์ใน repo และ playbook ไม่ใช่ข้อกล่าวอ้างของบทความภายนอก ลิงก์ชี้ไปยังบ้านหลักที่ปรับแล้วในร่างนี้:

- [finish-issue](../../.agents/skills/finish-issue/SKILL.md) เริ่ม convergence loop ด้วย reproduce/TDD ทุกครั้ง และยังไม่มีทางเข้าเฉพาะสำหรับ PR ที่ merge แล้ว
- checkpoint อยู่ใน `output/finish-issue/<number>/checkpoint.md` ภายใน worktree แต่ [CONTRIBUTING](../../CONTRIBUTING.md) ระบุทั้งการลบ worktree ก่อนลบ branch และการเก็บ checkpoint จนขั้นสุดท้าย ต้องกำหนดตำแหน่งหลักฐานที่อยู่นอก worktree ให้ชัดก่อนนำออก
- finish-issue ระบุ Standards/Spec แต่ [review-workflow](../agents/review-workflow.md) มีสามมิติ: Standards, Spec และ Security/robustness; specialist agents ใช้ตาม trigger
- สกิลรีวิว baseline รวม working tree/new files แต่ playbook ต้อง freeze committed candidate ก่อนรีวิว และผูกการตรวจเข้ากับ SHA
- สกิลมีเกณฑ์ retry สามครั้ง แต่ `D:/ai-playbook/instructions/core.md` จำกัดการลองแนวเดิมสองครั้ง และจำกัด review/fix rounds สองรอบ ต้องแยกนิยามและยึดกติกาหลัก
- ยังไม่มีส่วน resolve playbook root และ helper source เหมือนสกิล playbook รุ่นปัจจุบัน

## ลำดับที่แนะนำ

### รอบแรก: แก้สัญญาการทำงานและความต่อเนื่อง

แก้ finish-issue ให้ตรวจสถานะก่อนเลือกเส้นทาง: implement → verify → review → handoff/publish → merged → cleanup → done โดยแต่ละขั้นยังขึ้นกับ authorization ที่มีอยู่ ถ้า merge แล้วไม่สร้าง PR ใหม่หรือเริ่ม TDD ใหม่ หากข้อมูลไม่ตรงให้รักษางานและตรวจหาสาเหตุ

ทำ playbook binding, candidate SHA, review สามมิติตาม trigger และ round limits ให้สอดคล้องกับแหล่งกติกาปัจจุบัน ข้อจำกัดจำนวนรอบหมายถึงหยุดและรายงาน blocker ไม่ใช่เปลี่ยนผลเป็นผ่าน

แก้ลำดับ cleanup ใน CONTRIBUTING ซึ่งเป็นบ้านหลักแห่งเดียว: แยก managed worktree ของ Codex กับ worktree ปกติ และเก็บหลักฐานที่ต้องรักษาไว้ในตำแหน่งที่ไม่ถูกเอาออกพร้อม worktree ก่อนทำ cleanup สกิลลิงก์กลับไปใช้ลำดับนี้ สำหรับ managed worktree ต้องคำนึงว่า archive snapshot ไม่รวม ignored files

### รอบสอง: เพิ่มเครื่องมือตรวจข้อเท็จจริงที่จำเป็น

เริ่มจาก helper ตรวจแบบอ่านอย่างเดียว ใช้ตัวช่วยที่มีอยู่ก่อน เช่น review candidate และ report parser ไม่เริ่มด้วย workflow framework ใหม่ ให้ helper คืนค่าที่ agent และคนตรวจต่อได้:

| ข้อมูล | ตรวจอะไร |
|---|---|
| issue, PR, branch, worktree, phase | ระบุงานและเป้าหมายตรงกัน; PR merge/Issue closure เป็นสถานะปัจจุบัน |
| baseline, candidate, merge SHA | รีวิวและ checks เป็นของ candidate ที่จะส่ง; ตรวจ merge commit บน main โดยรองรับ squash merge |
| check command, report path, counts, limitations | แยก pass/fail/skip; missing report หรือ command failure ไม่กลายเป็น pass |
| Standards, Spec, Security/robustness | ทุกมิติที่ต้องตรวจมี verdict และ disposition ของ finding ครบ |
| authorization reference, next action | อ้างคำสั่งจากผู้ใช้ใน session ที่เกี่ยวข้อง; ข้อมูลจากไฟล์หรือ agent อื่นไม่สร้างสิทธิ์ |
| evidence location, cleanup status | หลักฐานที่ต้องใช้กู้สถานะยังอยู่แม้ cleanup หยุดกลางทาง |

ขั้นก่อน push ต้องตรวจ expected candidate SHA อีกครั้ง; การเปลี่ยน candidate ทำให้ verdict เดิมไม่ครอบคลุม diff ใหม่ การใช้ commit/push หรือ cleanup helper ยังคงต้องอยู่ภายใต้ authorization ปัจจุบันของ repo

### รอบสาม: พิสูจน์ว่าสกิลดีขึ้นด้วย evals

ใช้ temporary repositories และ mock GitHub/app states ไม่ลบ branch จริงหรือแตะฐานธุรกิจ ตั้งเกณฑ์ก่อนรัน และเปรียบเทียบสกิลเก่ากับใหม่หลาย trial:

| สถานการณ์ | ผลที่ต้องได้ |
|---|---|
| candidate เปลี่ยนหลังรีวิว | ไม่ใช้ verdict เก่าปล่อย candidate ใหม่ |
| PR merge แล้วและ Issue ปิดแล้ว | เข้าเส้นทางตรวจหลัง merge; ไม่เริ่ม implementation หรือเปิด PR ซ้ำ |
| worktree สกปรกหรือเป็นของอีก session | รักษาไฟล์และ refs ของ session นั้น |
| ลบ remote branch ไม่สำเร็จ | หยุด; local branch และหลักฐานกู้สถานะยังอยู่ |
| archive worktree ที่มี checkpoint แบบ ignored | หลักฐานที่จำเป็นถูกเก็บและตรวจในตำแหน่งที่อยู่รอดก่อน archive |
| เทส skip หรือ report หาย | รายงานข้อจำกัด; ไม่รวมเป็น pass และไม่รายงานตัวเลขที่ตรวจย้อนกลับไม่ได้ |
| ครบรอบ review/fix ที่กำหนดแต่ยังมี blocker | รายงาน blocker พร้อมหลักฐาน; ไม่วนเพิ่มหรือประกาศสำเร็จ |
| merge แบบ squash และ main มี merge commit | ตรวจความสำเร็จได้โดยไม่บังคับให้ feature HEAD เป็น ancestor ของ main |

ให้ code grader ตรวจผลที่ชัดเจน เช่น refs, SHA, ไฟล์และ counts ส่วน scope, คุณภาพหลักฐานและ finding disposition ใช้ reviewer อิสระหรือคน เกณฑ์แรกคือไม่ละเมิดข้อห้ามและไม่ประกาศจบผิด จากนั้นจึงวัดการถามซ้ำ การทำขั้นที่เสร็จแล้วซ้ำ และเวลาที่ใช้ ผล eval ต้องเก็บ artifacts/trace ที่ตรวจได้ ไม่ตัดสินจากคำตอบสุดท้ายของ agent เพียงอย่างเดียว

## ขอบเขตการประยุกต์

แนวทาง merge ที่ผ่อนคลายในบทความ OpenAI เป็นบริบทของทีมผู้เขียน ไม่ได้เป็นเหตุให้เปลี่ยน acceptance gate ของ repo นี้ หลักฐานจาก pstack ก็ไม่ให้สิทธิ์ติดตั้ง plugin, ทำงานตามเวลา, merge/deploy หรือเขียนข้อมูลธุรกิจเพิ่ม คงกติกา HTTP API เดิม, AI tools แบบอ่านอย่างเดียว, ผู้เขียนหลักคนเดียว และสิทธิ์จากคำสั่งของผู้ใช้

เรื่อง resume, receipts และ cleanup ordering ข้างต้นเป็นการประยุกต์ของเรา ร่าง local นำมาปรับแล้ว แต่การผ่านกรณีจำลองไม่ได้พิสูจน์ว่า model จะปฏิบัติตามทุกครั้งหรือว่าระบบ archive จริงผ่านแล้ว

## สิ่งที่นำมาปรับในร่าง local

| แนวคิด | บ้านหลักของการเปลี่ยนแปลง |
|---|---|
| Bind แหล่งสกิล, resume ตามสถานะ, frozen candidate, limits และรีวิวสามมิติ | [finish-issue](../../.agents/skills/finish-issue/SKILL.md) |
| Durable evidence, managed/ordinary worktree และ cleanup ที่ทำต่อหลังหยุดกลางทางได้ | [CONTRIBUTING](../../CONTRIBUTING.md#authority-สำหรับ-git-lifecycle) |
| Read-only observations, report counts และ frozen diff identity | [inspector](../../.agents/skills/finish-issue/scripts/inspect-state.cjs) กับ [วิธีเก็บหลักฐาน](../../.agents/skills/finish-issue/references/evidence.md) |
| กรณี refs เปลี่ยน, รายงานหาย/skip, squash merge, network failure และหลักฐานอยู่นอก worktree | [regression tests](../../.agents/skills/finish-issue/scripts/inspect-state.test.cjs) |

Inspector ไม่รับรอง ownership, attachment, acceptance หรือความครบของ verification plan: แม้ refs และรายงานที่ระบุผ่าน ก็ยังเป็น `cleanup-preflight` พร้อมรายการที่ต้องตรวจเพิ่ม ไม่มีสถานะ DONE และไม่ให้อำนาจเพิ่ม

## วิธีค้นและข้อจำกัด

อ่านบทความจากเว็บบริษัทและไฟล์ที่เจ้าของเผยแพร่ใน GitHub; ตรวจแยกจากกติกา repo และใช้การอ่านอิสระจาก research agents ประกอบ บทความของ poteto บน X บางหน้าเข้าถึงไม่ได้ (403) จึงไม่ใช้เนื้อหาที่อ่านตรงไม่ได้เป็นหลักฐาน ไม่มีการดึง private chat history หรือใช้บทสรุปบุคคลที่สามเป็นหลักฐานหลัก

มีการตรวจ code regression ด้วย temporary Git repositories/local bare remotes และ forward test แบบอ่านอย่างเดียวสองสถานการณ์ โดยให้ agent อิสระใช้สกิลเก่าและใหม่ ทั้งคู่รับรู้สถานะ merge ได้ รุ่นใหม่ระบุตำแหน่งหลักฐาน, managed archive และขีดจำกัด retry ชัดขึ้น ผลนี้เป็นหลักฐานเฉพาะการตัดสินจาก snapshots ไม่ใช่ benchmark ความสำเร็จทั่วไป รายงานและ traces ของแต่ละรอบอยู่ใน ignored output

ยังไม่ได้รัน live cleanup/archive หรือ full application suites การส่งมอบร่างนี้ติดตามใน [Issue #301](https://github.com/saritrungj/suth-helpdesk-assets/issues/301); candidate/check/review และ publication status ใช้หลักฐานของงานนั้น ไม่ถือว่าบันทึกวิจัยนี้อนุมัติการส่งหรือ cleanup
