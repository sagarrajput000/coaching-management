import type { MiddlewareHandler } from 'hono'

import type { AppContext } from './env'

// Schema lives with the Worker: D1 has no migration tool on Freebuff Sites, so
// tables are created on the first request of each isolate (cheap: one batch of
// IF NOT EXISTS statements). Add new statements at the end for new columns or
// tables; never edit existing ones in place once deployed.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    owner_sub TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    seeded_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT,
    schedule TEXT,
    monthly_fee INTEGER NOT NULL DEFAULT 0,
    hue INTEGER NOT NULL DEFAULT 220,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS batches_owner ON batches(owner_sub, name)`,
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    batch_id TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    guardian_name TEXT,
    guardian_phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    join_date TEXT,
    hue INTEGER NOT NULL DEFAULT 220,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS students_owner ON students(owner_sub, name)`,
  `CREATE INDEX IF NOT EXISTS students_batch ON students(owner_sub, batch_id)`,
  `CREATE TABLE IF NOT EXISTS fees (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    student_id TEXT NOT NULL,
    batch_id TEXT,
    amount INTEGER NOT NULL DEFAULT 0,
    period TEXT NOT NULL,
    due_date TEXT NOT NULL,
    paid_at INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS fees_owner ON fees(owner_sub, due_date)`,
  `CREATE INDEX IF NOT EXISTS fees_student ON fees(owner_sub, student_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS fees_period_unique ON fees(owner_sub, student_id, period)`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    student_id TEXT NOT NULL,
    batch_id TEXT,
    date TEXT NOT NULL,
    status TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS attendance_unique ON attendance(owner_sub, student_id, date)`,
  `CREATE INDEX IF NOT EXISTS attendance_owner_date ON attendance(owner_sub, date)`,
]

let ready: Promise<void> | undefined

export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(
    () => undefined,
    (error) => {
      ready = undefined
      throw error
    },
  )
  return ready
}

/** Rejects early with a clear message when the database binding is missing. */
export const requireDb: MiddlewareHandler<AppContext> = async (c, next) => {
  const db = c.env.DB
  if (!db) {
    return c.json(
      { error: 'database_missing', message: 'No database is attached yet. Add D1 storage named DB and redeploy.' },
      503,
    )
  }
  await ensureSchema(db)
  c.set('db', db)
  await next()
}

export const id = () => crypto.randomUUID()
export const now = () => Date.now()

export const todayStr = () => new Date().toISOString().slice(0, 10)
export const thisPeriod = () => new Date().toISOString().slice(0, 7)

export function hueFor(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

type Row = Record<string, unknown>

export function mapBatch(r: Row) {
  return {
    id: r.id as string,
    name: r.name as string,
    subject: (r.subject as string | null) ?? null,
    schedule: (r.schedule as string | null) ?? null,
    monthlyFee: Number(r.monthly_fee ?? 0),
    hue: Number(r.hue ?? 220),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    ...(r.student_count !== undefined ? { studentCount: Number(r.student_count) } : {}),
    ...(r.outstanding !== undefined ? { outstanding: Number(r.outstanding ?? 0) } : {}),
  }
}

export function mapStudent(r: Row) {
  return {
    id: r.id as string,
    batchId: (r.batch_id as string | null) ?? null,
    batchName: (r.batch_name as string | null) ?? null,
    batchHue: r.batch_hue === null || r.batch_hue === undefined ? null : Number(r.batch_hue),
    name: r.name as string,
    phone: (r.phone as string | null) ?? null,
    guardianName: (r.guardian_name as string | null) ?? null,
    guardianPhone: (r.guardian_phone as string | null) ?? null,
    status: r.status as 'active' | 'paused' | 'exited',
    joinDate: (r.join_date as string | null) ?? null,
    hue: Number(r.hue ?? 220),
    ...(r.attendance_pct !== undefined
      ? { attendancePct: r.attendance_pct === null || r.attendance_pct === undefined ? null : Number(r.attendance_pct) }
      : {}),
    ...(r.due_amount !== undefined ? { dueAmount: Number(r.due_amount ?? 0) } : {}),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export function mapFee(r: Row) {
  const paidAt = r.paid_at === null || r.paid_at === undefined ? null : Number(r.paid_at)
  const overdue = new Date(`${r.due_date as string}T23:59:59`).getTime() < Date.now()
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    studentName: (r.student_name as string | null) ?? null,
    studentHue: r.student_hue === null || r.student_hue === undefined ? null : Number(r.student_hue),
    batchId: (r.batch_id as string | null) ?? null,
    batchName: (r.batch_name as string | null) ?? null,
    amount: Number(r.amount ?? 0),
    period: r.period as string,
    dueDate: r.due_date as string,
    status: (paidAt ? 'paid' : overdue ? 'overdue' : 'due') as 'paid' | 'overdue' | 'due',
    paidAt,
    note: (r.note as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export function mapAttendanceSummary(r: Row) {
  const present = Number(r.present ?? 0)
  const late = Number(r.late ?? 0)
  const total = present + late + Number(r.absent ?? 0)
  return {
    studentId: r.student_id as string,
    studentName: (r.student_name as string) ?? '',
    hue: Number(r.hue ?? 220),
    present,
    late,
    absent: Number(r.absent ?? 0),
    pct: total ? Math.round(((present + late) / total) * 100) : 100,
    guardianPhone: (r.guardian_phone as string | null) ?? null,
  }
}

export const BATCH_SELECT = `
  SELECT b.*,
    (SELECT COUNT(*) FROM students s WHERE s.batch_id = b.id AND s.owner_sub = b.owner_sub AND s.status = 'active') AS student_count,
    (SELECT COALESCE(SUM(f.amount),0) FROM fees f
      WHERE f.batch_id = b.id AND f.owner_sub = b.owner_sub AND f.paid_at IS NULL AND f.due_date <= date('now'))
    AS outstanding
  FROM batches b`

export const STUDENT_SELECT = `
  SELECT s.*, b.name AS batch_name, b.hue AS batch_hue,
    (SELECT ROUND(100.0 * COALESCE(SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END), 0) / COUNT(*))
      FROM attendance a WHERE a.student_id = s.id AND a.owner_sub = s.owner_sub AND a.date >= date('now', '-30 days')) AS attendance_pct,
    (SELECT COALESCE(SUM(f.amount),0) FROM fees f
      WHERE f.student_id = s.id AND f.owner_sub = s.owner_sub AND f.paid_at IS NULL AND f.due_date <= date('now')) AS due_amount
  FROM students s LEFT JOIN batches b ON b.id = s.batch_id AND b.owner_sub = s.owner_sub`

export const FEE_SELECT = `
  SELECT f.*, st.name AS student_name, st.hue AS student_hue, b.name AS batch_name
  FROM fees f
  LEFT JOIN students st ON st.id = f.student_id AND st.owner_sub = f.owner_sub
  LEFT JOIN batches b ON b.id = f.batch_id AND b.owner_sub = f.owner_sub`

export const ATTENDANCE_SELECT = `SELECT a.* FROM attendance a`
