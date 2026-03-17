import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const cursor = body.cursor || null

  // 1. Get credentials
  const { data: cred } = await supabase
    .from('credentials').select('*').eq('id', 'gmail').single()

  if (!cred?.access_token) return errorResponse('Gmail not connected', 400)

  // 2. Refresh token if expired
  let accessToken = cred.access_token
  if (cred.expires_at && new Date(cred.expires_at) < new Date()) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: cred.refresh_token,
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        grant_type: 'refresh_token',
      }),
    })
    const refreshData = await refreshRes.json()
    if (refreshData.error) return errorResponse(`Token refresh failed: ${refreshData.error}`)

    accessToken = refreshData.access_token
    await supabase.from('credentials').update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
    }).eq('id', 'gmail')
  }

  const gmailHeaders = { Authorization: `Bearer ${accessToken}` }

  // 3. Fetch one page of messages
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('maxResults', '50')
  if (cursor) listUrl.searchParams.set('pageToken', cursor)

  const listRes = await fetch(listUrl.toString(), { headers: gmailHeaders })
  const listData = await listRes.json()

  if (listData.error) return errorResponse(`Gmail API error: ${listData.error.message}`, 500)

  const messages = listData.messages || []
  const nextPageToken = listData.nextPageToken || null

  // 4. Batch load existing hashes for this page
  const messageIds = messages.map((m: any) => m.id)
  const { data: existing } = await supabase
    .from('documents')
    .select('source_id, content_hash')
    .eq('source', 'gmail')
    .in('source_id', messageIds)
  const hashMap = new Map(existing?.map((d: any) => [d.source_id, d.content_hash]) ?? [])

  // 5. Fetch full messages and parse
  let synced = 0
  let skipped = 0
  const toUpsert: any[] = []

  for (const msg of messages) {
    try {
      const fullRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: gmailHeaders }
      )
      const full = await fullRes.json()

      const headers = full.payload?.headers || []
      const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || ''

      const subject = getHeader('Subject')
      const from = getHeader('From')
      const to = getHeader('To')
      const date = getHeader('Date')

      // Extract body text (recursive through MIME parts)
      function extractText(part: any): string {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
        }
        if (part.parts) return part.parts.map(extractText).join('\n')
        return ''
      }
      const bodyText = extractText(full.payload || {})

      const content = `From: ${from}\nTo: ${to}\nSubject: ${subject}\nDate: ${date}\n\n${bodyText}`

      // SHA-256 hash for change detection (Web Crypto API does not support MD5)
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content))
      const contentHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      if (hashMap.get(msg.id) === contentHash) {
        skipped++
        continue
      }

      toUpsert.push({
        source: 'gmail',
        source_id: msg.id,
        title: subject || '(no subject)',
        content,
        content_hash: contentHash,
        metadata: { from, to, subject, labels: full.labelIds, thread_id: full.threadId },
        updated_at: new Date().toISOString(),
      })
      synced++
    } catch (e) {
      console.error(`Failed to process message ${msg.id}:`, e)
    }
  }

  // 6. Batch upsert
  if (toUpsert.length) {
    const { error } = await supabase
      .from('documents')
      .upsert(toUpsert, { onConflict: 'source,source_id' })
    if (error) return errorResponse(error.message, 500)
  }

  // 7. Log sync run
  await supabase.from('sync_runs').insert({
    source: 'gmail',
    status: nextPageToken ? 'running' : 'completed',
    finished_at: nextPageToken ? null : new Date().toISOString(),
    items_synced: synced,
    items_skipped: skipped,
    cursor: nextPageToken,
  })

  return jsonResponse({
    synced,
    skipped,
    cursor: nextPageToken,
    done: !nextPageToken,
  })
})
