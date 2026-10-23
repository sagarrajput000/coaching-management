import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AttendanceRow, AttendanceSummary, Batch, FeeRecord, Me, Overview, Student } from '../../shared/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: {
      accept: 'application/json',
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!response.ok) {
    let message = response.statusText
    let code: string | undefined
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      message = body.message ?? body.error ?? message
      code = body.error
    } catch {
      /* no body */
    }
    throw new ApiError(response.status, message, code)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// Queries

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), retry: false, staleTime: 60_000 })
export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/overview') })

export interface StudentsQuery {
  q?: string
  status?: string
  batchId?: string
  sort?: 'recent' | 'name'
  page?: number
}
export const useStudents = (query: StudentsQuery) =>
  useQuery({
    queryKey: ['students', query],
    queryFn: () => {
      const params = new URLSearchParams()
      if (query.q) params.set('q', query.q)
      if (query.status) params.set('status', query.status)
      if (query.batchId) params.set('batchId', query.batchId)
      if (query.sort) params.set('sort', query.sort)
      if (query.page) params.set('page', String(query.page))
      return api<{ items: Student[]; total: number; page: number; pageSize: number }>(`/students?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useStudent = (id: string | undefined) =>
  useQuery({
    queryKey: ['student', id],
    queryFn: () =>
      api<{
        student: Student
        fees: FeeRecord[]
        attendance: AttendanceSummary | null
        recentAttendance: { date: string; status: 'present' | 'late' | 'absent' }[]
      }>(`/students/${id}`),
    enabled: Boolean(id),
  })

export const useBatches = (q = '') =>
  useQuery({
    queryKey: ['batches', q],
    queryFn: () => api<{ items: Batch[] }>(`/batches?q=${encodeURIComponent(q)}`),
    placeholderData: (previous) => previous,
  })

export interface FeesQuery {
  status?: string
  batchId?: string
  period?: string
  q?: string
  page?: number
}
export const useFees = (query: FeesQuery) =>
  useQuery({
    queryKey: ['fees', query],
    queryFn: () => {
      const params = new URLSearchParams()
      if (query.status) params.set('status', query.status)
      if (query.batchId) params.set('batchId', query.batchId)
      if (query.period) params.set('period', query.period)
      if (query.q) params.set('q', query.q)
      if (query.page) params.set('page', String(query.page))
      return api<{ items: FeeRecord[]; total: number; page: number; pageSize: number }>(`/fees?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useAttendanceSheet = (batchId: string | undefined, date: string | undefined) =>
  useQuery({
    queryKey: ['attendance-sheet', batchId, date],
    queryFn: () => api<{ items: AttendanceRow[] }>(`/attendance/sheet?batchId=${batchId}&date=${date}`),
    enabled: Boolean(batchId) && Boolean(date),
  })

export const useAttendanceSummary = (batchId: string | undefined, month: string | undefined) =>
  useQuery({
    queryKey: ['attendance-summary', batchId, month],
    queryFn: () => api<{ items: AttendanceSummary[] }>(`/attendance/summary?batchId=${batchId}&month=${month}`),
    enabled: Boolean(batchId) && Boolean(month),
  })

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      api<{
        students: { id: string; name: string; phone: string | null; hue: number }[]
        batches: { id: string; name: string; subject: string | null; hue: number }[]
      }>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  })

// Mutations. Each invalidates the lists it can affect; detail pages refetch
// through their own keys.

export function useInvalidate() {
  const client = useQueryClient()
  return (...keys: string[]) => Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })))
}

export function useApiMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  invalidates: string[],
  options?: {
    onSuccess?: (result: TResult, input: TInput) => void
    onError?: (error: ApiError, input: TInput) => void
  },
) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: run,
    onSuccess: async (result, input) => {
      await invalidate(...invalidates)
      options?.onSuccess?.(result, input)
    },
    onError: (error) => {
      if (error instanceof ApiError) options?.onError?.(error, undefined as TInput)
    },
  })
}
