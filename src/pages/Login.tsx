import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { AuthShell } from './AuthShell'
import { useAuth } from '@/store/auth'
import { api } from '@/data'
import { DEMO_PASSWORD } from '@/data/seed'
import { ROLE_LABELS } from '@/lib/permissions'
import { errorMessage } from '@/lib/utils'
import type { Role } from '@/types'

const DEMO_ACCOUNTS: [Role, string][] = [
  ['super_admin', 'admin@mmcg.ci'],
  ['store_admin', 'admin.sud@mmcg.ci'],
  ['store_manager', 'resp.plateau@mmcg.ci'],
  ['pole_chief', 'pole.nord@mmcg.ci'],
  ['cashier', 'caisse.plateau@mmcg.ci'],
  ['stock_manager', 'stock@mmcg.ci'],
]

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault()
    const c = creds ?? { email, password }
    if (!/^\S+@\S+\.\S+$/.test(c.email)) return setError('Adresse email invalide.')
    if (!c.password) return setError('Mot de passe requis.')
    setError(null)
    setLoading(true)
    try {
      const u = await signIn(c.email, c.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : u.role === 'cashier' ? '/pos' : '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
      <p className="mt-1 text-sm text-muted-foreground">Accédez à votre espace MM Cosmétiques Stock Pro.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Field label="Adresse email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@mmcg.ci" autoFocus />
        </Field>
        <Field label="Mot de passe">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? 'Masquer' : 'Afficher'}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          <LogIn /> Se connecter
        </Button>
      </form>

      {api.mode === 'demo' && (
        <div className="mt-8 rounded-xl border border-dashed p-4">
          <p className="text-xs font-semibold">Mode démo — connexion rapide</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Mot de passe commun : <code className="font-mono">{DEMO_PASSWORD}</code>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {DEMO_ACCOUNTS.map(([role, mail]) => (
              <button
                key={role}
                type="button"
                disabled={loading}
                onClick={() => {
                  setEmail(mail)
                  setPassword(DEMO_PASSWORD)
                  void submit(undefined, { email: mail, password: DEMO_PASSWORD })
                }}
                className="rounded-lg border bg-card px-2.5 py-2 text-left text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-accent"
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  )
}
