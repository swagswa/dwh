import { useEffect, useRef } from 'react'
import { X, Calendar, Clock, ChevronDown } from 'lucide-react'
import { SourceBadge } from '@/components/SourceBadge'
import type { SourceKey } from '@/lib/sources'

export interface Document {
  id: string
  source: SourceKey
  source_id: string
  title: string
  content: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface DocumentSheetProps {
  document: Document | null
  onClose: () => void
}

export function DocumentSheet({ document: doc, onClose }: DocumentSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!doc) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doc, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (doc) {
      globalThis.document.body.classList.add('overflow-hidden')
    }
    return () => {
      globalThis.document.body.classList.remove('overflow-hidden')
    }
  }, [doc])

  if (!doc) return null

  const hasMetadata = doc.metadata && Object.keys(doc.metadata).length > 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-slate-800 bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-800 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="mb-2">
              <SourceBadge source={doc.source} />
            </div>
            <h2 className="text-lg font-semibold leading-snug text-slate-100">
              {doc.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(doc.created_at)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(doc.updated_at)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {doc.content ? (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300 font-mono">
              {doc.content}
            </pre>
          ) : (
            <p className="text-sm text-slate-500 italic">Нет содержимого</p>
          )}

          {/* Metadata */}
          {hasMetadata && (
            <details className="mt-6 group">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500 select-none hover:text-slate-400 transition-colors">
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
                Метаданные
              </summary>
              <pre className="mt-3 rounded-lg bg-slate-950 border border-slate-800 p-4 text-xs text-slate-500 overflow-x-auto">
                {JSON.stringify(doc.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
