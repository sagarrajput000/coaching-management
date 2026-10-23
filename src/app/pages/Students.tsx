import { ChevronLeft, ChevronRight, Contact, MoreHorizontal, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { StudentForm, statusLabel, statusTone } from '../components/forms'
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Input, Menu, PageHeader, Select, Skeleton } from '../components/ui'
import { api, useApiMutation, useBatches, useStudents } from '../lib/api'
import { cx } from '../lib/cx'
import { money } from '../lib/format'
import { STUDENT_STATUSES, type Student } from '../../shared/types'

export function Students() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const batchId = params.get('batchId') ?? ''
  const sort = (params.get('sort') as 'recent' | 'name') ?? 'recent'
  const page = Number(params.get('page') ?? 0)
  const { data, isLoading, isFetching } = useStudents({ q, status, batchId, sort, page })
  const { data: batches } = useBatches()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Student | undefined>()
  const [deleting, setDeleting] = useState<Student | undefined>()
  const remove = useApiMutation((id: string) => api(`/students/${id}`, { method: 'DELETE' }), ['students', 'batches', 'overview'], {
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
    <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
      <PageHeader
        title="Students"
        subtitle={data ? `${data.total} ${data.total === 1 ? 'student' : 'students'}` : undefined}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus />
            New student
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input type="search" value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Search by name, phone or guardian" className="pl-9" />
        </div>
        <Select value={batchId} onChange={(e) => update({ batchId: e.target.value })} className="w-[190px]">
          <option value="">All batches</option>
          {batches?.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => update({ status: e.target.value })} className="w-[140px]">
          <option value="">All statuses</option>
          {STUDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => update({ sort: e.target.value })} className="w-[130px]">
          <option value="recent">Newest</option>
          <option value="name">Name</option>
        </Select>
      </div>

      <div className={cx('mt-4 overflow-hidden rounded-card border border-line transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        <table className="w-full table-fixed border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="h-10 border-b border-line bg-bg/60 text-[12.5px] font-medium text-muted">
              <th className="w-[30%] px-4 font-medium">Name</th>
              <th className="hidden w-[22%] px-4 font-medium md:table-cell">Batch</th>
              <th className="hidden w-[18%] px-4 font-medium lg:table-cell">Guardian</th>
              <th className="w-[12%] px-4 font-medium">Status</th>
              <th className="hidden w-[10%] px-4 font-medium sm:table-cell">Attend.</th>
              <th className="w-[12%] px-4 font-medium">Dues</th>
              <th className="w-12 px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="h-14">
                  <td className="px-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="round size-8" />
                      <Skeleton className="h-3.5 w-40" />
                    </div>
                  </td>
                  <td className="hidden px-4 md:table-cell">
                    <Skeleton className="h-3.5 w-28" />
                  </td>
                  <td className="hidden px-4 lg:table-cell">
                    <Skeleton className="h-3.5 w-32" />
                  </td>
                  <td className="px-4">
                    <Skeleton className="h-6 w-16" />
                  </td>
                  <td className="hidden px-4 sm:table-cell">
                    <Skeleton className="h-3.5 w-10" />
                  </td>
                  <td className="px-4">
                    <Skeleton className="h-3.5 w-14" />
                  </td>
                  <td />
                </tr>
              ))}
            {data?.items.map((s) => (
              <tr
                key={s.id}
                onClick={() => navigate(`/students/${s.id}`)}
                className="h-14 cursor-pointer transition-colors hover:bg-surface-2/60"
              >
                <td className="px-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} hue={s.hue} size={32} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      {s.phone && <p className="truncate text-[12.5px] text-faint">{s.phone}</p>}
                    </div>
                  </div>
                </td>
                <td className="hidden truncate px-4 text-muted md:table-cell">{s.batchName ?? <span className="text-faint">None</span>}</td>
                <td className="hidden truncate px-4 text-muted lg:table-cell">
                    {s.guardianName ?? <span className="text-faint">—</span>}
                    {s.guardianPhone && (
                      <Button variant="ghost" size="icon-sm" aria-label="WhatsApp guardian">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 2H7c-3.31 0-6 2.69-6 6v10c0 3.31 2.69 6 6 6h10c-3.31 0-6-2.69-6-6v-4.586l1.414-1.414A6.002 6.002 0 0 1 19 15.414V15c0-3.31-2.69-6-6-6zm-1 8.586l-2.293 2.293-1.414-1.414 2.293-2.293 1.414 1.414L16 13.586V9z"/></svg>
                      </Button>
                    )}
                  </td>
                <td className="px-4">
                  <Badge tone={statusTone[s.status]} dot>
                    {statusLabel[s.status]}
                  </Badge>
                </td>
                <td className="hidden px-4 tabular-nums text-muted sm:table-cell">
                  {s.attendancePct === null || s.attendancePct === undefined ? <span className="text-faint">—</span> : `${s.attendancePct}%`}
                </td>
                <td className={cx('px-4 tabular-nums', s.dueAmount ? 'font-medium text-danger' : 'text-muted')}>
                  {s.dueAmount ? money(s.dueAmount) : <span className="text-success font-medium">Clear</span>}
                </td>
                <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <Menu
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="More">
                        <MoreHorizontal />
                      </Button>
                    }
                    items={[
                      { label: 'Open', onSelect: () => navigate(`/students/${s.id}`) },
                      { label: 'Edit', onSelect: () => setEditing(s) },
                      { label: 'Delete', danger: true, onSelect: () => setDeleting(s) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<Contact />}
            title={q || status || batchId ? 'No students match' : 'No students yet'}
            description={q || status || batchId ? 'Try a different search or clear the filters.' : 'Add your first student to start tracking attendance and fees.'}
            action={
              q || status || batchId ? (
                <Button onClick={() => update({ q: '', status: '', batchId: '' })}>Clear filters</Button>
              ) : (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus />
                  New student
                </Button>
              )
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

      <StudentForm open={creating} onClose={() => setCreating(false)} onSaved={(s) => navigate(`/students/${s.id}`)} />
      <StudentForm open={Boolean(editing)} initial={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name ?? 'student'}?`}
        description="Their attendance and fee history are removed too."
      />
    </div>
  )
}
