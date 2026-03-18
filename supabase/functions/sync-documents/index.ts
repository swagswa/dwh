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

  // Telegram JSON detection — store as single conversation
  if (format === 'json') {
    try {
      const parsed = JSON.parse(text)
      if (parsed.messages && Array.isArray(parsed.messages)) {
        const channelName = parsed.name || 'Unknown Channel'

        // Extract plain text from Telegram's text field (can be string or array of mixed strings/objects)
        const extractText = (text: unknown): string => {
          if (typeof text === 'string') return text
          if (Array.isArray(text)) {
            return text.map((part: unknown) => {
              if (typeof part === 'string') return part
              if (part && typeof part === 'object' && 'text' in (part as Record<string, unknown>))
                return (part as Record<string, string>).text
              return ''
            }).join('')
          }
          return ''
        }

        // Collect all messages (text, service, forwarded, etc.)
        const messages: { id: number; date: string; from: string; text: string }[] = []
        const contentParts: string[] = []

        for (const msg of parsed.messages) {
          const text = extractText(msg.text)
          if (!text.trim()) continue
          messages.push({
            id: msg.id,
            date: msg.date || '',
            from: msg.from || msg.actor || 'Unknown',
            text,
          })
          contentParts.push(text)
        }

        // Store as one document with all messages in metadata
        const content = contentParts.join('\n\n')

        await supabase.from('documents').upsert({
          user_id: auth.user!.id,
          source: 'telegram',
          source_id: channelName,
          title: channelName,
          content,
          metadata: { channel: channelName, message_count: messages.length, messages },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,source,source_id' })

        await supabase.from('sync_runs').insert({
          user_id: auth.user!.id,
          source: 'telegram',
          status: 'completed',
          finished_at: new Date().toISOString(),
          items_synced: 1,
        })

        return jsonResponse({ synced: 1, messages: messages.length, format: 'telegram_json' })
      }
    } catch {
      // Not valid JSON or not Telegram — fall through to generic document
    }
  }

  // Generic document — all formats
  const sourceId = `${Date.now()}-${filename}`

  await supabase.from('documents').upsert({
    user_id: auth.user!.id,
    source: 'documents',
    source_id: sourceId,
    title: filename,
    content: text,
    metadata: { filename, format: format || ext, pageCount },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,source,source_id' })

  await supabase.from('sync_runs').insert({
    user_id: auth.user!.id,
    source: 'documents',
    status: 'completed',
    finished_at: new Date().toISOString(),
    items_synced: 1,
  })

  return jsonResponse({ synced: 1, format: format || ext })
})
