import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { edgeFetch } from '@/lib/api'
import { emitDataChange } from '@/lib/events'
import { LoginPage } from '@/components/LoginPage'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/components/DashboardPage'
import type { PageKey } from '@/components/Sidebar'
import { SearchPage } from '@/components/SearchPage'
import { DocumentsPage } from '@/components/DocumentsPage'
import { SettingsPage } from '@/components/SettingsPage'
import { GlobalDropZone } from '@/components/GlobalDropZone'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<PageKey>(() => {
    const hash = window.location.hash.replace('#', '') as PageKey
    return ['dashboard', 'search', 'documents', 'settings'].includes(hash) ? hash : 'dashboard'
  })

  // Sync current page to URL hash
  useEffect(() => {
    window.location.hash = currentPage
  }, [currentPage])

  // Handle browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '') as PageKey
      if (['dashboard', 'search', 'documents', 'settings'].includes(hash)) {
        setCurrentPage(hash)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const init = async () => {
      // 1. Instant load from localStorage (no network)
      const { data: { session: cached } } = await supabase.auth.getSession()
      setSession(cached)
      setLoading(false)

      // 2. Background refresh (updates token silently)
      supabase.auth.refreshSession().catch(() => {})

      // 3. Handle Gmail OAuth callback: ?code= in URL (needs session)
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      if (code && cached) {
        try {
          await edgeFetch('auth-gmail', {
            method: 'POST',
            body: JSON.stringify({ code }),
          })
          emitDataChange()
        } catch (err) {
          console.error('Gmail OAuth exchange failed:', err)
        }
        window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      }
    }
    void init()

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
    <GlobalDropZone>
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
      ) : currentPage === 'documents' ? (
        <DocumentsPage />
      ) : (
        <SettingsPage userEmail={session.user.email} onLogout={() => supabase.auth.signOut()} />
      )}
    </AppLayout>
    </GlobalDropZone>
  )
}
