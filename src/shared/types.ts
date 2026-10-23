// Types shared by the Worker (src/worker) and the app (src/app).

export type StudentStatus = 'active' | 'paused' | 'exited'
export const STUDENT_STATUSES: StudentStatus[] = ['active', 'paused', 'exited']

export type AttendanceStatus = 'present' | 'late' | 'absent'
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent']

export type FeeStatus = 'paid' | 'due' | 'overdue'

export interface Batch {
  id: string
  name: string
  subject: string | null
  schedule: string | null
  monthlyFee: number
  hue: number
  createdAt: number
  updatedAt: number
  studentCount?: number
  outstanding?: number
}

export interface Student {
  id: string
  batchId: string | null
  batchName?: string | null
  batchHue?: number | null
  name: string
  phone: string | null
  guardianName: string | null
  guardianPhone: string | null
  status: StudentStatus
  joinDate: string | null
  hue: number
  // Present or late over the last 30 days, when joined from a list query.
  attendancePct?: number | null
  dueAmount?: number | null
  createdAt: number
  updatedAt: number
}

export interface FeeRecord {
  id: string
  studentId: string
  studentName?: string | null
  studentHue?: number | null
  batchId: string | null
  batchName?: string | null
  amount: number
  period: string
  dueDate: string
  status: FeeStatus
  paidAt: number | null
  note: string | null
  guardianPhone?: string | null
  createdAt: number
  updatedAt: number
}

export interface AttendanceRow {
  studentId: string
  studentName: string
  hue: number
  status: AttendanceStatus | null
  guardianPhone?: string | null
}

export interface AttendanceSummary {
  studentId: string
  studentName: string
  hue: number
  present: number
  late: number
  absent: number
  pct: number
}

export type Me = {
  user: { sub: string; name?: string; email?: string; picture?: string }
  workspace: { name: string; seededAt: number | null }
  capabilities: { database: boolean; auth: 'freebuff' | 'development' }
}

export interface Overview {
  kpis: {
    activeStudents: number
    collectedThisMonth: number
    collectedLastMonth: number
    pendingAmount: number
    overdueCount: number
    attendanceRate: number
  }
  collectionSeries: { label: string; value: number }[]
  attendanceSeries: { label: string; value: number }[]
  batchTotals: { id: string; name: string; hue: number; students: number; outstanding: number }[]
  upcomingDues: FeeRecord[]
}
