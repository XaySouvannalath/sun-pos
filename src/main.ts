import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { ApiError, setUnauthorizedHandler } from './api'
import { useAuthStore } from './stores/auth'
import { useAppStore } from './stores/app'
import { useToastStore } from './stores/toast'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// The server no longer accepts the session (expired, or staff removed): back to the lock screen.
setUnauthorizedHandler(() => {
  useAuthStore().clear()
  useAppStore().reset()
  if (router.currentRoute.value.name !== 'lock') router.push({ name: 'lock' })
})

// Show API failures (validation, conflicts, no connection) as a message instead of failing silently.
function report(err: unknown) {
  const toast = useToastStore()
  if (err instanceof ApiError) toast.show(err.message, 'error', 4000)
  else {
    console.error(err)
    toast.show('Something went wrong. Please try again.', 'error', 4000)
  }
}
app.config.errorHandler = report
window.addEventListener('unhandledrejection', (e) => {
  report(e.reason)
  e.preventDefault()
})

app.mount('#app')
