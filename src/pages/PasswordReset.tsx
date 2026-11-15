import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { AuthShell } from './AuthShell'
import { api } from '@/data'
import { errorMessage } from '@/lib/utils'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  return (
    <AuthShell>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Retour à la connexion
      </Link>
      {sent ? (
        <div>
          <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <MailCheck className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Vérifiez vos emails</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Si un compte est associé à <b>{email}</b>, un lien de réinitialisation valable 1 heure vient d’être envoyé.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recevez un lien sécurisé pour définir un nouveau mot de passe.</p>
          <form
            className="mt-8 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setLoading(true)
              try {
                await api.requestPasswordReset(email)
                setSent(true)
              } catch (err) {
                toast.error(errorMessage(err))
              } finally {
                setLoading(false)
              }
            }}
          >
            <Field label="Adresse email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@mmcg.ci" />
            </Field>
            <Button className="w-full" size="lg" loading={loading}>
              Envoyer le lien
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const error = pw && pw.length < 8 ? '8 caractères minimum' : confirm && confirm !== pw ? 'Les mots de passe ne correspondent pas' : undefined
  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choisissez un mot de passe robuste d’au moins 8 caractères.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (error || !pw) return
          setLoading(true)
          try {
            await api.updatePassword(pw)
            toast.success('Mot de passe mis à jour')
            navigate('/')
          } catch (err) {
            toast.error(errorMessage(err))
          } finally {
            setLoading(false)
          }
        }}
      >
        <Field label="Nouveau mot de passe">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirmation" error={error}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button className="w-full" size="lg" loading={loading} disabled={!!error || !pw}>
          Mettre à jour
        </Button>
      </form>
    </AuthShell>
  )
}
