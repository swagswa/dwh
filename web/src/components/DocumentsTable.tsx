import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronLeft, ChevronRight, ChevronDown, Search, RefreshCw } from 'lucide-react'
import { DocumentModal } from './DocumentModal'
import type { DocumentRow } from './DocumentModal'

const PAGE_SIZE = 50

const SOURCE_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  chatgpt: 'ChatGPT',
  telegram: 'Telegram',
  sites: 'Сайты',
  documents: 'Файлы',
}

const SOURCE_COLORS: Record<string, string> = {
  gmail: 'bg-red-100 text-red-700 border-red-200',
  chatgpt: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  telegram: 'bg-blue-100 text-blue-700 border-blue-200',
  sites: 'bg-orange-100 text-orange-700 border-orange-200',
  documents: 'bg-purple-100 text-purple-700 border-purple-200',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function DocumentsTable() {
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [selectedDoc, setSelectedDoc] = useState<DocumentRow | null>(null)
  const [searchInput, setSearchInput] = useState('')

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('documents')
        .select('id, source, title, created_at, updated_at', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (sourceFilter !== 'all') {
        query = query.eq('source', sourceFilter)
      }
      if (search) {
        query = query.ilike('title', `%${search}%`)
      }

      const { data, count, error } = await query
      if (!error) {
        setDocs((data as DocumentRow[]) ?? [])
        setTotal(count ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, sourceFilter])

  useEffect(() => { void fetchDocs() }, [fetchDocs])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    setSearch(searchInput)
  }

  function handleSourceFilter(src: string) {
    setSourceFilter(src)
    setPage(0)
  }

  async function fetchFullDoc(id: string) {
    const { data } = await supabase
      .from('documents')
      .select('id, source, title, content, metadata, created_at, updated_at')
      .eq('id', id)
      .single()
    if (data) setSelectedDoc(data as DocumentRow)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Документы
          <span className="ml-2 text-sm font-normal text-muted-foreground">({total})</span>
        </h2>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 h-8 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
              {sourceFilter === 'all' ? 'Все источники' : SOURCE_LABELS[sourceFilter] ?? sourceFilter}
              <ChevronDown size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSourceFilter('all')}>Все источники</DropdownMenuItem>
              {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                <DropdownMenuItem key={key} onClick={() => handleSourceFilter(key)}>{label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-8 w-48 text-sm"
                placeholder="Поиск по названию..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="h-8">
              <Search size={14} />
            </Button>
          </form>

          <Button variant="ghost" size="sm" onClick={() => void fetchDocs()} className="h-8 w-8 p-0">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-28">Источник</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="w-28 text-right">Дата</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-4 w-full bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  Документов не найдено
                </TableCell>
              </TableRow>
            ) : (
              docs.map(doc => (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => void fetchFullDoc(doc.id)}
                >
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SOURCE_COLORS[doc.source] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {SOURCE_LABELS[doc.source] ?? doc.source}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium max-w-xs truncate" title={doc.title}>
                    {doc.title || <span className="text-muted-foreground italic">Без названия</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDate(doc.updated_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Стр. {page + 1} из {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className="h-7 w-7 p-0"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      <DocumentModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
    </div>
  )
}
