import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Database, Layers, Clock } from 'lucide-react'
import { sources, type SourceKey } from '@/lib/sources'
import { edgeFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SourceStats {
  source: SourceKey
  count: number
  lastSync: string | null
}

interface SyncStatus {
  sources: SourceStats[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Никогда'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  return `${days} дн назад`
}

/** Color mapping for left accent borders — Tailwind needs full class names */
const borderLeftColor: Record<string, string> = {
  emerald: 'border-l-emerald-500',
  red: 'border-l-red-500',
  sky: 'border-l-sky-500',
  amber: 'border-l-amber-500',
  violet: 'border-l-violet-500',
}

/* ------------------------------------------------------------------ */
/*  Skeleton Card                                                      */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 animate-pulse">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-5 w-5 rounded bg-slate-800" />
        <div className="h-4 w-24 rounded bg-slate-800" />
      </div>
      <div className="h-9 w-20 rounded bg-slate-800 mb-3" />
      <div className="h-3.5 w-32 rounded bg-slate-800" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Source Stats Card                                                   */
/* ------------------------------------------------------------------ */

interface SourceStatsCardProps {
  stat: SourceStats
  onSync: (source: SourceKey) => Promise<void>
  syncing: boolean
}

function SourceStatsCard({ stat, onSync, syncing }: SourceStatsCardProps) {
  const config = sources[stat.source]
  const Icon = config.icon
  const accentBorder = borderLeftColor[config.color] ?? 'border-l-slate-500'

  const isChatGPT = stat.source === 'chatgpt'
  const isTelegram = stat.source === 'telegram'
  const showSyncButton = !isChatGPT && !isTelegram

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-slate-800 bg-slate-900 p-5 border-l-[3px] transition-colors duration-200 hover:border-slate-700',
        accentBorder,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={cn('rounded-lg p-1.5', config.bgClass)}>
            <Icon className={cn('h-4 w-4', config.textClass)} />
          </div>
          <span className="text-sm font-medium text-slate-300">{config.label}</span>
        </div>
      </div>

      {/* Count */}
      <div className="mb-3">
        <span className="text-3xl font-bold tracking-tight text-slate-100">
          {stat.count.toLocaleString('ru-RU')}
        </span>
        <span className="ml-1.5 text-xs text-slate-500">док.</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">
          {relativeTime(stat.lastSync)}
        </span>

        {showSyncButton && (
          <button
            onClick={() => onSync(stat.source)}
            disabled={syncing}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200',
              'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300 hover:bg-slate-800/50',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <RefreshCw className={cn('h-3 w-3', syncing && 'animate-spin')} />
            {syncing ? 'Синхр...' : 'Синхр.'}
          </button>
        )}

        {isChatGPT && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-400">
            Через расширение
          </span>
        )}

        {isTelegram && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/5 px-2.5 py-1 text-xs font-medium text-sky-400">
            Загрузите JSON
          </span>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Top Stats Bar                                                      */
/* ------------------------------------------------------------------ */

interface TopStatsProps {
  totalDocs: number
  sourceCount: number
  lastSync: string | null
  loading: boolean
}

function TopStatsBar({ totalDocs, sourceCount, lastSync, loading }: TopStatsProps) {
  const stats = [
    { label: 'Всего документов', value: totalDocs.toLocaleString('ru-RU'), icon: Database },
    { label: 'Источников', value: String(sourceCount), icon: Layers },
    { label: 'Последняя синхронизация', value: relativeTime(lastSync), icon: Clock },
  ]

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {stats.map((s) => {
        const SIcon = s.icon
        return (
          <div
            key={s.label}
            className="rounded-lg bg-slate-900/50 border border-slate-800/50 p-4"
          >
            {loading ? (
              <div className="animate-pulse">
                <div className="h-7 w-16 rounded bg-slate-800 mb-1.5" />
                <div className="h-3.5 w-28 rounded bg-slate-800" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <SIcon className="h-4 w-4 text-slate-500" />
                  <span className="text-2xl font-bold tracking-tight text-slate-100">
                    {s.value}
                  </span>
                </div>
                <span className="text-xs text-slate-500">{s.label}</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */

const ALL_SOURCES: SourceKey[] = ['chatgpt', 'gmail', 'telegram', 'sites', 'documents']

export function DashboardPage() {
  const [stats, setStats] = useState<SourceStats[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingSource, setSyncingSource] = useState<SourceKey | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await edgeFetch('sync-status')
      if (res.ok) {
        const data: SyncStatus = await res.json()
        setStats(data.sources ?? [])
      }
    } catch {
      // silently fail — stats will show zeros
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  const handleSync = async (source: SourceKey) => {
    setSyncingSource(source)
    try {
      if (source === 'gmail') {
        // Gmail uses cursor-based pagination — loop until done
        let done = false
        while (!done) {
          const res = await edgeFetch(`sync-${source}`, { method: 'POST' })
          if (!res.ok) break
          const body = await res.json()
          done = !body.nextPageToken
        }
      } else {
        await edgeFetch(`sync-${source}`, { method: 'POST' })
      }
      await fetchStats()
    } catch {
      // fail silently
    } finally {
      setSyncingSource(null)
    }
  }

  /* Build stat objects for all 5 sources, filling zeros for missing */
  const statsBySource: Record<string, SourceStats> = {}
  for (const s of stats) {
    statsBySource[s.source] = s
  }
  const filledStats: SourceStats[] = ALL_SOURCES.map((key) =>
    statsBySource[key] ?? { source: key, count: 0, lastSync: null },
  )

  const totalDocs = filledStats.reduce((sum, s) => sum + s.count, 0)
  const activeSourceCount = filledStats.filter((s) => s.count > 0).length
  const lastSyncDate = filledStats
    .map((s) => s.lastSync)
    .filter(Boolean)
    .sort()
    .pop() ?? null

  return (
    <div>
      <TopStatsBar
        totalDocs={totalDocs}
        sourceCount={activeSourceCount}
        lastSync={lastSyncDate}
        loading={loading}
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {filledStats.map((stat) => (
            <SourceStatsCard
              key={stat.source}
              stat={stat}
              onSync={handleSync}
              syncing={syncingSource === stat.source}
            />
          ))}
        </div>
      )}
    </div>
  )
}
