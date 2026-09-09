<script setup>
import { t } from "../lib/locale";

// Presentation only. Session, API errors and redirect behavior remain unchanged.
import { ref, useTemplateRef, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowRight, Eye, EyeOff, ExternalLink, Mail, Phone } from "lucide-vue-next";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { setAuth } from "../store/auth";
import {
  APP_NAME,
  APP_TAGLINE,
  BRAND_ASSETS,
  ORG_NAME,
  OWNER_TEAM,
  SUPPORT_CHANNELS,
  supportHref,
} from "../app/brand";
import { UiAlert, UiButton, UiField, UiInput } from "../ui";
import AuroraCanvas from "../components/AuroraCanvas.vue";

const router = useRouter();
const route = useRoute();
const username = ref("");
const password = ref("");
const showPassword = ref(false);
const error = ref("");
const loading = ref(false);
const usernameEl = useTemplateRef("usernameEl");
const CHANNEL_ICONS = { phone: Phone, email: Mail, link: ExternalLink };

// Desktop starts ready to type. Touch devices should not open a keyboard on arrival.
onMounted(() => {
  if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) usernameEl.value?.focus();
});

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
    error.value = errorMessage(err, t("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <AuroraCanvas variant="hero" />
    <main class="login__main">
      <section class="login__brand" :aria-label="ORG_NAME">
        <div class="login__brand-inner">
          <img
            class="login__logo"
            :src="BRAND_ASSETS.horizontal"
            :alt="ORG_NAME"
            width="1200"
            height="676"
            fetchpriority="high"
            decoding="async"
          />
          <div class="login__identity">
            <p class="login__name">{{ APP_NAME }}</p>
            <p class="login__tagline">{{ APP_TAGLINE }}</p>
          </div>
        </div>
      </section>

      <section class="login__panel" aria-labelledby="login-heading">
        <div class="login__form">
          <header class="login__intro">
            <h1 id="login-heading"> {{ t("เข้าสู่ระบบ") }} </h1>
            <p> {{ t("ใช้บัญชีที่ได้รับจาก") }} {{ OWNER_TEAM }}</p>
          </header>

          <form class="login__fields" :aria-busy="loading" @submit.prevent="login">
            <UiField :label="t(&quot;ชื่อผู้ใช้&quot;)" field-id="login-username">
              <UiInput
                ref="usernameEl"
                v-model="username"
                name="username"
                autocomplete="username"
                autocapitalize="none"
                :spellcheck="false"
                required
                :placeholder="t(&quot;กรอกชื่อผู้ใช้&quot;)"
                input-class="min-h-12 text-base"
                :disabled="loading"
              />
            </UiField>

            <UiField :label="t(&quot;รหัสผ่าน&quot;)" field-id="current-password">
              <div class="relative">
                <UiInput
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  name="password"
                  autocomplete="current-password"
                  autocapitalize="none"
                  :spellcheck="false"
                  required
                  :placeholder="t(&quot;กรอกรหัสผ่าน&quot;)"
                  input-class="min-h-12 text-base pr-12"
                  :disabled="loading"
                />
                <button
                  type="button"
                  class="login__password-toggle"
                  :aria-label="showPassword ? t(&quot;ซ่อนรหัสผ่าน&quot;) : t(&quot;แสดงรหัสผ่าน — คำเตือน: รหัสผ่านจะปรากฏบนหน้าจอ&quot;)"
                  :aria-pressed="showPassword"
                  aria-controls="current-password"
                  :disabled="loading"
                  @click="showPassword = !showPassword"
                >
                  <component :is="showPassword ? EyeOff : Eye" :size="18" aria-hidden="true" />
                </button>
              </div>
            </UiField>

            <UiAlert v-if="error" tone="danger">{{ error }}</UiAlert>

            <UiButton type="submit" variant="primary" size="lg" block :loading="loading" class="login__submit">
              {{ loading ? t("กำลังเข้าสู่ระบบ…") : t("เข้าสู่ระบบ") }}
              <ArrowRight v-if="!loading" :size="18" aria-hidden="true" />
            </UiButton>
          </form>

          <details class="login__access">
            <summary> {{ t("ยังไม่มีบัญชี หรือเข้าใช้งานไม่ได้") }} </summary>
            <div class="login__help">
              <h2 id="login-access-heading"> {{ t("ติดต่อ{0}", [OWNER_TEAM]) }}</h2>
              <p> {{ t("เพื่อขอบัญชีหรือขอความช่วยเหลือในการเข้าสู่ระบบ") }} </p>
              <ul v-if="SUPPORT_CHANNELS.length" class="login__channels">
                <li v-for="channel in SUPPORT_CHANNELS" :key="channel.label">
                  <a :href="supportHref(channel)" class="login__channel">
                    <component :is="CHANNEL_ICONS[channel.kind]" :size="16" aria-hidden="true" />
                    <span>{{ channel.label }}</span>
                    <span v-if="channel.note" class="text-ink-mute">{{ channel.note }}</span>
                  </a>
                </li>
              </ul>
            </div>
          </details>
        </div>
      </section>
    </main>

    <footer class="login__footer">{{ ORG_NAME }}</footer>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  /* Same base surface and theme-aware artwork as DashboardHero. */
  background: var(--surface);
  color: var(--ink);
}
.login > :deep(.aurora) { z-index: -1; }
/* Static artwork: no ongoing GPU animation, including reduced-motion users. */
.login :deep(.aurora__layer) { animation: none; will-change: auto; }
.login__main {
  display: grid;
  grid-template-columns: minmax(0, 55fr) minmax(24rem, 45fr);
  min-height: 0;
}
.login__brand {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: clamp(2rem, 5vw, 5rem);
  background: var(--brand-backdrop);
  border-right: 1px solid var(--line-soft);
}
.login__brand-inner { width: min(100%, 46rem); text-align: center; }
.login__logo { display: block; width: 100%; height: auto; object-fit: contain; }
.login__identity { margin-top: 1rem; color: var(--brand-backdrop-ink); }
.login__name { font-size: var(--text-lg); font-weight: 600; line-height: 1.5; }
.login__tagline {
  margin-top: 0.25rem;
  font-size: var(--text-sm);
  color: var(--brand-backdrop-ink-soft);
  line-height: 1.6;
}
.login__panel {
  display: grid;
  align-items: center;
  min-width: 0;
  padding: clamp(2rem, 4vw, 4rem);
  background: var(--surface);
}
.login__form { width: min(100%, 28rem); min-width: 0; margin-inline: auto; }
.login__intro { margin-bottom: 1.5rem; }
.login__intro h1 {
  font-size: var(--text-2xl);
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.login__intro p {
  margin-top: 0.5rem;
  font-size: var(--text-base);
  line-height: 1.7;
  color: var(--ink-mute);
}
.login__fields { display: grid; gap: 1.25rem; }
.login__password-toggle {
  position: absolute;
  right: 0.125rem;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  color: var(--ink-mute);
}
.login__password-toggle:hover { color: var(--ink); background: var(--surface-2); }
.login__submit { min-height: 3rem; margin-top: 0.25rem; }
.login__access {
  margin-top: 1.75rem;
  border-top: 1px solid var(--line-soft);
  padding-top: 0.75rem;
}
.login__access summary {
  min-height: 2.75rem;
  padding-block: 0.75rem;
  font-size: var(--text-sm);
  line-height: 1.6;
  font-weight: 500;
  color: var(--ink-soft);
  cursor: pointer;
}
.login__access summary::marker { color: var(--ink-mute); }
.login__help { padding-top: 0.5rem; }
.login__help h2 { font-size: var(--text-sm); font-weight: 600; line-height: 1.7; }
.login__help p { margin-top: 0.25rem; color: var(--ink-mute); font-size: var(--text-sm); line-height: 1.7; }
.login__channels { list-style: none; padding: 0; margin-top: 0.75rem; }
.login__channel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  font-size: var(--text-sm);
  color: var(--brand-ink);
  text-underline-offset: 0.2em;
}
.login__channel:hover { text-decoration: underline; }
.login__footer {
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-top: 1px solid var(--line-soft);
  text-align: center;
  font-size: var(--text-xs);
  line-height: 1.7;
  color: var(--ink-mute);
}
/* ต่ำกว่า 768px แบรนด์กับฟอร์มเรียงลงมาเป็นแถวเดียว — ส่วนที่เหมือนกันอยู่ก้อนนี้ก้อนเดียว */
@media (max-width: 767px) {
  .login__main { grid-template-columns: 1fr; align-content: start; }
  .login__brand { border-right: 0; border-bottom: 1px solid var(--line-soft); }
  .login__identity { display: none; }
  .login__panel { align-items: start; }
}
@media (max-width: 639px) {
  .login__brand { padding: 0.5rem 1rem; }
  .login__brand-inner { width: min(100%, 13rem); }
  .login__panel { padding: 1.25rem 1rem 1.5rem; }
  .login__intro { margin-bottom: 1rem; }
  .login__intro h1 { font-size: var(--text-xl); }
  .login__intro p { margin-top: 0.25rem; }
  .login__fields { gap: 1rem; }
  .login__access { margin-top: 1.25rem; }
}
@media (min-width: 640px) and (max-width: 767px) {
  .login__brand { padding: 1rem 2rem; }
  .login__brand-inner { width: min(100%, 20rem); }
  .login__panel { padding: 2rem; }
}
</style>
