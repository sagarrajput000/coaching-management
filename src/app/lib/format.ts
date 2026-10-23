const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 })

export const money = (value: number) => currency.format(value)
export const moneyCompact = (value: number) => compact.format(value)

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts
  const minutes = Math.round(diff / 60_000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (Math.abs(minutes) < 60) return minutes > 0 ? `${minutes}m ago` : `in ${-minutes}m`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 7) return days > 0 ? `${days}d ago` : `in ${-days}d`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function shortDate(value: number | string | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function longDate(value: number | string | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function dueLabel(dueAt: number | string | null): { label: string; tone: 'danger' | 'warning' | 'muted' } {
  if (!dueAt) return { label: 'No date', tone: 'muted' }
  const ts = typeof dueAt === 'string' ? new Date(`${dueAt}T00:00:00`).getTime() : dueAt
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const dayEnd = start.getTime() + 86_400_000
  if (ts < start.getTime()) return { label: 'Overdue', tone: 'danger' }
  if (ts < dayEnd) return { label: 'Today', tone: 'warning' }
  if (ts < dayEnd + 86_400_000) return { label: 'Tomorrow', tone: 'muted' }
  return { label: shortDate(ts), tone: 'muted' }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function periodLabel(period: string | null | undefined): string {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return period ?? ''
  const date = new Date(`${period}-01T00:00:00`)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export const toDateInput = (ts: number | null) => (ts ? new Date(ts - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : '')
export const fromDateInput = (value: string) => (value ? new Date(`${value}T09:00:00`).getTime() : null)
export const todayStr = () => new Date().toISOString().slice(0, 10)
