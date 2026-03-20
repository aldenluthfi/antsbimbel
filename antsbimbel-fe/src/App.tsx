import { useEffect, useMemo, useState } from "react"
import { CalendarClock, Camera, LogOut, MapPin, ShieldUser, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Role = "admin" | "tutor"
type DashboardTab = "users" | "schedules" | "attendance"
type CalendarMode = "month" | "week"

type ApiUser = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_active: boolean
  role: Role
}

type Schedule = {
  id: number
  tutor_id: number
  student_id: string
  subject_topic: string
  scheduled_at: string
  status: "upcoming" | "done" | "cancelled" | "rescheduled"
}

type Attendance = {
  check_in_id: number
  tutor_id: number
  student_id: string
  check_in_time: string
  check_in_location: string
  check_in_photo: string
  check_out_id: number | null
  total_shift_time: string | null
}

type PaginatedResponse<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

type Session = {
  token: string
  user: ApiUser
}

type DateFilters = {
  tutorId: string
  studentId: string
  startDate: string
  endDate: string
}

type CalendarItem = {
  id: string
  title: string
  subtitle: string
  date: Date
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000/api"
const SESSION_STORAGE_KEY = "antsbimbel_session"
const DEFAULT_FILTERS: DateFilters = { tutorId: "", studentId: "", startDate: "", endDate: "" }

function parseApiError(error: unknown): string {
  if (typeof error === "string") {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Something went wrong."
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
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

function buildListQuery(filters: DateFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams()
  params.set("page", String(page))
  params.set("page_size", String(pageSize))

  if (filters.tutorId.trim()) {
    params.set("tutor_id", filters.tutorId.trim())
  }
  if (filters.studentId.trim()) {
    params.set("student_id", filters.studentId.trim())
  }
  if (filters.startDate) {
    params.set("start_date", filters.startDate)
  }
  if (filters.endDate) {
    params.set("end_date", filters.endDate)
  }

  return `?${params.toString()}`
}

function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString()
}

function startOfWeek(date: Date): Date {
  const next = new Date(date)
  const day = next.getDay()
  next.setDate(next.getDate() - day)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfWeek(date: Date): Date {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  next.setHours(23, 59, 59, 999)
  return next
}

function startOfMonthGrid(date: Date): Date {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  return startOfWeek(first)
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)
    try {
      const payload = await apiRequest<Session>("/auth/login/", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      })
      onLogin(payload)
    } catch (submissionError) {
      setError(parseApiError(submissionError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-[radial-gradient(circle_at_15%_20%,rgba(240,210,120,0.26),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(42,132,122,0.28),transparent_55%)] p-4 md:p-10">
      <section className="w-full max-w-md rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg backdrop-blur md:p-8">
        <p className="mb-2 text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          ANTS BIMBEL
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Staff Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in using your admin or tutor account to access schedules and attendance.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Username</span>
            <input
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  )
}

function DateFilterPanel({
  value,
  onChange,
  showTutor,
  lockedTutorId,
}: {
  value: DateFilters
  onChange: (next: DateFilters) => void
  showTutor: boolean
  lockedTutorId?: number
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-3 md:grid-cols-4">
      {showTutor ? (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tutor ID</span>
          <input
            value={value.tutorId}
            onChange={(event) => onChange({ ...value, tutorId: event.target.value })}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
            placeholder="e.g. 5"
          />
        </label>
      ) : (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tutor ID</span>
          <input
            disabled
            value={String(lockedTutorId ?? "")}
            className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm"
          />
        </label>
      )}

      <label className="space-y-1 text-sm">
        <span className="font-medium">Student ID</span>
        <input
          value={value.studentId}
          onChange={(event) => onChange({ ...value, studentId: event.target.value })}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
          placeholder="e.g. STD001"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">Start date</span>
        <input
          type="date"
          value={value.startDate}
          onChange={(event) => onChange({ ...value, startDate: event.target.value })}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">End date</span>
        <input
          type="date"
          value={value.endDate}
          onChange={(event) => onChange({ ...value, endDate: event.target.value })}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </label>
    </div>
  )
}

function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number
  total: number
  pageSize: number
  onPageChange: (nextPage: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Page {page} / {totalPages} ({total} records)
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function CalendarBoard({
  title,
  items,
}: {
  title: string
  items: CalendarItem[]
}) {
  const [mode, setMode] = useState<CalendarMode>("month")
  const [cursorDate, setCursorDate] = useState(new Date())

  const visibleRange = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(cursorDate)
      const end = endOfWeek(cursorDate)
      return { start, end }
    }

    const start = startOfMonthGrid(cursorDate)
    const end = new Date(start)
    end.setDate(end.getDate() + 41)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }, [mode, cursorDate])

  const visibleItems = items.filter(
    (item) => item.date >= visibleRange.start && item.date <= visibleRange.end
  )

  const move = (direction: "next" | "prev") => {
    const amount = direction === "next" ? 1 : -1
    if (mode === "week") {
      const next = new Date(cursorDate)
      next.setDate(next.getDate() + amount * 7)
      setCursorDate(next)
      return
    }
    setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + amount, 1))
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold">{title}</h4>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={mode === "month" ? "default" : "outline"} onClick={() => setMode("month")}>
            Month
          </Button>
          <Button size="sm" variant={mode === "week" ? "default" : "outline"} onClick={() => setMode("week")}>
            Week
          </Button>
          <Button size="sm" variant="outline" onClick={() => move("prev")}>
            Prev
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursorDate(new Date())}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => move("next")}>
            Next
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {mode === "month"
          ? cursorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
          : `${visibleRange.start.toLocaleDateString()} - ${visibleRange.end.toLocaleDateString()}`}
      </p>

      <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
        {weekDays.map((day) => (
          <div key={day} className="rounded-md bg-muted px-2 py-1 text-center">
            {day}
          </div>
        ))}
      </div>

      {mode === "month" ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 42 }).map((_, index) => {
            const day = new Date(visibleRange.start)
            day.setDate(day.getDate() + index)
            const dayItems = visibleItems.filter((item) => sameDate(item.date, day))
            const inCurrentMonth = day.getMonth() === cursorDate.getMonth()

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-24 rounded-lg border border-border p-2",
                  inCurrentMonth ? "bg-card" : "bg-muted/40"
                )}
              >
                <p className="mb-1 text-xs font-semibold">{day.getDate()}</p>
                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-md bg-primary/10 px-1.5 py-1 text-[11px] leading-tight">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground">{item.subtitle}</p>
                    </div>
                  ))}
                  {dayItems.length > 3 ? (
                    <p className="text-[11px] text-muted-foreground">+{dayItems.length - 3} more</p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => {
            const day = new Date(visibleRange.start)
            day.setDate(day.getDate() + index)
            const dayItems = visibleItems.filter((item) => sameDate(item.date, day))

            return (
              <div key={day.toISOString()} className="rounded-lg border border-border bg-card p-2">
                <p className="mb-2 text-xs font-semibold">
                  {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                </p>
                <div className="space-y-1">
                  {dayItems.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No events</p>
                  ) : null}
                  {dayItems.map((item) => (
                    <div key={item.id} className="rounded-md bg-primary/10 px-1.5 py-1 text-[11px] leading-tight">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground">{item.subtitle}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function UsersSection({ token }: { token: string }) {
  const [users, setUsers] = useState<ApiUser[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [roleFilter, setRoleFilter] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    role: "tutor" as Role,
    password: "",
    is_active: true,
  })

  const pageSize = 10

  const fetchUsers = async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("page_size", String(pageSize))
      if (roleFilter) {
        params.set("role", roleFilter)
      }

      const response = await apiRequest<PaginatedResponse<ApiUser>>(`/users/?${params.toString()}`, {}, token)
      setUsers(response.results)
      setTotal(response.count)
    } catch (fetchError) {
      setError(parseApiError(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, roleFilter])

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      await apiRequest<ApiUser>(
        "/users/",
        {
          method: "POST",
          body: JSON.stringify(createForm),
        },
        token
      )
      setIsCreateOpen(false)
      setCreateForm({
        username: "",
        first_name: "",
        last_name: "",
        email: "",
        role: "tutor",
        password: "",
        is_active: true,
      })
      await fetchUsers()
    } catch (createError) {
      setError(parseApiError(createError))
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Users</h3>
        <div className="flex gap-2">
          <select
            value={roleFilter}
            onChange={(event) => {
              setPage(1)
              setRoleFilter(event.target.value)
            }}
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="tutor">Tutor</option>
          </select>
          <Button size="sm" onClick={() => setIsCreateOpen((open) => !open)}>
            {isCreateOpen ? "Close" : "Create user"}
          </Button>
        </div>
      </div>

      {isCreateOpen ? (
        <form onSubmit={createUser} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-3">
          <input
            required
            value={createForm.username}
            onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })}
            placeholder="Username"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            value={createForm.first_name}
            onChange={(event) => setCreateForm({ ...createForm, first_name: event.target.value })}
            placeholder="First name"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            value={createForm.last_name}
            onChange={(event) => setCreateForm({ ...createForm, last_name: event.target.value })}
            placeholder="Last name"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            type="email"
            value={createForm.email}
            onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
            placeholder="Email"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            required
            type="password"
            value={createForm.password}
            onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
            placeholder="Password"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <select
            value={createForm.role}
            onChange={(event) => setCreateForm({ ...createForm, role: event.target.value as Role })}
            className="h-9 rounded-lg border border-border px-3 text-sm"
          >
            <option value="tutor">Tutor</option>
            <option value="admin">Admin</option>
          </select>
          <label className="col-span-full flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.checked })}
            />
            Active user
          </label>
          <Button className="md:col-span-1" disabled={creating} type="submit">
            {creating ? "Creating..." : "Save new user"}
          </Button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading users...</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border">
                <td className="px-3 py-2">{user.id}</td>
                <td className="px-3 py-2">{user.username}</td>
                <td className="px-3 py-2">
                  {user.first_name} {user.last_name}
                </td>
                <td className="px-3 py-2 capitalize">{user.role}</td>
                <td className="px-3 py-2">{user.email || "-"}</td>
                <td className="px-3 py-2">{user.is_active ? "Yes" : "No"}</td>
              </tr>
            ))}
            {users.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={6}>
                  No users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
    </section>
  )
}

function SchedulesSection({
  token,
  canManage,
  tutorId,
}: {
  token: string
  canManage: boolean
  tutorId?: number
}) {
  const [filters, setFilters] = useState<DateFilters>(
    tutorId ? { ...DEFAULT_FILTERS, tutorId: String(tutorId) } : DEFAULT_FILTERS
  )
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [calendarSchedules, setCalendarSchedules] = useState<Schedule[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [formState, setFormState] = useState({
    tutor_id: tutorId ? String(tutorId) : "",
    student_id: "",
    subject_topic: "",
    scheduled_at: "",
    status: "upcoming" as Schedule["status"],
  })

  const pageSize = 10

  const fetchSchedules = async () => {
    setLoading(true)
    setError("")

    try {
      const listQuery = buildListQuery(filters, page, pageSize)
      const calendarQuery = buildListQuery(filters, 1, 100)

      const listResponse = await apiRequest<PaginatedResponse<Schedule>>(`/schedules/${listQuery}`, {}, token)
      const calendarResponse = await apiRequest<PaginatedResponse<Schedule>>(
        `/schedules/${calendarQuery}`,
        {},
        token
      )

      setSchedules(listResponse.results)
      setTotal(listResponse.count)
      setCalendarSchedules(calendarResponse.results)
    } catch (fetchError) {
      setError(parseApiError(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchSchedules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters])

  const resetForm = () => {
    setEditing(null)
    setFormState({
      tutor_id: tutorId ? String(tutorId) : "",
      student_id: "",
      subject_topic: "",
      scheduled_at: "",
      status: "upcoming",
    })
  }

  const openCreate = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const openEdit = (schedule: Schedule) => {
    setEditing(schedule)
    setFormState({
      tutor_id: String(schedule.tutor_id),
      student_id: schedule.student_id,
      subject_topic: schedule.subject_topic,
      scheduled_at: schedule.scheduled_at.slice(0, 16),
      status: schedule.status,
    })
    setIsFormOpen(true)
  }

  const saveSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError("")

    const payload = {
      tutor_id: Number(formState.tutor_id),
      student_id: formState.student_id,
      subject_topic: formState.subject_topic,
      scheduled_at: new Date(formState.scheduled_at).toISOString(),
      status: formState.status,
    }

    try {
      if (editing) {
        await apiRequest<Schedule>(
          `/schedules/${editing.id}/`,
          { method: "PATCH", body: JSON.stringify(payload) },
          token
        )
      } else {
        await apiRequest<Schedule>("/schedules/", { method: "POST", body: JSON.stringify(payload) }, token)
      }
      setIsFormOpen(false)
      resetForm()
      await fetchSchedules()
    } catch (saveError) {
      setError(parseApiError(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteSchedule = async (id: number) => {
    const shouldDelete = window.confirm("Delete this schedule?")
    if (!shouldDelete) {
      return
    }

    try {
      await apiRequest<void>(`/schedules/${id}/`, { method: "DELETE" }, token)
      await fetchSchedules()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
    }
  }

  const calendarItems = useMemo<CalendarItem[]>(
    () =>
      calendarSchedules.map((schedule) => ({
        id: `schedule-${schedule.id}`,
        title: `${schedule.student_id} • ${schedule.subject_topic}`,
        subtitle: `Tutor ${schedule.tutor_id} • ${schedule.status}`,
        date: new Date(schedule.scheduled_at),
      })),
    [calendarSchedules]
  )

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Schedules</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Reset filters
          </Button>
          {canManage ? (
            <Button size="sm" onClick={openCreate}>
              Create schedule
            </Button>
          ) : null}
        </div>
      </div>

      <DateFilterPanel
        value={filters}
        onChange={(next) => {
          setPage(1)
          setFilters(tutorId ? { ...next, tutorId: String(tutorId) } : next)
        }}
        showTutor={!tutorId}
        lockedTutorId={tutorId}
      />

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading schedules...</p> : null}

      {isFormOpen ? (
        <form onSubmit={saveSchedule} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Tutor ID</span>
            <input
              required
              disabled={Boolean(tutorId)}
              value={formState.tutor_id}
              onChange={(event) => setFormState({ ...formState, tutor_id: event.target.value })}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Student ID</span>
            <input
              required
              value={formState.student_id}
              onChange={(event) => setFormState({ ...formState, student_id: event.target.value })}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Subject / topic</span>
            <input
              required
              value={formState.subject_topic}
              onChange={(event) => setFormState({ ...formState, subject_topic: event.target.value })}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Scheduled at</span>
            <input
              required
              type="datetime-local"
              value={formState.scheduled_at}
              onChange={(event) => setFormState({ ...formState, scheduled_at: event.target.value })}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Status</span>
            <select
              value={formState.status}
              onChange={(event) =>
                setFormState({ ...formState, status: event.target.value as Schedule["status"] })
              }
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            >
              <option value="upcoming">Upcoming</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
              <option value="rescheduled">Rescheduled</option>
            </select>
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : editing ? "Update schedule" : "Create schedule"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Tutor</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Topic</th>
              <th className="px-3 py-2">Datetime</th>
              <th className="px-3 py-2">Status</th>
              {canManage ? <th className="px-3 py-2">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id} className="border-t border-border">
                <td className="px-3 py-2">{schedule.id}</td>
                <td className="px-3 py-2">{schedule.tutor_id}</td>
                <td className="px-3 py-2">{schedule.student_id}</td>
                <td className="px-3 py-2">{schedule.subject_topic}</td>
                <td className="px-3 py-2">{formatDateTime(schedule.scheduled_at)}</td>
                <td className="px-3 py-2 capitalize">{schedule.status}</td>
                {canManage ? (
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(schedule)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteSchedule(schedule.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {schedules.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={canManage ? 7 : 6}>
                  No schedules found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      <CalendarBoard title="Schedules Calendar" items={calendarItems} />
    </section>
  )
}

function AttendanceSection({
  token,
  user,
}: {
  token: string
  user: ApiUser
}) {
  const [filters, setFilters] = useState<DateFilters>(
    user.role === "tutor" ? { ...DEFAULT_FILTERS, tutorId: String(user.id) } : DEFAULT_FILTERS
  )
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [calendarAttendance, setCalendarAttendance] = useState<Attendance[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [cameraStatus, setCameraStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "denied">("idle")

  const [checkInStudentId, setCheckInStudentId] = useState("")
  const [checkInLocation, setCheckInLocation] = useState("")
  const [checkInPhoto, setCheckInPhoto] = useState<File | null>(null)
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false)

  const [checkoutAttendanceId, setCheckoutAttendanceId] = useState("")
  const [checkOutPhoto, setCheckOutPhoto] = useState<File | null>(null)
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false)

  const pageSize = 10
  const isTutor = user.role === "tutor"

  const fetchAttendance = async () => {
    setLoading(true)
    setError("")
    try {
      const fixedFilters = isTutor ? { ...filters, tutorId: String(user.id) } : filters
      const listQuery = buildListQuery(fixedFilters, page, pageSize)
      const calendarQuery = buildListQuery(fixedFilters, 1, 100)

      const listResponse = await apiRequest<PaginatedResponse<Attendance>>(
        `/attendance/${listQuery}`,
        {},
        token
      )
      const calendarResponse = await apiRequest<PaginatedResponse<Attendance>>(
        `/attendance/${calendarQuery}`,
        {},
        token
      )

      setAttendance(listResponse.results)
      setTotal(listResponse.count)
      setCalendarAttendance(calendarResponse.results)
    } catch (fetchError) {
      setError(parseApiError(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAttendance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters])

  const askDevicePermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((track) => track.stop())
      setCameraStatus("granted")
    } catch {
      setCameraStatus("denied")
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationStatus("granted")
        setCheckInLocation(`${position.coords.latitude}, ${position.coords.longitude}`)
      },
      () => {
        setLocationStatus("denied")
      }
    )
  }

  const submitCheckIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!checkInPhoto) {
      setError("Check-in photo is required.")
      return
    }

    setError("")
    setIsSubmittingCheckIn(true)

    const formData = new FormData()
    formData.append("student_id", checkInStudentId)
    formData.append("check_in_location", checkInLocation)
    formData.append("check_in_photo", checkInPhoto)
    formData.append("check_in_time", new Date().toISOString())

    try {
      await apiRequest<Attendance>("/attendance/", { method: "POST", body: formData }, token)
      setCheckInStudentId("")
      setCheckInPhoto(null)
      await fetchAttendance()
    } catch (checkInError) {
      setError(parseApiError(checkInError))
    } finally {
      setIsSubmittingCheckIn(false)
    }
  }

  const submitCheckOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!checkoutAttendanceId) {
      setError("Please select a check-in record to check out.")
      return
    }
    if (!checkOutPhoto) {
      setError("Check-out photo is required.")
      return
    }

    setError("")
    setIsSubmittingCheckout(true)

    const formData = new FormData()
    formData.append("check_out_time", new Date().toISOString())
    formData.append("check_out_photo", checkOutPhoto)

    try {
      await apiRequest<Attendance>(
        `/attendance/${checkoutAttendanceId}/`,
        {
          method: "PATCH",
          body: formData,
        },
        token
      )
      setCheckoutAttendanceId("")
      setCheckOutPhoto(null)
      await fetchAttendance()
    } catch (checkOutError) {
      setError(parseApiError(checkOutError))
    } finally {
      setIsSubmittingCheckout(false)
    }
  }

  const openRecords = attendance.filter((record) => record.check_out_id === null)

  const calendarItems = useMemo<CalendarItem[]>(
    () =>
      calendarAttendance.map((record) => ({
        id: `attendance-${record.check_in_id}`,
        title: `${record.student_id} • Tutor ${record.tutor_id}`,
        subtitle: record.check_out_id ? "Checked out" : "Check-in only",
        date: new Date(record.check_in_time),
      })),
    [calendarAttendance]
  )

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Attendance</h3>
        <Button size="sm" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
          Reset filters
        </Button>
      </div>

      <DateFilterPanel
        value={filters}
        onChange={(next) => {
          setPage(1)
          setFilters(isTutor ? { ...next, tutorId: String(user.id) } : next)
        }}
        showTutor={!isTutor}
        lockedTutorId={isTutor ? user.id : undefined}
      />

      {isTutor ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-3 rounded-xl border border-border bg-background p-3">
            <h4 className="flex items-center gap-2 font-semibold">
              <ShieldUser className="size-4" />
              Device Permissions
            </h4>
            <p className="text-sm text-muted-foreground">
              Tutors should allow camera and location so check-in/check-out records are accepted.
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-muted px-2 py-1">Camera: {cameraStatus}</span>
              <span className="rounded-full bg-muted px-2 py-1">Location: {locationStatus}</span>
            </div>
            <Button size="sm" variant="outline" onClick={askDevicePermissions}>
              Request camera + location
            </Button>
          </section>

          <form onSubmit={submitCheckIn} className="space-y-3 rounded-xl border border-border bg-background p-3">
            <h4 className="flex items-center gap-2 font-semibold">
              <Camera className="size-4" />
              Check In
            </h4>
            <input
              required
              value={checkInStudentId}
              onChange={(event) => setCheckInStudentId(event.target.value)}
              placeholder="Student ID"
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
            <div className="flex gap-2">
              <input
                required
                value={checkInLocation}
                onChange={(event) => setCheckInLocation(event.target.value)}
                placeholder="Latitude, Longitude"
                className="h-9 w-full rounded-lg border border-border px-3 text-sm"
              />
              <Button type="button" size="sm" variant="outline" onClick={askDevicePermissions}>
                <MapPin className="size-4" />
              </Button>
            </div>
            <input
              required
              accept="image/*"
              capture="environment"
              type="file"
              onChange={(event) => setCheckInPhoto(event.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            <Button disabled={isSubmittingCheckIn} type="submit" className="w-full">
              {isSubmittingCheckIn ? "Submitting..." : "Create check-in"}
            </Button>
          </form>

          <form onSubmit={submitCheckOut} className="space-y-3 rounded-xl border border-border bg-background p-3 md:col-span-2">
            <h4 className="font-semibold">Check Out</h4>
            <p className="text-sm text-muted-foreground">
              Select an open check-in record, then attach a checkout photo.
            </p>
            <select
              required
              value={checkoutAttendanceId}
              onChange={(event) => setCheckoutAttendanceId(event.target.value)}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            >
              <option value="">Select open record</option>
              {openRecords.map((record) => (
                <option key={record.check_in_id} value={record.check_in_id}>
                  #{record.check_in_id} | {record.student_id} | {formatDateTime(record.check_in_time)}
                </option>
              ))}
            </select>
            <input
              required
              accept="image/*"
              capture="environment"
              type="file"
              onChange={(event) => setCheckOutPhoto(event.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            <Button disabled={isSubmittingCheckout} type="submit" className="w-full md:w-auto">
              {isSubmittingCheckout ? "Submitting..." : "Submit check-out"}
            </Button>
          </form>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading attendance...</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="px-3 py-2">Check-in ID</th>
              <th className="px-3 py-2">Tutor</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Check in time</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Check out</th>
              <th className="px-3 py-2">Total shift</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((record) => (
              <tr key={record.check_in_id} className="border-t border-border">
                <td className="px-3 py-2">{record.check_in_id}</td>
                <td className="px-3 py-2">{record.tutor_id}</td>
                <td className="px-3 py-2">{record.student_id}</td>
                <td className="px-3 py-2">{formatDateTime(record.check_in_time)}</td>
                <td className="px-3 py-2">{record.check_in_location}</td>
                <td className="px-3 py-2">{record.check_out_id ? `#${record.check_out_id}` : "Pending"}</td>
                <td className="px-3 py-2">{record.total_shift_time ?? "-"}</td>
              </tr>
            ))}
            {attendance.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={7}>
                  No attendance records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      <CalendarBoard title="Attendance Calendar" items={calendarItems} />
    </section>
  )
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const isAdmin = session.user.role === "admin"
  const [activeTab, setActiveTab] = useState<DashboardTab>(isAdmin ? "users" : "schedules")

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_8%_15%,rgba(60,120,230,0.16),transparent_36%),radial-gradient(circle_at_85%_5%,rgba(219,129,66,0.2),transparent_44%),radial-gradient(circle_at_90%_85%,rgba(39,172,130,0.14),transparent_38%)] p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
          <div>
            <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
              ANTS BIMBEL PORTAL
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold md:text-2xl">
              <CalendarClock className="size-5" />
              {isAdmin ? "Admin Dashboard" : "Tutor Dashboard"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Logged in as {session.user.username} ({session.user.role})
            </p>
          </div>

          <Button variant="outline" onClick={onLogout}>
            <LogOut className="size-4" />
            Logout
          </Button>
        </header>

        <nav className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card/70 p-3">
          {isAdmin ? (
            <Button
              variant={activeTab === "users" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("users")}
            >
              <UserRound className="size-4" />
              Users
            </Button>
          ) : null}
          <Button
            variant={activeTab === "schedules" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("schedules")}
          >
            Schedules
          </Button>
          <Button
            variant={activeTab === "attendance" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("attendance")}
          >
            Attendance
          </Button>
        </nav>

        {activeTab === "users" && isAdmin ? <UsersSection token={session.token} /> : null}
        {activeTab === "schedules" ? (
          <SchedulesSection token={session.token} canManage={isAdmin} tutorId={isAdmin ? undefined : session.user.id} />
        ) : null}
        {activeTab === "attendance" ? (
          <AttendanceSection token={session.token} user={session.user} />
        ) : null}
      </div>
    </main>
  )
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const cached = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!cached) {
      return null
    }

    try {
      return JSON.parse(cached) as Session
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [session])

  const logout = async () => {
    if (session?.token) {
      try {
        await apiRequest<{ detail: string }>("/auth/logout/", { method: "POST" }, session.token)
      } catch {
        // Ignore logout API failures and clear local state anyway.
      }
    }
    setSession(null)
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />
  }

  return <Dashboard session={session} onLogout={logout} />
}

export default App
