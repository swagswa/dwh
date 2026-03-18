import { useEffect, useRef } from 'react'
import { X, Calendar, Clock, ChevronDown, User, Bot, Wrench, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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

interface ChatMessage {
  role: string
  content: string
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isTool = message.role === 'tool'

  const icon = isUser ? (
    <User className="h-4 w-4" />
  ) : isTool ? (
    <Wrench className="h-4 w-4" />
  ) : (
    <Bot className="h-4 w-4" />
  )

  const label = isUser ? 'Вы' : isSystem ? 'Система' : isTool ? 'Инструмент' : 'ChatGPT'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-blue-500/20 text-blue-400'
            : isSystem
              ? 'bg-amber-500/20 text-amber-400'
              : isTool
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-emerald-500/20 text-emerald-400'
        }`}
      >
        {icon}
      </div>

      {/* Bubble */}
      <div className={`max-w-[85%] min-w-0 ${isUser ? 'items-end' : ''}`}>
        <p className={`mb-1 text-[11px] font-medium ${
          isUser ? 'text-right text-blue-400' : isSystem ? 'text-amber-400' : isTool ? 'text-purple-400' : 'text-emerald-400'
        }`}>
          {label}
        </p>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-blue-500/15 text-slate-200'
              : isSystem
                ? 'rounded-tl-sm bg-amber-500/10 text-slate-300'
                : isTool
                  ? 'rounded-tl-sm bg-purple-500/10 text-slate-300'
                  : 'rounded-tl-sm bg-slate-800/80 text-slate-300'
          }`}
        >
          <div className="chat-markdown break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChatView({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg, i) => (
        <ChatBubble key={i} message={msg} />
      ))}
    </div>
  )
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
        className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-800/40 px-6 py-5">
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
          {/* File info bar for uploaded documents */}
          {doc.source === 'documents' && doc.metadata && (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-slate-800/50 px-4 py-2.5 text-xs text-slate-400">
              <FileText className="h-4 w-4 text-violet-400" />
              <span className="font-medium text-slate-300">
                {(doc.metadata as Record<string, unknown>).filename as string || doc.title}
              </span>
              {typeof (doc.metadata as Record<string, unknown>).format === 'string' && (
                <span className="rounded bg-violet-500/10 px-2 py-0.5 text-violet-400 uppercase">
                  {(doc.metadata as Record<string, unknown>).format as string}
                </span>
              )}
              {(doc.metadata as Record<string, unknown>).pageCount != null && (
                <span>{String((doc.metadata as Record<string, unknown>).pageCount)} стр.</span>
              )}
            </div>
          )}

          {doc.source === 'chatgpt' && Array.isArray((doc.metadata as Record<string, unknown>)?.messages) ? (
            <ChatView messages={(doc.metadata as Record<string, unknown>).messages as ChatMessage[]} />
          ) : doc.content ? (
            <div className="chat-markdown text-sm leading-relaxed text-slate-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
            </div>
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
              <pre className="mt-3 rounded-lg bg-slate-950 p-4 text-xs text-slate-500 overflow-x-auto">
                {JSON.stringify(doc.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
