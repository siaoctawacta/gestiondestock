import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { can, type Permission } from '@/lib/permissions'
import { api } from '@/data'
import { TABLE_KEYS } from '@/hooks/queries'
import { cn } from '@/lib/utils'
import { FlaskConical } from 'lucide-react'

function useRealtimeSync() {
  const qc = useQueryClient()
  useEffect(
    () =>
      api.subscribe((table) => {
        if (table === '*') return void qc.invalidateQueries()
        ;(TABLE_KEYS[table] ?? []).forEach((k) => qc.invalidateQueries({ queryKey: k }))
      }),
    [qc],
  )
}

export function AppLayout() {
  const user = useAuth((s) => s.user)
  const collapsed = useUi((s) => s.collapsed)
  const location = useLocation()
  useRealtimeSync()

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <div className="min-h-screen" style={{ ['--banner-h' as string]: api.mode === 'demo' ? '29px' : '0px' }}>
      <Sidebar />
      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <Topbar />
        {api.mode === 'demo' && (
          <div className="flex h-[29px] items-center justify-center gap-2 truncate border-b bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <FlaskConical className="size-3.5" />
            <span className="sm:hidden">Mode démo — données locales</span>
            <span className="hidden sm:inline">
              Mode démo — données locales simulées. Renseignez <code className="font-mono">VITE_API_URL</code> dans <code className="font-mono">.env</code> pour la production.
            </span>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Route Guard : contrôle d'accès par rôle. */
export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const role = useAuth((s) => s.user?.role)
  if (!can(role, permission)) return <Navigate to="/forbidden" replace />
  return <>{children}</>
}
