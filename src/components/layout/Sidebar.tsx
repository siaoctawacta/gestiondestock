import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from './nav'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/queries'

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-white shadow-sm">
        <svg viewBox="0 0 32 32" className="size-5" fill="none">
          <path d="M7 23V9l4.5 7L16 9l4.5 7L25 9v14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">MMCG Stock Pro</p>
          <p className="text-[10px] uppercase tracking-[0.14em] opacity-60">Cosmétique ERP</p>
        </div>
      )}
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
                        {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" />}
                        <item.icon className={cn('size-[18px] shrink-0', isActive && 'text-rose-300')} />
                        {!compact && <span className="truncate">{item.label}</span>}
                        {item.to === '/notifications' && unread > 0 && (
                          <span
                            className={cn(
                              'ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white tabular',
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
      <div className={cn('flex h-16 items-center border-b border-white/5 px-5', collapsed && 'justify-center px-0')}>
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
