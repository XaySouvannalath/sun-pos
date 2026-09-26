<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import { Copy, ExternalLink, Printer, QrCode, RefreshCw } from 'lucide-vue-next'
import { t } from '@/i18n'
import { api } from '@/api'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useFloorStore } from '@/stores/floor'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { canPrint, embedded } from '@/utils/env'
import type { DiningTable } from '@/types'

const auth = useAuthStore()
const floor = useFloorStore()
const settings = useSettingsStore()
const toast = useToastStore()
const router = useRouter()

onMounted(() => floor.load())

/** The link in a table's QR code: the guest ordering page of this app. */
const guestUrl = (token: string) =>
  new URL(`${import.meta.env.BASE_URL}order/${token}`, window.location.origin).href

// QR images, made in the browser (no outside service sees the links).
const images = ref<Record<string, string>>({})
watch(
  () => floor.plan.tables.map((tb) => tb.qrToken ?? ''),
  async (tokens) => {
    const out: Record<string, string> = {}
    for (const token of tokens.filter(Boolean))
      out[token] =
        images.value[token] ??
        (await QRCode.toString(guestUrl(token), { type: 'svg', margin: 1, width: 180 }))
    images.value = out
  },
  { immediate: true },
)

const byArea = computed(() =>
  floor.plan.areas
    .map((a) => ({ area: a, tables: floor.plan.tables.filter((tb) => tb.areaId === a.id) }))
    .filter((g) => g.tables.length),
)

async function copy(tb: DiningTable) {
  try {
    await navigator.clipboard.writeText(guestUrl(tb.qrToken!))
    toast.show(t('selfOrder.linkCopied'), 'success')
  } catch {
    toast.show(guestUrl(tb.qrToken!))
  }
}

const print = () => window.print()

const renewing = ref<DiningTable | null>(null)
async function renew() {
  const tb = renewing.value
  if (!tb) return
  await api.floor.newQr(tb.id)
  renewing.value = null
  await floor.load()
  toast.show(t('selfOrder.renewed', { table: tb.name }), 'success')
}
</script>

<template>
  <div class="page space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex flex-1 items-center gap-2">
        <QrCode class="size-7 text-primary" /> {{ t('selfOrder.qrCodes') }}
      </h1>
      <button v-if="canPrint" class="btn btn-primary" @click="print">
        <Printer class="size-4" /> {{ t('selfOrder.printAll') }}
      </button>
    </div>
    <p class="max-w-3xl text-sm text-ink-muted">{{ t('selfOrder.qrHelp') }}</p>
    <p v-if="embedded" class="max-w-3xl rounded-xl bg-accent-soft px-3 py-2 text-sm">
      {{ t('selfOrder.previewHint') }}
    </p>
    <p v-if="!settings.s.selfOrder.enabled" class="rounded-xl bg-danger-soft px-3 py-2 text-sm">
      {{ t('selfOrder.offHint') }}
    </p>

    <div class="print-area print-sheet space-y-6">
      <section v-for="g in byArea" :key="g.area.id">
        <h2 class="mb-3 text-lg font-semibold">{{ g.area.name }}</h2>
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <li
            v-for="tb in g.tables"
            :key="tb.id"
            class="print-card card flex flex-col items-center p-4 text-center"
          >
            <p class="text-xs text-ink-muted">
              {{ settings.s.storeName
              }}<template v-if="auth.multiBranch"> · {{ auth.branch?.name }}</template>
            </p>
            <p class="text-2xl font-bold">{{ t('cart.tableN', { n: tb.name }) }}</p>
            <!-- eslint-disable-next-line vue/no-v-html -- SVG made locally by the qrcode library -->
            <div
              v-if="tb.qrToken && images[tb.qrToken]"
              class="my-2 w-40 rounded-lg bg-white p-1 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              v-html="images[tb.qrToken]"
            />
            <p class="text-sm font-medium">{{ t('selfOrder.scanToOrder') }}</p>
            <div class="mt-3 flex gap-1 print:hidden">
              <button
                class="btn btn-ghost btn-icon btn-sm"
                :title="t('selfOrder.openGuest')"
                :aria-label="t('selfOrder.openGuest')"
                @click="router.push(`/order/${tb.qrToken}`)"
              >
                <ExternalLink class="size-4" />
              </button>
              <button
                class="btn btn-ghost btn-icon btn-sm"
                :title="t('selfOrder.copyLink')"
                :aria-label="t('selfOrder.copyLink')"
                @click="copy(tb)"
              >
                <Copy class="size-4" />
              </button>
              <button
                class="btn btn-ghost btn-icon btn-sm"
                :title="t('selfOrder.renew')"
                :aria-label="t('selfOrder.renew')"
                @click="renewing = tb"
              >
                <RefreshCw class="size-4" />
              </button>
            </div>
          </li>
        </ul>
      </section>
      <p v-if="!byArea.length" class="card p-10 text-center text-sm text-ink-muted">
        {{ t('selfOrder.noTables') }}
      </p>
    </div>

    <BaseModal
      :model-value="!!renewing"
      :title="t('selfOrder.renewTitle', { table: renewing?.name ?? '' })"
      size="sm"
      @update:model-value="renewing = null"
    >
      <p class="text-sm text-ink-muted">{{ t('selfOrder.renewBody') }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="renewing = null">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-primary flex-1" @click="renew">{{ t('selfOrder.renew') }}</button>
      </template>
    </BaseModal>
  </div>
</template>
