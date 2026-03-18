import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  if (req.method === 'GET') {
    // Return OAuth URL
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
    })
    return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
  }

  if (req.method === 'POST') {
    const { code } = await req.json()
    if (!code) return errorResponse('code required')

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()
    if (tokens.error) {
      return errorResponse(`Google OAuth error: ${tokens.error_description || tokens.error}`)
    }

    const supabase = getServiceClient()
    const { error } = await supabase.from('credentials').upsert({
      id: 'gmail',
      user_id: auth.user!.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      metadata: { scope: tokens.scope, token_type: tokens.token_type },
    }, { onConflict: 'user_id,id' })

    if (error) return errorResponse(error.message, 500)

    return jsonResponse({ success: true })
  }

  return errorResponse('Method not allowed', 405)
})
