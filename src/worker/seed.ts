import { hueFor, id, todayStr } from './db'

const DAY = 86_400_000

const batches: Array<[name: string, subject: string, schedule: string, monthlyFee: number]> = [
  ['Class 10 — Mathematics', 'Mathematics', 'Mon–Fri · 5:00–6:30 PM', 2000],
  ['Class 10 — Science', 'Science', 'Tue & Thu · 6:30–8:00 PM', 1800],
  ['Class 12 — Physics', 'Physics', 'Mon, Wed & Fri · 6:30–8:00 PM', 2500],
  ['Spoken English', 'English', 'Sat & Sun · 10:00–11:30 AM', 1500],
]

// Weekly class days (0 = Sunday): from the schedule above.
const BATCH_WEEKDAYS: number[][] = [
  [1, 2, 3, 4, 5], // Mon–Fri
  [2, 4], // Tue & Thu
  [1, 3, 5], // Mon, Wed & Fri
  [0, 6], // Sat & Sun
]

// name, batch index, phone tail, guardian name
const people: Array<[string, number, string, string]> = [
  ['Aarav Sharma', 0, '01734', 'Rajesh Sharma'],
  ['Diya Patel', 0, '02805', 'Meera Patel'],
  ['Kabir Singh', 0, '03911', 'Harpreet Singh'],
  ['Ananya Iyer', 1, '04268', 'Suresh Iyer'],
  ['Rohan Mehta', 1, '05744', 'Nisha Mehta'],
  ['Ishita Rao', 1, '06109', 'Prakash Rao'],
  ['Vihaan Gupta', 1, '07623', 'Deepak Gupta'],
  ['Saanvi Reddy', 2, '08014', 'Anil Reddy'],
  ['Arjun Nair', 2, '09951', 'Latha Nair'],
  ['Myra Joshi', 2, '10260', 'Kiran Joshi'],
  ['Advit Kulkarni', 2, '11789', 'Sunil Kulkarni'],
  ['Zara Khan', 3, '12473', 'Imran Khan'],
  ['Reyansh Bose', 3, '13828', 'Arnab Bose'],
  ['Aadhya Menon', 3, '14960', 'Vinod Menon'],
]

// Joined n days ago; later joiners skip older attendance/fees.
const joinedAgoDays = (i: number) => 80 - i * 4

export async function seedWorkspace(db: D1Database, owner: string) {
  const t = Date.now()
  const statements: D1PreparedStatement[] = []

  const batchIds = batches.map(() => id())
  batches.forEach(([name, subject, schedule, fee], i) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO batches (id, owner_sub, name, subject, schedule, monthly_fee, hue, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(batchIds[i], owner, name, subject, schedule, fee, hueFor(name), t - (90 - i * 10) * DAY, t - i * DAY),
    )
  })

  const studentIds = people.map(() => id())
  people.forEach(([name, batchIndex, phoneTail, guardian], i) => {
    const joinedAt = t - joinedAgoDays(i) * DAY
    statements.push(
      db
        .prepare(
          `INSERT INTO students (id, owner_sub, batch_id, name, phone, guardian_name, guardian_phone, status, join_date, hue, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          studentIds[i],
          owner,
          batchIds[batchIndex],
          name,
          `+91 9800${phoneTail}`,
          guardian,
          `+91 9700${phoneTail}`,
          'active',
          new Date(joinedAt).toISOString().slice(0, 10),
          hueFor(name),
          joinedAt,
          joinedAt,
        ),
    )
  })

  // Attendance over the last 35 days on each batch's class days, deterministic
  // but varied: most students present, a few absences and lates.
  const today = new Date(`${todayStr()}T12:00:00`).getTime()
  for (let dayOffset = 35; dayOffset >= 0; dayOffset--) {
    const dayStart = t - dayOffset * DAY
    const date = new Date(dayStart).toISOString().slice(0, 10)
    const weekday = new Date(`${date}T12:00:00`).getDay()
    people.forEach(([, batchIndex], i) => {
      if (!BATCH_WEEKDAYS[batchIndex].includes(weekday)) return
      if (today - dayStart > joinedAgoDays(i) * DAY) return // not enrolled yet
      const roll = (Number(date.slice(8, 10)) + i * 3) % 11
      const status = roll === 0 ? 'absent' : i % 7 === 3 && roll === 1 ? 'late' : 'present'
      statements.push(
        db
          .prepare(`INSERT INTO attendance (id, owner_sub, student_id, batch_id, date, status) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(id(), owner, studentIds[i], batchIds[batchIndex], date, status),
      )
    })
  }

  // Fees: the previous two periods are mostly paid, the current period is open,
  // and a handful of last-month invoices stay unpaid so overdue states show up.
  const periods: string[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(new Date(t).getFullYear(), new Date(t).getMonth() - i + 1, 0)
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  periods.forEach((period, p) => {
    const dueDate = `${period}-10`
    people.forEach(([, batchIndex], i) => {
      if (new Date(`${dueDate}T09:00:00`).getTime() < t - joinedAgoDays(i) * DAY) return // joined later
      const amount = batches[batchIndex][3]
      const historic = p < 2
      const paid = historic ? (i * 7 + p * 5) % 18 !== 0 : (i * 11) % 23 < 5
      const paidAtMs = new Date(`${dueDate}T10:00:00`).getTime() + (i % 4) * DAY
      const paidAt = paid ? Math.min(paidAtMs, t) : null
      const latest = paidAt ?? Math.min(new Date(`${dueDate}T09:00:00`).getTime() + 6 * DAY, t) - i * 3_600_000
      statements.push(
        db
          .prepare(
            `INSERT INTO fees (id, owner_sub, student_id, batch_id, amount, period, due_date, paid_at, note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          )
          .bind(
            id(),
            owner,
            studentIds[i],
            batchIds[batchIndex],
            amount,
            period,
            dueDate,
            paidAt,
            new Date(`${dueDate}T09:00:00`).getTime() - 6 * DAY,
            latest,
          ),
      )
    })
  })

  statements.push(db.prepare(`UPDATE workspaces SET seeded_at = ? WHERE owner_sub = ?`).bind(t, owner))
  // D1 batches are limited in size; chunk to stay well under the limit.
  for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40))
}

export async function clearWorkspace(db: D1Database, owner: string) {
  await db.batch(
    ['attendance', 'fees', 'students', 'batches'].map((table) => db.prepare(`DELETE FROM ${table} WHERE owner_sub = ?`).bind(owner)),
  )
  await db.prepare(`UPDATE workspaces SET seeded_at = NULL WHERE owner_sub = ?`).bind(owner).run()
}
