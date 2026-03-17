import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { edgeFetch } from '@/lib/api'
import { LoginPage } from '@/components/LoginPage'
import { Dashboard } from '@/components/Dashboard'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Handle Gmail OAuth callback: ?code= in URL
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      void (async () => {
        try {
          await edgeFetch(`auth-gmail?code=${encodeURIComponent(code)}`)
        } catch {
          // silently ignore — user may not be authed yet
        }
        // Clean URL
        const clean = window.location.pathname
        window.history.replaceState({}, '', clean)
      })()
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    }).catch(() => setLoading(false))

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => { subscription.unsubscribe() }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return <Dashboard session={session} />
}
