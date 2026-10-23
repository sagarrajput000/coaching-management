import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, ReceiptText, Search, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import { FeeForm } from '../components/forms'
import { Avatar, Badge, Button, ConfirmDialog, Dialog, EmptyState, Field, Input, Menu, PageHeader, Select, Skeleton, useToast } from '../components/ui'
import { api, useApiMutation, useBatches, useFees } from '../lib/api'
import { cx } from '../lib/cx'
import { money, periodLabel, shortDate } from '../lib/format'
import type { FeeRecord } from '../../shared/types'

const STATUSES = ['due', 'overdue', 'paid'] as const
const statusText: Record<string, string> = { paid: 'Paid', due: 'Due', overdue: 'Overdue' }

export function Fees() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  const batchId = params.get('batchId') ?? ''
  const period = params.get('period') ?? ''
  const page = Number(params.get('page') ?? 0)
  const { data, isLoading, isFetching } = useFees({ q, status, batchId, period, page })
  const { data: batches } = useBatches()
  const toast = useToast()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<FeeRecord | undefined>()
  const [deleting, setDeleting] = useState<FeeRecord | undefined>()
  const [generating, setGenerating] = useState(false)

  const setPaid = useApiMutation(
    (input: { id: string; paid: boolean }) => api(`/fees/${input.id}`, { method: 'PATCH', json: { paid: input.paid } }),
    ['fees', 'overview', 'students', 'batches'],
    { onSuccess: (_result, input) => toast(input.paid ? 'Marked as paid' : 'Marked as unpaid') },
  )
  const remove = useApiMutation((id: string) => api(`/fees/${id}`, { method: 'DELETE' }), ['fees', 'overview', 'students'], {
    onSuccess: () => setDeleting(undefined),
  })

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) v ? merged.set(k, v) : merged.delete(k)
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="mx-auto max-w-[1150px] p-5 sm:p-8">
      <PageHeader
        title="Fees"
        subtitle={data ? `${data.total} ${data.total === 1 ? 'record' : 'records'}` : undefined}
        actions={
          <>
            <Button onClick={() => setGenerating(true)}>
              <Sparkles />
              Generate invoices
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus />
              New fee
            </Button>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input type="search" value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Search by student" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => update({ status: e.target.value })} className="w-[140px]">
          <option value="all">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusText[s]}
            </option>
          ))}
        </Select>
        <Select value={batchId} onChange={(e) => update({ batchId: e.target.value })} className="w-[190px]">
          <option value="">All batches</option>
          {batches?.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={period} onChange={(e) => update({ period: e.target.value })} className="w-[150px]">
          <option value="">All months</option>
          {monthsInView(data?.items ?? []).map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </Select>
      </div>

      <div className={cx('mt-4 overflow-hidden rounded-card border border-line transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        <table className="w-full table-fixed border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="h-10 border-b border-line bg-bg/60 text-[12.5px] font-medium text-muted">
              <th className="w-[30%] px-4 font-medium">Student</th>
              <th className="hidden w-[20%] px-4 font-medium md:table-cell">Batch</th>
              <th className="w-[12%] px-4 font-medium">Month</th>
              <th className="w-[14%] px-4 font-medium">Due date</th>
              <th className="w-[12%] px-4 font-medium">Amount</th>
              <th className="w-[12%] px-4 font-medium">Status</th>
              <th className="w-16 px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="h-14">
                  <td className="px-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="round size-8" />
                      <Skeleton className="h-3.5 w-36" />
                    </div>
                  </td>
                  <td className="hidden px-4 md:table-cell">
                    <Skeleton className="h-3.5 w-28" />
                  </td>
                  <td className="px-4">
                    <Skeleton className="h-3.5 w-14" />
                  </td>
                  <td className="px-4">
                    <Skeleton className="h-3.5 w-14" />
                  </td>
                  <td className="px-4">
                    <Skeleton className="h-3.5 w-14" />
                  </td>
                  <td className="px-4">
                    <Skeleton className="h-6 w-16" />
                  </td>
                  <td />
                </tr>
              ))}
            {data?.items.map((f) => {
              const overdue = f.status === 'overdue'
              return (
                <tr key={f.id} className="group h-14 transition-colors hover:bg-surface-2/60">
                  <td className="px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={f.studentName ?? '?'} hue={f.studentHue ?? 220} size={30} />
                      <Link to={`/students/${f.studentId}`} className="min-w-0 truncate font-medium hover:underline">
                        {f.studentName ?? 'Unknown'}
                      </Link>
                    </div>
                  </td>
                  <td className="hidden truncate px-4 text-muted md:table-cell">{f.batchName ?? <span className="text-faint">None</span>}</td>
                  <td className="truncate px-4 text-muted">{periodLabel(f.period)}</td>
                  <td className="truncate px-4 tabular-nums text-muted">{shortDate(f.dueDate)}</td>
                  <td className="px-4 font-medium tabular-nums">{money(f.amount)}</td>
                  <td className="px-4">
                    <Badge tone={overdue ? 'danger' : f.paidAt ? 'success' : 'warning'} dot>
                      {statusText[f.status]}
                    </Badge>
                  </td>
                  <td className="px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!f.paidAt && (
                        <Button size="sm" variant="ghost" onClick={() => setPaid.mutate({ id: f.id, paid: true })} loading={setPaid.isPending} aria-label="Mark paid">
                          Mark paid
                        </Button>
                      )}
                      {f.paidAt && (
                        <Button size="sm" variant="ghost" onClick={() => setPaid.mutate({ id: f.id, paid: false })} loading={setPaid.isPending} aria-label="Undo payment">
                          Unmark
                        </Button>
                      )}
                      {f.guardianPhone && (
                        <Button size="sm" variant="ghost" aria-label="WhatsApp reminder">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 2H7c-3.31 0-6 2.69-6 6v10c0 3.31 2.69 6 6 6h10c-3.31 0-6-2.69-6-6v-4.586l1.414-1.414A6.002 6.002 0 0 1 19 15.414V15c0-3.31-2.69-6-6-6zm-1 8.586l-2.293 2.293-1.414-1.414 2.293-2.293 1.414 1.414L16 13.586V9z"/></svg>
                        </Button>
                      )}
                      <Menu
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="More">
                            <MoreHorizontal />
                          </Button>
                        }
                        items={[
                          { label: 'Edit', onSelect: () => setEditing(f) },
                          { label: 'Delete', danger: true, onSelect: () => setDeleting(f) },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<ReceiptText />}
            title={q || (status && status !== 'all') || batchId || period ? 'Nothing matches' : 'No fee records yet'}
            description={
              q || (status && status !== 'all') || batchId || period
                ? 'Try different filters or clear them.'
                : 'Add a single invoice or generate one per student for a batch.'
            }
            action={
              q || (status && status !== 'all') || batchId || period ? (
                <Button onClick={() => update({ q: '', status: 'all', batchId: '', period: '' })}>Clear filters</Button>
              ) : undefined
            }
          />
        )}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button size="icon-sm" disabled={page === 0} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button size="icon-sm" disabled={page + 1 >= totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <FeeForm open={creating} onClose={() => setCreating(false)} />
      <FeeForm open={Boolean(editing)} initial={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete fee for ${deleting?.studentName ?? 'student'}?`}
        description={`The ${deleting ? periodLabel(deleting.period) : ''} invoice is removed permanently.`}
      />
      <GenerateDialog open={generating} onClose={() => setGenerating(false)} onDone={(n) => toast(n ? `Created ${n} invoice${n === 1 ? '' : 's'}` : 'Nothing to create — every active student already has an invoice')} />
    </div>
  )
}

// Distinct months across the loaded page, newest first, for the filter.
function monthsInView(items: FeeRecord[]): string[] {
  const set = new Set(items.map((f) => f.period))
  return [...set].sort().reverse()
}

function GenerateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (created: number) => void }) {
  const toast = useToast()
  const { data: batches } = useBatches()
  const month = new Date().toISOString().slice(0, 7)
  const [batchId, setBatchId] = useState('')
  const [period, setPeriod] = useState(month)
  const [dueDate, setDueDate] = useState(`${month}-10`)

  const generate = useApiMutation(
    () => api<{ created: number }>('/fees/generate', { method: 'POST', json: { batchId, period, dueDate } }),
    ['fees', 'overview', 'students', 'batches'],
    {
      onSuccess: (result) => {
        onDone(result.created)
        onClose()
      },
      onError: (error) => toast(error.message, 'danger'),
    },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    if (batchId) generate.mutate(undefined)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Generate monthly invoices"
      description="Creates one due invoice per active student in a batch, using the batch's monthly fee. Students who already have an invoice for the month are skipped."
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="generate-form" loading={generate.isPending} disabled={!batchId}>
            Generate
          </Button>
        </>
      }
    >
      <form
        id="generate-form"
        onSubmit={(e) => submit(e)}
        className={cx('grid gap-4')}
      >
        <Field label="Batch">
          <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Pick a batch</option>
            {batches?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · ₹{b.monthlyFee}/month · {b.studentCount ?? 0} students
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="For month">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {generate.error && <p className="text-[13px] text-danger">{generate.error.message}</p>}
      </form>
    </Dialog>
  )
}


