import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Banknote,
  Barcode,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ProductThumb } from '@/components/common/ProductThumb'
import { EmptyState } from '@/components/common/EmptyState'
import { useCart } from '@/store/cart'
import { useAuth } from '@/store/auth'
import { useAction, useCategories, useInventory, useLookups, useProducts, useStores } from '@/hooks/queries'
import { api } from '@/data'
import { computeSaleTotals, discountFromInput, discountPercent } from '@/data/logic'
import { can, DISCOUNT_SUPERVISOR_THRESHOLD, storeScope } from '@/lib/permissions'
import { cn, formatMoney, formatPct } from '@/lib/utils'
import { generateReceiptPdf } from '@/lib/receipt'
import type { MobileProvider, Payment, PaymentMethod, Profile, Sale } from '@/types'

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function Pos() {
  const user = useAuth((s) => s.user)!
  const { activeStoreId, setActiveStore } = useAuth()
  const stores = useStores().data ?? []
  const scope = storeScope(user)
  const posStores = stores.filter((s) => s.is_active && (scope === null || scope.includes(s.id)))
  const storeId = activeStoreId ?? null

  if (!storeId) {
    return (
      <Card className="mx-auto max-w-md p-6">
        <h2 className="text-base font-semibold">Choisir une boutique</h2>
        <p className="mt-1 text-sm text-muted-foreground">La caisse fonctionne sur une boutique précise.</p>
        <Select className="mt-4" defaultValue="" onChange={(e) => setActiveStore(e.target.value)}>
          <option value="" disabled>
            Sélectionner…
          </option>
          {posStores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Card>
    )
  }
  return <PosTerminal storeId={storeId} user={user} />
}

function PosTerminal({ storeId, user }: { storeId: string; user: Profile }) {
  const products = useProducts().data ?? []
  const categories = useCategories().data ?? []
  const inventory = useInventory().data ?? []
  const L = useLookups()
  const cart = useCart()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [supervisorOpen, setSupervisorOpen] = useState(false)
  const [supervisor, setSupervisor] = useState<Profile | null>(null)
  const [completed, setCompleted] = useState<Sale | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const stockMap = useMemo(() => {
    const m = new Map<string, number>()
    inventory.filter((i) => i.store_id === storeId).forEach((i) => m.set(i.product_id, i.quantity))
    return m
  }, [inventory, storeId])

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const active = products.filter((p) => p.is_active)
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return active.filter(
      (p) =>
        (!category || p.category_id === category) &&
        (!q || normalize(`${p.name} ${p.brand} ${p.sku} ${p.barcode ?? ''}`).includes(q)),
    )
  }, [active, query, category])

  const subtotal = cart.lines.reduce((a, l) => a + (productMap.get(l.product_id)?.selling_price ?? 0) * l.quantity, 0)
  const discount = discountFromInput(subtotal, cart.discountMode, cart.discountValue)
  const totals = useMemo(() => {
    try {
      return computeSaleTotals(
        cart.lines.filter((l) => productMap.has(l.product_id)),
        productMap,
        discount,
      )
    } catch {
      return null
    }
  }, [cart.lines, productMap, discount])
  const pct = discountPercent(subtotal, discount)
  const needsSupervisor = pct > DISCOUNT_SUPERVISOR_THRESHOLD && !can(user.role, 'discount.approve')
  const itemsCount = cart.lines.reduce((a, l) => a + l.quantity, 0)

  // Le superviseur ne vaut que pour la remise en cours
  useEffect(() => {
    if (!needsSupervisor) setSupervisor(null)
  }, [needsSupervisor])

  const addProduct = (id: string) => {
    const available = stockMap.get(id) ?? 0
    const inCart = cart.lines.find((l) => l.product_id === id)?.quantity ?? 0
    if (inCart + 1 > available) {
      toast.error(`Stock insuffisant (${available} disponible${available > 1 ? 's' : ''})`)
      return
    }
    cart.add(id)
  }

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const q = query.trim()
    if (!q) return
    // Lecteur code-barres : correspondance exacte EAN13 ou SKU
    const exact = active.find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase())
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null)
    if (target) {
      addProduct(target.id)
      setQuery('')
    } else if (/^\d{8,13}$/.test(q)) {
      toast.error(`Code-barres inconnu : ${q}`)
      setQuery('')
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'F9' && cart.lines.length) {
        e.preventDefault()
        startPayment()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const startPayment = () => {
    if (!cart.lines.length) return
    if (needsSupervisor && !supervisor) return setSupervisorOpen(true)
    setPayOpen(true)
  }

  return (
    <div className="-m-4 grid h-[calc(100dvh-4rem-var(--banner-h,0px))] grid-rows-[1fr_auto] sm:-m-6 lg:-m-8 lg:grid-cols-[1fr_420px] lg:grid-rows-1">
      {/* Catalogue */}
      <section className="flex min-h-0 flex-col">
        <div className="space-y-3 border-b bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Rechercher un produit ou scanner un code-barres…"
              className="h-12 rounded-xl pl-10 pr-24 text-base"
            />
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Barcode className="size-4" />
              <kbd className="rounded border bg-muted px-1.5 font-mono">F2</kbd>
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
            {[{ id: null, name: 'Tout' }, ...categories].map((c) => (
              <button
                key={c.id ?? 'all'}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                  category === c.id ? 'border-primary bg-primary text-white' : 'bg-card hover:bg-muted',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((p) => {
              const stock = stockMap.get(p.id) ?? 0
              const inCart = cart.lines.find((l) => l.product_id === p.id)?.quantity ?? 0
              return (
                <button
                  key={p.id}
                  onClick={() => addProduct(p.id)}
                  disabled={stock <= 0}
                  className={cn(
                    'group relative flex flex-col rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
                    inCart > 0 && 'border-primary ring-1 ring-primary/30',
                  )}
                >
                  {inCart > 0 && (
                    <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">
                      {inCart}
                    </span>
                  )}
                  <ProductThumb product={p} className="mb-3 aspect-square h-auto w-full rounded-lg text-lg" />
                  <p className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-tight">{p.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.brand}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-sm font-semibold tabular">{formatMoney(p.selling_price)}</span>
                    <span
                      className={cn(
                        'text-[10px] font-medium tabular',
                        stock <= 0 ? 'text-red-600' : stock <= p.min_stock_level ? 'text-amber-600' : 'text-muted-foreground',
                      )}
                    >
                      {stock <= 0 ? 'Rupture' : `${stock} en stock`}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          {!filtered.length && <EmptyState icon={Search} title="Aucun produit trouvé" description="Essayez un autre terme ou une autre catégorie." />}
        </div>
      </section>

      {/* Panier */}
      <aside className="flex max-h-[55vh] min-h-0 flex-col border-t bg-card lg:max-h-none lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Panier</p>
            <p className="text-[11px] text-muted-foreground">
              {L.store.get(storeId)?.name} · {itemsCount} article{itemsCount > 1 ? 's' : ''}
            </p>
          </div>
          {cart.lines.length > 0 && (
            <Button variant="ghost" size="sm" onClick={cart.clear} className="text-muted-foreground">
              <Trash2 /> Vider
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
          {cart.lines.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Panier vide" description="Scannez ou touchez un produit pour l’ajouter." />
          ) : (
            <ul className="divide-y">
              {cart.lines.map((l) => {
                const p = productMap.get(l.product_id)
                if (!p) return null
                const stock = stockMap.get(p.id) ?? 0
                return (
                  <li key={l.product_id} className="flex items-center gap-3 px-2 py-3">
                    <ProductThumb product={p} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] font-medium leading-tight">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground tabular">{formatMoney(p.selling_price)}</p>
                    </div>
                    <div className="flex items-center rounded-lg border">
                      <button className="grid size-8 place-items-center hover:bg-muted" onClick={() => cart.setQty(p.id, l.quantity - 1)} aria-label="Moins">
                        <Minus className="size-3.5" />
                      </button>
                      <input
                        value={l.quantity}
                        inputMode="numeric"
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10) || 0
                          cart.setQty(p.id, Math.min(v, stock))
                        }}
                        className="w-8 bg-transparent text-center text-sm font-semibold tabular outline-none"
                      />
                      <button
                        className="grid size-8 place-items-center hover:bg-muted disabled:opacity-40"
                        disabled={l.quantity >= stock}
                        onClick={() => cart.setQty(p.id, l.quantity + 1)}
                        aria-label="Plus"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular">{formatMoney(p.selling_price * l.quantity)}</span>
                    <button onClick={() => cart.remove(p.id)} className="text-muted-foreground hover:text-destructive" aria-label="Retirer">
                      <X className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t p-5">
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5 text-xs">
              {(['percent', 'amount'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => cart.setDiscount(m, 0)}
                  className={cn('rounded-md px-2.5 py-1 font-medium', cart.discountMode === m ? 'bg-muted text-foreground' : 'text-muted-foreground')}
                >
                  {m === 'percent' ? '%' : 'F'}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={0}
              value={cart.discountValue || ''}
              onChange={(e) => cart.setDiscount(cart.discountMode, Number(e.target.value))}
              placeholder="Remise"
              className="h-8"
            />
          </div>
          {needsSupervisor && (
            <p className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]', supervisor ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700')}>
              <ShieldCheck className="size-3.5" />
              {supervisor
                ? `Remise autorisée par ${supervisor.first_name} ${supervisor.last_name}`
                : `Remise > ${DISCOUNT_SUPERVISOR_THRESHOLD} % : validation superviseur requise`}
            </p>
          )}
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Sous-total</dt>
              <dd className="tabular">{formatMoney(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>Remise ({formatPct(pct)})</dt>
                <dd className="tabular text-primary">− {formatMoney(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>dont TVA</dt>
              <dd className="tabular">{formatMoney(totals?.tax_amount ?? 0)}</dd>
            </div>
            <div className="flex items-baseline justify-between pt-2">
              <dt className="font-semibold">Total TTC</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular">{formatMoney(totals?.total ?? 0)}</dd>
            </div>
          </dl>
          <Button size="xl" className="w-full" disabled={!cart.lines.length} onClick={startPayment}>
            Encaisser <kbd className="ml-1 rounded bg-white/20 px-1.5 font-mono text-xs">F9</kbd>
          </Button>
        </div>
      </aside>

      <SupervisorDialog
        open={supervisorOpen}
        onOpenChange={setSupervisorOpen}
        onApproved={(p) => {
          setSupervisor(p)
          setSupervisorOpen(false)
          setPayOpen(true)
        }}
      />
      {totals && (
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          total={totals.total}
          onConfirm={async (payments) => {
            const sale = await api.createSale({
              store_id: storeId,
              items: cart.lines,
              discount_amount: discount,
              payments,
              supervisor_id: supervisor?.id ?? null,
            })
            cart.clear()
            setSupervisor(null)
            setPayOpen(false)
            setCompleted(sale)
          }}
        />
      )}
      <ReceiptDialog sale={completed} onClose={() => {
        setCompleted(null)
        setTimeout(() => searchRef.current?.focus(), 50)
      }} />
    </div>
  )
}

function SupervisorDialog({
  open,
  onOpenChange,
  onApproved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onApproved: (p: Profile) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const verify = useAction(() => api.verifySupervisor(email, password), {
    onSuccess: (p) => {
      setPassword('')
      onApproved(p)
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Validation superviseur" description={`Une remise supérieure à ${DISCOUNT_SUPERVISOR_THRESHOLD} % doit être autorisée par un responsable.`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            verify.mutate(undefined)
          }}
        >
          <Field label="Email du superviseur">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Mot de passe">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={verify.isPending}>
              <ShieldCheck /> Autoriser
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const METHODS: { key: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { key: 'cash', label: 'Espèces', icon: Banknote },
  { key: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
  { key: 'card', label: 'Carte', icon: CreditCard },
]
const PROVIDERS: { key: MobileProvider; label: string; cls: string }[] = [
  { key: 'wave', label: 'Wave', cls: 'bg-sky-500' },
  { key: 'orange_money', label: 'Orange Money', cls: 'bg-orange-500' },
  { key: 'mtn', label: 'MTN MoMo', cls: 'bg-yellow-400' },
]

function PaymentDialog({
  open,
  onOpenChange,
  total,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  total: number
  onConfirm: (payments: Payment[]) => Promise<void>
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [provider, setProvider] = useState<MobileProvider>('wave')
  const [received, setReceived] = useState('')
  const [txRef, setTxRef] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setMethod('cash')
      setReceived('')
      setTxRef('')
    }
  }, [open])

  const receivedNum = Number(received) || 0
  const change = receivedNum - total
  const quick = [...new Set([total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000])]
    .filter((v) => v >= total)
    .slice(0, 4)
  const canPay = method !== 'cash' || receivedNum >= total

  const confirm = async () => {
    if (!canPay) return
    setBusy(true)
    try {
      await onConfirm([
        {
          method,
          provider: method === 'mobile_money' ? provider : null,
          amount: total,
          amount_received: method === 'cash' ? receivedNum : null,
          change_given: method === 'cash' ? change : null,
        },
      ])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" title="Encaissement" description="Sélectionnez le mode de règlement">
        <div className="rounded-xl bg-muted/60 p-4 text-center">
          <p className="text-xs text-muted-foreground">Montant à encaisser</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{formatMoney(total)}</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors',
                method === m.key ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <m.icon className="size-5" />
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {method === 'cash' && (
            <div className="space-y-3">
              <Field label="Montant reçu">
                <Input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirm()}
                  className="h-12 text-lg font-semibold tabular"
                  placeholder="0"
                />
              </Field>
              <div className="grid grid-cols-4 gap-2">
                {quick.map((q) => (
                  <Button key={q} variant="outline" size="sm" onClick={() => setReceived(String(q))} className="tabular">
                    {formatMoney(q, false)}
                  </Button>
                ))}
              </div>
              <div className={cn('flex items-center justify-between rounded-xl border p-4', change >= 0 && receivedNum > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : '')}>
                <span className="text-sm text-muted-foreground">Monnaie à rendre</span>
                <span className={cn('text-xl font-semibold tabular', change < 0 && 'text-muted-foreground')}>
                  {formatMoney(Math.max(0, change))}
                </span>
              </div>
            </div>
          )}
          {method === 'mobile_money' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setProvider(p.key)}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-medium',
                      provider === p.key ? 'border-primary bg-accent' : 'hover:bg-muted',
                    )}
                  >
                    <span className={cn('size-2.5 rounded-full', p.cls)} />
                    {p.label}
                  </button>
                ))}
              </div>
              <Field label="Référence de transaction (optionnel)">
                <Input value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="Ex. MP2611…" />
              </Field>
              <p className="text-xs text-muted-foreground">Confirmez la réception du paiement sur le terminal marchand avant de valider.</p>
            </div>
          )}
          {method === 'card' && (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Présentez la carte sur le TPE puis validez une fois le paiement accepté.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button size="lg" onClick={confirm} disabled={!canPay} loading={busy}>
            <CheckCircle2 /> Valider la vente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReceiptDialog({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const L = useLookups()
  const user = useAuth((s) => s.user)
  if (!sale) return null
  const store = L.store.get(sale.store_id)
  const pay = sale.payments[0]
  return (
    <Dialog open={!!sale} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm" title="Vente enregistrée" description={sale.reference}>
        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="size-7" />
          </span>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular">{formatMoney(sale.total)}</p>
          {pay?.method === 'cash' && pay.change_given !== null && pay.change_given > 0 && (
            <p className="mt-1 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700">
              Rendu : {formatMoney(pay.change_given)}
            </p>
          )}
        </div>
        <div className="mt-5 space-y-1 rounded-xl border bg-muted/30 p-4 font-mono text-[11px]">
          {sale.items.map((i) => (
            <div key={i.product_id} className="flex justify-between gap-2">
              <span className="truncate">
                {i.quantity} × {i.product_name}
              </span>
              <span className="tabular">{formatMoney(i.line_total, false)}</span>
            </div>
          ))}
          {sale.discount_amount > 0 && (
            <div className="flex justify-between border-t pt-1">
              <span>Remise</span>
              <span>−{formatMoney(sale.discount_amount, false)}</span>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => generateReceiptPdf(sale, store, user ?? undefined)}>
            <Printer /> Imprimer le ticket
          </Button>
          <Button onClick={onClose}>Nouvelle vente</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
