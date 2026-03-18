import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'
import * as cheerio from 'npm:cheerio@1'
import TurndownService from 'npm:turndown@7'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()
  const body = await req.json().catch(() => ({}))

  // Get URLs from request body or from credentials table
  let urls: string[] = body.urls || []
  if (urls.length === 0) {
    const { data: cred } = await supabase
      .from('credentials').select('metadata').eq('id', 'sites').single()
    urls = (cred?.metadata as any)?.urls || []
  }

  if (urls.length === 0) return errorResponse('No URLs configured')

  // Load existing hashes
  const { data: existing } = await supabase
    .from('documents')
    .select('source_id, content_hash')
    .eq('source', 'sites')
  const hashMap = new Map(existing?.map((d: any) => [d.source_id, d.content_hash]) ?? [])

  const turndown = new TurndownService()
  let synced = 0
  let skipped = 0

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DWH-Bot/1.0' },
      })
      if (!res.ok) {
        console.error(`Failed to fetch ${url}: ${res.status}`)
        continue
      }

      const html = await res.text()
      const $ = cheerio.load(html)

      // Remove scripts, styles, nav, footer
      $('script, style, nav, footer, header, aside, iframe, noscript').remove()

      // Extract title
      const title = $('title').text().trim() || $('h1').first().text().trim() || url

      // Extract main content (prefer article/main, fallback to body)
      const contentHtml = $('article').html() || $('main').html() || $('body').html() || ''

      // Convert to Markdown
      const content = turndown.turndown(contentHtml).trim()

      if (!content) {
        console.error(`No content extracted from ${url}`)
        continue
      }

      // Hash check
      const encoder = new TextEncoder()
      const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(content))
      const contentHash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      if (hashMap.get(url) === contentHash) {
        skipped++
        continue
      }

      await supabase.from('documents').upsert({
        source: 'sites',
        source_id: url,
        title,
        content,
        content_hash: contentHash,
        metadata: { url, page_title: title },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source,source_id' })

      synced++
    } catch (e) {
      console.error(`Error processing ${url}:`, e)
    }
  }

  // Log sync run
  await supabase.from('sync_runs').insert({
    source: 'sites',
    status: 'completed',
    finished_at: new Date().toISOString(),
    items_synced: synced,
    items_skipped: skipped,
  })

  return jsonResponse({ synced, skipped, total: urls.length })
})
