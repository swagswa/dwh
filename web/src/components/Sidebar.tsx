import { LayoutDashboard, Search, FileText, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PageKey = 'dashboard' | 'search' | 'documents' | 'settings'

interface SidebarProps {
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
  userEmail?: string
  onLogout: () => void
}

const navItems: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { key: 'search', label: 'Поиск', icon: Search },
  { key: 'documents', label: 'Документы', icon: FileText },
  { key: 'settings', label: 'Настройки', icon: Settings },
]

export function Sidebar({ currentPage, onNavigate, userEmail, onLogout }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-slate-950">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold tracking-wider text-white">
          D
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-slate-100">
          DWH
        </span>
        <span className="ml-auto rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          beta
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map(({ key, label, icon: Icon }) => {
          const active = currentPage === key
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className={cn(
                'group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                active
                  ? 'bg-slate-800 text-slate-50'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
              )}
            >
              {active && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-500" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          )
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-3">
        {userEmail && (
          <p className="mb-2 truncate px-3 text-xs text-slate-500" title={userEmail}>
            {userEmail}
          </p>
        )}
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors duration-150 hover:bg-slate-800/50 hover:text-slate-200"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
      </div>
    </aside>
  )
}
