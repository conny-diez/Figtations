import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Global safety net (PRD NFR-5): an unhandled error must still be visible.
window.addEventListener('error', (event) => {
  console.error('[Figtations]', event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Figtations]', event.reason)
})

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
