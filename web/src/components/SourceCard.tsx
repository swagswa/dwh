import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

export interface SourceStatus {
  count: number
  lastSync: string | null
  status: 'success' | 'error' | 'never' | 'syncing'
  error?: string
}

interface Props {
  source: string
  label: string
  emoji: string
  accentColor: string
  status: SourceStatus
  onSync?: () => Promise<void>
  syncLabel?: string
  badgeText?: string
}

function formatDate(iso: string | null) {
  if (!iso) return 'Никогда'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Только что'
  if (diffMins < 60) return `${diffMins} мин. назад`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours} ч. назад`
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function SourceCard({ label, emoji, accentColor, status, onSync, syncLabel, badgeText }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [localStatus, setLocalStatus] = useState<SourceStatus>(status)

  async function handleSync() {
    if (!onSync || syncing) return
    setSyncing(true)
    setLocalStatus(s => ({ ...s, status: 'syncing' }))
    try {
      await onSync()
      setLocalStatus(s => ({ ...s, status: 'success', lastSync: new Date().toISOString() }))
    } catch {
      setLocalStatus(s => ({ ...s, status: 'error' }))
    } finally {
      setSyncing(false)
    }
  }

  const st = localStatus

  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-shadow">
      <div className={`absolute top-0 left-0 w-1 h-full ${accentColor}`} />
      <CardHeader className="pb-2 pl-5">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <span className="text-xl">{emoji}</span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pl-5 space-y-3">
        <div className="flex items-end gap-1">
          <span className="text-3xl font-bold tabular-nums leading-none">{st.count.toLocaleString('ru-RU')}</span>
          <span className="text-sm text-muted-foreground mb-0.5">документов</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {st.status === 'success' && <CheckCircle size={12} className="text-emerald-500 shrink-0" />}
          {st.status === 'error' && <XCircle size={12} className="text-destructive shrink-0" />}
          {st.status === 'never' && <Clock size={12} className="shrink-0" />}
          {st.status === 'syncing' && <RefreshCw size={12} className="animate-spin text-blue-500 shrink-0" />}
          <span>{formatDate(st.lastSync)}</span>
          {st.error && <span className="text-destructive truncate" title={st.error}>{st.error}</span>}
        </div>

        {badgeText ? (
          <Badge variant="secondary" className="text-xs">{badgeText}</Badge>
        ) : onSync ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs gap-1"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Синхронизация...' : (syncLabel ?? 'Синхронизировать')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
