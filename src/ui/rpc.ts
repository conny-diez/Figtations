/** Typed postMessage client with promises (PRD §4.4). */
import { isMainEvent, type MainEvent, type UiMessage, type UiRequest } from '../shared/rpc'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const pending = new Map<string, Pending>()
const listeners = new Set<(event: MainEvent) => void>()
let counter = 0

window.addEventListener('message', (event: MessageEvent) => {
  const data: unknown = event.data
  if (typeof data !== 'object' || data === null) return
  const payload = (data as Record<string, unknown>)['pluginMessage']
  if (!isMainEvent(payload)) return

  if (payload.t === 'ok') {
    const entry = pending.get(payload.requestId)
    if (entry) {
      pending.delete(payload.requestId)
      entry.resolve(payload.payload)
    }
    return
  }
  if (payload.t === 'error') {
    const entry = pending.get(payload.requestId)
    if (entry) {
      pending.delete(payload.requestId)
      entry.reject(new Error(payload.message))
      return
    }
  }
  for (const listener of listeners) listener(payload)
})

export function request<T = unknown>(req: UiRequest): Promise<T> {
  counter += 1
  const requestId = `r${counter}`
  const message: UiMessage = { requestId, req }
  return new Promise<T>((resolve, reject) => {
    pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
    parent.postMessage({ pluginMessage: message }, '*')
  })
}

export function onEvent(handler: (event: MainEvent) => void): () => void {
  listeners.add(handler)
  return () => {
    listeners.delete(handler)
  }
}
