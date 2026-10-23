import { CalendarCheck, CalendarDays, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Avatar, Button, EmptyState, PageHeader, Select, Skeleton, useToast } from '../components/ui'
import { api, useApiMutation, useAttendanceSheet, useAttendanceSummary, useBatches } from '../lib/api'
import { cx } from '../lib/cx'
import { todayStr } from '../lib/format'
import type { AttendanceStatus } from '../../shared/types'

const TODAY = todayStr()

function monthOf(date: string): string {
  return date.slice(0, 7)
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const options: { key: AttendanceStatus | null; label: string; tone: string }[] = [
  { key: 'present', label: 'Present', tone: 'bg-success text-white' },
  { key: 'late', label: 'Late', tone: 'bg-warning text-white' },
  { key: 'absent', label: 'Absent', tone: 'bg-danger text-white' },
  { key: null, label: 'Clear', tone: 'text-muted hover:bg-surface-2' },
]

export function Attendance() {
  const { data: batches } = useBatches()
  const [batchId, setBatchId] = useState<string | undefined>(undefined)
  const [date, setDate] = useState(TODAY)
  const toast = useToast()

  const activeBatch = batchId ?? batches?.items[0]?.id
  const { data: sheet, isLoading } = useAttendanceSheet(activeBatch, date)
  const { data: summary } = useAttendanceSummary(activeBatch, monthOf(date))

  const mark = useApiMutation(
    (input: { studentId: string; status: AttendanceStatus | null }) =>
      api('/attendance', { method: 'PUT', json: { studentId: input.studentId, date, status: input.status } }),
    ['attendance-sheet', 'attendance-summary', 'overview', 'students'],
  )
  const markAll = useApiMutation(
    async (status: AttendanceStatus) => {
      await Promise.all((sheet?.items ?? []).map((row) => api('/attendance', { method: 'PUT', json: { studentId: row.studentId, date, status } })))
    },
    ['attendance-sheet', 'attendance-summary', 'overview', 'students'],
    { onSuccess: () => toast(status === 'present' ? 'All marked present' : 'All marked absent') },
  )

  const currentBatch = batches?.items.find((b) => b.id === activeBatch)
  const marked = sheet?.items.filter((r) => r.status !== null).length ?? 0
  const present = sheet?.items.filter((r) => r.status === 'present').length ?? 0

  return (
    <div className="mx-auto max-w-[1000px] p-5 sm:p-8">
      <PageHeader title="Attendance" subtitle={currentBatch ? currentBatch.name : 'Pick a batch to take attendance'} />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Select value={activeBatch ?? ''} onChange={(e) => setBatchId(e.target.value)} className="w-[240px]">
          {batches?.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          {!batches?.items.length && <option value="">No batches yet</option>}
        </Select>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
            <ChevronLeft />
          </Button>
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-9 rounded-control border border-line-strong bg-surface pl-8 pr-3 text-[13.5px]"
            />
          </label>
          <Button size="icon-sm" disabled={date >= TODAY} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
            <ChevronRight />
          </Button>
          {date !== TODAY && (
            <Button size="sm" onClick={() => setDate(TODAY)}>
              Today
            </Button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" disabled={!sheet?.items.length || markAll.isPending} onClick={() => markAll.mutate('present')} loading={markAll.isPending && markAll.variables === 'present' ? true : undefined}>
            <CheckCheck />
            All present
          </Button>
        </div>
      </div>

      {sheet && sheet.items.length > 0 && (
        <p className="mt-3 text-[13px] text-muted">
          {marked} of {sheet.items.length} marked · {present} present
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-card border border-line">
        {isLoading && (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-control" />
            ))}
          </div>
        )}
        {sheet && sheet.items.length === 0 && (
          <EmptyState
            icon={<CalendarCheck />}
            title="No active students"
            description={currentBatch ? `Students join ${currentBatch.name} from the Batches page or a student's profile.` : 'Create a batch and add students first.'}
          />
        )}
        <ul className="divide-y divide-line">
          {sheet?.items.map((row) => (
            <li key={row.studentId} className="flex h-13 items-center gap-3 px-4">
              <Avatar name={row.studentName} hue={row.hue} size={30} />
              <Link to={`/students/${row.studentId}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">
                {row.studentName}
              </Link>
              <div className="flex gap-1" role="group" aria-label={`Attendance for ${row.studentName}`}>
                {options.map((opt) => {
                  const selected = row.status === opt.key
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => mark.mutate({ studentId: row.studentId, status: opt.key })}
                      className={cx(
                        'h-8 rounded-tile px-3 text-[12.5px] font-medium transition-colors',
                        selected ? opt.tone : 'border border-line bg-surface text-muted hover:bg-surface-2',
                        opt.key === null && 'pl-2 pr-2',
                      )}
                    >
                      {opt.label}
                    </button>
                  )
                })}
                {row.guardianPhone && (
                  <button
                    key="whatsapp"
                    type="button"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-line bg-surface text-faint hover:bg-surface-2"
                    onClick={() => window.open(`https://wa.me/${row.guardianPhone?.replace(/[^\d+]/g, '') ?? ''}?text=Hi%20%7C%20Attendance%20update%20for%20${row.studentName}`)}
                    aria-label="WhatsApp guardian"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17 2H7c-3.31 0-6 2.69-6 6v10c0 3.31 2.69 6 6 6h10c-3.31 0-6-2.69-6-6v-4.586l1.414-1.414A6.002 6.002 0 0 1 19 15.414V15c0-3.31-2.69-6-6-6zm-1 8.586l-2.293 2.293-1.414-1.414 2.293-2.293 1.414 1.414L16 13.586V9z"/></svg>
                    Send msg
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <section className="mt-8">
        <h2 className="text-[13px] font-semibold">
          Summary · {new Date(`${monthOf(date)}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        {!summary || summary.items.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">No marks recorded for this month yet.</p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-card border border-line">
            <table className="w-full table-fixed border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="h-10 border-b border-line bg-bg/60 text-[12.5px] font-medium text-muted">
                  <th className="w-[36%] px-4 font-medium">Student</th>
                  <th className="w-16 px-2 text-center font-medium">P</th>
                  <th className="w-16 px-2 text-center font-medium">L</th>
                  <th className="w-16 px-2 text-center font-medium">A</th>
                  <th className="w-[20%] px-4 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.items.map((row) => (
                  <tr key={row.studentId} className="h-12">
                    <td className="px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={row.studentName} hue={row.hue} size={26} />
                        <Link to={`/students/${row.studentId}`} className="truncate font-medium hover:underline">
                          {row.studentName}
                        </Link>
                      </div>
                    </td>
                    <td className="px-2 text-center tabular-nums text-success">{row.present}</td>
                    <td className="px-2 text-center tabular-nums text-warning">{row.late}</td>
                    <td className="px-2 text-center tabular-nums text-danger">{row.absent}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 tabular-nums">{row.pct}%</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-surface-2">
                          <span
                            className={cx('block h-full', row.pct >= 75 ? 'bg-success' : row.pct >= 50 ? 'bg-warning' : 'bg-danger')}
                            style={{ width: `${row.pct}%` }}
                          />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
