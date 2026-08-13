/** Outbound channel to the UI. Never throws, even when no UI is shown. */
import type { MainEvent } from '../shared/rpc'

export function emit(event: MainEvent): void {
  try {
    figma.ui.postMessage(event)
  } catch {
    // The UI may be closed (menu commands run headless) — nothing to do.
  }
}

export function toast(level: 'info' | 'warn' | 'error', message: string): void {
  emit({ t: 'toast', level, message })
  try {
    figma.notify(message, level === 'error' ? { error: true } : {})
  } catch {
    // notify is unavailable in some editor types.
  }
}

const throttled = new Map<string, number>()

/** Emits at most one toast per key per `windowMs` (PRD FR-12). */
export function throttledToast(
  key: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  windowMs = 5000
): void {
  const now = Date.now()
  const last = throttled.get(key) ?? 0
  if (now - last < windowMs) return
  throttled.set(key, now)
  toast(level, message)
}
