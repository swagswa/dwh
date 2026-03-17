import { getAnonClient } from './supabase.ts'

export async function verifyAuth(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: 'Missing authorization' }
  }
  const token = authHeader.slice(7)
  const supabase = getAnonClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { user: null, error: 'Invalid token' }
  }
  return { user, error: null }
}
