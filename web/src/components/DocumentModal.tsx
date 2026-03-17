import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface DocumentRow {
  id: string
  source: string
  title: string
  content?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface Props {
  doc: DocumentRow | null
  onClose: () => void
}

const SOURCE_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  chatgpt: 'ChatGPT',
  telegram: 'Telegram',
  sites: 'Сайты',
  documents: 'Файлы',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function DocumentModal({ doc, onClose }: Props) {
  const [metaOpen, setMetaOpen] = useState(false)

  if (!doc) return null

  return (
    <Dialog open={!!doc} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">{doc.title || 'Без названия'}</DialogTitle>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Badge variant="secondary">{SOURCE_LABELS[doc.source] ?? doc.source}</Badge>
            <span className="text-xs text-muted-foreground">
              Создан: {formatDate(doc.created_at)}
            </span>
            <span className="text-xs text-muted-foreground">
              Изменён: {formatDate(doc.updated_at)}
            </span>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 mt-2 rounded-md border bg-muted/30 p-4 min-h-0">
          {doc.content ? (
            <pre className="whitespace-pre-wrap text-sm font-mono break-words">{doc.content}</pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">Нет содержимого</p>
          )}
        </ScrollArea>

        {doc.metadata && Object.keys(doc.metadata).length > 0 && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMetaOpen(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground px-0 h-auto"
            >
              {metaOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Метаданные
            </Button>
            {metaOpen && (
              <ScrollArea className="mt-1 max-h-40 rounded-md border bg-muted/20 p-3">
                <pre className="text-xs font-mono">{JSON.stringify(doc.metadata, null, 2)}</pre>
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
