// Edge Function : vérifie les identifiants d'un superviseur pour autoriser
// une remise > 15 % au POS, sans remplacer la session du caissier.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const { email, password } = await req.json()
  const url = Deno.env.get('SUPABASE_URL')!
  const temp = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await temp.auth.signInWithPassword({ email, password })
  if (error || !data.user) return json({ error: 'Identifiants superviseur invalides' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile } = await admin.from('users').select('*').eq('id', data.user.id).single()
  await temp.auth.signOut()
  if (!profile?.is_active || !['super_admin', 'store_admin', 'store_manager'].includes(profile.role_id))
    return json({ error: 'Ce compte ne peut pas autoriser une remise' }, 403)
  return json({ profile })
})
