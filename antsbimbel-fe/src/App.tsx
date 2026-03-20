import { useEffect, useMemo, useRef, useState } from "react"
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Camera,
  Check,
  ChevronsUpDown,
  ClipboardList,
  LogOut,
  MapPin,
  Pencil,
  ShieldUser,
  Trash2,
  UserRound,
} from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type ApiUser,
  attendanceApi,
  authApi,
  type Attendance,
  type DateFilters,
  DEFAULT_FILTERS,
  parseApiError,
  schedulesApi,
  type Schedule,
  type Session,
  studentsApi,
  type Student,
  usersApi,
} from "@/lib/api"
import { cn } from "@/lib/utils"

type DashboardTab = "users" | "students" | "schedules" | "attendance"
type CalendarMode = "month" | "week"

type CalendarItem = {
  id: string
  title: string
  subtitle: string
  date: Date
}

const SESSION_STORAGE_KEY = "antsbimbel_session"

function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString()
}

function toDateInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toTimeInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

function toScheduledAtIso(datePart: string, timePart: string): string {
  const localDateTime = new Date(`${datePart}T${timePart}`)
  if (Number.isNaN(localDateTime.getTime())) {
    return ""
  }

  return localDateTime.toISOString()
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
      const payload = await authApi.login(username, password)
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

function TutorCombobox({
  tutors,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  tutors: ApiUser[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selectedTutor = tutors.find((tutor) => String(tutor.id) === value)
  const filteredTutors = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return tutors
    }

    return tutors.filter((tutor) => {
      const fullName = `${tutor.first_name} ${tutor.last_name}`.trim()
      return (
        String(tutor.id).includes(normalized) ||
        tutor.username.toLowerCase().includes(normalized) ||
        fullName.toLowerCase().includes(normalized) ||
        tutor.email.toLowerCase().includes(normalized)
      )
    })
  }, [query, tutors])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between"
        >
          <span className="truncate text-left">
            {selectedTutor
              ? `${selectedTutor.username} (#${selectedTutor.id})`
              : (placeholder ?? "Select tutor")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tutor..."
          className="h-9"
        />
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
          {filteredTutors.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No tutor found.</p>
          ) : (
            filteredTutors.map((tutor) => {
              const fullName = `${tutor.first_name} ${tutor.last_name}`.trim()
              const isSelected = String(tutor.id) === value

              return (
                <button
                  key={tutor.id}
                  type="button"
                  onClick={() => {
                    onChange(String(tutor.id))
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {tutor.username} {fullName ? `(${fullName})` : ""}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">#{tutor.id}</span>
                  </span>
                  {isSelected ? <Check className="size-4" /> : null}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function StudentCombobox({
  students,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  students: Student[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selectedStudent = students.find((student) => student.student_id === value)
  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return students
    }

    return students.filter((student) => {
      return (
        student.student_id.toLowerCase().includes(normalized) ||
        student.full_name.toLowerCase().includes(normalized)
      )
    })
  }, [query, students])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between"
        >
          <span className="truncate text-left">
            {selectedStudent
              ? `${selectedStudent.student_id} (${selectedStudent.full_name})`
              : (placeholder ?? "Select student")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search student..."
          className="h-9"
        />
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
          {filteredStudents.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No student found.</p>
          ) : (
            filteredStudents.map((student) => {
              const isSelected = student.student_id === value

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => {
                    onChange(student.student_id)
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{student.student_id}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {student.full_name}
                    </span>
                  </span>
                  {isSelected ? <Check className="size-4" /> : null}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DatePickerInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
}) {
  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-9 w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarDays className="mr-2 size-4" />
          {value ? format(new Date(`${value}T00:00:00`), "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(nextDate) => onChange(nextDate ? format(nextDate, "yyyy-MM-dd") : "")}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

function DateFilterPanel({
  value,
  onChange,
  showTutor,
  lockedTutorId,
  tutors,
  students,
  canPickStudent,
}: {
  value: DateFilters
  onChange: (next: DateFilters) => void
  showTutor: boolean
  lockedTutorId?: number
  tutors: ApiUser[]
  students?: Student[]
  canPickStudent?: boolean
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/70 p-3 md:grid-cols-4">
      {showTutor ? (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tutor ID</span>
          <TutorCombobox
            tutors={tutors}
            value={value.tutorId}
            onChange={(nextTutorId) => onChange({ ...value, tutorId: nextTutorId })}
            placeholder="Select tutor"
          />
        </label>
      ) : (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tutor ID</span>
          <Input
            disabled
            value={String(lockedTutorId ?? "")}
            className="h-9 w-full bg-muted"
          />
        </label>
      )}

      {canPickStudent ? (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Student ID</span>
          <StudentCombobox
            students={students ?? []}
            value={value.studentId}
            onChange={(nextStudentId) => onChange({ ...value, studentId: nextStudentId })}
            placeholder="Select student"
          />
        </label>
      ) : (
        <label className="space-y-1 text-sm">
          <span className="font-medium">Student ID</span>
          <input
            value={value.studentId}
            onChange={(event) => onChange({ ...value, studentId: event.target.value })}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
            placeholder="e.g. STD001"
          />
        </label>
      )}

      <label className="space-y-1 text-sm">
        <span className="font-medium">Start date</span>
        <DatePickerInput
          value={value.startDate}
          onChange={(nextDate) => onChange({ ...value, startDate: nextDate })}
          placeholder="Select start date"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">End date</span>
        <DatePickerInput
          value={value.endDate}
          onChange={(nextDate) => onChange({ ...value, endDate: nextDate })}
          placeholder="Select end date"
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [createForm, setCreateForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    is_active: true,
  })

  const pageSize = 10

  const fetchUsers = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await usersApi.list(token, page, pageSize)
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
  }, [page])

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      await usersApi.create(createForm, token)
      setIsCreateOpen(false)
      setCreateForm({
        username: "",
        first_name: "",
        last_name: "",
        email: "",
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

  const openEditUser = (user: ApiUser) => {
    setEditingUserId(user.id)
    setEditForm({
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      password: "",
      is_active: user.is_active,
    })
  }

  const cancelEditUser = () => {
    setEditingUserId(null)
    setEditForm({
      username: "",
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      is_active: true,
    })
  }

  const updateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingUserId) {
      return
    }

    setIsEditing(true)
    setError("")

    const payload: Record<string, string | boolean> = {
      username: editForm.username,
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      email: editForm.email,
      is_active: editForm.is_active,
    }

    const password = editForm.password.trim()
    if (password) {
      payload.password = password
    }

    try {
      await usersApi.update(editingUserId, payload, token)
      cancelEditUser()
      await fetchUsers()
    } catch (updateError) {
      setError(parseApiError(updateError))
    } finally {
      setIsEditing(false)
    }
  }

  const deleteUser = async (user: ApiUser) => {
    const shouldDelete = window.confirm(`Delete tutor ${user.username}?`)
    if (!shouldDelete) {
      return
    }

    setError("")
    try {
      await usersApi.remove(user.id, token)
      if (editingUserId === user.id) {
        cancelEditUser()
      }
      await fetchUsers()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Users</h3>
        <Button size="sm" onClick={() => setIsCreateOpen((open) => !open)}>
          {isCreateOpen ? "Close" : "Create tutor"}
        </Button>
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

      {editingUserId ? (
        <form onSubmit={updateUser} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-3">
          <Input
            required
            value={editForm.username}
            onChange={(event) => setEditForm({ ...editForm, username: event.target.value })}
            placeholder="Username"
            className="h-9"
          />
          <Input
            value={editForm.first_name}
            onChange={(event) => setEditForm({ ...editForm, first_name: event.target.value })}
            placeholder="First name"
            className="h-9"
          />
          <Input
            value={editForm.last_name}
            onChange={(event) => setEditForm({ ...editForm, last_name: event.target.value })}
            placeholder="Last name"
            className="h-9"
          />
          <Input
            type="email"
            value={editForm.email}
            onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
            placeholder="Email"
            className="h-9"
          />
          <Input
            type="password"
            value={editForm.password}
            onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
            placeholder="New password (optional)"
            className="h-9"
          />
          <label className="col-span-full flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
            />
            Active user
          </label>
          <div className="col-span-full flex gap-2">
            <Button disabled={isEditing} type="submit">
              {isEditing ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={cancelEditUser}>
              Cancel
            </Button>
          </div>
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
              <th className="px-3 py-2">Actions</th>
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
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditUser(user)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteUser(user)}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={7}>
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

function StudentsSection({ token }: { token: string }) {
  const [students, setStudents] = useState<Student[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null)
  const [createForm, setCreateForm] = useState({
    full_name: "",
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    full_name: "",
    is_active: true,
  })

  const pageSize = 10

  const fetchStudents = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await studentsApi.list(token, page, pageSize)
      setStudents(response.results)
      setTotal(response.count)
    } catch (fetchError) {
      setError(parseApiError(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const createStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      await studentsApi.create(createForm, token)
      setIsCreateOpen(false)
      setCreateForm({
        full_name: "",
        is_active: true,
      })
      await fetchStudents()
    } catch (createError) {
      setError(parseApiError(createError))
    } finally {
      setCreating(false)
    }
  }

  const openEditStudent = (student: Student) => {
    setEditingStudentId(student.id)
    setEditForm({
      full_name: student.full_name,
      is_active: student.is_active,
    })
  }

  const cancelEditStudent = () => {
    setEditingStudentId(null)
    setEditForm({
      full_name: "",
      is_active: true,
    })
  }

  const updateStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingStudentId) {
      return
    }

    setIsEditing(true)
    setError("")

    try {
      await studentsApi.update(editingStudentId, editForm, token)
      cancelEditStudent()
      await fetchStudents()
    } catch (updateError) {
      setError(parseApiError(updateError))
    } finally {
      setIsEditing(false)
    }
  }

  const deleteStudent = async (student: Student) => {
    const shouldDelete = window.confirm(`Delete student ${student.student_id}?`)
    if (!shouldDelete) {
      return
    }

    setError("")
    try {
      await studentsApi.remove(student.id, token)
      if (editingStudentId === student.id) {
        cancelEditStudent()
      }
      await fetchStudents()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Students</h3>
        <Button size="sm" onClick={() => setIsCreateOpen((open) => !open)}>
          {isCreateOpen ? "Close" : "Create student"}
        </Button>
      </div>

      {isCreateOpen ? (
        <form onSubmit={createStudent} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <Input
            required
            value={createForm.full_name}
            onChange={(event) => setCreateForm({ ...createForm, full_name: event.target.value })}
            placeholder="Full name"
            className="h-9"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.checked })}
            />
            Active student
          </label>
          <Button className="md:col-span-1" disabled={creating} type="submit">
            {creating ? "Creating..." : "Save new student"}
          </Button>
        </form>
      ) : null}

      {editingStudentId ? (
        <form onSubmit={updateStudent} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <Input
            required
            value={editForm.full_name}
            onChange={(event) => setEditForm({ ...editForm, full_name: event.target.value })}
            placeholder="Full name"
            className="h-9"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
            />
            Active student
          </label>
          <div className="col-span-full flex gap-2">
            <Button disabled={isEditing} type="submit">
              {isEditing ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={cancelEditStudent}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading students...</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Student ID</th>
              <th className="px-3 py-2">Full Name</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-t border-border">
                <td className="px-3 py-2">{student.id}</td>
                <td className="px-3 py-2">{student.student_id}</td>
                <td className="px-3 py-2">{student.full_name}</td>
                <td className="px-3 py-2">{student.is_active ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditStudent(student)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteStudent(student)}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={5}>
                  No students found.
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
  const [tutors, setTutors] = useState<ApiUser[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [calendarSchedules, setCalendarSchedules] = useState<Schedule[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [cameraStatus, setCameraStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [checkInLocation, setCheckInLocation] = useState("")
  const [activeCaptureSchedule, setActiveCaptureSchedule] = useState<Schedule | null>(null)
  const [captureMode, setCaptureMode] = useState<"check-in" | "check-out" | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null)
  const [isSubmittingCapture, setIsSubmittingCapture] = useState(false)
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

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
      const listResponse = await schedulesApi.list(filters, page, pageSize, token)
      const calendarResponse = await schedulesApi.list(filters, 1, 100, token)

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

  useEffect(() => {
    if (tutorId) {
      return
    }

    const fetchTutors = async () => {
      try {
        const response = await usersApi.list(token, 1, 100)
        setTutors(response.results)
      } catch {
        // Fallback to empty options if tutor fetch fails.
      }
    }

    void fetchTutors()
  }, [token, tutorId])

  useEffect(() => {
    if (!canManage) {
      return
    }

    const fetchStudents = async () => {
      try {
        const response = await studentsApi.list(token, 1, 100)
        setStudents(response.results)
      } catch {
        // Fallback to empty options if student fetch fails.
      }
    }

    void fetchStudents()
  }, [canManage, token])

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      if (capturedPhotoUrl) {
        URL.revokeObjectURL(capturedPhotoUrl)
      }
    }
  }, [capturedPhotoUrl])

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
      scheduled_at: schedule.scheduled_at,
      status: schedule.status,
    })
    setIsFormOpen(true)
  }

  const updateScheduledDate = (nextDate: string) => {
    const timePart = toTimeInputValue(formState.scheduled_at) || "00:00"
    const nextScheduledAt = nextDate ? toScheduledAtIso(nextDate, timePart) : ""
    setFormState({ ...formState, scheduled_at: nextScheduledAt })
  }

  const updateScheduledTime = (nextTime: string) => {
    const datePart = toDateInputValue(formState.scheduled_at)
    const nextScheduledAt = datePart && nextTime ? toScheduledAtIso(datePart, nextTime) : ""
    setFormState({ ...formState, scheduled_at: nextScheduledAt })
  }

  const saveSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formState.tutor_id) {
      setError("Please select a tutor.")
      return
    }
    if (!formState.student_id.trim()) {
      setError("Please select a student.")
      return
    }
    const scheduledDate = toDateInputValue(formState.scheduled_at)
    const scheduledTime = toTimeInputValue(formState.scheduled_at)

    if (!scheduledDate || !scheduledTime) {
      setError("Please select schedule date and time.")
      return
    }

    if (!formState.scheduled_at) {
      setError("Invalid schedule date or time.")
      return
    }

    setIsSaving(true)
    setError("")

    const payload = {
      tutor_id: Number(formState.tutor_id),
      student_id: formState.student_id,
      subject_topic: formState.subject_topic,
      scheduled_at: formState.scheduled_at,
      status: formState.status,
    }

    try {
      if (editing) {
        await schedulesApi.update(editing.id, payload, token)
      } else {
        await schedulesApi.create(payload, token)
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
      await schedulesApi.remove(id, token)
      await fetchSchedules()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
    }
  }

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop())
    cameraStreamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  const requestCurrentLocation = async () => {
    const isBrowser = typeof window !== "undefined"
    if (!isBrowser || !("geolocation" in navigator)) {
      setLocationStatus("denied")
      return
    }

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationStatus("granted")
          setCheckInLocation(`${position.coords.latitude}, ${position.coords.longitude}`)
          resolve()
        },
        () => {
          setLocationStatus("denied")
          resolve()
        }
      )
    })
  }

  const startCamera = async () => {
    if (!("mediaDevices" in navigator)) {
      setCameraStatus("denied")
      return false
    }

    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
      })
      cameraStreamRef.current = stream
      setCameraStatus("granted")

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      return true
    } catch {
      setCameraStatus("denied")
      return false
    }
  }

  const openCaptureDialog = async (mode: "check-in" | "check-out", schedule: Schedule) => {
    setError("")
    setActiveCaptureSchedule(schedule)
    setCaptureMode(mode)
    setCapturedPhoto(null)
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl)
      setCapturedPhotoUrl(null)
    }

    const hasCamera = await startCamera()
    if (!hasCamera) {
      setError("Camera permission is required to continue.")
      return
    }

    if (mode === "check-in") {
      await requestCurrentLocation()
    }
  }

  const closeCaptureDialog = () => {
    stopCamera()
    setActiveCaptureSchedule(null)
    setCaptureMode(null)
    setCapturedPhoto(null)
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl)
      setCapturedPhotoUrl(null)
    }
  }

  const captureFromCamera = () => {
    if (!videoRef.current || !canvasRef.current) {
      setError("Unable to access camera preview.")
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const context = canvas.getContext("2d")
    if (!context) {
      setError("Unable to capture photo from camera.")
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob: Blob | null) => {
        if (!blob) {
          setError("Failed to generate captured image.")
          return
        }

        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" })
        setCapturedPhoto(file)
        if (capturedPhotoUrl) {
          URL.revokeObjectURL(capturedPhotoUrl)
        }
        setCapturedPhotoUrl(URL.createObjectURL(file))
      },
      "image/jpeg",
      0.92
    )
  }

  const submitCapturedAttendance = async () => {
    if (!activeCaptureSchedule || !captureMode) {
      return
    }
    if (!capturedPhoto) {
      setError("Please capture a photo first.")
      return
    }

    setError("")
    setIsSubmittingCapture(true)

    try {
      if (captureMode === "check-in") {
        if (!checkInLocation.trim()) {
          setError("Location is required for check-in.")
          return
        }

        const formData = new FormData()
        formData.append("schedule_id", String(activeCaptureSchedule.id))
        formData.append("student_id", activeCaptureSchedule.student_id)
        formData.append("check_in_location", checkInLocation.trim())
        formData.append("check_in_photo", capturedPhoto)
        formData.append("check_in_time", new Date().toISOString())
        await attendanceApi.create(formData, token)
      } else {
        if (!activeCaptureSchedule.check_in_id) {
          setError("Check-in record is missing for this schedule.")
          return
        }

        const formData = new FormData()
        formData.append("check_out_time", new Date().toISOString())
        formData.append("check_out_photo", capturedPhoto)
        await attendanceApi.update(activeCaptureSchedule.check_in_id, formData, token)
      }

      closeCaptureDialog()
      await fetchSchedules()
    } catch (submitError) {
      setError(parseApiError(submitError))
    } finally {
      setIsSubmittingCapture(false)
    }
  }

  const calendarItems = useMemo<CalendarItem[]>(
    () =>
      calendarSchedules.map((schedule) => ({
        id: `schedule-${schedule.id}`,
        title: `${schedule.student_id} • ${schedule.subject_topic}`,
        subtitle: `Tutor ${schedule.tutor_id} • ${schedule.status} • CI ${schedule.check_in_id ? "exist" : "none"} • CO ${schedule.check_out_id ? "exist" : "none"}`,
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
        tutors={tutors}
        students={students}
        canPickStudent={canManage}
      />

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading schedules...</p> : null}

      {isFormOpen ? (
        <form onSubmit={saveSchedule} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Tutor ID</span>
            {tutorId ? (
              <Input disabled value={formState.tutor_id} className="h-9 w-full bg-muted" />
            ) : (
              <TutorCombobox
                tutors={tutors}
                value={formState.tutor_id}
                onChange={(nextTutorId) => setFormState({ ...formState, tutor_id: nextTutorId })}
                placeholder="Select tutor"
              />
            )}
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Student ID</span>
            {canManage ? (
              <StudentCombobox
                students={students}
                value={formState.student_id}
                onChange={(nextStudentId) => setFormState({ ...formState, student_id: nextStudentId })}
                placeholder="Select student"
              />
            ) : (
              <input
                required
                value={formState.student_id}
                onChange={(event) => setFormState({ ...formState, student_id: event.target.value })}
                className="h-9 w-full rounded-lg border border-border px-3 text-sm"
              />
            )}
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
            <span className="font-medium">Scheduled date</span>
            <DatePickerInput
              value={toDateInputValue(formState.scheduled_at)}
              onChange={updateScheduledDate}
              placeholder="Select schedule date"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Scheduled time</span>
            <input
              required
              type="time"
              step={60}
              value={toTimeInputValue(formState.scheduled_at)}
              onChange={(event) => updateScheduledTime(event.target.value)}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Status</span>
            <Select
              value={formState.status}
              onValueChange={(nextStatus) =>
                setFormState({ ...formState, status: nextStatus as Schedule["status"] })
              }
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="rescheduled">Rescheduled</SelectItem>
              </SelectContent>
            </Select>
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
              <th className="px-3 py-2">Check In</th>
              <th className="px-3 py-2">Check Out</th>
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
                <td className="px-3 py-2">
                  {canManage ? (
                    schedule.check_in_id ? "Exist" : "Not yet"
                  ) : schedule.check_in_id ? (
                    "Exist"
                  ) : (
                    <Button size="sm" onClick={() => void openCaptureDialog("check-in", schedule)}>
                      Check in
                    </Button>
                  )}
                </td>
                <td className="px-3 py-2">
                  {canManage ? (
                    schedule.check_out_id ? "Exist" : "Not yet"
                  ) : schedule.check_out_id ? (
                    "Exist"
                  ) : schedule.check_in_id ? (
                    <Button size="sm" variant="outline" onClick={() => void openCaptureDialog("check-out", schedule)}>
                      Check out
                    </Button>
                  ) : (
                    "Check in first"
                  )}
                </td>
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
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={canManage ? 9 : 8}>
                  No schedules found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {!canManage && activeCaptureSchedule && captureMode ? (
        <section className="space-y-3 rounded-xl border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold capitalize">
              {captureMode} for schedule #{activeCaptureSchedule.id}
            </h4>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-1">Camera: {cameraStatus}</span>
              {captureMode === "check-in" ? (
                <span className="rounded-full bg-muted px-2 py-1">Location: {locationStatus}</span>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Capture a live photo using camera. File upload is disabled for this action.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <video ref={videoRef} autoPlay muted playsInline className="w-full rounded-lg border border-border bg-black/80" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void startCamera()}>
                  Restart camera
                </Button>
                <Button type="button" onClick={captureFromCamera}>
                  Capture photo
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {capturedPhotoUrl ? (
                <img
                  src={capturedPhotoUrl}
                  alt="Captured attendance"
                  className="w-full rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  No photo captured yet.
                </div>
              )}

              {captureMode === "check-in" ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      required
                      value={checkInLocation}
                      onChange={(event) => setCheckInLocation(event.target.value)}
                      placeholder="Latitude, Longitude"
                      className="h-9"
                    />
                    <Button type="button" variant="outline" onClick={() => void requestCurrentLocation()}>
                      <MapPin className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={isSubmittingCapture}
                  onClick={() => void submitCapturedAttendance()}
                >
                  {isSubmittingCapture ? "Submitting..." : captureMode === "check-in" ? "Submit check in" : "Submit check out"}
                </Button>
                <Button type="button" variant="outline" onClick={closeCaptureDialog}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
  const [tutors, setTutors] = useState<ApiUser[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [tutorSchedules, setTutorSchedules] = useState<Schedule[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [calendarAttendance, setCalendarAttendance] = useState<Attendance[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [cameraStatus, setCameraStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "denied">("idle")

  const [checkInScheduleId, setCheckInScheduleId] = useState("")
  const [checkInStudentId, setCheckInStudentId] = useState("")
  const [checkInLocation, setCheckInLocation] = useState("")
  const [checkInPhoto, setCheckInPhoto] = useState<File | null>(null)
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false)

  const [checkoutAttendanceId, setCheckoutAttendanceId] = useState("")
  const [checkOutPhoto, setCheckOutPhoto] = useState<File | null>(null)
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false)

  const pageSize = 10
  const isTutor = user.role === "tutor"
  const availableTutorSchedules = tutorSchedules.filter((schedule) => schedule.check_in_id === null)
  const selectedTutorSchedule = tutorSchedules.find(
    (schedule) => String(schedule.id) === checkInScheduleId
  )

  const fetchTutorSchedulesForCheckIn = async () => {
    if (!isTutor) {
      return
    }

    try {
      const response = await schedulesApi.list(
        { ...DEFAULT_FILTERS, tutorId: String(user.id) },
        1,
        100,
        token
      )
      setTutorSchedules(response.results)
    } catch {
      setTutorSchedules([])
    }
  }

  const fetchAttendance = async () => {
    setLoading(true)
    setError("")
    try {
      const fixedFilters = isTutor ? { ...filters, tutorId: String(user.id) } : filters
      const listResponse = await attendanceApi.list(fixedFilters, page, pageSize, token)
      const calendarResponse = await attendanceApi.list(fixedFilters, 1, 100, token)

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

  useEffect(() => {
    if (isTutor) {
      return
    }

    const fetchTutors = async () => {
      try {
        const response = await usersApi.list(token, 1, 100)
        setTutors(response.results)
      } catch {
        // Fallback to empty options if tutor fetch fails.
      }
    }

    void fetchTutors()
  }, [isTutor, token])

  useEffect(() => {
    void fetchTutorSchedulesForCheckIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTutor, token, user.id])

  useEffect(() => {
    if (!selectedTutorSchedule) {
      setCheckInStudentId("")
      return
    }

    setCheckInStudentId(selectedTutorSchedule.student_id)
  }, [selectedTutorSchedule])

  useEffect(() => {
    if (isTutor) {
      return
    }

    const fetchStudents = async () => {
      try {
        const response = await studentsApi.list(token, 1, 100)
        setStudents(response.results)
      } catch {
        // Fallback to empty options if student fetch fails.
      }
    }

    void fetchStudents()
  }, [isTutor, token])

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
    if (!checkInScheduleId) {
      setError("Please select a schedule first.")
      return
    }
    if (!checkInPhoto) {
      setError("Check-in photo is required.")
      return
    }

    setError("")
    setIsSubmittingCheckIn(true)

    const formData = new FormData()
    formData.append("schedule_id", checkInScheduleId)
    formData.append("student_id", checkInStudentId)
    formData.append("check_in_location", checkInLocation)
    formData.append("check_in_photo", checkInPhoto)
    formData.append("check_in_time", new Date().toISOString())

    try {
      await attendanceApi.create(formData, token)
      setCheckInScheduleId("")
      setCheckInStudentId("")
      setCheckInPhoto(null)
      await fetchTutorSchedulesForCheckIn()
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
      await attendanceApi.update(Number(checkoutAttendanceId), formData, token)
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
        tutors={tutors}
        students={students}
        canPickStudent={!isTutor}
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
            <select
              required
              value={checkInScheduleId}
              onChange={(event) => setCheckInScheduleId(event.target.value)}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            >
              <option value="">Select schedule</option>
              {availableTutorSchedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  #{schedule.id} | {schedule.student_id} | {formatDateTime(schedule.scheduled_at)}
                </option>
              ))}
            </select>
            <input
              required
              readOnly
              value={checkInStudentId}
              placeholder="Student ID"
              className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm"
            />
            {availableTutorSchedules.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                All schedules already have check-in records, or no schedules are available yet.
              </p>
            ) : null}
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
              Tutors
            </Button>
          ) : null}
          {isAdmin ? (
            <Button
              variant={activeTab === "students" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("students")}
            >
              <UserRound className="size-4" />
              Students
            </Button>
          ) : null}
          <Button
            variant={activeTab === "schedules" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("schedules")}
          >
            <CalendarCheck className="size-4" />
            Schedules
          </Button>
          {isAdmin ? (
            <Button
              variant={activeTab === "attendance" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("attendance")}
            >
              <ClipboardList className="size-4" />
              Attendance
            </Button>
          ) : null}
        </nav>

        {activeTab === "users" && isAdmin ? <UsersSection token={session.token} /> : null}
        {activeTab === "students" && isAdmin ? <StudentsSection token={session.token} /> : null}
        {activeTab === "schedules" ? (
          <SchedulesSection token={session.token} canManage={isAdmin} tutorId={isAdmin ? undefined : session.user.id} />
        ) : null}
        {isAdmin && activeTab === "attendance" ? (
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
        await authApi.logout(session.token)
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
