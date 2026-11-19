// Edge Function : création / mise à jour de comptes par un administrateur.
// La création d'un compte Auth exige la clé service_role, qui ne doit
// jamais être exposée au navigateur : d'où cette fonction serveur.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    // Seul le Super Admin crée, modifie, supprime des comptes et attribue les rôles.
    if (!me?.is_active || me.deleted_at || me.role_id !== 'super_admin') return json({ error: 'Action réservée au Super Admin' }, 403)

    const body = await req.json()
    const { id, email, password, first_name, last_name, phone, role, store_id, store_ids, is_active } = body

    const { data: target } = id ? await admin.from('users').select('*').eq('id', id).maybeSingle() : { data: null }
    if (id && (!target || target.deleted_at)) return json({ error: 'Utilisateur introuvable ou supprimé' }, 404)
    const otherSuperAdmins = async () => {
      const { count } = await admin.from('users').select('id', { count: 'exact', head: true })
        .eq('role_id', 'super_admin').eq('is_active', true).is('deleted_at', null).neq('id', id)
      return count ?? 0
    }
    if (id && target.role_id === 'super_admin' && (body.delete || is_active === false || (role && role !== 'super_admin'))) {
      if ((await otherSuperAdmins()) === 0) return json({ error: 'Impossible de retirer le dernier Super Admin' }, 400)
    }
    if (id && id === me.id && (body.delete || is_active === false)) return json({ error: 'Action impossible sur votre propre compte' }, 400)

    // Suppression logique : historique conservé, connexion bloquée, email libéré.
    if (body.delete) {
      const freed = `supprime-${String(id).slice(-8)}@supprime.local`
      const { error: authErr } = await admin.auth.admin.updateUserById(id, { email: freed, ban_duration: '876000h' })
      if (authErr) return json({ error: authErr.message }, 400)
      await admin.auth.admin.signOut(id).catch(() => null)
      await admin.from('users').update({ is_active: false, deleted_at: new Date().toISOString(), email: freed }).eq('id', id)
      await admin.from('user_stores').delete().eq('user_id', id)
      await admin.from('stores').update({ manager_id: null }).eq('manager_id', id)
      await admin.from('audit_logs').insert({ user_id: me.id, action: 'DELETE', entity: 'users', entity_id: id, details: `Suppression du compte ${target.email} (historique conservé)` })
      return json({ id })
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

    if (Array.isArray(store_ids)) {
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
