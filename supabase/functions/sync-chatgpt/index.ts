import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()
  const { conversations } = await req.json()

  if (!Array.isArray(conversations) || conversations.length === 0) {
    return errorResponse('conversations: non-empty array required')
  }
  if (conversations.length > 25) {
    return errorResponse('Max 25 conversations per batch')
  }

  const toUpsert: any[] = []

  for (const conv of conversations) {
    // ChatGPT full conversation API returns conversation_id, not id
    const convId = conv.conversation_id || conv.id
    if (!convId) continue

    const messages = Object.values(conv.mapping || {})
      .filter((n: any) => n.message?.content?.parts?.length)
      .map((n: any) => ({
        role: n.message.author.role,
        content: n.message.content.parts.join('\n'),
      }))

    const content = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n')

    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content))
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    toUpsert.push({
      source: 'chatgpt',
      source_id: convId,
      title: conv.title || 'Untitled',
      content,
      content_hash: contentHash,
      metadata: { chat_id: convId, message_count: messages.length, messages },
      updated_at: new Date().toISOString(),
    })
  }

  if (toUpsert.length) {
    const { error } = await supabase
      .from('documents')
      .upsert(toUpsert, { onConflict: 'source,source_id' })
    if (error) return errorResponse(error.message, 500)
  }

  // Log sync run
  await supabase.from('sync_runs').insert({
    source: 'chatgpt',
    status: 'completed',
    finished_at: new Date().toISOString(),
    items_synced: toUpsert.length,
    items_skipped: 0,
  })

  return jsonResponse({ synced: toUpsert.length })
})
