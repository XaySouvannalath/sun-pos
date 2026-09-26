<script setup lang="ts">
import { t } from '@/i18n'
import { useAuthStore } from '@/stores/auth'

/** '' = this till's branch, a branch id, or 'all' for the whole chain. Hidden with one branch. */
const model = defineModel<string>({ required: true })
defineProps<{ allowAll?: boolean }>()
const auth = useAuthStore()
</script>

<template>
  <select
    v-if="auth.multiBranch"
    v-model="model"
    class="input h-10 w-auto"
    :aria-label="t('branches.show')"
  >
    <option value="">{{ t('branches.thisBranch', { name: auth.branch?.name ?? '' }) }}</option>
    <option
      v-for="b in auth.branches.filter((x) => x.id !== auth.branchId)"
      :key="b.id"
      :value="b.id"
    >
      {{ b.name }}
    </option>
    <option v-if="allowAll !== false" value="all">{{ t('branches.all') }}</option>
  </select>
</template>
