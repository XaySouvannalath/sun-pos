<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import ApprovalModal from '@/components/ApprovalModal.vue'
import { useSettingsStore } from '@/stores/settings'

// Instantiate early so the saved theme is applied before first paint.
useSettingsStore()
const route = useRoute()
const bare = computed(() => route.meta.public === true)
</script>

<template>
  <RouterView v-if="bare" v-slot="{ Component }">
    <Transition name="page" appear>
      <component :is="Component" />
    </Transition>
  </RouterView>
  <div v-else class="flex h-full flex-col md:flex-row">
    <AppSidebar />
    <main class="min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0">
      <RouterView v-slot="{ Component, route: r }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="r.path" />
        </Transition>
      </RouterView>
    </main>
  </div>
  <ToastHost />
  <ApprovalModal />
</template>
