import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Sidebar'
import { ShieldCheck, Store, Zap } from 'lucide-react'

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-sage/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-sage/10 blur-3xl" />
        <Logo className="relative [&_img]:h-12" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Le stock, la caisse et la performance de vos boutiques beauté, réunis.
          </h2>
          <p className="mt-4 text-sm text-sidebar-muted">
            Suivi multi-sites en temps réel, encaissement rapide, contrôle quotidien des caisses et pilotage financier
            consolidé.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              [Zap, 'Encaissement en moins de 3 secondes'],
              [Store, 'Stocks synchronisés entre toutes les boutiques'],
              [ShieldCheck, 'Données isolées par boutique (Row Level Security)'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Zap
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-sage">
                    <I className="size-4" />
                  </span>
                  {text as string}
                </li>
              )
            })}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-sidebar-muted/60">© {new Date().getFullYear()} MM Cosmétiques — Tous droits réservés</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo variant="dark" />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
