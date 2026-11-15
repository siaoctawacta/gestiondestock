import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './EmptyState'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sort?: (row: T) => string | number
  className?: string
  headerClassName?: string
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  search,
  searchPlaceholder = 'Rechercher…',
  toolbar,
  pageSize = 12,
  loading,
  emptyTitle = 'Aucun élément',
  emptyDescription,
  onRowClick,
  initialSort,
}: {
  data: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  search?: (row: T) => string
  searchPlaceholder?: string
  toolbar?: ReactNode
  pageSize?: number
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onRowClick?: (row: T) => void
  initialSort?: { key: string; dir: 'asc' | 'desc' }
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState(initialSort ?? null)

  const filtered = useMemo(() => {
    let rows = data
    if (query && search) {
      const q = query
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      rows = rows.filter((r) =>
        search(r)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(q),
      )
    }
    const col = sort && columns.find((c) => c.key === sort.key)
    if (col?.sort) {
      const fn = col.sort
      rows = [...rows].sort((a, b) => {
        const va = fn(a)
        const vb = fn(b)
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr')
        return sort!.dir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [data, query, search, sort, columns])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages - 1)
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize)

  return (
    <div>
      {(search || toolbar) && (
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
          {search && (
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(0)
                }}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {toolbar && <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">{toolbar}</div>}
        </div>
      )}
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            {columns.map((c) => (
              <TH key={c.key} className={c.headerClassName}>
                {c.sort ? (
                  <button
                    className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                    onClick={() =>
                      setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))
                    }
                  >
                    {c.header}
                    {sort?.key === c.key &&
                      (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                ) : (
                  c.header
                )}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <TR key={i}>
                  {columns.map((c) => (
                    <TD key={c.key}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </TD>
                  ))}
                </TR>
              ))
            : rows.map((r) => (
                <TR
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {columns.map((c) => (
                    <TD key={c.key} className={c.className}>
                      {c.cell(r)}
                    </TD>
                  ))}
                </TR>
              ))}
        </TBody>
      </Table>
      {!loading && filtered.length === 0 && <EmptyState title={emptyTitle} description={emptyDescription} />}
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="tabular">
            {current * pageSize + 1}–{Math.min(filtered.length, (current + 1) * pageSize)} sur {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeft />
            </Button>
            <span className="px-2 tabular">
              {current + 1} / {pages}
            </span>
            <Button variant="outline" size="icon-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
