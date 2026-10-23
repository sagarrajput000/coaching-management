import { Hono } from 'hono'

import { privateJson } from '../auth'
import { BATCH_SELECT, hueFor, id, mapBatch, now } from '../db'
import type { AppContext } from '../env'

export const batches = new Hono<AppContext>()

batches.get('/', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  const owner = c.get('user').sub
  const like = `%${q.replace(/[%_]/g, '')}%`
  const rows = await c
    .get('db')
    .prepare(`${BATCH_SELECT} WHERE b.owner_sub = ? ${q ? 'AND (b.name LIKE ? OR b.subject LIKE ?)' : ''} ORDER BY b.name ASC LIMIT 100`)
    .bind(...(q ? [owner, like, like] : [owner]))
    .all()
  return privateJson(c, { items: (rows.results as Record<string, unknown>[]).map(mapBatch) })
})

type BatchInput = { name?: string; subject?: string | null; schedule?: string | null; monthlyFee?: number | null }

function clean(input: BatchInput, fallback?: { name?: string; monthlyFee?: number }) {
  const name = (input.name?.trim() ?? fallback?.name ?? '').trim().slice(0, 100)
  return {
    name,
    subject: input.subject?.trim().slice(0, 60) || null,
    schedule: input.schedule?.trim().slice(0, 80) || null,
    monthlyFee: Math.max(0, Math.round(Number(input.monthlyFee ?? fallback?.monthlyFee ?? 0) || 0)),
  }
}

batches.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const body = clean(await c.req.json<BatchInput>())
  if (!body.name) return c.json({ error: 'Name is required.' }, 400)
  const batchId = id()
  const t = now()
  await db
    .prepare(
      `INSERT INTO batches (id, owner_sub, name, subject, schedule, monthly_fee, hue, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(batchId, owner, body.name, body.subject, body.schedule, body.monthlyFee, hueFor(body.name), t, t)
    .run()
  const row = await db.prepare(`${BATCH_SELECT} WHERE b.owner_sub = ? AND b.id = ?`).bind(owner, batchId).first()
  return privateJson(c, { batch: mapBatch(row as Record<string, unknown>) }, 201)
})

batches.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const batchId = c.req.param('id')
  const existing = await db.prepare(`SELECT * FROM batches WHERE owner_sub = ? AND id = ?`).bind(owner, batchId).first<Record<string, unknown>>()
  if (!existing) return c.json({ error: 'Not found.' }, 404)
  const merged = clean(await c.req.json<BatchInput>(), {
    name: (existing.name as string) ?? undefined,
    monthlyFee: existing.monthly_fee as number,
  })
  if (!merged.name) return c.json({ error: 'Name is required.' }, 400)
  await db
    .prepare(`UPDATE batches SET name = ?, subject = ?, schedule = ?, monthly_fee = ?, updated_at = ? WHERE owner_sub = ? AND id = ?`)
    .bind(merged.name, merged.subject, merged.schedule, merged.monthlyFee, now(), owner, batchId)
    .run()
  const row = await db.prepare(`${BATCH_SELECT} WHERE b.owner_sub = ? AND b.id = ?`).bind(owner, batchId).first()
  return privateJson(c, { batch: mapBatch(row as Record<string, unknown>) })
})

batches.delete('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const batchId = c.req.param('id')
  await db.batch([
    db.prepare(`UPDATE students SET batch_id = NULL WHERE owner_sub = ? AND batch_id = ?`).bind(owner, batchId),
    db.prepare(`UPDATE fees SET batch_id = NULL WHERE owner_sub = ? AND batch_id = ?`).bind(owner, batchId),
    db.prepare(`DELETE FROM attendance WHERE batch_id = ? AND owner_sub = ?`).bind(batchId, owner),
    db.prepare(`DELETE FROM batches WHERE owner_sub = ? AND id = ?`).bind(owner, batchId),
  ])
  return privateJson(c, { ok: true })
})
