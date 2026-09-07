<script setup>
/**
 * Login — หน้าแรกที่ทุกคนเห็นก่อนเข้าระบบ
 *
 * ## โครงหน้า: สองแผง (split screen) — แผงแนะนำระบบ + แผงฟอร์ม
 *
 * เดิมเป็นการ์ดเดี่ยวกลางจอ ซึ่งอ่านง่ายแต่ "เงียบ" เกินไป — คนที่ได้ลิงก์มาแล้ว
 * ยังไม่มีบัญชีเปิดมาเจอช่องกรอกสองช่องกับปุ่มเดียว ไม่มีอะไรบอกว่าระบบนี้ทำอะไร
 * และไม่มีทางรู้ว่าจะขอสิทธิ์เข้าใช้ได้อย่างไร
 *
 * โครงใหม่แบ่งซ้าย/ขวาที่ความกว้าง lg ขึ้นไป
 *
 *   ซ้าย  แผงแบรนด์บนพื้น aurora — โลโก้ ชื่อระบบ และสิ่งที่ระบบทำสามข้อ
 *   ขวา   แผงฟอร์มบนพื้นทึบ — มีเฉพาะสิ่งที่ต้องกรอกและวิธีขอสิทธิ์เข้าใช้งาน
 *
 * ที่แบ่งแบบนี้ไม่ใช่เพราะ "สองคอลัมน์ดูแพงกว่า" แต่เพราะมันแก้ข้อขัดแย้งที่
 * แหล่งอ้างอิงพูดตรงกัน: ฟอร์มต้องเป็นคอลัมน์เดียวและต้องเป็นสิ่งที่เด่นที่สุด
 * ในสายตา ขณะเดียวกันหน้าล็อกอินขององค์กรก็ต้องมีที่สำหรับตราสัญลักษณ์และ
 * ประกาศ การมีแผงที่สองทำให้ของสองอย่างนี้ไม่ต้องแย่งที่กัน — ฟอร์มยังเป็น
 * คอลัมน์เดียวและไม่มีอะไรมาวางทับ (Cieden: "single-column default … add a
 * second column only for co-branding or required security notices"; สิ่งที่ต้อง
 * เลี่ยงคือ "over-branding that buries the form")
 *
 * ต่ำกว่า lg แผงซ้ายยุบเหลือแถบหัวเตี้ยๆ ที่มีแค่โลโก้กับชื่อระบบ รายการ
 * ความสามารถถูกซ่อน เพราะบนจอสูงไม่ถึง 800px มันจะดันฟอร์มตกขอบจอ ซึ่งแลกไม่คุ้ม
 *
 * ## เหตุผลด้านความปลอดภัยและการเข้าถึง
 *
 * ไม่มีปุ่ม "สมัครสมาชิก" เพราะบัญชีถูกสร้างโดยผู้ดูแลระบบเท่านั้น และไม่มีปุ่ม
 * "ลืมรหัสผ่าน" เพราะระบบไม่มีอีเมลของผู้ใช้ให้ส่งลิงก์รีเซ็ต — ลิงก์ที่กดแล้ว
 * ไม่มีอะไรเกิดขึ้นแย่กว่าการไม่มีลิงก์ จึงเขียนบอกตรงๆ ว่าต้องติดต่อใครแทน
 *
 * ข้อความ error ของการล็อกอินตั้งใจไม่แยก "ไม่พบผู้ใช้นี้" กับ "รหัสผ่านผิด"
 * เพราะการแยกสองอย่างนี้บอกคนนอกได้ว่าชื่อผู้ใช้ไหนมีอยู่จริงในระบบ
 * (ฝั่ง API เป็นคนตัดสินข้อความ ที่นี่แค่แสดงตามที่ได้รับมา)
 *
 * ข้อกำหนด WCAG 2.2 ที่หน้านี้ต้องรักษาไว้ — และเทสที่ล็อกไว้ทีละข้อ —
 * อยู่ใน docs/reference/accessibility.md ทั้งหมด อ่านก่อนแก้หน้านี้
 */
import { ref, useTemplateRef, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Eye, EyeOff, ExternalLink, LogIn, Mail, Phone, ShieldCheck } from "lucide-vue-next";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { setAuth } from "../store/auth";
import {
  APP_CAPABILITIES,
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  ORG_NAME,
  OWNER_TEAM,
  SUPPORT_CHANNELS,
  supportHref,
} from "../app/brand";
import AuroraCanvas from "../components/AuroraCanvas.vue";
import { UiAlert, UiButton, UiField, UiInput } from "../ui";

const router = useRouter();
const route = useRoute();

const username = ref("");
const password = ref("");
const showPassword = ref(false);
const error = ref("");
const loading = ref(false);

const usernameEl = useTemplateRef("usernameEl");

/** ไอคอนของช่องทางติดต่อ — แยกตามชนิด ไม่ใช่ตามลำดับ */
const CHANNEL_ICONS = { phone: Phone, email: Mail, link: ExternalLink };

// โฟกัสช่องแรกให้เลย คนที่เปิดหน้านี้มาทำอย่างเดียวคือพิมพ์ชื่อผู้ใช้
onMounted(() => usernameEl.value?.focus());

async function login() {
  if (loading.value) return; // กันกดซ้ำ/กด Enter รัวๆ ระหว่างรอคำตอบ

  error.value = "";
  loading.value = true;

  try {
    const res = await api.post("/auth/login", {
      username: username.value,
      password: password.value,
    });

    setAuth(res.data.user);

    // ถ้าถูกเด้งมาจากหน้าที่ session หมดอายุ (มี redirect query จาก api.js) ให้กลับไปหน้าเดิม
    router.push(route.query.redirect || "/");
  } catch (err) {
    // อ่านผ่าน lib/api-error เสมอ ห้ามไล่ .response.data เอง — API ตอบตามรูปแบบ
    // Problem Details (ดู ADR-0010) และการอ่านเองเคยทำให้ผู้ใช้เห็นข้อความอังกฤษ
    // ของ axios แทนข้อความจริงที่ API ตั้งใจส่งมา
    error.value = errorMessage(err, "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login">
    <!-- ======================================================================
         แผงซ้าย — แนะนำระบบ
         บนจอเล็กเหลือเป็นแถบหัวเตี้ยที่มีแค่โลโก้กับชื่อระบบ
         ====================================================================== -->
    <section class="login__brand" aria-labelledby="login-app-name">
      <!-- ชั้นบรรยากาศ ตกแต่งล้วน อยู่หลังทุกอย่างและกดไม่ได้ -->
      <AuroraCanvas variant="panel" />
      <div class="login__grid" aria-hidden="true" />

      <div class="login__brandInner">
        <!--
          โลโก้ต้นฉบับเป็นภาพพื้นขาวทึบ จึงต้องวางบนแผ่นขาวเสมอ ไม่ใช่พื้นตามธีม
          (ดู brand/README.md)

          ขนาด 13rem บนจอใหญ่ไม่ใช่ค่าที่เลือกให้ "ดูใหญ่" แต่เป็นขนาดที่เล็กที่สุด
          ที่ตัวหนังสือในโลโก้ยังอ่านออก — ไฟล์โลโก้มีชื่อโรงพยาบาลอยู่ในภาพแล้ว
          ที่ 8rem บรรทัดนั้นเหลือสูงราว 5px ซึ่งกลายเป็นรอยเปื้อนใต้คำว่า SUTH
          ด้วยเหตุผลเดียวกันจึงไม่มีบรรทัดชื่อโรงพยาบาลซ้ำอีกใต้โลโก้
        -->
        <img src="/logo-suth.png" width="480" height="198" :alt="ORG_NAME" class="login__logo" />

        <div class="login__brandText">
          <h1 id="login-app-name" class="login__title">{{ APP_NAME }}</h1>
          <p class="login__tagline">{{ APP_TAGLINE }}</p>
        </div>

        <!-- สิ่งที่ระบบทำ — ซ่อนบนจอเล็กเพราะจะดันฟอร์มตกขอบจอ -->
        <div class="login__about">
          <p class="login__desc">{{ APP_DESCRIPTION }}</p>

          <ul class="login__caps">
            <li v-for="cap in APP_CAPABILITIES" :key="cap.title" class="login__cap">
              <span class="login__capDot" aria-hidden="true" />
              <span>
                <strong class="login__capTitle">{{ cap.title }}</strong>
                <span class="login__capDetail">{{ cap.detail }}</span>
              </span>
            </li>
          </ul>
        </div>

        <p class="login__org">{{ ORG_NAME }}</p>
      </div>
    </section>

    <!-- ======================================================================
         แผงขวา — ฟอร์ม
         ====================================================================== -->
    <section class="login__panel" aria-labelledby="login-heading">
      <div class="login__form">
        <header class="mb-6">
          <h2 id="login-heading" class="text-2xl font-semibold text-ink tracking-tight">
            เข้าสู่ระบบ
          </h2>
          <p class="text-sm text-ink-mute mt-1.5">
            ใช้ชื่อผู้ใช้และรหัสผ่านที่ได้รับจาก{{ OWNER_TEAM }}
          </p>
        </header>

        <form class="flex flex-col gap-4" @submit.prevent="login">
          <!--
            `name` + `id` คงที่ และ `autocomplete` ที่ถูกต้อง คือสามอย่างที่
            โปรแกรมจัดการรหัสผ่านใช้จำว่าช่องไหนคือช่องไหน ขาดอย่างใดอย่างหนึ่ง
            แล้วมันจะเติมรหัสให้ได้บ้างไม่ได้บ้าง โดยที่ไม่มีอะไรฟ้องเลย

            นี่ไม่ใช่แค่ความสะดวก — มันคือทางที่หน้านี้ผ่าน WCAG 2.2 ข้อ 3.3.8
            (Accessible Authentication) การจำรหัสผ่านนับเป็น "cognitive function
            test" ซึ่งต้องมีข้อยกเว้นรองรับ และข้อยกเว้นที่หน้านี้ใช้คือ
            "Mechanism" — ปล่อยให้โปรแกรมจัดการรหัสผ่านกรอกให้ได้
          -->
          <UiField label="ชื่อผู้ใช้" field-id="login-username">
            <UiInput
              ref="usernameEl"
              v-model="username"
              name="username"
              autocomplete="username"
              required
              placeholder="ชื่อผู้ใช้ที่ได้รับจากผู้ดูแลระบบ"
              :disabled="loading"
            />
          </UiField>

          <UiField label="รหัสผ่าน" field-id="current-password">
            <div class="relative">
              <UiInput
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                required
                placeholder="รหัสผ่าน"
                input-class="pr-12"
                :disabled="loading"
              />
              <!--
                ปุ่มดูรหัสผ่าน: การพิมพ์รหัสยาวๆ ผิดแล้วไม่รู้ตัวคือสาเหตุอันดับหนึ่ง
                ที่คนล็อกอินไม่ผ่าน โดยเฉพาะบนแท็บเล็ตที่หน้าเครื่องพิมพ์ W3C ระบุ
                ไว้ในคำอธิบายข้อ 3.3.8 ว่าการสลับให้เห็นรหัสผ่าน "improve the chance
                of success for some people with cognitive disabilities"

                พื้นที่กด 44×44 — ข้อ 2.5.8 (Target Size Minimum, AA) บังคับ 24×24
                ส่วน 44×44 เป็นค่าที่ web.dev แนะนำสำหรับนิ้วมือจริง เดิมเป็น 28×28
                ส่วนที่ "เห็น" ยังเป็นไอคอน 16px เท่าเดิม — พื้นที่กดกับสิ่งที่มอง
                เห็นไม่จำเป็นต้องเท่ากัน

                คำอธิบายบอกด้วยว่ากดแล้วรหัสผ่านจะโผล่ขึ้นบนจอ ไม่ใช่แค่ "แสดง
                รหัสผ่าน" เพราะคนที่ฟังเสียงอ่านหน้าจอมองไม่เห็นว่ารอบตัวมีใครอยู่
              -->
              <button
                type="button"
                class="absolute right-0 top-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 rounded-md
                       text-ink-faint hover:text-ink transition-colors"
                :aria-label="
                  showPassword
                    ? 'ซ่อนรหัสผ่าน'
                    : 'แสดงรหัสผ่าน — คำเตือน: รหัสผ่านจะปรากฏบนหน้าจอ'
                "
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <component :is="showPassword ? EyeOff : Eye" :size="16" aria-hidden="true" />
              </button>
            </div>
          </UiField>

          <UiAlert v-if="error" tone="danger">{{ error }}</UiAlert>

          <UiButton type="submit" variant="primary" size="lg" block :loading="loading" class="mt-1">
            <template #icon><LogIn :size="17" /></template>
            {{ loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ" }}
          </UiButton>
        </form>

        <!-- ====================================================================
             ขอสิทธิ์เข้าใช้งาน

             แยกเป็น section ที่มีหัวข้อของตัวเอง ไม่ใช่บรรทัดตัวเล็กท้ายหน้า
             เพราะนี่คือทางออกเดียวของคนที่เข้าไม่ได้ ระบบไม่มีทั้งการสมัครเอง
             และการรีเซ็ตรหัสผ่านด้วยตัวเอง

             ปุ่มช่องทางติดต่อจะขึ้นก็ต่อเมื่อมีข้อมูลจริงใน SUPPORT_CHANNELS
             ถ้ายังไม่มี จะเหลือเพียงประโยคว่าให้ติดต่อฝ่ายไหน ซึ่งเป็นข้อความ
             ที่ยืนยันได้ — **ห้ามใส่เบอร์หรืออีเมลสมมติเพื่อให้หน้าดูครบ**
             ==================================================================== -->
        <section class="login__access" aria-labelledby="login-access-heading">
          <h3 id="login-access-heading" class="text-sm font-semibold text-ink">
            ยังไม่มีบัญชี หรือเข้าใช้งานไม่ได้
          </h3>

          <p class="text-xs leading-relaxed text-ink-mute mt-1.5">
            ระบบนี้ไม่เปิดให้สมัครด้วยตนเองและไม่มีการรีเซ็ตรหัสผ่านอัตโนมัติ
            บัญชีทั้งหมดออกโดย{{ OWNER_TEAM }} กรุณาแจ้งชื่อ-นามสกุล หน่วยงาน
            และงานที่ต้องใช้ เพื่อขอสิทธิ์เข้าใช้งาน
          </p>

          <ul v-if="SUPPORT_CHANNELS.length" class="flex flex-col gap-1.5 mt-3 list-none">
            <li v-for="channel in SUPPORT_CHANNELS" :key="channel.label">
              <a :href="supportHref(channel)" class="login__channel">
                <component
                  :is="CHANNEL_ICONS[channel.kind]"
                  :size="15"
                  class="shrink-0 text-ink-faint"
                  aria-hidden="true"
                />
                <span class="font-medium">{{ channel.label }}</span>
                <span v-if="channel.note" class="text-xs text-ink-mute">{{ channel.note }}</span>
              </a>
            </li>
          </ul>

          <p v-else class="text-xs text-ink-mute mt-2">ติดต่อ{{ OWNER_TEAM }}โดยตรง</p>
        </section>

        <p class="flex items-start gap-2 text-2xs leading-relaxed text-ink-mute mt-6">
          <ShieldCheck :size="13" class="shrink-0 mt-px" aria-hidden="true" />
          <span>ระบบภายในของ{{ ORG_NAME }} การเข้าใช้งานถูกบันทึกไว้ทุกครั้ง</span>
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* --------------------------------------------------------------------------
   โครงสองแผง

   ใช้ grid ไม่ใช่ flex เพราะต้องกำหนดสัดส่วนของสองแผงให้คงที่ (1.15fr / 1fr)
   สัดส่วนนี้ทำให้แผงฟอร์มกว้างพอที่ช่องกรอกจะไม่ยืดจนอ่านยาก ขณะที่แผงซ้าย
   ยังกว้างพอสำหรับข้อความสามบรรทัดโดยไม่ต้องตัดคำแปลกๆ

   ต่ำกว่า lg เป็นคอลัมน์เดียว: แถบแบรนด์อยู่บน ฟอร์มอยู่ล่าง
   -------------------------------------------------------------------------- */
.login {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
}

@media (min-width: 1024px) {
  .login {
    grid-template-rows: none;
    grid-template-columns: 1.15fr 1fr;
  }
}

/* --------------------------------------------------------------------------
   แผงซ้าย — แบรนด์
   -------------------------------------------------------------------------- */
.login__brand {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  /* พื้นทึบเข้มทั้งสองโหมด ชั้นแสง aurora วางทับอีกที
     ต้องประกาศที่นี่ด้วย ไม่ใช่พึ่ง AuroraCanvas อย่างเดียว เพราะถ้า component
     นั้นยังไม่ถูก mount ตัวหนังสือสีอ่อนจะอยู่บนพื้นขาวชั่วขณะ */
  background: var(--aurora-ground);
  color: var(--on-aurora);
  padding: 1.5rem;
}

@media (min-width: 1024px) {
  .login__brand {
    padding: 3rem 3.5rem;
  }
}

/* เส้นตารางจางๆ — ให้พื้นหลังมี "โครง" ไม่ใช่สีเปล่าๆ
   ใช้ gradient ซ้อนกันสองทิศแทนรูปภาพ จึงคมทุกความละเอียดและไม่กินโหลด */
.login__grid {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image:
    linear-gradient(to right, var(--on-aurora) 1px, transparent 1px),
    linear-gradient(to bottom, var(--on-aurora) 1px, transparent 1px);
  background-size: 4.5rem 4.5rem;
  /* จางมาก — ต้องรู้สึกว่า "มีโครง" ไม่ใช่มองเห็นเป็นตาราง */
  opacity: 0.05;
  mask-image: radial-gradient(90% 70% at 30% 40%, oklch(0 0 0 / 0.9), transparent 90%);
}

.login__brandInner {
  position: relative;
  width: 100%;
  max-width: 32rem;
  margin-inline: auto;
  display: flex;
  align-items: center;
  gap: 1rem;
  animation: login-brand-in var(--dur-enter) var(--ease-out-quart) both;
}

@media (min-width: 1024px) {
  .login__brandInner {
    display: block;
    margin-inline: 0;
    margin-left: auto;
    max-width: 28rem;
  }
}

.login__logo {
  flex-shrink: 0;
  width: 6rem;
  height: auto;
  border-radius: var(--radius-lg);
  background: #fff;
  padding: 0.4rem 0.6rem;
}

@media (min-width: 1024px) {
  .login__logo {
    width: 13rem;
    border-radius: var(--radius-2xl);
    padding: 0.75rem 1rem;
    box-shadow: var(--elev-pop);
  }

  .login__brandText {
    margin-top: 2rem;
  }
}

.login__title {
  font-size: 1.125rem;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.25;
  color: var(--on-aurora);
}

.login__tagline {
  margin-top: 0.15rem;
  font-size: 0.8125rem;
  color: var(--on-aurora-mute);
}

@media (min-width: 1024px) {
  .login__title {
    font-size: 2rem;
  }

  .login__tagline {
    margin-top: 0.5rem;
    font-size: 1rem;
  }
}

/* รายละเอียดระบบ — เฉพาะจอใหญ่
   ที่ซ่อนบนจอเล็กเพราะบนจอสูง 640–800px มันดันฟอร์มลงไปใต้ขอบจอ ซึ่งทำให้
   คนที่มาเพื่อล็อกอินต้องเลื่อนก่อนถึงจะเห็นช่องกรอก — แลกไม่คุ้ม */
.login__about {
  display: none;
}

@media (min-width: 1024px) {
  .login__about {
    display: block;
    margin-top: 2.5rem;
    padding-top: 2rem;
    border-top: 1px solid var(--on-aurora-faint);
  }
}

.login__desc {
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--on-aurora-mute);
}

.login__caps {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  list-style: none;
  padding: 0;
}

.login__cap {
  display: flex;
  gap: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.6;
}

.login__capDot {
  flex-shrink: 0;
  width: 0.375rem;
  height: 0.375rem;
  margin-top: 0.5rem;
  border-radius: 50%;
  background: var(--flame-500);
}

.login__capTitle {
  display: block;
  font-weight: 600;
  color: var(--on-aurora);
}

.login__capDetail {
  display: block;
  color: var(--on-aurora-mute);
}

.login__org {
  display: none;
}

@media (min-width: 1024px) {
  .login__org {
    display: block;
    margin-top: 3rem;
    font-size: 0.75rem;
    color: var(--on-aurora-mute);
  }
}

/* --------------------------------------------------------------------------
   แผงขวา — ฟอร์ม

   พื้นทึบเสมอ เพื่อให้ contrast ของช่องกรอกวัดได้จริง ไม่ใช่การ์ดโปร่งบนพื้นแสง
   ซึ่งเป็นกฎ artwork ของระบบ (ดู docs/explanation/design-system.md)
   -------------------------------------------------------------------------- */
.login__panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  padding: 2.5rem 1.25rem 3rem;
}

@media (min-width: 1024px) {
  .login__panel {
    padding: 3rem 3.5rem;
  }
}

.login__form {
  width: 100%;
  /* 24rem คือความกว้างที่ช่องกรอกยังพอดีมือและตัวหนังสืออธิบายไม่ยาวเกินบรรทัด */
  max-width: 24rem;
  animation: login-form-in var(--dur-enter) var(--ease-out-quart) 60ms both;
}

@media (min-width: 1024px) {
  .login__form {
    margin-right: auto;
  }
}

.login__access {
  margin-top: 1.75rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xl);
  background: var(--surface-2);
}

/* ปุ่มช่องทางติดต่อ — สูง 44px เต็มความกว้าง
   ข้อ 2.5.8 บังคับแค่ 24×24 แต่ลิงก์เหล่านี้จะถูกกดจากแท็บเล็ตที่ถือด้วยมือเดียว
   จึงให้เต็มความกว้างไปเลย พลาดยาก และเห็นชัดว่ากดได้ */
.login__channel {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-lg);
  background: var(--surface);
  font-size: 0.8125rem;
  color: var(--ink-soft);
  text-decoration: none;
  transition: background-color 0.15s var(--ease-out-quart);
}

.login__channel:hover {
  background: var(--surface-3);
}

/* --------------------------------------------------------------------------
   entrance — เข้าครั้งเดียวแล้วนิ่ง ไม่วนซ้ำ
   -------------------------------------------------------------------------- */
@keyframes login-brand-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes login-form-in {
  from {
    opacity: 0;
    transform: translateY(0.75rem);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* คนที่ตั้งค่าลดการเคลื่อนไหวไว้ ต้องเห็นผลปลายทางทันที */
@media (prefers-reduced-motion: reduce) {
  .login__brandInner,
  .login__form {
    animation: none;
  }
}
</style>
