import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { edgeFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { FileUpload } from './FileUpload'
import { ChevronDown, ChevronRight, ExternalLink, Plus, Trash2 } from 'lucide-react'

export function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [gmailLoading, setGmailLoading] = useState(false)
  const [gmailError, setGmailError] = useState<string | null>(null)
  const [siteUrl, setSiteUrl] = useState('')
  const [siteUrls, setSiteUrls] = useState<string[]>([])
  const [siteLoading, setSiteLoading] = useState(false)

  useEffect(() => {
    if (open) void loadSiteUrls()
  }, [open])

  async function loadSiteUrls() {
    const { data } = await supabase
      .from('credentials')
      .select('value')
      .eq('source', 'sites')
      .maybeSingle()
    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value as string) as unknown
        if (Array.isArray(parsed)) setSiteUrls(parsed as string[])
      } catch {
        setSiteUrls([])
      }
    }
  }

  async function connectGmail() {
    setGmailLoading(true)
    setGmailError(null)
    try {
      const res = await edgeFetch('auth-gmail')
      if (!res.ok) throw new Error('Ошибка при получении ссылки')
      const json = await res.json() as { url?: string }
      if (json.url) {
        window.location.href = json.url
      } else {
        throw new Error('Нет URL в ответе')
      }
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setGmailLoading(false)
    }
  }

  async function addSiteUrl() {
    const trimmed = siteUrl.trim()
    if (!trimmed || siteUrls.includes(trimmed)) {
      setSiteUrl('')
      return
    }
    const updated = [...siteUrls, trimmed]
    await saveSiteUrls(updated)
    setSiteUrl('')
  }

  async function removeSiteUrl(url: string) {
    const updated = siteUrls.filter(u => u !== url)
    await saveSiteUrls(updated)
  }

  async function saveSiteUrls(urls: string[]) {
    setSiteLoading(true)
    await supabase.from('credentials').upsert(
      { source: 'sites', value: JSON.stringify(urls), updated_at: new Date().toISOString() },
      { onConflict: 'source' },
    )
    setSiteUrls(urls)
    setSiteLoading(false)
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-sm">Настройки</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-6">
          <Separator />

          {/* Gmail */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Gmail</h3>
            <p className="text-xs text-muted-foreground">
              Подключите Gmail для синхронизации писем
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void connectGmail()}
              disabled={gmailLoading}
              className="gap-1.5"
            >
              <ExternalLink size={14} />
              {gmailLoading ? 'Перенаправление...' : 'Подключить Gmail'}
            </Button>
            {gmailError && (
              <p className="text-xs text-destructive">{gmailError}</p>
            )}
          </div>

          <Separator />

          {/* Sites */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Сайты для мониторинга</h3>
            <p className="text-xs text-muted-foreground">
              Добавьте URL сайтов, которые нужно синхронизировать
            </p>
            {siteUrls.length > 0 && (
              <ul className="space-y-1.5">
                {siteUrls.map(url => (
                  <li key={url} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 bg-muted/30">
                    <span className="text-sm text-muted-foreground truncate">{url}</span>
                    <button
                      onClick={() => void removeSiteUrl(url)}
                      disabled={siteLoading}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com"
                value={siteUrl}
                onChange={e => setSiteUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void addSiteUrl() }}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void addSiteUrl()}
                disabled={siteLoading || !siteUrl.trim()}
                className="h-8 gap-1 shrink-0"
              >
                <Plus size={14} />
                Добавить
              </Button>
            </div>
          </div>

          <Separator />

          {/* File upload */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Загрузка документов</h3>
            <p className="text-xs text-muted-foreground">
              Загрузите JSON-экспорт Telegram или другие файлы
            </p>
            <FileUpload />
          </div>
        </div>
      )}
    </div>
  )
}
