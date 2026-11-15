import type { DataApi } from './api'
import { demoApi } from './demoApi'
import { supabaseApi } from './supabaseApi'

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const api: DataApi = isSupabaseConfigured ? supabaseApi : demoApi
export { resetDemoData } from './demoApi'
