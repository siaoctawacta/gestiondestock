import { useNavigate } from 'react-router-dom'
import * as D from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  LogOut,
  Maximize,
  Menu,
  Minimize,
  Moon,
  PackageX,
  Settings,
  Store as StoreIcon,
  Sun,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown'
import { Avatar } from '@/components/common/Avatar'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { ROLE_LABELS, storeScope } from '@/lib/permissions'
import { useAction, useNotifications, useStores } from '@/hooks/queries'
import { api } from '@/data'
import { cn, timeAgo } from '@/lib/utils'
import { Logo, SidebarNav } from './Sidebar'
import type { AppNotification } from '@/types'

export function NotificationIcon({ n }: { n: Pick<AppNotification, 'type' | 'severity'> }) {
  const cls =
    n.severity === 'critical'
      ? 'bg-red-500/10 text-red-600'
      : n.severity === 'warning'
        ? 'bg-amber-500/10 text-amber-600'
        : 'bg-sky-500/10 text-sky-600'
  const Icon = n.type === 'out_of_stock' ? PackageX : n.severity === 'info' ? Bell : AlertTriangle
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', cls)}>
      <Icon className="size-4" />
    </span>
  )
}

function StoreSwitcher() {
  const user = useAuth((s) => s.user)
  const { activeStoreId, setActiveStore } = useAuth()
  const stores = useStores().data ?? []
  const scope = storeScope(user)
  const options = stores.filter((s) => s.is_active && (scope === null || scope.includes(s.id)))
  if (options.length <= 1) {
    const s = options[0]
    return s ? (
      <span className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium md:inline-flex">
        <StoreIcon className="size-3.5 text-muted-foreground" />
        {s.name}
      </span>
    ) : null
  }
  return (
    <div className="relative hidden md:block">
      <StoreIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Select
        value={activeStoreId ?? ''}
        onChange={(e) => setActiveStore(e.target.value || null)}
        className="h-9 w-56 pl-8 text-xs font-medium"
        aria-label="Boutique active"
      >
        {scope === null && <option value="">Toutes les boutiques</option>}
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

function NotificationsMenu() {
  const navigate = useNavigate()
  const list = useNotifications().data ?? []
  const unread = list.filter((n) => !n.read)
  const markAll = useAction(() => api.markAllNotificationsRead(), { tables: ['notifications'] })
  const markOne = useAction((id: string) => api.markNotificationRead(id), { tables: ['notifications'] })

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {unread.length > 0 && (
            <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </DropdownTrigger>
      <DropdownContent className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length > 0 && (
            <button onClick={() => markAll.mutate(undefined)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <CheckCheck className="size-3.5" /> Tout marquer lu
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {list.slice(0, 8).map((n) => (
            <DropdownItem
              key={n.id}
              className="items-start rounded-none border-b px-4 py-3 last:border-0"
              onSelect={() => {
                if (!n.read) markOne.mutate(n.id)
                navigate(n.type === 'daily_report' || n.type === 'cash_variance' || n.type === 'report_status' ? '/daily-reports' : n.type === 'transfer' ? '/transfers' : '/inventory')
              }}
            >
              <NotificationIcon n={n} />
              <div className="min-w-0 flex-1">
                <p className={cn('text-[13px]', !n.read && 'font-semibold')}>{n.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
            </DropdownItem>
          ))}
          {!list.length && <p className="p-6 text-center text-xs text-muted-foreground">Aucune notification</p>}
        </div>
        <button onClick={() => navigate('/notifications')} className="w-full border-t py-2.5 text-xs font-medium text-primary hover:bg-muted">
          Voir toutes les notifications
        </button>
      </DropdownContent>
    </Dropdown>
  )
}

export function Topbar() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme, mobileOpen, setMobileOpen } = useUi()
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  if (!user) return null
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Trigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
            <Menu />
          </Button>
        </D.Trigger>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Menu principal</D.Description>
            <div className="flex h-16 items-center justify-between border-b border-white/5 px-5">
              <Logo />
              <D.Close className="rounded-md p-1 text-sidebar-muted hover:text-white">
                <X className="size-5" />
              </D.Close>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <StoreSwitcher />

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Thème">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label="Plein écran"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>
        <NotificationsMenu />
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="ml-1 flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 text-left hover:bg-muted">
              <Avatar first={user.first_name} last={user.last_name} />
              <div className="hidden leading-tight sm:block">
                <p className="text-[13px] font-semibold">
                  {user.first_name} {user.last_name}
                </p>
                <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </div>
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>{user.email}</DropdownLabel>
            <DropdownSeparator />
            <DropdownItem onSelect={() => navigate('/settings')}>
              <Settings /> Paramètres du compte
            </DropdownItem>
            <DropdownItem
              className="text-destructive focus:text-destructive [&_svg]:text-destructive"
              onSelect={async () => {
                await signOut()
                navigate('/login')
              }}
            >
              <LogOut /> Se déconnecter
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </header>
  )
}
