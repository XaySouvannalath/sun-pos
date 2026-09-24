<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Delete } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const auth = useAuthStore()
const settings = useSettingsStore()
const router = useRouter()
const route = useRoute()

const pin = ref('')
const error = ref(false)
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

function press(k: string) {
  error.value = false
  if (k === 'clear') pin.value = ''
  else if (k === 'back') pin.value = pin.value.slice(0, -1)
  else if (pin.value.length < 6) {
    pin.value += k
    if (pin.value.length >= 4) tryLogin(false)
  }
}

const busy = ref(false)

// PINs are 4–6 digits: try from the 4th digit, and only show an error on Enter or at 6 digits.
async function tryLogin(showError = true) {
  if (busy.value || !pin.value) return
  busy.value = true
  const attempt = pin.value
  try {
    if (await auth.login(attempt)) {
      const next = typeof route.query.next === 'string' ? route.query.next : '/'
      await router.replace(next)
    } else if (showError || attempt.length === 6) {
      error.value = true
      pin.value = ''
    }
  } finally {
    busy.value = false
  }
  // Digits typed while the check was running: try the longer PIN.
  if (auth.user === null && pin.value !== attempt && pin.value.length >= 4) void tryLogin(false)
}

function onKey(e: KeyboardEvent) {
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') press('back')
  else if (e.key === 'Enter') tryLogin()
  else if (e.key === 'Escape') press('clear')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
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
      <p class="mt-1 text-sm text-ink-muted">Enter your PIN to start</p>

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
      <p class="-mt-3 mb-3 h-5 text-sm text-danger">{{ error ? 'Wrong PIN, try again' : '' }}</p>

      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="k in keys"
          :key="k"
          class="btn h-16 rounded-2xl text-xl"
          :class="k === 'clear' || k === 'back' ? 'btn-ghost text-sm' : 'btn-outline'"
          :aria-label="k === 'back' ? 'Backspace' : k"
          @click="press(k)"
        >
          <Delete v-if="k === 'back'" class="size-6" />
          <template v-else-if="k === 'clear'">Clear</template>
          <template v-else>{{ k }}</template>
        </button>
      </div>

      <p class="mt-8 text-xs text-ink-muted">
        Demo PINs: Manager <b>1234</b> · Cashier <b>0000</b>
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
