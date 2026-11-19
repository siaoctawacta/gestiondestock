import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout, RequirePermission } from '@/components/layout/AppLayout'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import type { Permission } from '@/lib/permissions'
import LoginPage from '@/pages/Login'
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/PasswordReset'
import { ForbiddenPage, NotFoundPage } from '@/pages/Errors'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Pos = lazy(() => import('@/pages/Pos'))
const Sales = lazy(() => import('@/pages/Sales'))
const Products = lazy(() => import('@/pages/Products'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const Transfers = lazy(() => import('@/pages/Transfers'))
const Movements = lazy(() => import('@/pages/Movements'))
const DailyReports = lazy(() => import('@/pages/DailyReports'))
const Reports = lazy(() => import('@/pages/Reports'))
const Stores = lazy(() => import('@/pages/Stores'))
const Users = lazy(() => import('@/pages/Users'))
const CatalogSettings = lazy(() => import('@/pages/CatalogSettings'))
const Audit = lazy(() => import('@/pages/Audit'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Settings = lazy(() => import('@/pages/Settings'))

const guarded: [string, Permission, React.ComponentType][] = [
  ['/pos', 'pos', Pos],
  ['/sales', 'sales.view', Sales],
  ['/products', 'products.view', Products],
  ['/inventory', 'inventory.view', Inventory],
  ['/transfers', 'transfers.view', Transfers],
  ['/movements', 'inventory.view', Movements],
  ['/daily-reports', 'reports.daily.view', DailyReports],
  ['/reports', 'analytics', Reports],
  ['/stores', 'stores.view', Stores],
  ['/users', 'users.manage', Users],
  ['/catalog-settings', 'catalog.settings', CatalogSettings],
  ['/audit', 'audit', Audit],
]

function Splash() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <span className="size-6 animate-spin rounded-full border-2 border-primary border-r-transparent" />
    </div>
  )
}

export default function App() {
  const { ready, init } = useAuth()
  const theme = useUi((s) => s.theme)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (!ready)
    return (
      <div className="grid min-h-screen place-items-center">
        <Splash />
      </div>
    )

  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          {guarded.map(([path, perm, C]) => (
            <Route
              key={path}
              path={path}
              element={
                <RequirePermission permission={perm}>
                  <C />
                </RequirePermission>
              }
            />
          ))}
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
