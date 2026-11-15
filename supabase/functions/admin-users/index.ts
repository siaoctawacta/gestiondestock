// Edge Function : création / mise à jour de comptes par un administrateur.
// La création d'un compte Auth exige la clé service_role, qui ne doit
// jamais être exposée au navigateur : d'où cette fonction serveur.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_ASSIGNABLE = ['store_manager', 'cashier', 'stock_manager']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: auth } = await caller.auth.getUser()
    if (!auth.user) return json({ error: 'Non authentifié' }, 401)
    const { data: me } = await admin.from('users').select('*').eq('id', auth.user.id).single()
    if (!me?.is_active || !['super_admin', 'store_admin'].includes(me.role_id))
      return json({ error: 'Action non autorisée' }, 403)

    const body = await req.json()
    const { id, email, password, first_name, last_name, phone, role, store_id, store_ids, is_active } = body

    if (me.role_id === 'store_admin') {
      const { data: scope } = await admin.from('user_stores').select('store_id').eq('user_id', me.id)
      const allowed = new Set([me.store_id, ...(scope ?? []).map((s: { store_id: string }) => s.store_id)])
      if (role && !ADMIN_ASSIGNABLE.includes(role)) return json({ error: 'Rôle non attribuable' }, 403)
      if (store_id && !allowed.has(store_id)) return json({ error: 'Boutique hors périmètre' }, 403)
    }

    let userId = id as string | undefined
    if (!userId) {
      if (!password || password.length < 8) return json({ error: 'Mot de passe initial : 8 caractères minimum' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name, last_name, phone, role, store_id },
      })
      if (error) return json({ error: error.message }, 400)
      userId = data.user.id
    } else {
      const patch: Record<string, unknown> = {}
      if (email) patch.email = email
      if (password) patch.password = password
      if (Object.keys(patch).length) {
        const { error } = await admin.auth.admin.updateUserById(userId, patch)
        if (error) return json({ error: error.message }, 400)
      }
    }

    const profile: Record<string, unknown> = { id: userId }
    if (email !== undefined) profile.email = email
    if (first_name !== undefined) profile.first_name = first_name
    if (last_name !== undefined) profile.last_name = last_name
    if (phone !== undefined) profile.phone = phone
    if (role !== undefined) profile.role_id = role
    if (store_id !== undefined) profile.store_id = store_id
    if (is_active !== undefined) profile.is_active = is_active
    const { error: upErr } = await admin.from('users').upsert(profile)
    if (upErr) return json({ error: upErr.message }, 400)

    if (Array.isArray(store_ids) && me.role_id === 'super_admin') {
      await admin.from('user_stores').delete().eq('user_id', userId)
      if (store_ids.length)
        await admin.from('user_stores').insert(store_ids.map((s: string) => ({ user_id: userId, store_id: s })))
    }
    if (is_active === false) await admin.auth.admin.signOut(userId).catch(() => null)

    await admin.from('audit_logs').insert({
      user_id: me.id,
      action: id ? 'UPDATE' : 'INSERT',
      entity: 'users',
      entity_id: userId,
      details: `${id ? 'Modification' : 'Création'} du compte ${email ?? ''}`,
    })
    return json({ id: userId })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
