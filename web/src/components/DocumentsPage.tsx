import { useCallback, useEffect, useState } from 'react'
import { Search, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { type SourceKey } from '@/lib/sources'
import { SourceBadge } from '@/components/SourceBadge'
import { EmptyState } from '@/components/EmptyState'
import { DocumentSheet, type Document } from '@/components/DocumentSheet'

const PAGE_SIZE = 50

const tabs: { key: 'all' | SourceKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'gmail', label: 'Gmail' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'sites', label: 'Сайты' },
  { key: 'documents', label: 'Документы' },
]

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин. назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч. назад`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн. назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-slate-800/50">
          <td className="px-4 py-3 w-32">
            <div className="h-5 w-20 animate-pulse rounded-md bg-slate-800" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-slate-800" style={{ width: `${60 + i * 8}%` }} />
          </td>
          <td className="px-4 py-3 w-40">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-800" />
          </td>
        </tr>
      ))}
    </>
  )
}

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<'all' | SourceKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('documents')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (activeTab !== 'all') {
        query = query.eq('source', activeTab)
      }
      if (searchQuery.trim()) {
        query = query.ilike('title', `%${searchQuery.trim()}%`)
      }

      const { data, count, error } = await query
      if (error) throw error
      setDocuments((data as Document[]) ?? [])
      setTotalCount(count ?? 0)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
      setDocuments([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchQuery, page])

  useEffect(() => {
    void fetchDocuments()
  }, [fetchDocuments])

  // Reset page when filter changes
  useEffect(() => {
    setPage(0)
  }, [activeTab, searchQuery])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const from = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount)

  const isEmpty = !loading && documents.length === 0

  return (
    <div className="space-y-5">
      {/* Source Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-slate-900/50 p-1 w-fit">
        {tabs.map((tab) => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
                active
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Search input */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 w-full rounded-lg border border-slate-700/50 bg-slate-800 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-colors focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800/30 bg-slate-900/50">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/50">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400 w-32">
                Источник
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Название
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400 w-40">
                Обновлено
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : isEmpty ? (
              <tr>
                <td colSpan={3}>
                  <EmptyState
                    icon={FileText}
                    title="Нет документов"
                    description={
                      searchQuery
                        ? 'Попробуйте другой поисковый запрос'
                        : 'Документы появятся здесь после синхронизации'
                    }
                  />
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className="border-t border-slate-800/50 transition-colors duration-150 hover:bg-slate-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3 w-32">
                    <SourceBadge source={doc.source} />
                  </td>
                  <td className="px-4 py-3 max-w-0">
                    <span className="block truncate text-sm text-slate-200">
                      {doc.title}
                    </span>
                  </td>
                  <td className="px-4 py-3 w-40">
                    <span className="text-sm text-slate-500">
                      {relativeTime(doc.updated_at)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Показано {from}–{to} из {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={cn(
                'flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700',
                page === 0 && 'opacity-50 cursor-not-allowed hover:bg-slate-800',
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Назад
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={cn(
                'flex items-center gap-1 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700',
                page >= totalPages - 1 && 'opacity-50 cursor-not-allowed hover:bg-slate-800',
              )}
            >
              Далее
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Document Sheet */}
      <DocumentSheet document={selectedDoc} onClose={() => setSelectedDoc(null)} />
    </div>
  )
}
