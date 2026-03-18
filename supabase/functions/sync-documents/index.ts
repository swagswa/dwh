import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()
  const { text, filename, format, pageCount } = await req.json()

  if (!text || !filename) return errorResponse('text and filename required')

  const ext = filename.split('.').pop()?.toLowerCase() || ''

  // Telegram JSON detection
  if (format === 'json') {
    try {
      const parsed = JSON.parse(text)
      if (parsed.messages && Array.isArray(parsed.messages)) {
        const channelName = parsed.name || 'Unknown Channel'
        const toUpsert: any[] = []

        for (const msg of parsed.messages) {
          if (!msg.text || typeof msg.text !== 'string' || !msg.text.trim()) continue
          toUpsert.push({
            source: 'telegram',
            source_id: `${channelName}_${msg.id}`,
            title: `${channelName} #${msg.id}`,
            content: msg.text,
            metadata: { channel: channelName, message_id: msg.id, date: msg.date },
            updated_at: new Date().toISOString(),
          })
        }

        if (toUpsert.length) {
          await supabase.from('documents').upsert(toUpsert, { onConflict: 'source,source_id' })
        }

        await supabase.from('sync_runs').insert({
          source: 'telegram',
          status: 'completed',
          finished_at: new Date().toISOString(),
          items_synced: toUpsert.length,
        })

        return jsonResponse({ synced: toUpsert.length, format: 'telegram_json' })
      }
    } catch {
      // Not valid JSON or not Telegram — fall through to generic document
    }
  }

  // Generic document — all formats
  const sourceId = `${Date.now()}-${filename}`

  await supabase.from('documents').upsert({
    source: 'documents',
    source_id: sourceId,
    title: filename,
    content: text,
    metadata: { filename, format: format || ext, pageCount },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'source,source_id' })

  await supabase.from('sync_runs').insert({
    source: 'documents',
    status: 'completed',
    finished_at: new Date().toISOString(),
    items_synced: 1,
  })

  return jsonResponse({ synced: 1, format: format || ext })
})
