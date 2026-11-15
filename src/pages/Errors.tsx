import { Link } from 'react-router-dom'
import { ShieldX, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

function ErrorView({ icon: Icon, code, title, text }: { icon: typeof ShieldX; code: string; title: string; text: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-6" />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{code}</p>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{text}</p>
        <Button asChild className="mt-6">
          <Link to="/">Retour au tableau de bord</Link>
        </Button>
      </div>
    </div>
  )
}

export const ForbiddenPage = () => (
  <ErrorView icon={ShieldX} code="403" title="Accès refusé" text="Votre rôle ne permet pas d’accéder à cette page. Contactez votre administrateur si nécessaire." />
)
export const NotFoundPage = () => (
  <ErrorView icon={Compass} code="404" title="Page introuvable" text="La page demandée n’existe pas ou a été déplacée." />
)
