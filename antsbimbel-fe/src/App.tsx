import { useEffect, useMemo, useRef, useState } from "react"
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronsUpDown,
  LogOut,
  MapPin,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  type DateFilters,
  DEFAULT_FILTERS,
  parseApiError,
  schedulesApi,
  type Schedule,
  type ScheduleSortBy,
  type ScheduleStatusFilter,
  type Session,
  type SortOrder,
  studentsApi,
  type Student,
  usersApi,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { type DateRange } from "react-day-picker"

type DashboardTab = "users" | "students" | "schedules"
type CalendarMode = "month" | "week"

const REPORT_MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

type CalendarItem = {
  id: string
  studentName: string
  tutorName: string
  statusLabel: string
  statusDotClassName: string
  date: Date
  schedule?: Schedule
}

const SESSION_STORAGE_KEY = "antsbimbel_session"
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000/api"
const WIB_TIMEZONE = "Asia/Jakarta"
const WIB_OFFSET_HOURS = 7

function buildAttendancePhotoUrl(checkInId: number, photoKind: "check-in" | "check-out"): string {
  return `${API_BASE}/attendance/${checkInId}/photo/${photoKind}/`
}

function notifySubmitError(error: unknown, title = "Submit failed") {
  toast.error(title, { description: parseApiError(error) })
}

function getWibDateTimeParts(date: Date): {
  year: string
  month: string
  day: string
  hour: string
  minute: string
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: WIB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
  }
}

function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  const { year, month, day, hour, minute } = getWibDateTimeParts(date)
  return `${year}-${month}-${day} ${hour}:${minute} WIB`
}

function displayStudentName(schedule: Schedule): string {
  return schedule.student_name?.trim() || `#${schedule.student}`
}

function displayTutorName(schedule: Schedule): string {
  return schedule.tutor_name?.trim() || `#${schedule.tutor}`
}

function getTutorFullName(tutor: Pick<ApiUser, "id" | "username" | "first_name" | "last_name">): string {
  const fullName = `${tutor.first_name ?? ""} ${tutor.last_name ?? ""}`.trim()
  return fullName || tutor.username || `#${tutor.id}`
}

function getStudentFullName(student: Pick<Student, "id" | "first_name" | "last_name">): string {
  const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()
  return fullName || `#${student.id}`
}

function isSchedulePast(schedule: Schedule): boolean {
  const scheduledTime = new Date(schedule.scheduled_at)
  if (Number.isNaN(scheduledTime.getTime())) {
    return false
  }

  return scheduledTime.getTime() < Date.now()
}

function getScheduleStatusPresentation(schedule: Schedule): {
  label: string
  className: string
} {
  if (schedule.status === "upcoming" && !schedule.check_in_detail) {
    const isPast = isSchedulePast(schedule)

    return {
      label: isPast ? "Need check in" : "Upcoming",
      className: isPast
        ? "bg-red-100 text-red-700 border-red-200"
        : "bg-sky-100 text-sky-700 border-sky-200",
    }
  }

  if (schedule.status === "upcoming" && !schedule.check_out_detail) {
    const isPast = isSchedulePast(schedule)

    return {
      label: isPast ? "Need check out" : "Upcoming",
      className: isPast
        ? "bg-red-100 text-red-700 border-red-200"
        : "bg-sky-100 text-sky-700 border-sky-200",
    }
  }

  if (schedule.status === "cancelled") {
    return {
      label: "Cancelled",
      className: "bg-zinc-100 text-zinc-700 border-zinc-200",
    }
  }

  if (schedule.status === "rescheduled") {
    return {
      label: "Rescheduled",
      className: "bg-amber-100 text-amber-700 border-amber-200",
    }
  }

  if (schedule.status === "done") {
    return {
      label: "Done",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    }
  }

  return {
    label: "Upcoming",
    className: "bg-sky-100 text-sky-700 border-sky-200",
  }
}

function getScheduleStatusDotClass(schedule: Schedule): string {
  if (schedule.status === "upcoming" && (!schedule.check_in_detail || !schedule.check_out_detail)) {
    return isSchedulePast(schedule) ? "bg-red-500" : "bg-sky-500"
  }

  if (schedule.status === "upcoming") {
    return "bg-sky-500"
  }

  if (schedule.status === "cancelled") {
    return "bg-zinc-500"
  }

  if (schedule.status === "rescheduled") {
    return "bg-amber-500"
  }

  if (schedule.status === "done") {
    return "bg-emerald-500"
  }

  return "bg-sky-500"
}

function toDateInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const { year, month, day } = getWibDateTimeParts(date)
  return `${year}-${month}-${day}`
}

function toTimeInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const { hour, minute } = getWibDateTimeParts(date)
  return `${hour}:${minute}`
}

function toScheduledAtIso(datePart: string, timePart: string): string {
  const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const timeMatch = timePart.match(/^(\d{2}):(\d{2})$/)

  if (!dateMatch || !timeMatch) {
    return ""
  }

  const year = Number(dateMatch[1])
  const monthIndex = Number(dateMatch[2]) - 1
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])

  if ([year, monthIndex, day, hour, minute].some((value) => Number.isNaN(value))) {
    return ""
  }

  const utcMillis = Date.UTC(year, monthIndex, day, hour - WIB_OFFSET_HOURS, minute, 0, 0)
  const date = new Date(utcMillis)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return date.toISOString()
}

function toWibCalendarDate(isoDate: string): Date {
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) {
    return new Date()
  }

  const { year, month, day } = getWibDateTimeParts(parsed)
  return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
}

function getCurrentWibDate(): Date {
  return toWibCalendarDate(new Date().toISOString())
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

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function AttendancePhoto({
  token,
  photoUrl,
  alt,
  className,
}: {
  token: string
  photoUrl: string
  alt: string
  className: string
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const shouldFetchAsBlob = /\/api\/attendance\/\d+\/photo\/(check-in|check-out)\//.test(photoUrl)
    if (!shouldFetchAsBlob) {
      setBlobUrl(null)
      setError("")
      return
    }

    const controller = new AbortController()
    let objectUrl: string | null = null

    const load = async () => {
      setError("")
      try {
        const response = await fetch(photoUrl, {
          headers: {
            Authorization: `Token ${token}`,
          },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Image request failed with status ${response.status}`)
        }

        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return
        }
        setError(parseApiError(fetchError))
      }
    }

    void load()

    return () => {
      controller.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [photoUrl, token])

  if (error) {
    return <p className="text-muted-foreground">Failed to load image: {error}</p>
  }

  if (blobUrl) {
    return <img src={blobUrl} alt={alt} className={className} />
  }

  const shouldFetchAsBlob = /\/api\/attendance\/\d+\/photo\/(check-in|check-out)\//.test(photoUrl)
  if (shouldFetchAsBlob) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Loading image...
      </div>
    )
  }

  return <img src={photoUrl} alt={alt} className={className} />
}

function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [, setError] = useState("")

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)
    try {
      const payload = await authApi.login(username, password)
      toast.success("Login successful")
      onLogin(payload)
    } catch (submissionError) {
      setError(parseApiError(submissionError))
      notifySubmitError(submissionError, "Login failed")
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
          <label className="block space-y-2">
            <span className="text-sm font-medium">Username</span>
            <input
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>

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
      return (
        String(tutor.id).includes(normalized) ||
        tutor.username.toLowerCase().includes(normalized) ||
        getTutorFullName(tutor).toLowerCase().includes(normalized) ||
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
              ? `${getTutorFullName(selectedTutor)} (#${selectedTutor.id})`
              : (placeholder ?? "Select tutor")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by ID or name"
          className="h-9"
        />
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
          {filteredTutors.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No tutor found.</p>
          ) : (
            filteredTutors.map((tutor) => {
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
                      {getTutorFullName(tutor)}
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

  const selectedStudent = students.find((student) => String(student.id) === value)
  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return students
    }

    return students.filter((student) => {
      return (
        String(student.id).includes(normalized) ||
        getStudentFullName(student).toLowerCase().includes(normalized)
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
              ? `${getStudentFullName(selectedStudent)} (#${selectedStudent.id})`
              : (placeholder ?? "Select student")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by ID or name"
          className="h-9"
        />
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
          {filteredStudents.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No student found.</p>
          ) : (
            filteredStudents.map((student) => {
              const isSelected = String(student.id) === value

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => {
                    onChange(String(student.id))
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{getStudentFullName(student)}</span>
                    <span className="block truncate text-xs text-muted-foreground">#{student.id}</span>
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

function DateTimePickerInput({
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  placeholder,
}: {
  dateValue: string
  timeValue: string
  onDateChange: (next: string) => void
  onTimeChange: (next: string) => void
  placeholder: string
}) {
  const selectedDate = dateValue ? new Date(`${dateValue}T00:00:00`) : undefined

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground"
          )}
        >
          <CalendarDays className="mr-2 size-4" />
          {selectedDate ? format(selectedDate, "PPP") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="border-b border-border">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(nextDate) => onDateChange(nextDate ? format(nextDate, "yyyy-MM-dd") : "")}
            autoFocus
          />
        </div>
        <div className="space-y-1 p-3">
          <p className="text-xs font-medium text-muted-foreground">Time</p>
          <Input
            type="time"
            step={60}
            value={timeValue}
            onChange={(event) => onTimeChange(event.target.value)}
            className="time-input-no-icon h-9"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DateRangePickerInput({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string
  endDate: string
  onChange: (next: { startDate: string; endDate: string }) => void
}) {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") {
      return true
    }
    return window.matchMedia("(min-width: 768px)").matches
  })

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const mediaQuery = window.matchMedia("(min-width: 768px)")
    const onChangeMedia = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches)
    }

    setIsDesktop(mediaQuery.matches)
    mediaQuery.addEventListener("change", onChangeMedia)
    return () => mediaQuery.removeEventListener("change", onChangeMedia)
  }, [])

  const selectedRange: DateRange | undefined = startDate
    ? {
      from: new Date(`${startDate}T00:00:00`),
      to: endDate ? new Date(`${endDate}T00:00:00`) : undefined,
    }
    : undefined

  const label = selectedRange?.from
    ? selectedRange.to
      ? `${format(selectedRange.from, "LLL dd, y")} - ${format(selectedRange.to, "LLL dd, y")}`
      : format(selectedRange.from, "LLL dd, y")
    : "Select date range"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start text-left font-normal",
            !selectedRange?.from && "text-muted-foreground"
          )}
        >
          <CalendarDays className="mr-2 size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={selectedRange?.from}
          selected={selectedRange}
          onSelect={(nextRange) =>
            onChange({
              startDate: nextRange?.from ? format(nextRange.from, "yyyy-MM-dd") : "",
              endDate: nextRange?.to ? format(nextRange.to, "yyyy-MM-dd") : "",
            })
          }
          numberOfMonths={isDesktop ? 2 : 1}
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
  tutors,
  students,
  canPickStudent,
  status,
  onStatusChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
}: {
  value: DateFilters
  onChange: (next: DateFilters) => void
  showTutor: boolean
  tutors: ApiUser[]
  students?: Student[]
  canPickStudent?: boolean
  status: ScheduleStatusFilter
  onStatusChange: (next: ScheduleStatusFilter) => void
  sortBy: ScheduleSortBy
  onSortByChange: (next: ScheduleSortBy) => void
  sortOrder: SortOrder
  onSortOrderChange: (next: SortOrder) => void
}) {
  const filterGridColumnsClass = showTutor ? "md:grid-cols-4" : "md:grid-cols-3"

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-3">
      <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Filters
        </p>
        <div className={cn("grid gap-3", filterGridColumnsClass)}>
          {showTutor ? (
            <label className="space-y-2 text-sm">
              <span className="font-medium">Tutor ID</span>
              <TutorCombobox
                tutors={tutors}
                value={value.tutorId}
                onChange={(nextTutorId) => onChange({ ...value, tutorId: nextTutorId })}
                placeholder="Select tutor"
              />
            </label>
          ) : null}

          {canPickStudent ? (
            <label className="space-y-2 text-sm">
              <span className="font-medium">Student ID</span>
              <StudentCombobox
                students={students ?? []}
                value={value.studentId}
                onChange={(nextStudentId) => onChange({ ...value, studentId: nextStudentId })}
                placeholder="Select student"
              />
            </label>
          ) : (
            <label className="space-y-2 text-sm">
              <span className="font-medium">Student ID</span>
              <input
                value={value.studentId}
                onChange={(event) => onChange({ ...value, studentId: event.target.value })}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                placeholder="e.g. 123"
              />
            </label>
          )}

          <label className="space-y-2 text-sm">
            <span className="font-medium">Date range</span>
            <DateRangePickerInput
              startDate={value.startDate}
              endDate={value.endDate}
              onChange={({ startDate, endDate }) => onChange({ ...value, startDate, endDate })}
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Status</span>
            <Select value={status || "all"} onValueChange={(next) => onStatusChange(next === "all" ? "" : (next as ScheduleStatusFilter))}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="rescheduled">Rescheduled</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Sort
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Sort by</span>
            <Select value={sortBy} onValueChange={(next) => onSortByChange(next as ScheduleSortBy)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select sorting" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">ID</SelectItem>
                <SelectItem value="scheduled_at">Schedule datetime</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Order</span>
            <Select value={sortOrder} onValueChange={(next) => onSortOrderChange(next as SortOrder)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>
    </div>
  )
}

function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  total: number
  pageSize: number
  onPageChange: (nextPage: number) => void
  onPageSizeChange: (nextPageSize: number) => void
}) {
  const pageSizeOptions = [10, 25, 50, 100]
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className="text-muted-foreground">
          Page {page} / {totalPages} ({total} records)
        </p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows</span>
          <Select value={String(pageSize)} onValueChange={(next) => onPageSizeChange(Number(next))}>
            <SelectTrigger className="h-8 w-24">
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          className="flex-1 sm:flex-none"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          className="flex-1 sm:flex-none"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function CalendarBoard({
  title,
  mode,
  cursorDate,
  items,
  onModeChange,
  onMove,
  onToday,
  onItemClick,
}: {
  title: string
  mode: CalendarMode
  cursorDate: Date
  items: CalendarItem[]
  onModeChange: (nextMode: CalendarMode) => void
  onMove: (direction: "next" | "prev") => void
  onToday: () => void
  onItemClick?: (item: CalendarItem) => void
}) {
  const monthStart = useMemo(() => new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1), [cursorDate])
  const monthEnd = useMemo(() => {
    const end = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0)
    end.setHours(23, 59, 59, 999)
    return end
  }, [cursorDate])

  const visibleRange = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(cursorDate)
      const end = endOfWeek(cursorDate)
      return { start, end }
    }

    return { start: monthStart, end: monthEnd }
  }, [mode, cursorDate, monthEnd, monthStart])

  const visibleItems = items.filter(
    (item) => item.date >= visibleRange.start && item.date <= visibleRange.end
  )

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <section className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="font-semibold">{title}</h4>
      </div>

      <div className="flex gap-2 flex-col sm:flex-row justify-x-between w-full">
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap justify-start">
          <Button size="sm" variant={mode === "month" ? "default" : "outline"} onClick={() => onModeChange("month")}>
            Month
          </Button>
          <Button size="sm" variant={mode === "week" ? "default" : "outline"} onClick={() => onModeChange("week")}>
            Week
          </Button>
        </div>

        <div className="flex w-max items-center gap-2 mx-auto sm:w-full justify-end">
          <Button size="sm" variant="outline" onClick={() => onMove("prev")} aria-label="Previous period">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onToday} className="px-4">
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMove("next")} aria-label="Next period">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {mode === "month"
          ? cursorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
          : `${visibleRange.start.toLocaleDateString()} - ${visibleRange.end.toLocaleDateString()}`}
      </p>

      <div className="hidden grid-cols-7 gap-2 text-xs font-medium text-muted-foreground md:grid">
        {weekDays.map((day) => (
          <div key={day} className="rounded-md bg-muted px-2 py-1 text-center">
            {day}
          </div>
        ))}
      </div>

      {mode === "month" ? (
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-180 grid-cols-7 gap-2">
            {Array.from({ length: monthStart.getDay() }).map((_, index) => (
              <div
                key={`empty-${index}`}
                aria-hidden="true"
                className="min-h-24 rounded-lg border border-dashed border-border/50 bg-transparent"
              />
            ))}
            {Array.from({ length: monthEnd.getDate() }).map((_, index) => {
              const day = new Date(monthStart)
              day.setDate(index + 1)
              const dayItems = visibleItems.filter((item) => sameDate(item.date, day))

              return (
                <div key={day.toISOString()} className="min-h-24 rounded-lg border border-border bg-card p-2">
                  <p className="mb-1 text-xs font-semibold">{day.getDate()}</p>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onItemClick?.(item)}
                        className={cn(
                          "w-full rounded-md border border-primary/20 bg-primary/10 px-1.5 py-1 text-left text-[11px] leading-tight",
                          onItemClick ? "cursor-pointer hover:bg-primary/20" : "cursor-default"
                        )}
                      >
                        <p className="font-medium">{item.studentName}</p>
                        <p className="text-muted-foreground">{item.tutorName}</p>
                        <span
                          className={cn("mt-1 inline-block size-2.5 rounded-full", item.statusDotClassName)}
                          title={item.statusLabel}
                          aria-label={item.statusLabel}
                        />
                      </button>
                    ))}
                    {dayItems.length > 3 ? (
                      <p className="text-[11px] text-muted-foreground">+{dayItems.length - 3} more</p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
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
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onItemClick?.(item)}
                      className={cn(
                        "w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight border-primary/20 bg-primary/10",
                        onItemClick ? "cursor-pointer hover:bg-primary/20" : "cursor-default"
                      )}
                    >
                      <p className="font-medium">{item.studentName}</p>
                      <p className="text-muted-foreground">{item.tutorName}</p>
                      <span
                        className={cn("mt-1 inline-block size-2.5 rounded-full", item.statusDotClassName)}
                        title={item.statusLabel}
                        aria-label={item.statusLabel}
                      />
                    </button>
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
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [, setError] = useState("")
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

  const fetchUsers = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await usersApi.list(token, page, pageSize, searchQuery)
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
  }, [page, pageSize, searchQuery])

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      await usersApi.create(createForm, token)
      toast.success("Tutor created")
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
      notifySubmitError(createError, "Create tutor failed")
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
      toast.success("Tutor updated")
      cancelEditUser()
      await fetchUsers()
    } catch (updateError) {
      setError(parseApiError(updateError))
      notifySubmitError(updateError, "Update tutor failed")
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
      toast.success("Tutor deleted")
      if (editingUserId === user.id) {
        cancelEditUser()
      }
      await fetchUsers()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
      notifySubmitError(deleteError, "Delete tutor failed")
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

      <Input
        value={searchQuery}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setPage(1)
        }}
        placeholder="Search by ID or name"
        className="h-9 md:max-w-sm"
      />

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

      {loading ? <p className="text-sm text-muted-foreground">Loading users...</p> : null}

      <div className="space-y-3 md:hidden">
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border border-border bg-background p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{user.username}</p>
                <p className="text-xs text-muted-foreground">#{user.id}</p>
              </div>
              <Badge variant="outline" className="capitalize">
                {user.role}
              </Badge>
            </div>
            <p className="mt-2 text-muted-foreground">{user.first_name} {user.last_name}</p>
            <p className="mt-1 break-all text-muted-foreground">{user.email || "-"}</p>
            <p className="mt-1 text-muted-foreground">Active: {user.is_active ? "Yes" : "No"}</p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" size="sm" variant="outline" onClick={() => openEditUser(user)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button className="flex-1" size="sm" variant="destructive" onClick={() => deleteUser(user)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </article>
        ))}
        {users.length === 0 && !loading ? (
          <p className="rounded-xl border border-border px-3 py-5 text-center text-sm text-muted-foreground">
            No users found.
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
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

      <Pagination
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(1)
        }}
      />
    </section>
  )
}

function StudentsSection({ token }: { token: string }) {
  const [students, setStudents] = useState<Student[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [, setError] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null)
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    is_active: true,
  })

  const fetchStudents = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await studentsApi.list(token, page, pageSize, searchQuery)
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
  }, [page, pageSize, searchQuery])

  const createStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      await studentsApi.create(createForm, token)
      toast.success("Student created")
      setIsCreateOpen(false)
      setCreateForm({
        first_name: "",
        last_name: "",
        is_active: true,
      })
      await fetchStudents()
    } catch (createError) {
      setError(parseApiError(createError))
      notifySubmitError(createError, "Create student failed")
    } finally {
      setCreating(false)
    }
  }

  const openEditStudent = (student: Student) => {
    setEditingStudentId(student.id)
    setEditForm({
      first_name: student.first_name,
      last_name: student.last_name,
      is_active: student.is_active,
    })
  }

  const cancelEditStudent = () => {
    setEditingStudentId(null)
    setEditForm({
      first_name: "",
      last_name: "",
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
      toast.success("Student updated")
      cancelEditStudent()
      await fetchStudents()
    } catch (updateError) {
      setError(parseApiError(updateError))
      notifySubmitError(updateError, "Update student failed")
    } finally {
      setIsEditing(false)
    }
  }

  const deleteStudent = async (student: Student) => {
    const shouldDelete = window.confirm(`Delete student #${student.id}?`)
    if (!shouldDelete) {
      return
    }

    setError("")
    try {
      await studentsApi.remove(student.id, token)
      toast.success("Student deleted")
      if (editingStudentId === student.id) {
        cancelEditStudent()
      }
      await fetchStudents()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
      notifySubmitError(deleteError, "Delete student failed")
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

      <Input
        value={searchQuery}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setPage(1)
        }}
        placeholder="Search by ID or name"
        className="h-9 md:max-w-sm"
      />

      {isCreateOpen ? (
        <form onSubmit={createStudent} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <Input
            required
            value={createForm.first_name}
            onChange={(event) => setCreateForm({ ...createForm, first_name: event.target.value })}
            placeholder="First name"
            className="h-9"
          />
          <Input
            value={createForm.last_name}
            onChange={(event) => setCreateForm({ ...createForm, last_name: event.target.value })}
            placeholder="Last name"
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

      {loading ? <p className="text-sm text-muted-foreground">Loading students...</p> : null}

      <div className="space-y-3 md:hidden">
        {students.map((student) => (
          <article key={student.id} className="rounded-xl border border-border bg-background p-3 text-sm">
            <p className="font-semibold">{getStudentFullName(student)}</p>
            <p className="text-xs text-muted-foreground">#{student.id}</p>
            <p className="mt-2 text-muted-foreground">Active: {student.is_active ? "Yes" : "No"}</p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" size="sm" variant="outline" onClick={() => openEditStudent(student)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button className="flex-1" size="sm" variant="destructive" onClick={() => deleteStudent(student)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </article>
        ))}
        {students.length === 0 && !loading ? (
          <p className="rounded-xl border border-border px-3 py-5 text-center text-sm text-muted-foreground">
            No students found.
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-t border-border">
                <td className="px-3 py-2">{student.id}</td>
                <td className="px-3 py-2">{getStudentFullName(student)}</td>
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
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={4}>
                  No students found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(1)
        }}
      />
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
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>("")
  const [sortBy, setSortBy] = useState<ScheduleSortBy>("scheduled_at")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month")
  const [calendarCursorDate, setCalendarCursorDate] = useState(getCurrentWibDate())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [, setError] = useState("")
  const [cameraStatus, setCameraStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [checkInLocation, setCheckInLocation] = useState("")
  const [activeCaptureSchedule, setActiveCaptureSchedule] = useState<Schedule | null>(null)
  const [captureMode, setCaptureMode] = useState<"check-in" | "check-out" | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null)
  const [isSubmittingCapture, setIsSubmittingCapture] = useState(false)
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null)
  const [reportMonth, setReportMonth] = useState(() => format(new Date(), "yyyy-MM"))
  const reportMonthParts = useMemo(() => {
    const match = reportMonth.match(/^(\d{4})-(\d{2})$/)
    if (!match) {
      const now = new Date()
      return {
        year: String(now.getFullYear()),
        month: String(now.getMonth() + 1).padStart(2, "0"),
      }
    }

    return { year: match[1], month: match[2] }
  }, [reportMonth])
  const reportYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 11 }, (_, index) => String(currentYear - 5 + index))
  }, [])
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [detailDialogState, setDetailDialogState] = useState<{
    schedule: Schedule
    mode: "check-in" | "check-out" | "calendar"
  } | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [formState, setFormState] = useState({
    tutor: tutorId ? String(tutorId) : "",
    student: "",
    subject_topic: "",
    scheduled_at: "",
    status: "upcoming" as Schedule["status"],
  })

  const fetchSchedules = async () => {
    setLoading(true)
    setError("")

    try {
      const listResponse = await schedulesApi.list(
        {
          filters,
          status: statusFilter,
          sortBy,
          sortOrder,
          page,
          pageSize,
        },
        token
      )
      const calendarResponse = await schedulesApi.calendarPagination(
        {
          filters,
          status: statusFilter,
          sortBy,
          sortOrder,
          mode: calendarMode,
          cursorDate: format(calendarCursorDate, "yyyy-MM-dd"),
        },
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
  }, [page, pageSize, filters, statusFilter, sortBy, sortOrder, calendarMode, calendarCursorDate])

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
    const fetchStudents = async () => {
      try {
        const response = await studentsApi.list(token, 1, 100)
        setStudents(response.results)
      } catch {
        // Fallback to empty options if student fetch fails.
      }
    }

    void fetchStudents()
  }, [token])

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
      tutor: tutorId ? String(tutorId) : "",
      student: "",
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
      tutor: String(schedule.tutor),
      student: String(schedule.student),
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
    if (!formState.tutor) {
      setError("Please select a tutor.")
      toast.error("Save schedule failed", { description: "Please select a tutor." })
      return
    }
    if (!formState.student.trim()) {
      setError("Please select a student.")
      toast.error("Save schedule failed", { description: "Please select a student." })
      return
    }
    const scheduledDate = toDateInputValue(formState.scheduled_at)
    const scheduledTime = toTimeInputValue(formState.scheduled_at)

    if (!scheduledDate || !scheduledTime) {
      setError("Please select schedule date and time.")
      toast.error("Save schedule failed", {
        description: "Please select schedule date and time.",
      })
      return
    }

    if (!formState.scheduled_at) {
      setError("Invalid schedule date or time.")
      toast.error("Save schedule failed", { description: "Invalid schedule date or time." })
      return
    }

    setIsSaving(true)
    setError("")

    const payload = {
      tutor: Number(formState.tutor),
      student: Number(formState.student),
      subject_topic: formState.subject_topic,
      scheduled_at: formState.scheduled_at,
      status: formState.status,
    }

    try {
      if (editing) {
        await schedulesApi.update(editing.id, payload, token)
        toast.success("Schedule updated")
      } else {
        await schedulesApi.create(payload, token)
        toast.success("Schedule created")
      }
      setIsFormOpen(false)
      resetForm()
      await fetchSchedules()
    } catch (saveError) {
      setError(parseApiError(saveError))
      notifySubmitError(saveError, "Save schedule failed")
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
      toast.success("Schedule deleted")
      await fetchSchedules()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
      notifySubmitError(deleteError, "Delete schedule failed")
    }
  }

  const generateMonthlyReport = async () => {
    const month = reportMonth.trim()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError("Please select a valid month in YYYY-MM format.")
      toast.error("Generate report failed", {
        description: "Please select a valid month in YYYY-MM format.",
      })
      return
    }

    setError("")
    setIsGeneratingReport(true)

    try {
      const response = await schedulesApi.generateMonthlyReport(month, token)
      toast.success(`Report for ${response.month} created`, {
        action: {
          label: "Open Google Sheet",
          onClick: () => window.open(response.sheet_url, "_blank", "noopener,noreferrer"),
        },
      })
    } catch (generationError) {
      setError(parseApiError(generationError))
      notifySubmitError(generationError, "Generate report failed")
    } finally {
      setIsGeneratingReport(false)
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
      toast.error("Attendance submit failed", { description: "Please capture a photo first." })
      return
    }

    setError("")
    setIsSubmittingCapture(true)

    try {
      if (captureMode === "check-in") {
        if (!checkInLocation.trim()) {
          setError("Location is required for check-in.")
          toast.error("Attendance submit failed", {
            description: "Location is required for check-in.",
          })
          return
        }

        const formData = new FormData()
        formData.append("schedule_id", String(activeCaptureSchedule.id))
        formData.append("student", String(activeCaptureSchedule.student))
        formData.append("check_in_location", checkInLocation.trim())
        formData.append("check_in_photo", capturedPhoto)
        formData.append("check_in_time", new Date().toISOString())
        await attendanceApi.create(formData, token)
      } else {
        if (!activeCaptureSchedule.check_in_id) {
          setError("Check-in record is missing for this schedule.")
          toast.error("Attendance submit failed", {
            description: "Check-in record is missing for this schedule.",
          })
          return
        }

        const formData = new FormData()
        formData.append("check_out_time", new Date().toISOString())
        formData.append("check_out_photo", capturedPhoto)
        await attendanceApi.update(activeCaptureSchedule.check_in_id, formData, token)
      }

      closeCaptureDialog()
      await fetchSchedules()
      toast.success(captureMode === "check-in" ? "Check in submitted" : "Check out submitted")
    } catch (submitError) {
      setError(parseApiError(submitError))
      notifySubmitError(submitError, "Attendance submit failed")
    } finally {
      setIsSubmittingCapture(false)
    }
  }

  const openDetailDialog = (schedule: Schedule, mode: "check-in" | "check-out" | "calendar") => {
    setDetailDialogState({ schedule, mode })
  }

  const closeDetailDialog = () => {
    setDetailDialogState(null)
  }

  const calendarItems = useMemo<CalendarItem[]>(
    () =>
      calendarSchedules.map((schedule) => {
        const statusPresentation = getScheduleStatusPresentation(schedule)
        return {
          id: `schedule-${schedule.id}`,
          studentName: displayStudentName(schedule),
          tutorName: displayTutorName(schedule),
          statusLabel: statusPresentation.label,
          statusDotClassName: getScheduleStatusDotClass(schedule),
          date: toWibCalendarDate(schedule.scheduled_at),
          schedule,
        }
      }),
    [calendarSchedules]
  )

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold">Schedules</h3>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              setFilters(tutorId ? { ...DEFAULT_FILTERS, tutorId: String(tutorId) } : DEFAULT_FILTERS)
              setStatusFilter("")
              setSortBy("scheduled_at")
              setSortOrder("desc")
              setPage(1)
            }}
          >
            Reset filters
          </Button>
          {canManage ? (
            <Button size="sm" className="w-full sm:w-auto" onClick={openCreate}>
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
        tutors={tutors}
        students={students}
        canPickStudent
        status={statusFilter}
        onStatusChange={(next) => {
          setPage(1)
          setStatusFilter(next)
        }}
        sortBy={sortBy}
        onSortByChange={(next) => {
          setPage(1)
          setSortBy(next)
        }}
        sortOrder={sortOrder}
        onSortOrderChange={(next) => {
          setPage(1)
          setSortOrder(next)
        }}
      />

      {canManage ? (
        <section className="space-y-3 rounded-xl border border-border bg-background p-3">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Report
          </p>
          <div className="grid gap-3 md:grid-cols-3 md:items-end">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Month</span>
              <Select
                value={reportMonthParts.month}
                onValueChange={(nextMonth) =>
                  setReportMonth(`${reportMonthParts.year}-${nextMonth}`)
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_MONTH_OPTIONS.map((monthOption) => (
                    <SelectItem key={monthOption.value} value={monthOption.value}>
                      {monthOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Year</span>
              <Select
                value={reportMonthParts.year}
                onValueChange={(nextYear) =>
                  setReportMonth(`${nextYear}-${reportMonthParts.month}`)
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {reportYearOptions.map((yearOption) => (
                    <SelectItem key={yearOption} value={yearOption}>
                      {yearOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              type="button"
              onClick={() => void generateMonthlyReport()}
              disabled={isGeneratingReport}
              className="w-full md:w-auto md:self-end"
            >
              {isGeneratingReport ? "Generating..." : "Generate report"}
            </Button>
          </div>
        </section>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading schedules...</p> : null}

      {isFormOpen ? (
        <form onSubmit={saveSchedule} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Tutor ID</span>
            {tutorId ? (
              <Input disabled value={formState.tutor} className="h-9 w-full bg-muted" />
            ) : (
              <TutorCombobox
                tutors={tutors}
                value={formState.tutor}
                onChange={(nextTutorId) => setFormState({ ...formState, tutor: nextTutorId })}
                placeholder="Select tutor"
              />
            )}
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">Student ID</span>
            {canManage ? (
              <StudentCombobox
                students={students}
                value={formState.student}
                onChange={(nextStudentId) => setFormState({ ...formState, student: nextStudentId })}
                placeholder="Select student"
              />
            ) : (
              <input
                required
                value={formState.student}
                onChange={(event) => setFormState({ ...formState, student: event.target.value })}
                className="h-9 w-full rounded-lg border border-border px-3 text-sm"
              />
            )}
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">Subject / topic</span>
            <input
              required
              value={formState.subject_topic}
              onChange={(event) => setFormState({ ...formState, subject_topic: event.target.value })}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">Scheduled date & time</span>
            <DateTimePickerInput
              dateValue={toDateInputValue(formState.scheduled_at)}
              timeValue={toTimeInputValue(formState.scheduled_at)}
              onDateChange={updateScheduledDate}
              onTimeChange={updateScheduledTime}
              placeholder="Select schedule date"
            />
          </label>
          <label className="space-y-2 text-sm md:col-span-2">
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
          <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
            <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
              {isSaving ? "Saving..." : editing ? "Update schedule" : "Create schedule"}
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="space-y-3 md:hidden">
        {schedules.map((schedule) => {
          const statusPresentation = getScheduleStatusPresentation(schedule)
          return (
            <article key={schedule.id} className="rounded-xl border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Schedule #{schedule.id}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(schedule.scheduled_at)}</p>
                </div>
                <Badge variant="outline" className={statusPresentation.className}>
                  {statusPresentation.label}
                </Badge>
              </div>
              <p className="mt-2 text-muted-foreground">Tutor: {displayTutorName(schedule)}</p>
              <p className="text-muted-foreground">Student: {displayStudentName(schedule)}</p>
              <p className="text-muted-foreground">Topic: {schedule.subject_topic}</p>

              <div className="mt-3 grid gap-2">
                {schedule.check_in_detail ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDetailDialog(schedule, "check-in")}
                    className="w-full"
                  >
                    View check in details
                  </Button>
                ) : canManage ? (
                  <p className="text-xs text-muted-foreground">Check in: Not yet</p>
                ) : (
                  <Button size="sm" onClick={() => void openCaptureDialog("check-in", schedule)} className="w-full">
                    Check in
                  </Button>
                )}

                {schedule.check_out_detail ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDetailDialog(schedule, "check-out")}
                    className="w-full"
                  >
                    View check out details
                  </Button>
                ) : canManage ? (
                  <p className="text-xs text-muted-foreground">Check out: Not yet</p>
                ) : schedule.check_in_id ? (
                  <Button size="sm" onClick={() => void openCaptureDialog("check-out", schedule)} className="w-full">
                    Check out
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Check out: Check in first</p>
                )}

                {canManage ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(schedule)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => deleteSchedule(schedule.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
        {schedules.length === 0 && !loading ? (
          <p className="rounded-xl border border-border px-3 py-5 text-center text-sm text-muted-foreground">
            No schedules found.
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
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
                <td className="px-3 py-2">{displayTutorName(schedule)}</td>
                <td className="px-3 py-2">{displayStudentName(schedule)}</td>
                <td className="px-3 py-2">{schedule.subject_topic}</td>
                <td className="px-3 py-2">{formatDateTime(schedule.scheduled_at)}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={getScheduleStatusPresentation(schedule).className}
                  >
                    {getScheduleStatusPresentation(schedule).label}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {schedule.check_in_detail ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDetailDialog(schedule, "check-in")}
                    >
                      View details
                    </Button>
                  ) : canManage ? (
                    "Not yet"
                  ) : (
                    <Button size="sm" onClick={() => void openCaptureDialog("check-in", schedule)}>
                      Check in
                    </Button>
                  )}
                </td>
                <td className="px-3 py-2">
                  {schedule.check_out_detail ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDetailDialog(schedule, "check-out")}
                    >
                      View details
                    </Button>
                  ) : canManage ? (
                    "Not yet"
                  ) : schedule.check_in_id ? (
                    <Button size="sm" onClick={() => void openCaptureDialog("check-out", schedule)}>
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
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                  <div className="flex flex-col gap-2 sm:flex-row">
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

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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

      {detailDialogState ? (
        <Dialog open onOpenChange={(open) => (!open ? closeDetailDialog() : null)}>
          <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Attendance details</DialogTitle>
              <DialogDescription>
                {displayTutorName(detailDialogState.schedule)} • {displayStudentName(detailDialogState.schedule)} •{" "}
                <Badge
                  variant="outline"
                  className={getScheduleStatusPresentation(detailDialogState.schedule).className}
                >
                  {getScheduleStatusPresentation(detailDialogState.schedule).label}
                </Badge>
              </DialogDescription>
            </DialogHeader>

            {detailDialogState.mode === "calendar" ? (
              <section className="space-y-1 rounded-lg border border-border p-3 text-sm">
                <p>
                  <span className="font-medium">Schedule time:</span>{" "}
                  {formatDateTime(detailDialogState.schedule.scheduled_at)}
                </p>
              </section>
            ) : null}

            {detailDialogState.mode !== "check-out" ? (
              <section className="space-y-2 rounded-lg border border-border p-3">
                <h4 className="font-semibold">Check in</h4>
                {detailDialogState.schedule.check_in_detail ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Time:</span> {formatDateTime(detailDialogState.schedule.check_in_detail.time)}
                    </p>
                    <p>
                      <span className="font-medium">Location:</span>{" "}
                      <a
                        href={detailDialogState.schedule.check_in_detail.location}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        Open Google Maps
                      </a>
                    </p>
                    {detailDialogState.schedule.check_in_detail ? (
                      <AttendancePhoto
                        token={token}
                        photoUrl={buildAttendancePhotoUrl(
                          detailDialogState.schedule.check_in_detail.id,
                          "check-in"
                        )}
                        alt="Check in"
                        className="max-h-80 w-full rounded-lg border border-border object-contain"
                      />
                    ) : (
                      <p className="text-muted-foreground">No check-in photo available.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Check-in details are not available yet.</p>
                )}
              </section>
            ) : null}

            {detailDialogState.mode !== "check-in" ? (
              <section className="space-y-2 rounded-lg border border-border p-3">
                <h4 className="font-semibold">Check out</h4>
                {detailDialogState.schedule.check_out_detail ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Time:</span> {formatDateTime(detailDialogState.schedule.check_out_detail.time)}
                    </p>
                    {detailDialogState.schedule.check_out_detail && detailDialogState.schedule.check_in_id ? (
                      <AttendancePhoto
                        token={token}
                        photoUrl={buildAttendancePhotoUrl(detailDialogState.schedule.check_in_id, "check-out")}
                        alt="Check out"
                        className="max-h-80 w-full rounded-lg border border-border object-contain"
                      />
                    ) : (
                      <p className="text-muted-foreground">No check-out photo available.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Check-out details are not available yet.</p>
                )}
              </section>
            ) : null}

            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      ) : null}

      <Pagination
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(1)
        }}
      />
      <CalendarBoard
        title="Schedules Calendar"
        mode={calendarMode}
        cursorDate={calendarCursorDate}
        items={calendarItems}
        onModeChange={(nextMode) => {
          setCalendarMode(nextMode)
          setCalendarCursorDate(getCurrentWibDate())
        }}
        onMove={(direction) => {
          setCalendarCursorDate((previousDate) => {
            const nextDate = new Date(previousDate)
            if (calendarMode === "week") {
              nextDate.setDate(nextDate.getDate() + (direction === "next" ? 7 : -7))
              return nextDate
            }

            nextDate.setMonth(nextDate.getMonth() + (direction === "next" ? 1 : -1), 1)
            return nextDate
          })
        }}
        onToday={() => setCalendarCursorDate(getCurrentWibDate())}
        onItemClick={(item) => {
          if (!item.schedule) {
            return
          }
          openDetailDialog(item.schedule, "calendar")
        }}
      />
    </section>
  )
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const isAdmin = session.user.role === "admin"
  const [activeTab, setActiveTab] = useState<DashboardTab>(isAdmin ? "users" : "schedules")

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_8%_15%,rgba(60,120,230,0.16),transparent_36%),radial-gradient(circle_at_85%_5%,rgba(219,129,66,0.2),transparent_44%),radial-gradient(circle_at_90%_85%,rgba(39,172,130,0.14),transparent_38%)] p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
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

          <Button variant="outline" className="w-full sm:w-auto" onClick={onLogout}>
            <LogOut className="size-4" />
            Logout
          </Button>
        </header>

        {isAdmin ? (
          <nav className="grid grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-card/70 p-3 sm:grid-cols-3">
            <Button
              variant={activeTab === "users" ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setActiveTab("users")}
            >
              <UserRound className="size-4" />
              Tutors
            </Button>
            <Button
              variant={activeTab === "students" ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setActiveTab("students")}
            >
              <UserRound className="size-4" />
              Students
            </Button>
            <Button
              variant={activeTab === "schedules" ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setActiveTab("schedules")}
            >
              <CalendarCheck className="size-4" />
              Schedules
            </Button>
          </nav>
        ) : null}

        {activeTab === "users" && isAdmin ? <UsersSection token={session.token} /> : null}
        {activeTab === "students" && isAdmin ? <StudentsSection token={session.token} /> : null}
        {activeTab === "schedules" ? (
          <SchedulesSection token={session.token} canManage={isAdmin} tutorId={isAdmin ? undefined : session.user.id} />
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
