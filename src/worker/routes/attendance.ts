import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id } from '../db'
import type { AppContext } from '../env'
import { ATTENDANCE_STATUSES } from '../../shared/types'

export const attendance = new Hono<AppContext>()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// The sheet for one batch on one date: every active student with their
// existing status (or null when not marked yet).
attendance.get('/sheet', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const batchId = c.req.query('batchId')
  const date = c.req.query('date') ?? ''
  if (!batchId || !DATE_RE.test(date)) return c.json({ items: [] })
  const rows = await db
    .prepare(
      `SELECT s.id AS student_id, s.name AS student_name, s.hue, a.status
       FROM students s
       LEFT JOIN attendance a ON a.student_id = s.id AND a.owner_sub = s.owner_sub AND a.date = ?
       WHERE s.owner_sub = ? AND s.batch_id = ? AND s.status = 'active'
       ORDER BY s.name ASC`,
    )
    .bind(date, owner, batchId)
    .all()
  return privateJson(c, {
    items: (rows.results as Record<string, unknown>[]).map((r) => ({
      studentId: r.student_id as string,
      studentName: (r.student_name as string) ?? '',
      hue: Number(r.hue ?? 220),
      status: (r.status as 'present' | 'late' | 'absent' | null) ?? null,
    })),
  })
})

// Upserts one student's status for a date. An explicit `null` removes the mark.
attendance.put('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const input = await c.req.json<{ studentId?: string; date?: string; status?: string | null }>()
  const studentId = input.studentId
  const date = input.date ?? ''
  const status = input.status ?? null
  if (!studentId || !DATE_RE.test(date)) return c.json({ error: 'Student and date are required.' }, 400)
  if (status !== null && !ATTENDANCE_STATUSES.includes(status as never)) return c.json({ error: 'Invalid status.' }, 400)
  const student = await db.prepare(`SELECT id, batch_id FROM students WHERE owner_sub = ? AND id = ?`).bind(owner, studentId).first<Record<string, unknown>>()
  if (!student) return c.json({ error: 'Not found.' }, 404)
  if (status === null) {
    await db.prepare(`DELETE FROM attendance WHERE owner_sub = ? AND student_id = ? AND date = ?`).bind(owner, studentId, date).run()
    return privateJson(c, { ok: true, status: null })
  }
  await db
    .prepare(
      `INSERT INTO attendance (id, owner_sub, student_id, batch_id, date, status) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_sub, student_id, date) DO UPDATE SET status = excluded.status, batch_id = excluded.batch_id`,
    )
    .bind(id(), owner, studentId, student.batch_id, date, status)
    .run()
  return privateJson(c, { ok: true, status })
})

// Per-student present/late/absent counts for one batch and month. The month
// filter lives in the JOIN so students without any marks still appear.
attendance.get('/summary', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const batchId = c.req.query('batchId')
  const month = c.req.query('month') ?? ''
  if (!batchId || !/^\d{4}-\d{2}$/.test(month)) return c.json({ items: [] })
  const rows = await db
    .prepare(
      `SELECT s.id AS student_id, s.name AS student_name, s.hue, s.guardian_phone,
        COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0) AS present,
        COALESCE(SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END), 0) AS late,
        COALESCE(SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
        ROUND(100.0 * COALESCE(SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END), 0) / CASE WHEN COUNT(a.status) = 0 THEN 1 ELSE COUNT(a.status) END) AS pct
       FROM students s
       LEFT JOIN attendance a ON a.student_id = s.id AND a.owner_sub = s.owner_sub
         AND a.date >= ? AND a.date < date(?, '+1 month')
       WHERE s.owner_sub = ? AND s.batch_id = ? AND s.status = 'active'
       GROUP BY s.id`,
    )
    .bind(`${month}-01`, `${month}-01`, owner, batchId)
    .all()
  return privateJson(c, {
    items: (rows.results as Record<string, unknown>[]).map((r) => ({
      studentId: r.student_id as string,
      studentName: (r.student_name as string) ?? '',
      hue: Number(r.hue ?? 220),
      guardianPhone: r.guardian_phone as string | null,
      present: Number(r.present ?? 0),
      late: Number(r.late ?? 0),
      absent: Number(r.absent ?? 0),
      pct: Number(r.pct ?? 0),
    })),
  })
})
