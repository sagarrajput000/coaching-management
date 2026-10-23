import { ArrowLeft, CalendarCheck, CheckCircle2, Pencil, Phone, Plus, ReceiptText, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { FeeForm, StudentForm, statusLabel, statusTone } from '../components/forms'
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Spinner, useToast } from '../components/ui'
import { api, useApiMutation, useStudent } from '../lib/api'
import { cx } from '../lib/cx'
import { longDate, money, periodLabel, shortDate } from '../lib/format'
import type { FeeRecord } from '../../shared/types'

const ATTENDANCE_LABEL = { present: 'Present', late: 'Late', absent: 'Absent' } as const

export function StudentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data, isLoading } = useStudent(id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newFee, setNewFee] = useState(false)
  const [editingFee, setEditingFee] = useState<FeeRecord | undefined>()

  const remove = useApiMutation(() => api(`/students/${id}`, { method: 'DELETE' }), ['students', 'batches', 'overview'], {
    onSuccess: () => navigate('/students'),
  })
  const markPaid = useApiMutation((feeId: string) => api(`/fees/${feeId}`, { method: 'PATCH', json: { paid: true } }), ['student', 'students', 'overview', 'fees'], {
    onSuccess: () => toast('Marked as paid'),
  })

  if (isLoading || !data) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }
  const { student, fees, attendance, recentAttendance } = data
  const due = fees.filter((f) => !f.paidAt).reduce((sum, f) => sum + f.amount, 0)

  return (
    <div className="mx-auto max-w-[1000px] p-5 sm:p-8">
      <Link to="/students" className="inline-flex h-8 items-center gap-1.5 rounded-tile text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" />
        Students
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={student.name} hue={student.hue} size={64} />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{student.name}</h1>
              <Badge tone={statusTone[student.status]} dot>
                {statusLabel[student.status]}
              </Badge>
            </div>
            <p className="mt-1 text-[14px] text-muted">
              {student.batchName ? (
                <Link to="/batches" className="font-medium text-fg hover:underline">
                  {student.batchName}
                </Link>
              ) : (
                'No batch yet'
              )}
              {student.joinDate && <span className="text-faint"> · joined </span>}
              {student.joinDate && longDate(student.joinDate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setEditing(true)}>
            <Pencil />
            Edit
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete student" onClick={() => setDeleting(true)}>
            <Trash2 />
          </Button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-card border border-line p-4">
          <p className="text-[12.5px] text-muted">Attendance (30 days)</p>
          <p className="mt-1 text-[20px] font-semibold tracking-tight tabular-nums">
            {attendance ? `${attendance.pct}%` : '—'}
          </p>
        </div>
        <div className="rounded-card border border-line p-4">
          <p className="text-[12.5px] text-muted">Present / late</p>
          <p className="mt-1 text-[20px] font-semibold tracking-tight tabular-nums">
            {attendance ? `${attendance.present} / ${attendance.late}` : '—'}
          </p>
        </div>
        <div className="rounded-card border border-line p-4">
          <p className="text-[12.5px] text-muted">Absences</p>
          <p className="mt-1 text-[20px] font-semibold tracking-tight tabular-nums">{attendance ? attendance.absent : '—'}</p>
        </div>
        <div className="rounded-card border border-line p-4">
          <p className="text-[12.5px] text-muted">Outstanding fees</p>
          <p className={cx('mt-1 text-[20px] font-semibold tracking-tight tabular-nums', due > 0 && 'text-danger')}>{money(due)}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Fee history</h2>
            <Button size="sm" onClick={() => setNewFee(true)}>
              <Plus />
              Fee
            </Button>
          </div>
          {fees.length === 0 ? (
            <EmptyState icon={<ReceiptText />} title="No fee records yet" description="Invoices you create for this student appear here." />
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-card border border-line">
              {fees.map((f) => {
                const overdue = !f.paidAt && f.status === 'overdue'
                return (
                  <li key={f.id} className="group flex h-13 items-center gap-3 px-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{periodLabel(f.period)}</p>
                      <p className="truncate text-[12px] text-faint">Due {shortDate(f.dueDate)}</p>
                    </div>
                    <span className="text-[13.5px] tabular-nums">{money(f.amount)}</span>
                    <Badge tone={overdue ? 'danger' : f.paidAt ? 'success' : 'warning'} dot>
                      {f.paidAt ? 'Paid' : overdue ? 'Overdue' : 'Due'}
                    </Badge>
                    {!f.paidAt && (
                      <Button size="sm" variant="ghost" onClick={() => markPaid.mutate(f.id)} loading={markPaid.isPending} aria-label="Mark paid">
                        <CheckCircle2 />
                        Paid
                      </Button>
                    )}
                    {f.paidAt && (
                      <button
                        type="button"
                        aria-label="Edit fee"
                        onClick={() => setEditingFee(f)}
                        className="grid size-8 place-items-center rounded-tile text-faint opacity-0 transition-opacity hover:bg-surface-2 hover:text-fg group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-8">
          <section>
            <h3 className="text-[13px] font-semibold">Contact</h3>
            <dl className="mt-3 flex flex-col gap-3 text-[13.5px]">
              <div className="flex items-center gap-3">
                <dt className="grid size-7 place-items-center rounded-[9px] bg-surface-2 text-muted">
                  <Phone className="size-3.5" />
                </dt>
                <dd className="truncate">{student.phone ?? <span className="text-faint">No phone</span>}</dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="grid size-7 place-items-center rounded-[9px] bg-surface-2 text-muted">
                  <UserRound className="size-3.5" />
                </dt>
                <dd className="min-w-0">
                  {student.guardianName ?? <span className="text-faint">No guardian recorded</span>}
                  <span className="block truncate text-[12.5px] text-muted">{student.guardianPhone}</span>
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-[13px] font-semibold">
              <CalendarCheck className="size-4 text-muted" />
              Recent attendance
            </h3>
            {recentAttendance.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">Not marked yet</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1">
                {recentAttendance.map((a) => (
                  <li key={a.date} className="flex h-8 items-center justify-between rounded-control px-2 odd:bg-surface-2/60">
                    <span className="text-[12.5px] tabular-nums text-muted">{shortDate(a.date)}</span>
                    <span
                      className={cx(
                        'text-[12.5px] font-medium',
                        a.status === 'absent' ? 'text-danger' : a.status === 'late' ? 'text-warning' : 'text-success',
                      )}
                    >
                      {ATTENDANCE_LABEL[a.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <StudentForm open={editing} initial={student} onClose={() => setEditing(false)} />
      <FeeForm open={newFee} onClose={() => setNewFee(false)} defaultStudentId={student.id} />
      <FeeForm open={Boolean(editingFee)} initial={editingFee} onClose={() => setEditingFee(undefined)} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate(undefined)}
        loading={remove.isPending}
        title={`Delete ${student.name}?`}
        description="Their attendance and fee history are removed too."
      />
    </div>
  )
}
