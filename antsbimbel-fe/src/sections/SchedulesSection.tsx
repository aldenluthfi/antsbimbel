import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { MapPin } from "lucide-react"
import { toast } from "sonner"

import {
  AttendancePhoto,
  CalendarBoard,
  DateFilterPanel,
  DateTimePickerInput,
  Pagination,
  StudentCombobox,
  TutorCombobox,
} from "@/components/schedules"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  attendanceApi,
  type ApiUser,
  type DateFilters,
  DEFAULT_FILTERS,
  parseApiError,
  schedulesApi,
  type Schedule,
  type ScheduleSortBy,
  type ScheduleStatusFilter,
  type SortOrder,
  studentsApi,
  type Student,
  usersApi,
} from "@/lib/api"
import {
  buildAttendancePhotoUrl,
  type CalendarItem,
  type CalendarMode,
  displayStudentName,
  displayTutorName,
  formatDateTime,
  getCurrentWibDate,
  getScheduleStatusPresentation,
  REPORT_MONTH_OPTIONS,
  toDateInputValue,
  toScheduledAtIso,
  toTimeInputValue,
  toWibCalendarDate,
} from "@/lib/helpers/schedule"
import { notifySubmitError } from "@/lib/helpers/notifications"

export function SchedulesSection({
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
          statusDotClassName: statusPresentation.className,
          date: toWibCalendarDate(schedule.scheduled_at),
          schedule,
        }
      }),
    [calendarSchedules]
  )

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
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
      <section className="space-y-3 rounded-2xl border border-border bg-background p-3">
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
          <>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Generate Report
            </p>
            <div className="space-y-3 rounded-xl border border-border bg-card p-3">
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
            </div>
          </>
        ) : null}
      </section>

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
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="w-16 px-3 py-2">ID</th>
              <th className="w-36 px-3 py-2">Tutor</th>
              <th className="w-36 px-3 py-2">Student</th>
              <th className="w-32 px-3 py-2">Topic</th>
              <th className="w-40 px-3 py-2">Datetime</th>
              <th className="w-28 px-3 py-2">Status</th>
              <th className="w-24 px-3 py-2">Check In</th>
              <th className="w-24 px-3 py-2">Check Out</th>
              {canManage ? <th className="w-28 px-3 py-2">Actions</th> : null}
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
