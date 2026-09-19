# Subagent ของโปรเจกต์

`.claude/agents/*.md` เก็บ subagent เฉพาะงานที่เครื่องมือเดิมยังไม่ครอบคลุม Claude Code โหลดให้อัตโนมัติและเลือกใช้จาก `description` ในแต่ละไฟล์ หรือสั่งตรงด้วยชื่อ เช่น "ใช้ domain-guardian รีวิว diff นี้" — หน้าที่ สิทธิ์ และโมเดลของแต่ละตัวอ่านจาก frontmatter ของไฟล์นั้น

## หลักที่ใช้ออกแบบ

1. **คนเขียนโค้ดมีคนเดียว คือ session หลัก** subagent อ่านอย่างเดียว (`check-runner` รันคำสั่งได้แต่ห้ามแก้ไฟล์) เพราะ agent ที่เขียนขนานกันต่างคนต่างตัดสินใจโดยไม่เห็นกัน แล้วผลขัดกันเอง ([Cognition](https://cognition.com/blog/dont-build-multi-agents)) และงานเขียนโค้ดแยกขนานได้จริงน้อยกว่างานค้นคว้า ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system))
2. **ส่งงานที่อ่านเยอะออกไป เก็บ context หลักไว้คิด** ผลกลับมาเป็นสรุปสั้น ไม่ใช่ไฟล์หรือ log ทั้งก้อน ([Claude Code best practices](https://code.claude.com/docs/en/best-practices#use-subagents-for-investigation))
3. **คนตรวจไม่ใช่คนเขียน** reviewer เริ่มจาก context ใหม่ เห็นแค่ diff กับเกณฑ์ ([adversarial review](https://code.claude.com/docs/en/best-practices#add-an-adversarial-review-step))
4. **ไม่สร้างซ้ำของที่มีอยู่** Standards/Spec ใช้ `/code-review` การสำรวจโค้ดใช้ `Explore` ที่มากับ Claude Code กฎทั่วไปอยู่ใน `AGENTS.md` ซึ่ง subagent โหลดเองอยู่แล้ว ไฟล์ agent จึงเก็บเฉพาะรายการตรวจที่ต้องใช้ทุกครั้ง
5. **เรียกเมื่อคุ้ม** multi-agent ใช้ token มากกว่าแชตราว 15 เท่า ตัวที่ใช้ `opus` เรียกเฉพาะเมื่อ diff แตะพื้นที่ของมัน งานที่อธิบาย diff ได้ในประโยคเดียวไม่ต้องใช้ subagent

session หลักเป็นคนสั่งและรวมผล ไม่ส่งต่อการควบคุมระหว่าง agent (manager pattern — [OpenAI](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf))

## ลำดับการใช้กับงานหนึ่ง Issue

```text
1. สำรวจ      Explore (ขนานได้ถ้าคำถามแยกกันจริง เช่น ฝั่ง API กับฝั่งเว็บ)
2. วางแผนและลงมือ  session หลักคนเดียว — test แดงก่อน แล้วแก้
3. ตรวจ       check-runner
4. รีวิว      /code-review
              + security-reviewer   ถ้าแตะ apps/api, auth, import หรือ state จาก URL
              + domain-guardian     ถ้าแตะ packages/domain, รายงาน, เงิน, ราคา หรือ database/
              เรียกพร้อมกันในข้อความเดียว
5. ปิด finding  session หลักแก้เฉพาะที่ยืนยันแล้ว → check-runner อีกรอบ
```

## กฎที่ subagent ไม่ได้เปลี่ยน

- authority ของ Git lifecycle อยู่ที่ [CONTRIBUTING.md](../../CONTRIBUTING.md#authority-สำหรับ-git-lifecycle) — subagent ไม่ commit, push หรือแก้ Issue
- reviewer ที่ถูกสั่งให้หาจุดบกพร่องจะหาเจอเสมอแม้งานดีแล้ว ปิดเฉพาะ finding ที่กระทบความถูกต้องหรือ requirement
- "อ่านอย่างเดียว" ในไฟล์ agent เป็นคำสั่งใน prompt ถ้าต้องกันแบบบังคับจริง ใช้ `permissions.deny` หรือ hook ใน `.claude/settings.json`

## แก้หรือเพิ่ม agent

รูปแบบ frontmatter ดู [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) `description` ต้องบอกว่า **เมื่อไหร่** ควรเรียก ก่อนเพิ่มตัวใหม่ให้เช็กว่า skill หรือ agent ที่มีอยู่ทำได้แล้วหรือยัง เมื่อ ADR ที่ `domain-guardian` อ้างเปลี่ยน ต้องแก้ตารางในไฟล์นั้นให้ตรงด้วย
