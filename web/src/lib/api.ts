import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kuodvlyepoojqimutmvu.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_n-B1HcuRd0kDc0spwr-oHg_KI-i0itS'
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

export async function edgeFetch(fn: string, options?: RequestInit) {
  // refreshSession() auto-refreshes expired tokens, unlike getSession() which returns cached
  const { data: { session } } = await supabase.auth.refreshSession()
  if (!session?.access_token) {
    throw new Error('Не авторизован — войдите в систему')
  }
  return fetch(`${FUNCTIONS_URL}/${fn}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      ...options?.headers,
    },
  })
}
