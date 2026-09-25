import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useCatalogStore } from './catalog'
import { useCustomersStore } from './customers'
import { useCartStore } from './cart'
import { useShiftStore } from './shift'
import { useOrdersStore } from './orders'
import { useSettingsStore } from './settings'
import { useRatesStore } from './rates'

/** Loads everything the tills need after sign-in. */
export const useAppStore = defineStore('app', () => {
  const loaded = ref(false)

  async function load() {
    await Promise.all([
      useSettingsStore().load(),
      useCatalogStore().load(),
      useCustomersStore().load(),
      useCartStore().loadHeld(),
      useShiftStore().load(),
    ])
    // Rates depend on the store currency, so they load after the settings.
    await Promise.all([useOrdersStore().loadTopSellers(), useRatesStore().load()])
    loaded.value = true
  }

  function reset() {
    loaded.value = false
  }

  return { loaded, load, reset }
})
