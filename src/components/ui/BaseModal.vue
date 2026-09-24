<script setup lang="ts">
import { t } from '@/i18n'
import { onBeforeUnmount, watch } from 'vue'
import { X } from 'lucide-vue-next'

const open = defineModel<boolean>({ required: true })
const props = withDefaults(
  defineProps<{ title?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; dismissible?: boolean }>(),
  { size: 'md', dismissible: true },
)

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.dismissible) open.value = false
}

watch(
  open,
  (v) => {
    if (v) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
        @mousedown.self="dismissible && (open = false)"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          class="anim-modal flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-xl sm:rounded-3xl"
          :class="widths[size]"
        >
          <header
            v-if="title || $slots.header"
            class="flex items-center gap-3 border-b border-line px-5 py-4"
          >
            <slot name="header">
              <h2 class="flex-1 text-lg font-semibold">{{ title }}</h2>
            </slot>
            <button
              v-if="dismissible"
              class="btn btn-ghost btn-sm btn-icon"
              :aria-label="t('common.close')"
              @click="open = false"
            >
              <X class="size-5" />
            </button>
          </header>
          <div class="flex-1 overflow-y-auto p-5">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="flex gap-3 border-t border-line px-5 py-4">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
