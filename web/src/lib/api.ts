import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kuodvlyepoojqimutmvu.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_n-B1HcuRd0kDc0spwr-oHg_KI-i0itS'
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

export async function edgeFetch(fn: string, options?: RequestInit) {
  let { data: { session } } = await supabase.auth.getSession()

  // Only refresh if token expires within 60 seconds or is missing
  const expiresAt = session?.expires_at ?? 0
  if (!session?.access_token || expiresAt < Date.now() / 1000 + 60) {
    const { data } = await supabase.auth.refreshSession()
    session = data.session
  }

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
