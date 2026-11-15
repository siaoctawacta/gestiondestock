import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from './nav'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/queries'

/** Logo MM Cosmétiques. `variant="light"` pour fonds sombres (sidebar). */
export function Logo({ compact, variant = 'light', className }: { compact?: boolean; variant?: 'light' | 'dark'; className?: string }) {
  const suffix = variant === 'light' ? '-white' : ''
  if (compact) return <img src={`/logo-mark${suffix}.png`} alt="MM Cosmétiques" className={cn('h-8 w-auto', className)} />
  return (
    <div className={cn('flex flex-col', className)}>
      <img src={`/logo${suffix}.png`} alt="MM Cosmétiques" className="h-9 w-auto self-start" />
      <span className={cn('mt-1 text-[9px] font-medium uppercase tracking-[0.28em]', variant === 'light' ? 'text-sage' : 'text-muted-foreground')}>
        Stock Pro · ERP
      </span>
    </div>
  )
}

export function SidebarNav({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const role = useAuth((s) => s.user?.role)
  const unread = (useNotifications().data ?? []).filter((n) => !n.read).length

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin">
      {NAV.map((group) => {
        const items = group.items.filter((i) => can(role, i.permission))
        if (!items.length) return null
        return (
          <div key={group.title}>
            {!compact && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted/70">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    title={compact ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                        compact && 'justify-center px-0',
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-sage" />}
                        <item.icon className={cn('size-[18px] shrink-0', isActive && 'text-sage')} />
                        {!compact && <span className="truncate">{item.label}</span>}
                        {item.to === '/notifications' && unread > 0 && (
                          <span
                            className={cn(
                              'ml-auto rounded-full bg-sage px-1.5 text-[10px] font-semibold text-brand tabular',
                              compact && 'absolute right-1.5 top-1 ml-0',
                            )}
                          >
                            {unread}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  const { collapsed, toggleCollapsed } = useUi()
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className={cn('flex h-[72px] items-center border-b border-white/10 px-5', collapsed && 'justify-center px-0')}>
        <Logo compact={collapsed} />
      </div>
      <SidebarNav compact={collapsed} />
      <button
        onClick={toggleCollapsed}
        className="m-3 flex items-center justify-center gap-2 rounded-lg py-2 text-xs text-sidebar-muted hover:bg-white/5 hover:text-white"
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        {!collapsed && 'Réduire'}
      </button>
    </aside>
  )
}
