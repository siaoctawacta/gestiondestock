import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/lib/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission: Permission
}

export const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'dashboard' },
      { to: '/reports', label: 'Rapports & exports', icon: BarChart3, permission: 'analytics' },
    ],
  },
  {
    title: 'Ventes',
    items: [
      { to: '/pos', label: 'Caisse POS', icon: ShoppingCart, permission: 'pos' },
      { to: '/sales', label: 'Historique ventes', icon: Receipt, permission: 'sales.view' },
      { to: '/daily-reports', label: 'Déclarations', icon: ClipboardCheck, permission: 'reports.daily.view' },
    ],
  },
  {
    title: 'Stock',
    items: [
      { to: '/products', label: 'Catalogue', icon: Package, permission: 'products.view' },
      { to: '/inventory', label: 'Stocks', icon: Boxes, permission: 'inventory.view' },
      { to: '/transfers', label: 'Transferts', icon: ArrowLeftRight, permission: 'transfers.view' },
      { to: '/movements', label: 'Mouvements', icon: History, permission: 'inventory.view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/stores', label: 'Boutiques', icon: Store, permission: 'stores.view' },
      { to: '/users', label: 'Utilisateurs', icon: Users, permission: 'users.manage' },
      { to: '/catalog-settings', label: 'Catégories & fournisseurs', icon: Tags, permission: 'catalog.settings' },
      { to: '/audit', label: 'Journal d’audit', icon: ScrollText, permission: 'audit' },
    ],
  },
  {
    title: 'Compte',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell, permission: 'dashboard' },
      { to: '/settings', label: 'Paramètres', icon: Settings, permission: 'dashboard' },
    ],
  },
]
