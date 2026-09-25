<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Delete, ShieldCheck } from 'lucide-vue-next'
import { t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useApprovalStore } from '@/stores/approval'
import { useAuthStore } from '@/stores/auth'

const approval = useApprovalStore()
const auth = useAuthStore()

const pin = ref('')
const open = computed({
  get: () => !!approval.pending,
  set: (v) => {
    if (!v) approval.cancel()
  },
})
// Typing the PIN on a keyboard works too, while the pad is open.
watch(
  () => approval.pending,
  (p) => {
    pin.value = ''
    if (p) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
// A wrong PIN clears the dots so the manager can try again.
watch(
  () => approval.error,
  (e) => {
    if (e) pin.value = ''
  },
)

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
function press(k: string) {
  if (approval.busy) return
  if (k === 'back') pin.value = pin.value.slice(0, -1)
  else if (k === 'clear') pin.value = ''
  else if (pin.value.length < 6) pin.value += k
}

function onKey(e: KeyboardEvent) {
  // The PIN pad takes the keys, so they don't also type into a field behind it.
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') press('back')
  else if (e.key === 'Enter' && pin.value.length >= 4) void approval.submit(pin.value)
  else return
  e.preventDefault()
}
</script>

<template>
  <BaseModal v-model="open" :title="t('approval.title')" size="sm" top>
    <div v-if="approval.pending" class="space-y-4">
      <div class="flex gap-3 rounded-2xl bg-accent-soft p-3 text-sm text-ink">
        <ShieldCheck class="mt-0.5 size-5 shrink-0 text-accent" />
        <div>
          <p class="font-semibold">{{ t(`approval.actions.${approval.pending.action}`) }}</p>
          <p v-if="approval.pending.detail" class="text-ink-muted">{{ approval.pending.detail }}</p>
          <p class="mt-1 text-xs text-ink-muted">
            {{ t('approval.askedBy', { name: auth.user?.name ?? '' }) }}
          </p>
        </div>
      </div>

      <p class="text-center text-sm text-ink-muted">{{ t('approval.enterPin') }}</p>
      <div class="flex justify-center gap-3" aria-hidden="true">
        <span
          v-for="i in 6"
          :key="i"
          class="size-3.5 rounded-full border-2 transition"
          :class="i <= pin.length ? 'border-primary bg-primary' : 'border-line'"
        />
      </div>
      <p v-if="approval.error" class="text-center text-sm font-medium text-danger" role="alert">
        {{ approval.error }}
      </p>

      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="k in keys"
          :key="k"
          class="btn btn-soft h-12 text-lg"
          :aria-label="k === 'back' ? t('common.backspace') : k === 'clear' ? t('common.clear') : k"
          @click="press(k)"
        >
          <Delete v-if="k === 'back'" class="size-5" />
          <span v-else-if="k === 'clear'" class="text-xs">{{ t('common.clear') }}</span>
          <template v-else>{{ k }}</template>
        </button>
      </div>
    </div>
    <template #footer>
      <button class="btn btn-soft" @click="approval.cancel()">{{ t('common.cancel') }}</button>
      <button
        class="btn btn-primary flex-1"
        :disabled="pin.length < 4 || approval.busy"
        @click="approval.submit(pin)"
      >
        <ShieldCheck class="size-4" /> {{ t('approval.approve') }}
      </button>
    </template>
  </BaseModal>
</template>
