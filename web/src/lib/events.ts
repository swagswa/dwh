import { supabase } from '@/lib/supabase'

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

// Debounced emitter — collapses rapid inserts during batch sync into one notification
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function debouncedEmit() {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    emitDataChange()
  }, 500)
}

// Realtime subscription — set up once at module load, persists for the lifetime of the tab
supabase
  .channel('documents-changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'documents' },
    debouncedEmit,
  )
  .subscribe()
