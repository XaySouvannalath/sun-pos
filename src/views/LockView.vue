<script setup lang="ts">
import { fmtDuration, fmtTime, languages, t } from '@/i18n'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clock, Delete, LogIn, MapPin } from 'lucide-vue-next'
import { api } from '@/api'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const auth = useAuthStore()
const settings = useSettingsStore()
const router = useRouter()
const route = useRoute()

const pin = ref('')
const error = ref(false)
/** Sign in, or clock in / out (which doesn't sign in). */
const mode = ref<'login' | 'clock'>('login')
/** A message under the dots: why sign-in was refused, or who just clocked in or out. */
const message = ref<{ text: string; ok: boolean } | null>(null)
let messageTimer: ReturnType<typeof setTimeout> | undefined

function show(text: string, ok: boolean) {
  message.value = { text, ok }
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = null
    if (ok) mode.value = 'login'
  }, 5000)
}

function setMode(m: 'login' | 'clock') {
  mode.value = m
  pin.value = ''
  error.value = false
  message.value = null
}
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

function press(k: string) {
  error.value = false
  if (message.value && !message.value.ok) message.value = null
  if (k === 'clear') pin.value = ''
  else if (k === 'back') pin.value = pin.value.slice(0, -1)
  else if (pin.value.length < 6) {
    pin.value += k
    if (pin.value.length >= 4) submit(false)
  }
}

const busy = ref(false)

/** Signs in or clocks in/out; false when the PIN is wrong (or may still be incomplete). */
async function attemptPin(attempt: string): Promise<boolean> {
  if (mode.value === 'login') {
    if (!(await auth.login(attempt))) return false
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await router.replace(next)
    return true
  }
  try {
    const { action, entry } = await api.time.clock(attempt, auth.deviceBranch || undefined)
    pin.value = ''
    show(
      action === 'in'
        ? t('clock.clockedIn', { name: entry.staffName, time: fmtTime(entry.clockIn) })
        : t('clock.clockedOut', {
            name: entry.staffName,
            time: fmtTime(entry.clockOut!),
            worked: fmtDuration(entry.clockOut! - entry.clockIn),
          }),
      true,
    )
    return true
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return false
    throw e
  }
}

// PINs are 4–6 digits: try from the 4th digit, and only show an error on Enter or at 6 digits.
async function submit(showError = true) {
  if (busy.value || !pin.value) return
  busy.value = true
  const attempt = pin.value
  let done = false
  try {
    done = await attemptPin(attempt)
    if (!done && (showError || attempt.length === 6)) {
      error.value = true
      pin.value = ''
    }
  } catch (e) {
    // Refused for a reason other than the PIN (wrong branch, not clocked in): say why here.
    if (!(e instanceof ApiError)) throw e
    done = true
    pin.value = ''
    show(e.message, false)
  } finally {
    busy.value = false
  }
  // Digits typed while the check was running: try the longer PIN.
  if (!done && pin.value !== attempt && pin.value.length >= 4) void submit(false)
}

function onKey(e: KeyboardEvent) {
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') press('back')
  else if (e.key === 'Enter') submit()
  else if (e.key === 'Escape') press('clear')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(messageTimer)
})
</script>

<template>
  <div class="grid min-h-full place-items-center bg-bg p-6">
    <div class="w-full max-w-xs text-center">
      <div
        class="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-primary text-3xl text-primary-ink"
      >
        ☀
      </div>
      <h1 class="text-2xl font-bold">{{ settings.s.storeName }}</h1>
      <!-- Which branch this till is at (remembered on this device). -->
      <div
        v-if="auth.multiBranch"
        class="mt-3 flex flex-wrap justify-center gap-1.5"
        role="group"
        :aria-label="t('branches.thisTill')"
      >
        <button
          v-for="b in auth.branches"
          :key="b.id"
          class="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition"
          :class="
            auth.deviceBranch === b.id
              ? 'border-primary bg-primary text-primary-ink'
              : 'border-line text-ink-muted hover:text-ink'
          "
          :aria-pressed="auth.deviceBranch === b.id"
          @click="auth.deviceBranch = b.id"
        >
          <MapPin class="size-3.5" /> {{ b.name }}
        </button>
      </div>
      <div class="segmented mt-4" role="group" :aria-label="t('clock.mode')">
        <button :aria-pressed="mode === 'login'" @click="setMode('login')">
          <LogIn class="size-4" /> {{ t('clock.signIn') }}
        </button>
        <button :aria-pressed="mode === 'clock'" @click="setMode('clock')">
          <Clock class="size-4" /> {{ t('clock.clockInOut') }}
        </button>
      </div>
      <p class="mt-3 text-sm text-ink-muted">
        {{ mode === 'login' ? t('lock.enterPin') : t('clock.enterPin') }}
      </p>

      <div class="my-6 flex justify-center gap-3" :class="error && 'animate-[shake_0.3s]'">
        <span
          v-for="i in 4"
          :key="i"
          class="size-3.5 rounded-full border-2 transition"
          :class="
            error
              ? 'border-danger bg-danger'
              : pin.length >= i
                ? 'anim-pop border-primary bg-primary'
                : 'border-line'
          "
        />
      </div>
      <p
        class="-mt-3 mb-3 min-h-5 text-sm font-medium"
        :class="message?.ok ? 'text-success' : 'text-danger'"
        role="status"
      >
        {{ error ? t('lock.wrongPin') : (message?.text ?? '') }}
      </p>

      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="k in keys"
          :key="k"
          class="btn h-16 rounded-2xl text-xl"
          :class="k === 'clear' || k === 'back' ? 'btn-ghost text-sm' : 'btn-outline'"
          :aria-label="k === 'back' ? t('common.backspace') : k"
          @click="press(k)"
        >
          <Delete v-if="k === 'back'" class="size-6" />
          <template v-else-if="k === 'clear'">{{ t('common.clear') }}</template>
          <template v-else>{{ k }}</template>
        </button>
      </div>

      <div
        class="mt-8 flex flex-wrap justify-center gap-1"
        role="group"
        :aria-label="t('settings.language')"
      >
        <button
          v-for="l in languages"
          :key="l.id"
          :lang="l.id"
          class="rounded-full px-3 py-1.5 text-xs font-medium transition"
          :class="
            settings.language === l.id
              ? 'bg-primary-soft text-primary'
              : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
          "
          :aria-pressed="settings.language === l.id"
          @click="settings.language = l.id"
        >
          {{ l.name }}
        </button>
      </div>

      <p class="mt-4 text-xs text-ink-muted">
        {{ t('lock.demoPins') }} {{ t('roles.admin') }} <b>1234</b> · {{ t('roles.cashier') }}
        <b>0000</b>
      </p>
    </div>
  </div>
</template>

<style>
@keyframes shake {
  25% {
    transform: translateX(-6px);
  }
  75% {
    transform: translateX(6px);
  }
}
</style>
