type Listener = () => void
const listeners = new Set<Listener>()

export function onDataChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function emitDataChange() {
  sessionStorage.removeItem('dwh-stats')
  listeners.forEach((fn) => fn())
}
