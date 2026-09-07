<script setup>
/**
 * AuroraCanvas — ลายเซ็นภาพของระบบ ชั้นแสง teal→ส้มจากสีในโลโก้โรงพยาบาล
 *
 * ใช้ได้ **สองที่เท่านั้น** — หน้าล็อกอิน และแผงสรุปบนสุดของแดชบอร์ด
 * ห้ามเอาไปวางหลังตาราง กราฟ หรือฟอร์ม เพราะพื้นหลังที่ไม่คงที่ทำให้วัด
 * contrast ของตัวหนังสือไม่ได้ และตัวเลขที่ต้องเอาไปตรวจใบแจ้งหนี้ต้องอ่านชัด
 * ที่สุดเสมอ (ดู docs/explanation/design-references.md หัวข้อ "พื้นผิว")
 *
 * ทำไมเป็น CSS ล้วน ไม่ใช่ canvas/WebGL
 *   - ไม่ต้องโหลดไลบรารีเพิ่มแม้แต่ไบต์เดียว และไม่กิน GPU ค้างไว้ทั้งวัน
 *   - เครื่องในโรงพยาบาลหลายเครื่องเป็นเครื่องเก่าที่ไม่มีการ์ดจอแยก
 *   - เบราว์เซอร์ทำ gamut mapping ของ oklch ให้เอง ได้สีที่อิ่มขึ้นบนจอ P3
 *     โดยไม่ต้องเขียนโค้ดตรวจจอเอง
 *
 * ทำไม "เล่นจบแล้วหยุด" ไม่ใช่วนตลอด
 *   หน้า landing ที่ได้รางวัลมีคนอยู่ 30 วินาที ระบบนี้คนเปิดทิ้งไว้ทั้งวัน
 *   พื้นหลังที่ขยับตลอดเวลาในสายตาข้างๆ ทำให้ล้าและกวนสมาธิตอนกรอกตัวเลข
 *   จึงเล่น entrance ครั้งเดียวไม่เกิน 600ms แล้วนิ่งสนิท
 */
defineProps({
  /**
   * "hero"  แผงสรุปแนวนอนเตี้ยบนแดชบอร์ด
   * "page"  เต็มพื้นที่หน้าล็อกอินแบบการ์ดกลางจอ (ยังใช้ได้ ไม่มีที่เรียกแล้ว)
   * "panel" แผงซ้ายของหน้าล็อกอินแบบสองแผง — สูงเต็มจอ กว้างราวครึ่งจอ
   */
  variant: { type: String, default: "hero" },
});
</script>

<template>
  <!-- aria-hidden: เป็นภาพประดับล้วน ไม่มีข้อมูล — โปรแกรมอ่านหน้าจอต้องข้ามไป
       ไม่งั้นคนที่ฟังจะเจอ "รูปภาพ" ที่ไม่มีอะไรให้ฟังคั่นอยู่หน้าเนื้อหาจริง -->
  <div class="aurora" :class="`aurora--${variant}`" aria-hidden="true">
    <span class="aurora__layer aurora__layer--1" />
    <span class="aurora__layer aurora__layer--2" />
    <span class="aurora__layer aurora__layer--3" />
    <span class="aurora__grain" />
  </div>
</template>

<style scoped>
.aurora {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  /* ตัดมุมตามกล่องแม่ ไม่งั้นแสงล้นออกนอกขอบการ์ดที่มน */
  border-radius: inherit;
}

.aurora__layer {
  position: absolute;
  border-radius: 50%;
  /* blur มากพอที่ขอบวงจะหายไปหมด เหลือแค่ "แสง" ไม่ใช่ "วงกลมเบลอ" */
  filter: blur(64px);
  will-change: transform, opacity;
}

/* ชั้นที่ 1 — teal เป็นแกนหลัก วางเยื้องซ้ายบน */
.aurora__layer--1 {
  width: 62%;
  aspect-ratio: 1;
  left: -12%;
  top: -34%;
  background: radial-gradient(circle, var(--aurora-1) 0%, transparent 70%);
  animation: aurora-in-1 var(--dur-aurora) var(--ease-out-quart) both;
}

/* ชั้นที่ 2 — ส้มเป็นจุดเน้น เล็กที่สุดและจางที่สุด ไม่ให้แย่งความเป็น teal
   ของแบรนด์ และไม่ให้ไปชนกับสีแดงของปุ่มลบในสายตา */
.aurora__layer--2 {
  width: 42%;
  aspect-ratio: 1;
  right: 4%;
  top: -22%;
  background: radial-gradient(circle, var(--aurora-2) 0%, transparent 70%);
  animation: aurora-in-2 var(--dur-aurora) var(--ease-out-quart) 60ms both;
}

/* ชั้นที่ 3 — teal เข้ม ทำให้ก้นภาพมีน้ำหนัก ไม่ลอย */
.aurora__layer--3 {
  width: 78%;
  aspect-ratio: 1.4;
  left: 24%;
  bottom: -62%;
  background: radial-gradient(ellipse, var(--aurora-3) 0%, transparent 68%);
  animation: aurora-in-3 var(--dur-aurora) var(--ease-out-quart) 120ms both;
}

/* เกรนละเอียดมาก — งานไล่เฉดกว้างๆ บนจอ 8-bit จะเห็นเป็นแถบ (banding)
   สัญญาณรบกวนจางๆ ทับไว้ทำให้ขอบแถบแตกตัวจนมองไม่เห็น เป็นวิธีเดียวกับที่
   งานพิมพ์ใช้มานาน ไม่ใช่การ "แต่งให้ดูวินเทจ" */
.aurora__grain {
  position: absolute;
  inset: 0;
  opacity: 0.4;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
}

/* หน้าล็อกอิน: พื้นทึบเข้มใต้ชั้นแสง แสงจึงเห็นชัดเต็มที่
   ต้องวางตำแหน่งใหม่ทั้งหมด ไม่ใช่แค่ปรับ blur — แผงนี้เป็นช่องสูงและแคบ
   ส่วนแผงบนแดชบอร์ดเป็นแถบเตี้ยและกว้าง ตำแหน่งที่ทำให้แสงอยู่ "ในกรอบ" ของ
   สองรูปทรงนี้จึงคนละชุดกัน ค่าชุดเดิมทำให้แสงเกือบทั้งหมดหลุดออกไปด้านบน
   จนแผงดูเป็นสีเขียวเข้มเรียบๆ ไม่มีอะไรเลย */
.aurora--page {
  background: var(--aurora-ground);
}

.aurora--page .aurora__layer {
  filter: blur(80px);
}

/* จัดแสงให้ "รวมศูนย์" อยู่หลังการ์ด ไม่ใช่กระจายไปตามขอบจอ
   หน้าล็อกอินมีของอยู่ชิ้นเดียวกลางจอ องค์ประกอบจึงต้องพาสายตาไปที่นั่น
   ชุดค่าเดิมวางแสงไว้ริมซ้ายกับริมขวา ซึ่งเหมาะกับตอนที่ฟอร์มอยู่ชิดขอบ */
.aurora--page .aurora__layer--1 {
  width: 90%;
  left: 5%;
  top: -28%;
  background: radial-gradient(circle, var(--aurora-dark-1) 0%, transparent 72%);
}

.aurora--page .aurora__layer--2 {
  width: 52%;
  right: 8%;
  top: 6%;
  background: radial-gradient(circle, var(--aurora-dark-2) 0%, transparent 74%);
}

.aurora--page .aurora__layer--3 {
  width: 110%;
  aspect-ratio: 1;
  left: -5%;
  bottom: -58%;
  background: radial-gradient(circle, var(--aurora-dark-3) 0%, transparent 72%);
}

/* แผงซ้ายของหน้าล็อกอินสองแผง — รูปทรงต่างจาก "page" ชัดเจน จึงต้องจัดแสงใหม่
   ไม่ใช่ใช้ค่าชุดเดิม แผงนี้สูงเต็มจอและกว้างราว 55vw ซึ่งบนจอ 1440×900 คือ
   ประมาณ 790×900 — เกือบเป็นจัตุรัส ต่างจากช่องสูงแคบของ "page"

   จุดรวมแสงอยู่เยื้องขวาบน ซึ่งเป็นด้านที่ติดกับแผงฟอร์ม ผลคือขอบรอยต่อของ
   สองแผงสว่างที่สุด และสายตาถูกพาข้ามไปหาฟอร์มเอง แทนที่จะค้างอยู่ฝั่งซ้าย */
.aurora--panel {
  background: var(--aurora-ground);
}

.aurora--panel .aurora__layer {
  filter: blur(88px);
}

.aurora--panel .aurora__layer--1 {
  width: 85%;
  aspect-ratio: 1;
  left: 22%;
  top: -18%;
  background: radial-gradient(circle, var(--aurora-dark-1) 0%, transparent 70%);
}

.aurora--panel .aurora__layer--2 {
  width: 45%;
  aspect-ratio: 1;
  right: -8%;
  top: 22%;
  background: radial-gradient(circle, var(--aurora-dark-2) 0%, transparent 72%);
}

.aurora--panel .aurora__layer--3 {
  width: 105%;
  aspect-ratio: 1;
  left: -25%;
  bottom: -42%;
  background: radial-gradient(circle, var(--aurora-dark-3) 0%, transparent 70%);
}

/* --------------------------------------------------------------------------
   entrance — แสงแต่ละชั้นเลื่อนเข้าจากทิศต่างกันเล็กน้อยแล้วหยุดถาวร
   ระยะทางสั้น (ไม่เกิน 8%) เพราะสิ่งที่ต้องรู้สึกคือ "มันเพิ่งติดขึ้นมา"
   ไม่ใช่ "มีอะไรวิ่งผ่าน"
   -------------------------------------------------------------------------- */
@keyframes aurora-in-1 {
  from { opacity: 0; transform: translate3d(-6%, -4%, 0) scale(0.9); }
  to   { opacity: 1; transform: none; }
}

@keyframes aurora-in-2 {
  from { opacity: 0; transform: translate3d(7%, -5%, 0) scale(0.88); }
  to   { opacity: 1; transform: none; }
}

@keyframes aurora-in-3 {
  from { opacity: 0; transform: translate3d(0, 8%, 0) scale(0.94); }
  to   { opacity: 1; transform: none; }
}

/* คนที่ตั้งค่าลดการเคลื่อนไหวไว้มักเป็นคนที่เวียนหัวจากภาพเคลื่อน — แสดงผล
   ปลายทางทันที ภาพยังสวยเหมือนเดิมทุกประการ แค่ไม่มีการเดินทาง */
@media (prefers-reduced-motion: reduce) {
  .aurora__layer {
    animation: none;
  }
}
</style>
