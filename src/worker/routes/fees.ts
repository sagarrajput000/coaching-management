import { Hono } from 'hono'

import { privateJson } from '../auth'
import { BATCH_SELECT, FEE_SELECT, id, mapBatch, mapFee, now, thisPeriod } from '../db'
import type { AppContext } from '../env'

export const fees = new Hono<AppContext>()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PERIOD_RE = /^\d{4}-\d{2}$/

fees.get('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const status = c.req.query('status') // paid | due | overdue | all
  const batchId = c.req.query('batchId')
  const period = c.req.query('period')
  const q = (c.req.query('q') ?? '').trim()
  const page = Math.max(0, Number(c.req.query('page') ?? 0))
  const PAGE = 50

  const where: string[] = ['f.owner_sub = ?']
  const binds: unknown[] = [owner]
  if (status === 'paid') where.push('f.paid_at IS NOT NULL')
  if (status === 'due') where.push('f.paid_at IS NULL AND f.due_date >= date(\'now\')')
  if (status === 'overdue') where.push('f.paid_at IS NULL AND f.due_date < date(\'now\')')
  if (batchId) {
    where.push('f.batch_id = ?')
    binds.push(batchId)
  }
  if (period && PERIOD_RE.test(period)) {
    where.push('f.period = ?')
    binds.push(period)
  }
  if (q) {
    where.push('st.name LIKE ?')
    binds.push(`%${q.replace(/[%_]/g, '')}%`)
  }
  const clause = where.join(' AND ')
  const [rows, count] = await db.batch([
    db
      .prepare(`${FEE_SELECT} WHERE ${clause} ORDER BY f.due_date DESC, st.name ASC LIMIT ? OFFSET ?`)
      .bind(...binds, PAGE, page * PAGE),
    db.prepare(`SELECT COUNT(*) AS n FROM fees f LEFT JOIN students st ON st.id = f.student_id AND st.owner_sub = f.owner_sub WHERE ${clause}`).bind(...binds),
  ])
  return privateJson(c, {
    items: (rows.results as Record<string, unknown>[]).map(mapFee),
    total: Number((count.results[0] as { n: number }).n),
    page,
    pageSize: PAGE,
  })
})

type FeeInput = { studentId?: string; amount?: number | null; period?: string | null; dueDate?: string | null; paid?: boolean; note?: string | null }

fees.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<FeeInput>()
  const period = input.period && PERIOD_RE.test(input.period) ? input.period : thisPeriod()
  const dueDate = input.dueDate && DATE_RE.test(input.dueDate) ? input.dueDate : `${period}-10`
  const studentId = input.studentId
  const student = studentId
    ? await db.prepare(`SELECT id, batch_id, name FROM students WHERE owner_sub = ? AND id = ?`).bind(owner, studentId).first<Record<string, unknown>>()
    : null
  if (!student) return c.json({ error: 'Pick a student.' }, 400)
  const amount = Math.max(0, Math.round(Number(input.amount ?? 0) || 0))
  if (!amount) return c.json({ error: 'Amount is required.' }, 400)
  const feeId = id()
  const t = now()
  await db
    .prepare(
      `INSERT INTO fees (id, owner_sub, student_id, batch_id, amount, period, due_date, paid_at, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(feeId, owner, studentId, student.batch_id, amount, period, dueDate, input.paid ? t : null, input.note?.trim().slice(0, 200) || null, t, t)
    .run()
  const row = await db.prepare(`${FEE_SELECT} WHERE f.owner_sub = ? AND f.id = ?`).bind(owner, feeId).first()
  return privateJson(c, { fee: mapFee(row as Record<string, unknown>) }, 201)
})

// Generates one invoice per active student of a batch for a period, reusing the
// batch's monthly fee. Students that already have an invoice for the period are
// skipped, so it is safe to run twice.
fees.post('/generate', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const { batchId, period, dueDate } = (await c.req.json<{ batchId?: string; period?: string; dueDate?: string }>()) ?? {}
  if (!batchId) return c.json({ error: 'Pick a batch.' }, 400)
  const p = period && PERIOD_RE.test(period) ? period : thisPeriod()
  const batch = await db.prepare(`${BATCH_SELECT} WHERE b.owner_sub = ? AND b.id = ?`).bind(owner, batchId).first()
  if (!batch) return c.json({ error: 'Not found.' }, 404)
  const b = mapBatch(batch as Record<string, unknown>)
  const due = dueDate && DATE_RE.test(dueDate) ? dueDate : `${p}-10`
  const students = await db
    .prepare(`SELECT id FROM students WHERE owner_sub = ? AND batch_id = ? AND status = 'active' ORDER BY name`)
    .bind(owner, batchId)
    .all<{ id: string }>()
  if (!students.results.length) return c.json({ error: 'This batch has no active students.' }, 400)
  const existing = await db
    .prepare(`SELECT student_id FROM fees WHERE owner_sub = ? AND batch_id = ? AND period = ?`)
    .bind(owner, batchId, p)
    .all<{ student_id: string }>()
  const have = new Set(existing.results.map((r) => r.student_id))
  const fresh = students.results.filter((s) => !have.has(s.id))
  if (!fresh.length) return c.json({ created: 0 })
  const t = now()
  await db.batch(
    fresh.map((s) =>
      db
        .prepare(
          `INSERT INTO fees (id, owner_sub, student_id, batch_id, amount, period, due_date, paid_at, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .bind(id(), owner, s.id, batchId, b.monthlyFee, p, due, t, t),
    ),
  )
  return privateJson(c, { created: fresh.length }, 201)
})

fees.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const feeId = c.req.param('id')
  const input = await c.req.json<FeeInput>()
  const existing = await db.prepare(`SELECT * FROM fees WHERE owner_sub = ? AND id = ?`).bind(owner, feeId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const amount = input.amount === undefined ? Number(existing.amount) : Math.max(0, Math.round(Number(input.amount) || 0))
  if (!amount) return c.json({ error: 'Amount is required.' }, 400)
  const period = input.period && PERIOD_RE.test(input.period) ? input.period : (existing.period as string)
  const dueDate = input.dueDate && DATE_RE.test(input.dueDate) ? input.dueDate : (existing.due_date as string)
  const paidAt = input.paid === undefined ? (existing.paid_at as number | null) : input.paid ? now() : null
  await db
    .prepare(`UPDATE fees SET amount = ?, period = ?, due_date = ?, paid_at = ?, note = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`)
    .bind(
      amount,
      period,
      dueDate,
      paidAt,
      input.note === undefined ? (existing.note as string | null) : input.note?.trim().slice(0, 200) || null,
      now(),
      owner,
      feeId,
    )
    .run()
  const row = await db.prepare(`${FEE_SELECT} WHERE f.owner_sub = ? AND f.id = ?`).bind(owner, feeId).first()
  return privateJson(c, { fee: mapFee(row as Record<string, unknown>) })
})

fees.delete('/:id', async (c) => {
  await c
    .get('db')
    .prepare(`DELETE FROM fees WHERE owner_sub = ? AND id = ?`)
    .bind(c.get('user').sub, c.req.param('id'))
    .run()
  return privateJson(c, { ok: true })
})
