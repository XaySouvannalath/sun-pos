<script setup lang="ts">
import { useToastStore } from '@/stores/toast'
import { CircleCheck, CircleAlert } from 'lucide-vue-next'

const toast = useToastStore()
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-200"
      enter-from-class="-translate-y-2 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <button
        v-for="t in toast.toasts"
        :key="t.id"
        class="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-lg"
        @click="toast.dismiss(t.id)"
      >
        <CircleCheck v-if="t.tone === 'success'" class="size-4 text-success" />
        <CircleAlert v-else-if="t.tone === 'error'" class="size-4 text-danger" />
        {{ t.message }}
      </button>
    </TransitionGroup>
  </div>
</template>
