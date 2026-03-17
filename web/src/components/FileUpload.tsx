import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { edgeFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Upload, CheckCircle, XCircle, FileText } from 'lucide-react'

const ACCEPTED = '.json,.txt,.md,.csv,.pdf,.docx,.xlsx'

interface UploadResult {
  file: string
  status: 'success' | 'error'
  message?: string
}

export function FileUpload() {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    const filename = file.name
    const filePath = `uploads/${Date.now()}_${filename}`

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      return { file: filename, status: 'error' as const, message: uploadError.message }
    }

    const res = await edgeFetch('sync-documents', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath, filename }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Ошибка сервера')
      return { file: filename, status: 'error' as const, message: text }
    }

    return { file: filename, status: 'success' as const }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setResults([])

    const results: UploadResult[] = []
    for (const file of Array.from(files)) {
      const result = await uploadFile(file)
      results.push(result)
      setResults([...results])
    }
    setUploading(false)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          relative flex flex-col items-center justify-center gap-3
          rounded-lg border-2 border-dashed p-8 text-center
          cursor-pointer transition-colors select-none
          ${dragging
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <div className={`rounded-full p-3 ${dragging ? 'bg-primary/10' : 'bg-muted'}`}>
          <Upload size={20} className={dragging ? 'text-primary' : 'text-muted-foreground'} />
        </div>
        <div>
          <p className="text-sm font-medium">
            {uploading ? 'Загрузка...' : 'Перетащите файлы или нажмите для выбора'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            JSON, TXT, MD, CSV, PDF, DOCX, XLSX
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={e => void handleFiles(e.target.files)}
        />
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm border ${
              r.status === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {r.status === 'success'
                ? <CheckCircle size={14} className="shrink-0" />
                : <XCircle size={14} className="shrink-0" />
              }
              <FileText size={14} className="shrink-0" />
              <span className="font-medium truncate">{r.file}</span>
              {r.message && <span className="text-xs opacity-70 ml-auto shrink-0">{r.message}</span>}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setResults([])}
          >
            Очистить
          </Button>
        </div>
      )}
    </div>
  )
}
