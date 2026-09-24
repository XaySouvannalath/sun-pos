<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

// A number that counts smoothly to its new value (instantly when animations are off).
const props = withDefaults(
  defineProps<{
    value: number
    format?: (n: number) => string
    duration?: number
    /** Count up from zero when first shown (for report figures). */
    fromZero?: boolean
  }>(),
  { format: (n: number) => String(Math.round(n)), duration: 350, fromZero: false },
)

const settings = useSettingsStore()
const shown = ref(props.fromZero && settings.animate ? 0 : props.value)
let frame = 0

function tween(to: number) {
  cancelAnimationFrame(frame)
  if (!settings.animate) {
    shown.value = to
    return
  }
  const from = shown.value
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / props.duration)
    const eased = 1 - Math.pow(1 - t, 3)
    shown.value = from + (to - from) * eased
    if (t < 1) frame = requestAnimationFrame(step)
    else shown.value = to
  }
  frame = requestAnimationFrame(step)
}

watch(() => props.value, tween)
onMounted(() => {
  if (shown.value !== props.value) tween(props.value)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <span class="tabular-nums">{{ format(shown) }}</span>
</template>
