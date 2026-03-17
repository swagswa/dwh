import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()
  const { file_path, filename } = await req.json()

  if (!file_path || !filename) return errorResponse('file_path and filename required')

  // Download from Supabase Storage
  const { data: fileData, error: dlError } = await supabase.storage
    .from('documents')
    .download(file_path)

  if (dlError || !fileData) return errorResponse(`Download failed: ${dlError?.message || 'unknown'}`)

  const ext = filename.split('.').pop()?.toLowerCase() || ''
  let synced = 0

  if (ext === 'json') {
    // Try Telegram export format
    try {
      const text = await fileData.text()
      const parsed = JSON.parse(text)

      if (parsed.messages && Array.isArray(parsed.messages)) {
        // Telegram export
        const channelName = parsed.name || 'Unknown Channel'
        const toUpsert: any[] = []

        for (const msg of parsed.messages) {
          if (!msg.text || typeof msg.text !== 'string' || !msg.text.trim()) continue

          toUpsert.push({
            source: 'telegram',
            source_id: `${channelName}_${msg.id}`,
            title: `${channelName} #${msg.id}`,
            content: msg.text,
            content_hash: null,
            metadata: { channel: channelName, message_id: msg.id, date: msg.date },
            updated_at: new Date().toISOString(),
          })
        }

        if (toUpsert.length) {
          await supabase.from('documents').upsert(toUpsert, { onConflict: 'source,source_id' })
          synced = toUpsert.length
        }

        await supabase.from('sync_runs').insert({
          source: 'telegram',
          status: 'completed',
          finished_at: new Date().toISOString(),
          items_synced: synced,
        })

        return jsonResponse({ synced, format: 'telegram_json' })
      }

      // Generic JSON — store as single document
      await supabase.from('documents').upsert({
        source: 'documents',
        source_id: file_path,
        title: filename,
        content: text,
        metadata: { filename, format: 'json', file_path },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source,source_id' })

      await supabase.from('sync_runs').insert({
        source: 'documents',
        status: 'completed',
        finished_at: new Date().toISOString(),
        items_synced: 1,
      })

      return jsonResponse({ synced: 1, format: 'json' })
    } catch (e) {
      return errorResponse(`JSON parse error: ${(e as Error).message}`)
    }
  }

  if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    const text = await fileData.text()

    await supabase.from('documents').upsert({
      source: 'documents',
      source_id: file_path,
      title: filename,
      content: text,
      metadata: { filename, format: ext, file_path },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source,source_id' })

    await supabase.from('sync_runs').insert({
      source: 'documents',
      status: 'completed',
      finished_at: new Date().toISOString(),
      items_synced: 1,
    })

    return jsonResponse({ synced: 1, format: ext })
  }

  // Binary formats (PDF, DOCX, XLSX) — store reference, full parsing in Stage 2
  await supabase.from('documents').upsert({
    source: 'documents',
    source_id: file_path,
    title: filename,
    content: `[Uploaded file: ${filename}] — content parsing available in Stage 2`,
    metadata: { filename, format: ext, file_path, needs_parsing: true },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'source,source_id' })

  await supabase.from('sync_runs').insert({
    source: 'documents',
    status: 'completed',
    finished_at: new Date().toISOString(),
    items_synced: 1,
  })

  return jsonResponse({ synced: 1, format: ext, note: 'Binary file stored, full parsing in Stage 2' })
})
