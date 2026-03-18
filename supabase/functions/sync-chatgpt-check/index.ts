import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()
  const { items } = await req.json()

  if (!Array.isArray(items)) return errorResponse('items array required')

  // Load existing documents' source_id + updated_at
  const { data: existing } = await supabase
    .from('documents')
    .select('source_id, updated_at')
    .eq('source', 'chatgpt')
    .eq('user_id', auth.user!.id)

  const existingMap = new Map(
    existing?.map((d: any) => [d.source_id, new Date(d.updated_at).getTime() / 1000]) ?? []
  )

  // Need sync if not exists or update_time is newer
  const needed_ids = items
    .filter((item: any) => {
      const stored = existingMap.get(item.id)
      return !stored || item.update_time > stored
    })
    .map((item: any) => item.id)

  return jsonResponse({ needed_ids, total: items.length, needed: needed_ids.length })
})
