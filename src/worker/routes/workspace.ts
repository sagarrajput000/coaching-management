import { Hono } from 'hono'

import { authMode, privateJson } from '../auth'
import { BATCH_SELECT, FEE_SELECT, mapBatch, mapFee, now } from '../db'
import type { AppContext } from '../env'
import { clearWorkspace, seedWorkspace } from '../seed'
import type { Me, Overview } from '../../shared/types'

export const workspace = new Hono<AppContext>()

async function ensureWorkspace(db: D1Database, owner: string, name: string) {
  const row = await db.prepare(`SELECT name, seeded_at FROM workspaces WHERE owner_sub = ?`).bind(owner).first<{ name: string; seeded_at: number | null }>()
  if (row) return row
  await db.prepare(`INSERT INTO workspaces (owner_sub, name, created_at) VALUES (?, ?, ?)`).bind(owner, name, now()).run()
  // A brand-new workspace gets sample data so the product is furnished on first open.
  await seedWorkspace(db, owner)
  return { name, seeded_at: now() }
}

workspace.get('/me', async (c) => {
  const user = c.get('user')
  const db = c.get('db')
  const ws = await ensureWorkspace(db, user.sub, `${user.name?.split(' ')[0] ?? 'Your'}'s coaching center`)
  const body: Me = {
    user: { sub: user.sub, name: user.name, email: user.email, picture: user.picture },
    workspace: { name: ws.name, seededAt: ws.seeded_at },
    capabilities: {
      database: true,
      auth: authMode(c.env, c.req.raw) === 'freebuff' ? 'freebuff' : 'development',
    },
  }
  return privateJson(c, body)
})

workspace.patch('/workspace', async (c) => {
  const { name } = await c.req.json<{ name?: string }>()
  const clean = name?.trim().slice(0, 60)
  if (!clean) return c.json({ error: 'Name is required.' }, 400)
  await c.get('db').prepare(`UPDATE workspaces SET name = ? WHERE owner_sub = ?`).bind(clean, c.get('user').sub).run()
  return privateJson(c, { ok: true })
})

workspace.post('/workspace/reset', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  await clearWorkspace(db, owner)
  await seedWorkspace(db, owner)
  return privateJson(c, { ok: true })
})

workspace.delete('/workspace/data', async (c) => {
  await clearWorkspace(c.get('db'), c.get('user').sub)
  return privateJson(c, { ok: true })
})

workspace.get('/overview', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const t = now()
  const startOfMonth = new Date(t)
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const startOfLast = new Date(startOfMonth)
  startOfLast.setMonth(startOfLast.getMonth() - 1)
  const sixMonths = new Date(startOfMonth)
  sixMonths.setMonth(sixMonths.getMonth() - 5)
  const twoWeeksAgo = new Date(t - 13 * 86_400_000).toISOString().slice(0, 10)

  const [active, collected, collectedLast, pending, overdue, attendanceAvg, byMonth, daily, dues, batches] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM students WHERE owner_sub = ? AND status = 'active'`).bind(owner),
    db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM fees WHERE owner_sub = ? AND paid_at >= ?`).bind(owner, startOfMonth.getTime()),
    db
      .prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM fees WHERE owner_sub = ? AND paid_at >= ? AND paid_at < ?`)
      .bind(owner, startOfLast.getTime(), startOfMonth.getTime()),
    db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM fees WHERE owner_sub = ? AND paid_at IS NULL AND due_date <= date('now')`).bind(owner),
    db.prepare(`SELECT COUNT(*) AS n FROM fees WHERE owner_sub = ? AND paid_at IS NULL AND due_date < date('now')`).bind(owner),
    db
      .prepare(
        `SELECT ROUND(100.0 * COALESCE(SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END), 0) / CASE WHEN COUNT(*) = 0 THEN 1 ELSE COUNT(*) END) AS pct
         FROM attendance WHERE owner_sub = ? AND date >= date('now', '-7 days')`,
      )
      .bind(owner),
    db
      .prepare(
        `SELECT substr(period, 1, 7) AS ym, COALESCE(SUM(amount),0) AS v FROM fees
         WHERE owner_sub = ? AND paid_at IS NOT NULL AND substr(period, 1, 7) >= ? GROUP BY ym ORDER BY ym`,
      )
      .bind(owner, sixMonths.toISOString().slice(0, 7)),
    db
      .prepare(
        `SELECT date, ROUND(100.0 * SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) / COUNT(*)) AS pct
         FROM attendance WHERE owner_sub = ? AND date >= ? GROUP BY date ORDER BY date`,
      )
      .bind(owner, twoWeeksAgo),
    db
      .prepare(`${FEE_SELECT} WHERE f.owner_sub = ? AND f.paid_at IS NULL AND f.due_date <= date('now') ORDER BY f.due_date ASC, st.name ASC LIMIT 6`)
      .bind(owner),
    db.prepare(`${BATCH_SELECT} WHERE b.owner_sub = ? ORDER BY b.name ASC`).bind(owner),
  ])

  const months: { label: string; value: number }[] = []
  const byYm = new Map((byMonth.results as { ym: string; v: number }[]).map((r) => [r.ym, Number(r.v)]))
  for (let i = 0; i < 6; i++) {
    const d = new Date(sixMonths)
    d.setMonth(d.getMonth() + i)
    const key = d.toISOString().slice(0, 7)
    months.push({ label: d.toLocaleString('en', { month: 'short' }), value: byYm.get(key) ?? 0 })
  }

  const byDay = new Map((daily.results as { date: string; pct: number }[]).map((r) => [r.date, Number(r.pct)]))
  const days: { label: string; value: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(t - i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    days.push({ label: d.toLocaleDateString('en', { day: 'numeric' }), value: byDay.get(key) ?? 100 })
  }

  const body: Overview = {
    kpis: {
      activeStudents: Number((active.results[0] as { n: number }).n),
      collectedThisMonth: Number((collected.results[0] as { v: number }).v),
      collectedLastMonth: Number((collectedLast.results[0] as { v: number }).v),
      pendingAmount: Number((pending.results[0] as { v: number }).v),
      overdueCount: Number((overdue.results[0] as { n: number }).n),
      attendanceRate: Number((attendanceAvg.results[0] as { pct: number }).pct ?? 0),
    },
    collectionSeries: months,
    attendanceSeries: days,
    batchTotals: (batches.results as Record<string, unknown>[]).map((r) => {
      const batch = mapBatch(r)
      return { id: batch.id, name: batch.name, hue: batch.hue, students: batch.studentCount ?? 0, outstanding: batch.outstanding ?? 0 }
    }),
    upcomingDues: (dues.results as Record<string, unknown>[]).map(mapFee),
  }
  return privateJson(c, body)
})

workspace.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 1) return privateJson(c, { students: [], batches: [] })
  const db = c.get('db')
  const owner = c.get('user').sub
  const like = `%${q.replace(/[%_]/g, '')}%`
  const [students, batches] = await db.batch([
    db
      .prepare(`SELECT id, name, phone, hue FROM students WHERE owner_sub = ? AND (name LIKE ? OR phone LIKE ? OR guardian_name LIKE ?) ORDER BY name LIMIT 6`)
      .bind(owner, like, like, like),
    db.prepare(`SELECT id, name, subject, hue FROM batches WHERE owner_sub = ? AND name LIKE ? ORDER BY name LIMIT 5`).bind(owner, like),
  ])
  return privateJson(c, { students: students.results, batches: batches.results })
})
