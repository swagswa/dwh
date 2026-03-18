import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()

  // All documents in one query, group in JS
  const { data: docs } = await supabase.from('documents').select('source').eq('user_id', auth.user!.id)
  const counts: Record<string, number> = {}
  for (const doc of docs || []) {
    counts[doc.source] = (counts[doc.source] || 0) + 1
  }

  // Last sync run per source
  const { data: runs } = await supabase
    .from('sync_runs')
    .select('*')
    .eq('user_id', auth.user!.id)
    .order('started_at', { ascending: false })

  const allSources = ['chatgpt', 'gmail', 'telegram', 'sites', 'documents']
  const stats: Record<string, { count: number; lastSync: unknown }> = {}
  for (const source of allSources) {
    stats[source] = {
      count: counts[source] || 0,
      lastSync: runs?.find((r: any) => r.source === source) ?? null,
    }
  }

  return jsonResponse(stats)
})
