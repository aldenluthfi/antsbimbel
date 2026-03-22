export type Role = "admin" | "tutor"
export type StudentLevel = "SD" | "SMP" | "SMA"

export type ApiUser = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_active: boolean
  role: Role
}

export type Schedule = {
  id: number
  tutor: number
  tutor_name: string
  student: number
  student_name: string | null
  subject_topic: string
  description: string
  start_datetime: string
  end_datetime: string
  status: "upcoming" | "done" | "missed" | "cancelled" | "rescheduled" | "extended" | "pending" | "rejected"
  check_in_id: number | null
  check_out_id: number | null
  check_in_detail: {
    id: number
    time: string
    location: string
    photo: string | null
    description: string
  } | null
  check_out_detail: {
    id: number
    time: string
    photo: string | null
  } | null
  can_check_in: boolean
  can_check_out: boolean
}

export type Attendance = {
  check_in_id: number
  tutor: number
  student: number
  check_in_time: string
  check_in_location: string
  description: string
  check_in_photo: string
  check_out_id: number | null
  total_shift_time: string | null
}

export type PaginatedResponse<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type Session = {
  token: string
  user: ApiUser
}

export type AdminResetPasswordPayload = {
  user_id: number
}

export type TutorResetPasswordPayload = {
  old_password: string
  new_password: string
  confirm_new_password: string
}

export type DateFilters = {
  tutorId: string
  studentId: string
  startDate: string
  endDate: string
}

export type ScheduleStatusFilter = Schedule["status"][]
export type RequestStatus = "pending" | "resolved"
export type RequestStatusFilter = RequestStatus[]

export type ScheduleSortBy = "start_datetime" | "end_datetime" | "status"

export type RequestSortBy = "created_at" | "start_datetime" | "end_datetime" | "status"

export type SortOrder = "asc" | "desc"

export type ScheduleListQuery = {
  filters: DateFilters
  status: ScheduleStatusFilter
  sortBy: ScheduleSortBy
  sortOrder: SortOrder
  page: number
  pageSize: number
}

export type CalendarPaginationMode = "month" | "week"

export type ScheduleCalendarPaginationQuery = {
  filters: DateFilters
  status: ScheduleStatusFilter
  sortBy: ScheduleSortBy
  sortOrder: SortOrder
  mode: CalendarPaginationMode
  cursorDate: string
}

export type RequestListQuery = {
  filters: DateFilters
  status: RequestStatusFilter
  sortBy: RequestSortBy
  sortOrder: SortOrder
  page: number
  pageSize: number
}

export type RequestCalendarPaginationQuery = {
  filters: DateFilters
  status: RequestStatusFilter
  sortBy: RequestSortBy
  sortOrder: SortOrder
  mode: CalendarPaginationMode
  cursorDate: string
}

export type ScheduleCalendarPaginationResponse = {
  mode: CalendarPaginationMode
  cursor_date: string
  period_start: string
  period_end: string
  previous_cursor_date: string
  next_cursor_date: string
  count: number
  results: Schedule[]
}

export type ScheduleRequest = {
  id: number
  status: RequestStatus
  old_schedule: number | null
  new_schedule: number | null
  extension: number | null
  old_schedule_detail: Schedule | null
  new_schedule_detail: Schedule | null
  created_at: string
  updated_at: string
}

export type RequestCalendarPaginationResponse = {
  mode: CalendarPaginationMode
  cursor_date: string
  period_start: string
  period_end: string
  previous_cursor_date: string
  next_cursor_date: string
  count: number
  results: ScheduleRequest[]
}

export type Student = {
  id: number
  first_name: string
  last_name: string
  email: string
  level: StudentLevel
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateUserPayload = {
  username: string
  first_name: string
  last_name: string
  email: string
  is_active: boolean
}

export type UpdateUserPayload = Partial<CreateUserPayload>

export type SaveSchedulePayload = {
  tutor: number
  student: number
  subject_topic: string
  description: string
  start_datetime: string
  end_datetime: string
  status: Schedule["status"]
}

export type TutorScheduleRequestPayload = {
  student: number
  subject_topic: string
  description: string
  start_datetime: string
  end_datetime: string
}

export type MonthlyScheduleReportResponse = {
  detail: string
  sheet_url: string
  sheet_id: string
  month: string
}

export type EmailBlastMode = "daily" | "weekly"

export type EmailBlastPermissionState = {
  can_daily: boolean
  can_weekly: boolean
}

export type EmailBlastResponse = {
  detail: string
  mode: EmailBlastMode
  period_start: string
  period_end: string
  sent_count: number
  failed_count: number
  permission: EmailBlastPermissionState
}

export type SaveStudentPayload = {
  first_name: string
  last_name: string
  email: string
  level: StudentLevel
  is_active: boolean
}

function resolveApiBase(): string {
  const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  const isBrowser = typeof window !== "undefined"

  if (!configuredBase) {
    if (isBrowser && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return "/api"
    }
    return "http://127.0.0.1:8000/api"
  }

  const normalizedBase = configuredBase.replace(/\/+$/, "")
  if (isBrowser && window.location.protocol === "https:" && normalizedBase.startsWith("http://")) {
    return normalizedBase.replace(/^http:\/\//, "https://")
  }

  return normalizedBase
}

const API_BASE = resolveApiBase()

export const DEFAULT_FILTERS: DateFilters = {
  tutorId: "",
  studentId: "",
  startDate: "",
  endDate: "",
}

export function parseApiError(error: unknown): string {
  if (typeof error === "string") {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Something went wrong."
}

function buildListQuery(filters: DateFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams()
  params.set("page", String(page))
  params.set("page_size", String(pageSize))

  if (filters.tutorId.trim()) {
    params.set("tutor", filters.tutorId.trim())
  }
  if (filters.studentId.trim()) {
    params.set("student", filters.studentId.trim())
  }
  if (filters.startDate) {
    params.set("start_date", filters.startDate)
  }
  if (filters.endDate) {
    params.set("end_date", filters.endDate)
  }

  return `?${params.toString()}`
}

function appendStatusFilters(params: URLSearchParams, statusValues: string[]): void {
  statusValues.forEach((statusValue) => {
    const normalizedStatusValue = statusValue.trim()
    if (!normalizedStatusValue) {
      return
    }

    params.append("status", normalizedStatusValue)
  })
}

function buildScheduleListQuery(query: ScheduleListQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page))
  params.set("page_size", String(query.pageSize))
  params.set("sort_by", query.sortBy)
  params.set("sort_order", query.sortOrder)

  if (query.filters.tutorId.trim()) {
    params.set("tutor", query.filters.tutorId.trim())
  }
  if (query.filters.studentId.trim()) {
    params.set("student", query.filters.studentId.trim())
  }
  if (query.filters.startDate) {
    params.set("start_date", query.filters.startDate)
  }
  if (query.filters.endDate) {
    params.set("end_date", query.filters.endDate)
  }
  if (query.status.length > 0) {
    appendStatusFilters(params, query.status)
  }

  return `?${params.toString()}`
}

function buildScheduleCalendarPaginationQuery(query: ScheduleCalendarPaginationQuery): string {
  const params = new URLSearchParams()
  params.set("mode", query.mode)
  params.set("cursor_date", query.cursorDate)
  params.set("sort_by", query.sortBy)
  params.set("sort_order", query.sortOrder)

  if (query.filters.tutorId.trim()) {
    params.set("tutor", query.filters.tutorId.trim())
  }
  if (query.filters.studentId.trim()) {
    params.set("student", query.filters.studentId.trim())
  }
  if (query.filters.startDate) {
    params.set("start_date", query.filters.startDate)
  }
  if (query.filters.endDate) {
    params.set("end_date", query.filters.endDate)
  }
  if (query.status.length > 0) {
    appendStatusFilters(params, query.status)
  }

  return `?${params.toString()}`
}

function buildRequestListQuery(query: RequestListQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page))
  params.set("page_size", String(query.pageSize))
  params.set("sort_by", query.sortBy)
  params.set("sort_order", query.sortOrder)

  if (query.filters.tutorId.trim()) {
    params.set("tutor", query.filters.tutorId.trim())
  }
  if (query.filters.studentId.trim()) {
    params.set("student", query.filters.studentId.trim())
  }
  if (query.filters.startDate) {
    params.set("start_date", query.filters.startDate)
  }
  if (query.filters.endDate) {
    params.set("end_date", query.filters.endDate)
  }
  if (query.status.length > 0) {
    appendStatusFilters(params, query.status)
  }

  return `?${params.toString()}`
}

function buildRequestCalendarPaginationQuery(query: RequestCalendarPaginationQuery): string {
  const params = new URLSearchParams()
  params.set("mode", query.mode)
  params.set("cursor_date", query.cursorDate)
  params.set("sort_by", query.sortBy)
  params.set("sort_order", query.sortOrder)

  if (query.filters.tutorId.trim()) {
    params.set("tutor", query.filters.tutorId.trim())
  }
  if (query.filters.studentId.trim()) {
    params.set("student", query.filters.studentId.trim())
  }
  if (query.filters.startDate) {
    params.set("start_date", query.filters.startDate)
  }
  if (query.filters.endDate) {
    params.set("end_date", query.filters.endDate)
  }
  if (query.status.length > 0) {
    appendStatusFilters(params, query.status)
  }

  return `?${params.toString()}`
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const isFormData = options.body instanceof FormData
  const headers = new Headers(options.headers)

  if (!isFormData) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Token ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`
    try {
      const errorPayload = (await response.json()) as Record<string, unknown>
      if (typeof errorPayload.detail === "string") {
        detail = errorPayload.detail
      } else {
        detail = JSON.stringify(errorPayload)
      }
    } catch {
      // Keep default fallback message.
    }
    throw new Error(detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const authApi = {
  login(username: string, password: string) {
    return apiRequest<Session>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
  },
  logout(token: string) {
    return apiRequest<{ detail: string }>("/auth/logout/", { method: "POST" }, token)
  },
  resetPassword(payload: AdminResetPasswordPayload | TutorResetPasswordPayload, token: string) {
    return apiRequest<{ detail: string }>(
      "/auth/reset-password/",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token
    )
  },
}

export const usersApi = {
  list(token: string, page: number, pageSize: number, search = "") {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    if (search.trim()) {
      params.set("search", search.trim())
    }
    return apiRequest<PaginatedResponse<ApiUser>>(`/users/?${params.toString()}`, {}, token)
  },
  create(payload: CreateUserPayload, token: string) {
    return apiRequest<ApiUser>("/users/", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token)
  },
  update(id: number, payload: UpdateUserPayload, token: string) {
    return apiRequest<ApiUser>(`/users/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }, token)
  },
  remove(id: number, token: string) {
    return apiRequest<void>(`/users/${id}/`, { method: "DELETE" }, token)
  },
}

export const studentsApi = {
  list(token: string, page: number, pageSize: number, search = "") {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    if (search.trim()) {
      params.set("search", search.trim())
    }
    return apiRequest<PaginatedResponse<Student>>(`/students/?${params.toString()}`, {}, token)
  },
  create(payload: SaveStudentPayload, token: string) {
    return apiRequest<Student>(
      "/students/",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token
    )
  },
  update(id: number, payload: Partial<SaveStudentPayload>, token: string) {
    return apiRequest<Student>(
      `/students/${id}/`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      token
    )
  },
  remove(id: number, token: string) {
    return apiRequest<void>(`/students/${id}/`, { method: "DELETE" }, token)
  },
}

export const schedulesApi = {
  list(queryInput: ScheduleListQuery, token: string) {
    const query = buildScheduleListQuery(queryInput)
    return apiRequest<PaginatedResponse<Schedule>>(`/schedules/${query}`, {}, token)
  },
  calendarPagination(queryInput: ScheduleCalendarPaginationQuery, token: string) {
    const query = buildScheduleCalendarPaginationQuery(queryInput)
    return apiRequest<ScheduleCalendarPaginationResponse>(`/schedules/calendar-pagination/${query}`, {}, token)
  },
  create(payload: SaveSchedulePayload, token: string) {
    return apiRequest<Schedule>("/schedules/", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token)
  },
  update(id: number, payload: Partial<SaveSchedulePayload>, token: string) {
    return apiRequest<Schedule>(`/schedules/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }, token)
  },
  requestSchedule(payload: TutorScheduleRequestPayload, token: string) {
    return apiRequest<{ request_id: number; schedule: Schedule }>(
      "/schedules/request/",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token
    )
  },
  remove(id: number, token: string) {
    return apiRequest<void>(`/schedules/${id}/`, { method: "DELETE" }, token)
  },
  generateMonthlyReport(month: string, token: string) {
    return apiRequest<MonthlyScheduleReportResponse>(
      "/schedules/generate-monthly-report/",
      {
        method: "POST",
        body: JSON.stringify({ month }),
      },
      token
    )
  },
  getEmailBlastPermission(token: string) {
    return apiRequest<EmailBlastPermissionState>("/schedules/email-blast-permission/", {}, token)
  },
  sendEmailBlast(mode: EmailBlastMode, token: string) {
    return apiRequest<EmailBlastResponse>(
      "/schedules/email-blast/",
      {
        method: "POST",
        body: JSON.stringify({ mode }),
      },
      token
    )
  },
}

export const requestsApi = {
  list(queryInput: RequestListQuery, token: string) {
    const query = buildRequestListQuery(queryInput)
    return apiRequest<PaginatedResponse<ScheduleRequest>>(`/requests/${query}`, {}, token)
  },
  calendarPagination(queryInput: RequestCalendarPaginationQuery, token: string) {
    const query = buildRequestCalendarPaginationQuery(queryInput)
    return apiRequest<RequestCalendarPaginationResponse>(`/requests/calendar-pagination/${query}`, {}, token)
  },
  approve(id: number, token: string) {
    return apiRequest<ScheduleRequest>(`/requests/${id}/approve/`, { method: "POST" }, token)
  },
  reject(id: number, token: string) {
    return apiRequest<ScheduleRequest>(`/requests/${id}/reject/`, { method: "POST" }, token)
  },
}

export const attendanceApi = {
  list(filters: DateFilters, page: number, pageSize: number, token: string) {
    const query = buildListQuery(filters, page, pageSize)
    return apiRequest<PaginatedResponse<Attendance>>(`/attendance/${query}`, {}, token)
  },
  create(formData: FormData, token: string) {
    return apiRequest<Attendance>("/attendance/", { method: "POST", body: formData }, token)
  },
  update(id: number, formData: FormData, token: string) {
    return apiRequest<Attendance>(`/attendance/${id}/`, {
      method: "PATCH",
      body: formData,
    }, token)
  },
}
