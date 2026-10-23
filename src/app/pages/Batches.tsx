import { CalendarCheck, GraduationCap, MoreHorizontal, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { BatchForm } from '../components/forms'
import { Button, ConfirmDialog, CompanyMark, EmptyState, Input, Menu, PageHeader, Skeleton } from '../components/ui'
import { api, useApiMutation, useBatches } from '../lib/api'
import { money, moneyCompact } from '../lib/format'
import type { Batch } from '../../shared/types'

export function Batches() {
  const [q, setQ] = useState('')
  const { data, isLoading } = useBatches(q)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Batch | undefined>()
  const [deleting, setDeleting] = useState<Batch | undefined>()
  const navigate = useNavigate()
  const remove = useApiMutation((id: string) => api(`/batches/${id}`, { method: 'DELETE' }), ['batches', 'students', 'attendance-sheet', 'attendance-summary', 'overview'], {
    onSuccess: () => setDeleting(undefined),
  })

  return (
    <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
      <PageHeader
        title="Batches"
        subtitle={data ? `${data.items.length} ${data.items.length === 1 ? 'batch' : 'batches'}` : undefined}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            New batch
          </Button>
        }
      />
      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search batches" className="pl-9" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[168px] rounded-card" />)}
        {data?.items.map((b) => (
          <div
            key={b.id}
            className="group flex h-[168px] flex-col justify-between rounded-card border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-card"
          >
            <div className="flex items-start gap-3">
              <CompanyMark name={b.name} hue={b.hue} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">{b.name}</p>
                <p className="truncate text-[12.5px] text-faint">{b.schedule ?? b.subject ?? 'No schedule set'}</p>
              </div>
              <div className="opacity-0 transition-opacity group-hover:opacity-100">
                <Menu
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label="More">
                      <MoreHorizontal />
                    </Button>
                  }
                  items={[
                    { label: 'Edit', icon: <Pencil />, onSelect: () => setEditing(b) },
                    {
                      label: 'Take attendance',
                      icon: <CalendarCheck />,
                      onSelect: () => navigate('/attendance'),
                    },
                    { label: 'Delete', danger: true, icon: <Trash2 />, onSelect: () => setDeleting(b) },
                  ]}
                />
              </div>
            </div>
            <dl className="grid grid-cols-3 items-end gap-2 text-[12.5px]">
              <div>
                <dt className="flex items-center gap-1 text-faint">
                  <UserRound className="size-3.5" />
                  Students
                </dt>
                <dd className="mt-0.5 font-medium tabular-nums">{b.studentCount ?? 0}</dd>
              </div>
              <div>
                <dt className="text-faint">Monthly fee</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{money(b.monthlyFee)}</dd>
              </div>
              <div>
                <dt className="text-faint">Overdue</dt>
                <dd className={`mt-0.5 font-medium tabular-nums ${b.outstanding ? 'text-danger' : ''}`}>
                  {b.outstanding ? moneyCompact(b.outstanding) : 'Nil'}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      {data && data.items.length === 0 && (
        <EmptyState
          icon={<GraduationCap />}
          title={q ? 'No batches match' : 'No batches yet'}
          description={q ? 'Try a different name.' : 'Batches group students, set the monthly fee and drive invoice generation.'}
          action={
            !q && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus />
                New batch
              </Button>
            )
          }
        />
      )}
      <BatchForm open={creating} onClose={() => setCreating(false)} />
      <BatchForm open={Boolean(editing)} initial={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name ?? 'batch'}?`}
        description="Students stay in your center without a batch. Attendance marks for this batch are removed."
      />
    </div>
  )
}
