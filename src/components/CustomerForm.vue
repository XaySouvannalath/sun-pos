<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Customer } from '@/types'

const props = defineProps<{ customer?: Customer | null; submitLabel?: string }>()
const emit = defineEmits<{
  submit: [data: Pick<Customer, 'name' | 'phone' | 'email' | 'note'> & { id?: string }]
  cancel: []
}>()

const form = reactive({ name: '', phone: '', email: '', note: '' })

watch(
  () => props.customer,
  (c) => {
    form.name = c?.name ?? ''
    form.phone = c?.phone ?? ''
    form.email = c?.email ?? ''
    form.note = c?.note ?? ''
  },
  { immediate: true },
)

function submit() {
  if (!form.name.trim()) return
  emit('submit', {
    id: props.customer?.id,
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    note: form.note.trim(),
  })
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="submit">
    <div>
      <label class="label" for="c-name">Name *</label>
      <input id="c-name" v-model="form.name" class="input" required autofocus />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label" for="c-phone">Phone</label>
        <input id="c-phone" v-model="form.phone" class="input" type="tel" />
      </div>
      <div>
        <label class="label" for="c-email">Email</label>
        <input id="c-email" v-model="form.email" class="input" type="email" />
      </div>
    </div>
    <div>
      <label class="label" for="c-note">Note</label>
      <input id="c-note" v-model="form.note" class="input" placeholder="Allergies, preferences…" />
    </div>
    <div class="flex gap-2 pt-1">
      <button type="button" class="btn btn-soft" @click="emit('cancel')">Cancel</button>
      <button type="submit" class="btn btn-primary flex-1" :disabled="!form.name.trim()">
        {{ submitLabel ?? 'Save' }}
      </button>
    </div>
  </form>
</template>
