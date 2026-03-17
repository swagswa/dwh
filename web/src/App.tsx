import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { edgeFetch } from '@/lib/api'
import { LoginPage } from '@/components/LoginPage'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/components/DashboardPage'
import type { PageKey } from '@/components/Sidebar'
import { SearchPage } from '@/components/SearchPage'
import { DocumentsPage } from '@/components/DocumentsPage'
import { SettingsPage } from '@/components/SettingsPage'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard')

  useEffect(() => {
    // Handle Gmail OAuth callback: ?code= in URL
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      void (async () => {
        try {
          await edgeFetch(`auth-gmail?code=${encodeURIComponent(code)}`)
        } catch {
          // silently ignore -- user may not be authed yet
        }
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex items-center gap-2 text-slate-400">
          <div className="h-5 w-5 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <AppLayout
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      userEmail={session.user.email}
      onLogout={() => supabase.auth.signOut()}
    >
      {currentPage === 'dashboard' ? (
        <DashboardPage />
      ) : currentPage === 'search' ? (
        <SearchPage />
      ) : (
        <PlaceholderPage page={currentPage} />
      )}
    </AppLayout>
  )
}
