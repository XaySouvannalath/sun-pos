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
      <div
        v-for="t in toast.toasts"
        :key="t.id"
        class="pointer-events-auto flex items-center rounded-full border border-line bg-surface text-sm font-medium shadow-lg"
      >
        <button class="flex items-center gap-2 py-2.5 pr-4 pl-4" @click="toast.dismiss(t.id)">
          <CircleCheck v-if="t.tone === 'success'" class="size-4 text-success" />
          <CircleAlert v-else-if="t.tone === 'error'" class="size-4 text-danger" />
          {{ t.message }}
        </button>
        <button
          v-if="t.action"
          class="-ml-1 mr-1.5 rounded-full px-3 py-1.5 font-semibold text-primary hover:bg-primary-soft"
          @click="toast.act(t)"
        >
          {{ t.action.label }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
