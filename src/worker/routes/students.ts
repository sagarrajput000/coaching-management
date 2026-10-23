import { Hono } from 'hono'

import { privateJson } from '../auth'
import {
  ATTENDANCE_SELECT,
  FEE_SELECT,
  STUDENT_SELECT,
  hueFor,
  id,
  mapAttendanceSummary,
  mapFee,
  mapStudent,
  now,
  todayStr,
} from '../db'
import type { AppContext } from '../env'
import { STUDENT_STATUSES } from '../../shared/types'

export const students = new Hono<AppContext>()

const PAGE = 25

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

students.get('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const q = (c.req.query('q') ?? '').trim()
  const status = c.req.query('status')
  const batchId = c.req.query('batchId')
  const sort = c.req.query('sort') === 'name' ? 's.name ASC' : 's.created_at DESC'
  const page = Math.max(0, Number(c.req.query('page') ?? 0))
  const statusFilter = status && status !== 'all' ? (STUDENT_STATUSES.includes(status as never) ? status : null) : null

  const where: string[] = ['s.owner_sub = ?']
  const binds: unknown[] = [owner]
  if (q) {
    where.push(`(s.name LIKE ? OR s.phone LIKE ? OR s.guardian_name LIKE ?)`)
    const like = `%${q.replace(/[%_]/g, '')}%`
    binds.push(like, like, like)
  }
  if (statusFilter) {
    where.push('s.status = ?')
    binds.push(statusFilter)
  }
  if (batchId) {
    where.push('s.batch_id = ?')
    binds.push(batchId)
  }
  const clause = where.join(' AND ')
  const [rows, count] = await db.batch([
    db.prepare(`${STUDENT_SELECT} WHERE ${clause} ORDER BY ${sort} LIMIT ? OFFSET ?`).bind(...binds, PAGE, page * PAGE),
    db.prepare(`SELECT COUNT(*) AS n FROM students s WHERE ${clause}`).bind(...binds),
  ])
  return privateJson(c, {
    items: (rows.results as Record<string, unknown>[]).map(mapStudent),
    total: Number((count.results[0] as { n: number }).n),
    page,
    pageSize: PAGE,
  })
})

students.get('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const studentId = c.req.param('id')
  const [row, fees, summaryRows, recent] = await db.batch([
    db.prepare(`${STUDENT_SELECT} WHERE s.owner_sub = ? AND s.id = ?`).bind(owner, studentId),
    db.prepare(`${FEE_SELECT} WHERE f.owner_sub = ? AND f.student_id = ? ORDER BY f.due_date DESC LIMIT 60`).bind(owner, studentId),
    db
      .prepare(
        `SELECT s.id AS student_id, s.name AS student_name, s.hue,
          COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0) AS present,
          COALESCE(SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END), 0) AS late,
          COALESCE(SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END), 0) AS absent
        FROM students s
        LEFT JOIN attendance a ON a.student_id = s.id AND a.owner_sub = s.owner_sub
        WHERE s.owner_sub = ? AND s.id = ?
        GROUP BY s.id`,
      )
      .bind(owner, studentId),
    db
      .prepare(`${ATTENDANCE_SELECT} WHERE a.owner_sub = ? AND a.student_id = ? ORDER BY a.date DESC LIMIT 40`)
      .bind(owner, studentId),
  ])
  const student = row.results[0]
  if (!student) return c.json({ error: 'Not found.' }, 404)
  return privateJson(c, {
    student: mapStudent(student as Record<string, unknown>),
    fees: (fees.results as Record<string, unknown>[]).map(mapFee),
    attendance: (summaryRows.results as Record<string, unknown>[]).map(mapAttendanceSummary)[0] ?? null,
    recentAttendance: (recent.results as Record<string, unknown>[]).map((r) => ({
      date: r.date as string,
      status: r.status as 'present' | 'late' | 'absent',
    })),
  })
})

type StudentInput = {
  name?: string
  phone?: string | null
  guardianName?: string | null
  guardianPhone?: string | null
  status?: string
  batchId?: string | null
  joinDate?: string | null
}

function clean(input: StudentInput, fallback?: { name?: unknown; status?: unknown }) {
  const name = (input.name?.trim() ?? (typeof fallback?.name === 'string' ? fallback.name : '')).slice(0, 100)
  return {
    name,
    phone: input.phone?.trim().slice(0, 40) || null,
    guardianName: input.guardianName?.trim().slice(0, 100) || null,
    guardianPhone: input.guardianPhone?.trim().slice(0, 40) || null,
    status: STUDENT_STATUSES.includes(input.status as never) ? (input.status as string) : 'active',
    batchId: input.batchId || null,
    joinDate: input.joinDate && DATE_RE.test(input.joinDate) ? input.joinDate : null,
  }
}

students.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const body = clean(await c.req.json<StudentInput>())
  if (!body.name) return c.json({ error: 'Name is required.' }, 400)
  const studentId = id()
  const t = now()
  await db
    .prepare(
      `INSERT INTO students (id, owner_sub, batch_id, name, phone, guardian_name, guardian_phone, status, join_date, hue, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(studentId, owner, body.batchId, body.name, body.phone, body.guardianName, body.guardianPhone, body.status, body.joinDate ?? todayStr(), hueFor(body.name), t, t)
    .run()
  const row = await db.prepare(`${STUDENT_SELECT} WHERE s.owner_sub = ? AND s.id = ?`).bind(owner, studentId).first()
  return privateJson(c, { student: mapStudent(row as Record<string, unknown>) }, 201)
})

students.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const studentId = c.req.param('id')
  const existing = await db.prepare(`SELECT * FROM students WHERE owner_sub = ? AND id = ?`).bind(owner, studentId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const input = await c.req.json<StudentInput>()
  const merged = clean(input, { name: existing.name, status: existing.status })
  if (!merged.name) return c.json({ error: 'Name is required.' }, 400)
  await db
    .prepare(
      `UPDATE students SET name = ?, phone = ?, guardian_name = ?, guardian_phone = ?, status = ?, batch_id = ?, join_date = ?, hue = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`,
    )
    .bind(
      merged.name,
      merged.phone,
      merged.guardianName,
      merged.guardianPhone,
      merged.status,
      merged.batchId,
      merged.joinDate,
      merged.name === existing.name ? existing.hue : hueFor(merged.name),
      now(),
      owner,
      studentId,
    )
    .run()
  const row = await db.prepare(`${STUDENT_SELECT} WHERE s.owner_sub = ? AND s.id = ?`).bind(owner, studentId).first()
  return privateJson(c, { student: mapStudent(row as Record<string, unknown>) })
})

students.delete('/:id', async (c) => {
  const owner = c.get('user').sub
  const studentId = c.req.param('id')
  await c.get('db').batch([
    c.get('db').prepare(`DELETE FROM attendance WHERE owner_sub = ? AND student_id = ?`).bind(owner, studentId),
    c.get('db').prepare(`DELETE FROM fees WHERE owner_sub = ? AND student_id = ?`).bind(owner, studentId),
    c.get('db').prepare(`DELETE FROM students WHERE owner_sub = ? AND id = ?`).bind(owner, studentId),
  ])
  return privateJson(c, { ok: true })
})
