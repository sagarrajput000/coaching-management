import { ArrowDownRight, ArrowUpRight, CheckCircle2, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'

import { AreaChart, StageBars } from '../components/charts'
import { Badge, Button, Card, PageHeader, Skeleton } from '../components/ui'
import { api, useApiMutation, useMe, useOverview } from '../lib/api'
import { money, periodLabel, shortDate } from '../lib/format'
import { cx } from '../lib/cx'
import type { FeeRecord } from '../../shared/types'

function feeTone(status: FeeRecord['status']) {
  return status === 'paid' ? ('success' as const) : status === 'overdue' ? ('danger' as const) : ('warning' as const)
}

export function Overview() {
  const { data, isLoading } = useOverview()
  const { data: me } = useMe()
  const markPaid = useApiMutation((id: string) => api(`/fees/${id}`, { method: 'PATCH', json: { paid: true } }), ['overview', 'fees'])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = me?.user.name?.split(' ')[0]

  const kpis = data
    ? [
        { label: 'Active students', value: String(data.kpis.activeStudents), hint: 'enrolled right now' },
        {
          label: 'Collected this month',
          value: money(data.kpis.collectedThisMonth),
          delta: data.kpis.collectedLastMonth
            ? (data.kpis.collectedThisMonth - data.kpis.collectedLastMonth) / data.kpis.collectedLastMonth
            : null,
          hint: 'fees received',
        },
        { label: 'Pending dues', value: money(data.kpis.pendingAmount), hint: `${data.kpis.overdueCount} overdue invoices`, danger: data.kpis.overdueCount > 0 },
        { label: 'Attendance (7 days)', value: `${data.kpis.attendanceRate}%`, hint: 'present + late' },
      ]
    : []

  return (
    <div className="mx-auto max-w-[1200px] p-5 sm:p-8">
      <PageHeader title={`${greeting}${first ? `, ${first}` : ''}`} subtitle="Here is where things stand at your coaching center." />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-card" />)
          : kpis.map((kpi) => (
              <Card key={kpi.label} className="flex h-[104px] flex-col justify-between p-4">
                <p className="text-[13px] text-muted">{kpi.label}</p>
                <div>
                  <p className="text-[24px] font-semibold tracking-[-0.02em] tabular-nums">{kpi.value}</p>
                  <p className={cx('mt-0.5 flex items-center gap-1 text-[12px] text-faint', kpi.danger && 'text-danger')}>
                    {kpi.delta !== undefined && kpi.delta !== null && (
                      <span className={cx('inline-flex items-center font-medium', kpi.delta >= 0 ? 'text-success' : 'text-danger')}>
                        {kpi.delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {Math.abs(Math.round(kpi.delta * 100))}%
                      </span>
                    )}
                    {kpi.hint}
                  </p>
                </div>
              </Card>
            ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Fee collections</h2>
            <span className="text-[12.5px] text-faint">Paid invoices, last 6 months</span>
          </div>
          <div className="mt-4">{data ? <AreaChart data={data.collectionSeries} /> : <Skeleton className="h-[220px]" />}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Attendance rate</h2>
            <Link to="/attendance" className="text-[12.5px] text-muted hover:text-fg">
              Take attendance
            </Link>
          </div>
          <div className="mt-4">
            {data ? <AreaChart data={data.attendanceSeries} height={220} /> : <Skeleton className="h-[220px]" />}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Upcoming &amp; overdue fees</h2>
            <Link to="/fees" className="text-[12.5px] text-muted hover:text-fg">
              All fees
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {data?.upcomingDues.map((f) => {
              const due = shortDate(f.dueDate)
              return (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/students/${f.studentId}`} className="truncate text-[13.5px] font-medium hover:underline">
                      {f.studentName}
                    </Link>
                    <p className="truncate text-[12.5px] text-faint">
                      {f.batchName ?? 'No batch'} · {periodLabel(f.period)}
                    </p>
                  </div>
                  <Badge tone={feeTone(f.status)} dot>
                    {f.status === 'overdue' ? `Overdue · was due ${due}` : `Due ${due}`}
                  </Badge>
                  <span className="hidden shrink-0 text-[13px] tabular-nums sm:block">{money(f.amount)}</span>
                  <Button size="sm" onClick={() => markPaid.mutate(f.id)} loading={markPaid.isPending} aria-label={`Mark ${f.studentName} as paid`}>
                    <CheckCircle2 />
                    Paid
                  </Button>
                </li>
              )
            })}
            {data && data.upcomingDues.length === 0 && (
              <li className="flex flex-col items-center py-8 text-center">
                <ReceiptText className="size-5 text-faint" />
                <p className="mt-2 text-[13px] text-muted">No pending fees — everyone is settled</p>
              </li>
            )}
          </ul>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Outstanding by batch</h2>
            <Link to="/batches" className="text-[12.5px] text-muted hover:text-fg">
              All batches
            </Link>
          </div>
          <div className="mt-5">
            {data ? (
              <StageBars
                data={data.batchTotals.map((b) => ({
                  label: b.name.split('—')[0]?.trim() || b.name,
                  value: b.outstanding,
                  count: b.students,
                  tone: `hsl(${b.hue} 55% 55%)`,
                }))}
              />
            ) : (
              <Skeleton className="h-[200px]" />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
