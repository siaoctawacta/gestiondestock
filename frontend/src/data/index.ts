import type { DataApi } from './api'
import { demoApi } from './demoApi'
import { laravelApi } from './laravelApi'
import { supabaseApi } from './supabaseApi'

/** Backend Laravel (hébergement LWS) : VITE_API_URL renseignée. */
export const isLaravelConfigured = Boolean(import.meta.env.VITE_API_URL)
/** Backend Supabase : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY renseignées. */
export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const api: DataApi = isLaravelConfigured ? laravelApi : isSupabaseConfigured ? supabaseApi : demoApi
export { resetDemoData } from './demoApi'
