<script setup>
import { computed, onMounted, reactive, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Eye, EyeOff, ExternalLink, LockKeyhole, Mail, Moon, Phone, Sun, UserRound } from "lucide-vue-next";
import { MAX_LENGTH, toBuddhistYear } from "@suth/domain";
import { t } from "../lib/locale";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { setAuth } from "../store/auth";
import { modeState, setMode } from "../store/theme";
import { APP_NAME, BRAND_ASSETS, ORG_NAME, OWNER_TEAM, SUPPORT_CHANNELS, supportHref } from "../app/brand";
import { UiAlert, UiButton, UiCard, UiCheckbox, UiField, UiInput } from "../ui";

const router = useRouter();
const route = useRoute();
const USERNAME_KEY = "suth.login.username";
function readUsername() {
  try { return (localStorage.getItem(USERNAME_KEY) || "").slice(0, MAX_LENGTH.username); }
  catch { return ""; }
}
const username = ref(readUsername());
const rememberUsername = ref(Boolean(username.value));
const password = ref("");
const showPassword = ref(false);
const error = ref("");
const loading = ref(false);
const fieldErrors = reactive({ username: "", password: "" });
const usernameEl = useTemplateRef("usernameEl");
const passwordEl = useTemplateRef("passwordEl");
const CHANNEL_ICONS = { phone: Phone, email: Mail, link: ExternalLink };
const copyrightYear = toBuddhistYear(new Date().getFullYear());
const logo = computed(() => modeState.current === "dark" ? BRAND_ASSETS.loginNight : BRAND_ASSETS.loginDay);
const logoSrcset = computed(() => `${modeState.current === "dark" ? BRAND_ASSETS.loginNightSmall : BRAND_ASSETS.loginDaySmall} 440w, ${logo.value} 880w`);

function remember() {
  try {
    if (rememberUsername.value) localStorage.setItem(USERNAME_KEY, username.value);
    else localStorage.removeItem(USERNAME_KEY);
  } catch { /* Shared/private machines may deny storage; the form still works. */ }
}
watch(rememberUsername, selected => { if (!selected) remember(); });
watch(username, () => { fieldErrors.username = ""; }, { flush: "sync" });
watch(password, () => { fieldErrors.password = ""; });
onMounted(() => {
  if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) usernameEl.value?.focus();
});

async function login() {
  if (loading.value) return;
  username.value = username.value.trim();
  fieldErrors.username = username.value ? "" : t("กรอกชื่อผู้ใช้");
  fieldErrors.password = password.value ? "" : t("กรอกรหัสผ่าน");
  if (fieldErrors.username || fieldErrors.password) {
    (fieldErrors.username ? usernameEl : passwordEl).value?.focus();
    return;
  }
  error.value = "";
  remember(); // Only the opted-in name, never a password or session credential.
  loading.value = true;
  try {
    const res = await api.post("/auth/login", { username: username.value, password: password.value });
    setAuth(res.data.user);
    router.push(route.query.redirect || "/");
  } catch (err) {
    error.value = errorMessage(err, t("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login auth-stage canvas-wash">
    <UiButton variant="secondary" icon-only class="auth-theme rounded-full" :label="modeState.current === 'dark' ? t('เปลี่ยนเป็นโหมดสว่าง') : t('เปลี่ยนเป็นโหมดมืด')" :aria-pressed="modeState.current === 'dark'" @click="setMode(modeState.current === 'dark' ? 'light' : 'dark')">
      <component :is="modeState.current === 'dark' ? Sun : Moon" :size="20" aria-hidden="true" />
    </UiButton>
    <div class="auth-logo">
      <img :src="logo" :srcset="logoSrcset" sizes="(max-width: 472px) calc(100vw - 32px), 440px" :alt="`${APP_NAME} · ${ORG_NAME}`" width="880" height="495" fetchpriority="high" decoding="async" />
    </div>
    <main class="auth-main">
      <UiCard class="auth-card" flush>
        <header class="auth-intro">
          <h1 id="login-heading" tabindex="-1">{{ t('เข้าสู่ระบบ') }}</h1>
          <p>{{ t('ใช้บัญชีที่ได้รับจาก') }} {{ OWNER_TEAM }}</p>
        </header>
        <form class="auth-fields" novalidate :aria-busy="loading" aria-labelledby="login-heading" @submit.prevent="login">
          <UiField :label="t('ชื่อผู้ใช้')" field-id="login-username" :error="fieldErrors.username">
            <UiInput ref="usernameEl" v-model="username" name="username" autocomplete="username" autocapitalize="none" :spellcheck="false" required :maxlength="MAX_LENGTH.username" :placeholder="t('กรอกชื่อผู้ใช้')" input-class="auth-input" :disabled="loading">
              <template #icon><UserRound :size="18" /></template>
            </UiInput>
          </UiField>
          <UiField :label="t('รหัสผ่าน')" field-id="current-password" :error="fieldErrors.password">
            <div class="relative">
              <UiInput ref="passwordEl" v-model="password" :type="showPassword ? 'text' : 'password'" name="password" autocomplete="current-password" autocapitalize="none" :spellcheck="false" required placeholder="••••••••" input-class="auth-input pr-12" :disabled="loading">
                <template #icon><LockKeyhole :size="18" /></template>
              </UiInput>
              <button type="button" class="auth-password-toggle" :aria-label="showPassword ? t('ซ่อนรหัสผ่าน') : t('แสดงรหัสผ่าน — คำเตือน: รหัสผ่านจะปรากฏบนหน้าจอ')" :aria-pressed="showPassword" aria-controls="current-password" :disabled="loading" @click="showPassword = !showPassword">
                <component :is="showPassword ? EyeOff : Eye" :size="20" aria-hidden="true" />
              </button>
            </div>
          </UiField>
          <div class="auth-options">
            <UiCheckbox v-model="rememberUsername" class="auth-remember" :label="t('จดจำชื่อผู้ใช้')" :disabled="loading" />
            <details class="login__access auth-help">
              <summary>{{ t('ลืมรหัสผ่าน?') }}</summary>
              <div class="auth-help-content">
                <h2>{{ t('ติดต่อ{0}', [OWNER_TEAM]) }}</h2>
                <p>{{ t('เพื่อขอบัญชีหรือขอความช่วยเหลือในการเข้าสู่ระบบ') }}</p>
                <ul v-if="SUPPORT_CHANNELS.length" class="mt-3 space-y-2">
                  <li v-for="channel in SUPPORT_CHANNELS" :key="channel.label">
                    <a :href="supportHref(channel)" class="flex flex-wrap items-center gap-2 text-brand-ink hover:underline">
                      <component :is="CHANNEL_ICONS[channel.kind]" :size="16" aria-hidden="true" />
                      <span>{{ channel.label }}</span><span v-if="channel.note" class="text-ink-mute">{{ channel.note }}</span>
                    </a>
                  </li>
                </ul>
              </div>
            </details>
          </div>
          <UiAlert v-if="error" tone="danger">{{ error }}</UiAlert>
          <UiButton type="submit" variant="primary" size="lg" block :loading="loading" class="auth-submit">
            {{ loading ? t('กำลังเข้าสู่ระบบ…') : t('เข้าสู่ระบบ') }}
          </UiButton>
        </form>
      </UiCard>
    </main>
    <footer class="auth-copyright">© {{ copyrightYear }} {{ ORG_NAME }}</footer>
  </div>
</template>
