export type Role = "admin" | "tutor"

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
  scheduled_at: string
  status: "upcoming" | "done" | "cancelled" | "rescheduled"
  check_in_id: number | null
  check_out_id: number | null
  check_in_detail: {
    id: number
    time: string
    location: string
    photo: string | null
  } | null
  check_out_detail: {
    id: number
    time: string
    photo: string | null
  } | null
}

export type Attendance = {
  check_in_id: number
  tutor: number
  student: number
  check_in_time: string
  check_in_location: string
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

export type DateFilters = {
  tutorId: string
  studentId: string
  startDate: string
  endDate: string
}

export type ScheduleStatusFilter = "" | Schedule["status"]

export type ScheduleSortBy = "id" | "scheduled_at" | "status"

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

export type Student = {
  id: number
  first_name: string
  last_name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateUserPayload = {
  username: string
  first_name: string
  last_name: string
  email: string
  password: string
  is_active: boolean
}

export type UpdateUserPayload = Partial<CreateUserPayload>

export type SaveSchedulePayload = {
  tutor: number
  student: number
  subject_topic: string
  scheduled_at: string
  status: Schedule["status"]
}

export type MonthlyScheduleReportResponse = {
  detail: string
  sheet_url: string
  sheet_id: string
  month: string
}

export type SaveStudentPayload = {
  first_name: string
  last_name: string
  is_active: boolean
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000/api"

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
  if (query.status) {
    params.set("status", query.status)
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
  if (query.status) {
    params.set("status", query.status)
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
  update(id: number, payload: SaveSchedulePayload, token: string) {
    return apiRequest<Schedule>(`/schedules/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }, token)
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
