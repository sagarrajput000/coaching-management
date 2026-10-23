import { useEffect, useState, type FormEvent } from 'react'

import { api, useApiMutation, useBatches, useStudents } from '../lib/api'
import { Button, Dialog, Field, Input, Select, useFieldId, useToast } from './ui'
import { STUDENT_STATUSES, type Batch, type FeeRecord, type Student, type StudentStatus } from '../../shared/types'

// Each form works for create and edit: pass `initial` to edit.

function FieldInput(props: React.ComponentPropsWithoutRef<typeof Input>) {
  const id = useFieldId()
  return <Input id={id} {...props} />
}
function FieldSelect(props: React.ComponentPropsWithoutRef<typeof Select>) {
  const id = useFieldId()
  return <Select id={id} {...props} />
}

export const statusLabel: Record<StudentStatus, string> = { active: 'Active', paused: 'Paused', exited: 'Exited' }
export const statusTone: Record<StudentStatus, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  paused: 'warning',
  exited: 'neutral',
}

export function StudentForm({
  open,
  onClose,
  initial,
  defaultBatchId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial?: Student
  defaultBatchId?: string | null
  onSaved?: (student: Student) => void
}) {
  const toast = useToast()
  const { data: batches } = useBatches()
  const [form, setForm] = useState(blankStudent(initial, defaultBatchId))
  useEffect(() => {
    if (open) setForm(blankStudent(initial, defaultBatchId))
  }, [open, initial, defaultBatchId])

  const save = useApiMutation(
    (input: typeof form) =>
      initial
        ? api<{ student: Student }>(`/students/${initial.id}`, { method: 'PATCH', json: input })
        : api<{ student: Student }>('/students', { method: 'POST', json: input }),
    ['students', 'student', 'batch', 'batches', 'overview', 'search'],
    {
      onSuccess: (result) => {
        toast(initial ? 'Student updated' : 'Student added')
        onSaved?.(result.student)
        onClose()
      },
    },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate(form)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit student' : 'New student'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="student-form" loading={save.isPending}>
            {initial ? 'Save' : 'Add student'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid gap-4">
        <Field label="Full name">
          <FieldInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Batch">
            <FieldSelect value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
              <option value="">None</option>
              {batches?.items.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </FieldSelect>
          </Field>
          <Field label="Status">
            <FieldSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}>
              {STUDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </FieldSelect>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <FieldInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Joined on">
            <FieldInput type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guardian name">
            <FieldInput value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
          </Field>
          <Field label="Guardian phone">
            <FieldInput value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
          </Field>
        </div>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

function blankStudent(initial?: Student, batchId?: string | null) {
  return {
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    guardianName: initial?.guardianName ?? '',
    guardianPhone: initial?.guardianPhone ?? '',
    batchId: initial?.batchId ?? batchId ?? '',
    status: initial?.status ?? ('active' as StudentStatus),
    joinDate: initial?.joinDate ?? '',
  }
}

export function BatchForm({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Batch; onSaved?: (batch: Batch) => void }) {
  const toast = useToast()
  const [form, setForm] = useState(blankBatch(initial))
  useEffect(() => {
    if (open) setForm(blankBatch(initial))
  }, [open, initial])
  const save = useApiMutation(
    (input: typeof form) => {
      const payload = { ...input, monthlyFee: Number(input.monthlyFee) || 0 }
      return initial
        ? api<{ batch: Batch }>(`/batches/${initial.id}`, { method: 'PATCH', json: payload })
        : api<{ batch: Batch }>('/batches', { method: 'POST', json: payload })
    },
    ['batches', 'batch', 'students', 'overview', 'search'],
    {
      onSuccess: (result) => {
        toast(initial ? 'Batch updated' : 'Batch added')
        onSaved?.(result.batch)
        onClose()
      },
    },
  )
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit batch' : 'New batch'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="batch-form" loading={save.isPending}>
            {initial ? 'Save' : 'Add batch'}
          </Button>
        </>
      }
    >
      <form
        id="batch-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(form)
        }}
        className="grid gap-4"
      >
        <Field label="Name">
          <FieldInput required placeholder="Class 10 — Mathematics" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            <FieldInput value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label="Monthly fee" hint="Used when generating invoices">
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-faint">₹</span>
              <FieldInput type="number" min={0} step={100} className="pl-7" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} />
            </span>
          </Field>
        </div>
        <Field label="Schedule">
          <FieldInput placeholder="Mon–Fri · 5:00–6:30 PM" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
        </Field>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

function blankBatch(initial?: Batch) {
  return {
    name: initial?.name ?? '',
    subject: initial?.subject ?? '',
    schedule: initial?.schedule ?? '',
    monthlyFee: initial ? String(initial.monthlyFee) : '',
  }
}

export function FeeForm({
  open,
  onClose,
  initial,
  defaultStudentId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial?: FeeRecord
  defaultStudentId?: string | null
  onSaved?: (fee: FeeRecord) => void
}) {
  const toast = useToast()
  const { data: students } = useStudents({ sort: 'name' })
  const [form, setForm] = useState(blankFee(initial, defaultStudentId))
  useEffect(() => {
    if (open) setForm(blankFee(initial, defaultStudentId))
  }, [open, initial, defaultStudentId])
  const save = useApiMutation(
    (input: typeof form) => {
      const payload = {
        studentId: input.studentId || null,
        amount: Number(input.amount) || 0,
        period: input.period,
        dueDate: input.dueDate || null,
        note: input.note || null,
      }
      return initial
        ? api<{ fee: FeeRecord }>(`/fees/${initial.id}`, { method: 'PATCH', json: payload })
        : api<{ fee: FeeRecord }>('/fees', { method: 'POST', json: payload })
    },
    ['fees', 'overview', 'student', 'students', 'batch'],
    {
      onSuccess: (result) => {
        toast(initial ? 'Fee updated' : 'Fee added')
        onSaved?.(result.fee)
        onClose()
      },
    },
  )
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit fee record' : 'New fee record'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="fee-form" loading={save.isPending}>
            {initial ? 'Save' : 'Add fee'}
          </Button>
        </>
      }
    >
      <form
        id="fee-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(form)
        }}
        className="grid gap-4"
      >
        <Field label="Student">
          <FieldSelect required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
            <option value="">Pick a student</option>
            {students?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.batchName ? ` · ${s.batchName}` : ''}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-faint">₹</span>
              <FieldInput type="number" min={0} step={50} required className="pl-7" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </span>
          </Field>
          <Field label="For month">
            <FieldInput type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <FieldInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label="Note">
            <FieldInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
        {save.error && <p className="text-[13px] text-danger">{save.error.message}</p>}
      </form>
    </Dialog>
  )
}

function blankFee(initial?: FeeRecord, defaultStudentId?: string | null) {
  const month = new Date().toISOString().slice(0, 7)
  return {
    studentId: initial?.studentId ?? defaultStudentId ?? '',
    amount: initial ? String(initial.amount) : '',
    period: initial?.period ?? month,
    dueDate: initial?.dueDate ?? `${month}-10`,
    note: initial?.note ?? '',
  }
}
