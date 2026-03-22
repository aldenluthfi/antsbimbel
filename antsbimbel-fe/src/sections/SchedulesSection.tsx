import { useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { MapPin } from "lucide-react"
import { toast } from "sonner"

import {
  AttendancePhoto,
  CalendarBoard,
  DateFilterPanel,
  SingleDateTimeRangePickerInput,
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
import { Skeleton } from "@/components/ui/skeleton"
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
  addMinutesToTimeValue,
  buildAttendancePhotoUrl,
  type CalendarItem,
  type CalendarMode,
  displayStudentName,
  displayTutorName,
  formatDateTime,
  formatDateTimeRange,
  formatTimeRange,
  getCurrentWibDate,
  getScheduleStatusPresentation,
  MIN_SCHEDULE_DURATION_MINUTES,
  REPORT_MONTH_OPTIONS,
  toDateInputValue,
  toScheduledAtIso,
  toTimeInputValue,
  toWibCalendarDate,
  validateScheduleRange,
} from "@/lib/helpers/schedule"

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
  const [tutorSearchQuery, setTutorSearchQuery] = useState("")
  const [studentSearchQuery, setStudentSearchQuery] = useState("")
  const [tutors, setTutors] = useState<ApiUser[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [calendarSchedules, setCalendarSchedules] = useState<Schedule[]>([])
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>("upcoming")
  const [sortBy, setSortBy] = useState<ScheduleSortBy>("start_datetime")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month")
  const [calendarCursorDate, setCalendarCursorDate] = useState(getCurrentWibDate())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [cameraStatus, setCameraStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "denied">("idle")
  const [checkInLocation, setCheckInLocation] = useState("")
  const [checkInDescription, setCheckInDescription] = useState("")
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
    description: "",
    start_datetime: "",
    end_datetime: "",
    status: "upcoming" as Schedule["status"],
  })
  const [rescheduleTarget, setRescheduleTarget] = useState<Schedule | null>(null)
  const [rescheduleStartDatetime, setRescheduleStartDatetime] = useState("")
  const [rescheduleEndDatetime, setRescheduleEndDatetime] = useState("")
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false)
  const [deleteTargetSchedule, setDeleteTargetSchedule] = useState<Schedule | null>(null)
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false)
  const [isTutorRequestOpen, setIsTutorRequestOpen] = useState(false)
  const [isSubmittingTutorRequest, setIsSubmittingTutorRequest] = useState(false)
  const [tutorRequestForm, setTutorRequestForm] = useState({
    student: "",
    subject_topic: "",
    description: "",
    start_datetime: "",
    end_datetime: "",
  })
  const DEFAULT_START_TIME = "08:00"

  const getDefaultEndTime = (startTime: string): string => {
    const nextEndTime = addMinutesToTimeValue(startTime, MIN_SCHEDULE_DURATION_MINUTES)
    if (!nextEndTime) {
      return ""
    }

    return nextEndTime <= startTime ? "23:59" : nextEndTime
  }

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
        const nextTutors: ApiUser[] = []
        let nextPage = 1
        let hasNext = true

        while (hasNext && nextPage <= 50) {
          const response = await usersApi.list(token, nextPage, 50, tutorSearchQuery)
          nextTutors.push(...response.results)
          hasNext = Boolean(response.next)
          nextPage += 1
        }

        setTutors(nextTutors)
      } catch {
        // Fallback to empty options if tutor fetch fails.
        setTutors([])
      }
    }

    void fetchTutors()
  }, [token, tutorId, tutorSearchQuery])

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const nextStudents: Student[] = []
        let nextPage = 1
        let hasNext = true

        while (hasNext && nextPage <= 50) {
          const response = await studentsApi.list(token, nextPage, 50, studentSearchQuery)
          nextStudents.push(...response.results)
          hasNext = Boolean(response.next)
          nextPage += 1
        }

        setStudents(nextStudents)
      } catch {
        // Fallback to empty options if student fetch fails.
        setStudents([])
      }
    }

    void fetchStudents()
  }, [token, studentSearchQuery])

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      if (capturedPhotoUrl) {
        URL.revokeObjectURL(capturedPhotoUrl)
      }
    }
  }, [capturedPhotoUrl])

  useEffect(() => {
    if (!error) {
      return
    }

    toast.error(error)
  }, [error])

  const resetForm = () => {
    setEditing(null)
    setFormState({
      tutor: tutorId ? String(tutorId) : "",
      student: "",
      subject_topic: "",
      description: "",
      start_datetime: "",
      end_datetime: "",
      status: "upcoming",
    })
  }

  const openCreate = () => {
    resetForm()
    setIsFormOpen(true)
  }

  const closeScheduleForm = () => {
    setIsFormOpen(false)
    resetForm()
  }

  const openEdit = (schedule: Schedule) => {
    setEditing(schedule)
    setFormState({
      tutor: String(schedule.tutor),
      student: String(schedule.student),
      subject_topic: schedule.subject_topic,
      description: schedule.description,
      start_datetime: schedule.start_datetime,
      end_datetime: schedule.end_datetime,
      status: schedule.status,
    })
    setIsFormOpen(true)
  }

  const openTutorReschedule = (schedule: Schedule) => {
    setRescheduleTarget(schedule)
    setRescheduleStartDatetime(schedule.start_datetime)
    setRescheduleEndDatetime(schedule.end_datetime)
  }

  const closeTutorReschedule = () => {
    setRescheduleTarget(null)
    setRescheduleStartDatetime("")
    setRescheduleEndDatetime("")
  }

  const openTutorRequest = () => {
    setTutorRequestForm({
      student: "",
      subject_topic: "",
      description: "",
      start_datetime: "",
      end_datetime: "",
    })
    setIsTutorRequestOpen(true)
  }

  const saveSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formState.tutor) {
      setError("Please select a tutor.")
      return
    }
    if (!formState.student.trim()) {
      setError("Please select a student.")
      return
    }
    const rangeValidationError = validateScheduleRange(formState.start_datetime, formState.end_datetime)
    if (rangeValidationError) {
      setError(rangeValidationError)
      return
    }

    setIsSaving(true)
    setError("")

    const payload = {
      tutor: Number(formState.tutor),
      student: Number(formState.student),
      subject_topic: formState.subject_topic,
      description: formState.description,
      start_datetime: formState.start_datetime,
      end_datetime: formState.end_datetime,
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
    } finally {
      setIsSaving(false)
    }
  }

  const submitTutorReschedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!rescheduleTarget) {
      return
    }

    const rangeValidationError = validateScheduleRange(rescheduleStartDatetime, rescheduleEndDatetime)
    if (rangeValidationError) {
      setError(rangeValidationError)
      return
    }

    setError("")
    setIsSubmittingReschedule(true)

    try {
      const isExtensionRequest = rescheduleStartDatetime === rescheduleTarget.start_datetime
      await schedulesApi.update(
        rescheduleTarget.id,
        {
          start_datetime: rescheduleStartDatetime,
          end_datetime: rescheduleEndDatetime,
        },
        token
      )
      toast.success(isExtensionRequest ? "Extension request submitted" : "Reschedule request submitted")
      closeTutorReschedule()
      await fetchSchedules()
    } catch (submitError) {
      setError(parseApiError(submitError))
    } finally {
      setIsSubmittingReschedule(false)
    }
  }

  const submitTutorScheduleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tutorRequestForm.student.trim()) {
      setError("Please select a student.")
      return
    }

    const rangeValidationError = validateScheduleRange(tutorRequestForm.start_datetime, tutorRequestForm.end_datetime)
    if (rangeValidationError) {
      setError(rangeValidationError)
      return
    }

    setError("")
    setIsSubmittingTutorRequest(true)

    try {
      await schedulesApi.requestSchedule(
        {
          student: Number(tutorRequestForm.student),
          subject_topic: tutorRequestForm.subject_topic,
          description: tutorRequestForm.description,
          start_datetime: tutorRequestForm.start_datetime,
          end_datetime: tutorRequestForm.end_datetime,
        },
        token
      )
      toast.success("Schedule request submitted")
      setIsTutorRequestOpen(false)
      await fetchSchedules()
    } catch (submitError) {
      setError(parseApiError(submitError))
    } finally {
      setIsSubmittingTutorRequest(false)
    }
  }

  const submitDeleteSchedule = async () => {
    if (!deleteTargetSchedule) {
      return
    }

    setIsDeletingSchedule(true)
    setError("")
    try {
      await schedulesApi.remove(deleteTargetSchedule.id, token)
      toast.success("Schedule deleted")
      setDeleteTargetSchedule(null)
      await fetchSchedules()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
    } finally {
      setIsDeletingSchedule(false)
    }
  }

  const generateMonthlyReport = async () => {
    const month = reportMonth.trim()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError("Please select a valid month in YYYY-MM format.")
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

  const requestCameraPermission = async () => {
    if (typeof window === "undefined" || !("mediaDevices" in navigator)) {
      setCameraStatus("denied")
      setError("Camera is not available in this browser/device.")
      return false
    }

    setCameraStatus("idle")

    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })

      cameraStreamRef.current = stream
      setCameraStatus("granted")

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      return true
    } catch (cameraError) {
      if (cameraError instanceof DOMException && cameraError.name === "OverconstrainedError") {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          cameraStreamRef.current = fallbackStream
          setCameraStatus("granted")
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream
            await videoRef.current.play()
          }
          return true
        } catch {
          // Fall through to denied state below.
        }
      }

      setCameraStatus("denied")
      setError("Camera permission was denied. Please allow camera access and retry.")
      return false
    }
  }

  const requestLocationPermission = async () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setLocationStatus("denied")
      setError("Location is not available in this browser/device.")
      return false
    }

    setLocationStatus("idle")

    return await new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationStatus("granted")
          setCheckInLocation(`${position.coords.latitude}, ${position.coords.longitude}`)
          resolve(true)
        },
        (locationError) => {
          const denied = locationError.code === locationError.PERMISSION_DENIED
          setLocationStatus(denied ? "denied" : "idle")
          setError(
            denied
              ? "Location permission was denied. Please allow location access and retry."
              : "Unable to fetch current location. Please retry."
          )
          resolve(false)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      )
    })
  }

  const restartCamera = async () => {
    setError("")
    await requestCameraPermission()
  }

  const refreshCurrentLocation = async () => {
    setError("")
    await requestLocationPermission()
  }

  const clearCapturedPhoto = () => {
    setCapturedPhoto(null)
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl)
      setCapturedPhotoUrl(null)
    }
  }

  const requestCaptureAccess = async (mode: "check-in" | "check-out") => {
    setError("")
    const hasCamera = await requestCameraPermission()
    if (!hasCamera || mode !== "check-in") {
      return
    }

    await requestLocationPermission()
  }

  const openCaptureDialog = async (mode: "check-in" | "check-out", schedule: Schedule) => {
    setError("")
    setActiveCaptureSchedule(schedule)
    setCaptureMode(mode)
    clearCapturedPhoto()
    setCheckInLocation("")
    setCheckInDescription("")
    setCameraStatus("idle")
    setLocationStatus("idle")

    await requestCaptureAccess(mode)
  }

  const closeCaptureDialog = () => {
    stopCamera()
    setActiveCaptureSchedule(null)
    setCaptureMode(null)
    clearCapturedPhoto()
    setCheckInDescription("")
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
        setCapturedPhotoUrl((previousPhotoUrl) => {
          if (previousPhotoUrl) {
            URL.revokeObjectURL(previousPhotoUrl)
          }

          return URL.createObjectURL(file)
        })
        stopCamera()
      },
      "image/jpeg",
      0.92
    )
  }

  const retakePhoto = async () => {
    setError("")
    clearCapturedPhoto()
    await requestCameraPermission()
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
        formData.append("student", String(activeCaptureSchedule.student))
        formData.append("check_in_location", checkInLocation.trim())
        formData.append("description", checkInDescription.trim())
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
      toast.success(captureMode === "check-in" ? "Check in submitted" : "Check out submitted")
    } catch (submitError) {
      setError(parseApiError(submitError))
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

  const getAttendanceModeLabel = (mode: "check-in" | "check-out") =>
    mode === "check-in" ? "Check in" : "Check out"

  const calendarItems = useMemo<CalendarItem[]>(
    () =>
      calendarSchedules.map((schedule) => {
        const statusPresentation = getScheduleStatusPresentation(schedule)
        return {
          id: `schedule-${schedule.id}`,
          studentName: displayStudentName(schedule),
          tutorName: displayTutorName(schedule),
          scheduleHourLabel: formatTimeRange(schedule.start_datetime, schedule.end_datetime),
          statusLabel: statusPresentation.label,
          statusDotClassName: statusPresentation.className,
          date: toWibCalendarDate(schedule.start_datetime),
          schedule,
        }
      }),
    [calendarSchedules]
  )

  return (
    <section className="flex flex-col space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3>Schedules</h3>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              setFilters(tutorId ? { ...DEFAULT_FILTERS, tutorId: String(tutorId) } : DEFAULT_FILTERS)
              setStatusFilter("upcoming")
              setSortBy("start_datetime")
              setSortOrder("asc")
              setPage(1)
            }}
          >
            Reset filters
          </Button>
          {canManage ? (
            <Button size="sm" className="w-full sm:w-auto" onClick={openCreate}>
              Create schedule
            </Button>
          ) : (
            <Button size="sm" className="w-full sm:w-auto" onClick={openTutorRequest}>
              Request schedule
            </Button>
          )}
        </div>
      </div>
      <section className="flex flex-col space-y-3 rounded-2xl border border-border bg-background p-3">
        <DateFilterPanel
          value={filters}
          onChange={(next) => {
            setPage(1)
            setFilters(tutorId ? { ...next, tutorId: String(tutorId) } : next)
          }}
          showTutor={!tutorId}
          tutors={tutors}
          students={students}
          onTutorSearchQueryChange={setTutorSearchQuery}
          onStudentSearchQueryChange={setStudentSearchQuery}
          status={statusFilter}
          onStatusChange={(next) => {
            setPage(1)
            setStatusFilter(next as ScheduleStatusFilter)
          }}
          sortBy={sortBy}
          onSortByChange={(next) => {
            setPage(1)
            setSortBy(next as ScheduleSortBy)
          }}
          sortOrder={sortOrder}
          onSortOrderChange={(next) => {
            setPage(1)
            setSortOrder(next)
          }}
        />

        {canManage ? (
          <>
            <p className="type-eyebrow">
              Generate Report
            </p>
            <div className="flex flex-col space-y-3 rounded-xl border border-border bg-card p-3">
              <div className="grid gap-3 md:grid-cols-3 md:items-end">
                <label className="flex flex-col space-y-2 text-sm">
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
                <label className="flex flex-col space-y-2 text-sm">
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

      <div className="flex flex-col space-y-3 md:hidden">
        {loading && schedules.length === 0
          ? Array.from({ length: 2 }).map((_, index) => (
            <article key={`schedule-mobile-skeleton-${index}`} className="rounded-xl border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-44" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-1 h-4 w-2/3" />
              <Skeleton className="mt-1 h-4 w-4/5" />
              <Skeleton className="mt-1 h-4 w-full" />

              <div className="mt-3 grid gap-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 flex-1" />
                </div>
              </div>
            </article>
          ))
          : schedules.map((schedule) => {
          const statusPresentation = getScheduleStatusPresentation(schedule)
          const canSubmitCheckIn = schedule.can_check_in
          const canSubmitCheckOut = schedule.can_check_out
          return (
            <article key={schedule.id} className="rounded-xl border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Schedule</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTimeRange(schedule.start_datetime, schedule.end_datetime)}
                  </p>
                </div>
                <Badge variant="outline" className={statusPresentation.className}>
                  {statusPresentation.label}
                </Badge>
              </div>
              <p className="mt-2 text-muted-foreground">Tutor: {displayTutorName(schedule)}</p>
              <p className="text-muted-foreground">Student: {displayStudentName(schedule)}</p>
              <p className="text-muted-foreground">Topic: {schedule.subject_topic}</p>
              <p className="text-muted-foreground">Description: {schedule.description || "-"}</p>

              <div className="mt-3 grid gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDetailDialog(schedule, "calendar")}
                  className="w-full"
                >
                  See details
                </Button>
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
                  <p className="text-sm text-muted-foreground">Check in: Not yet</p>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void openCaptureDialog("check-in", schedule)}
                    className="w-full disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                    disabled={!canSubmitCheckIn}
                  >
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
                  <p className="text-sm text-muted-foreground">Check out: Not yet</p>
                ) : schedule.check_in_id ? (
                  <Button
                    size="sm"
                    onClick={() => void openCaptureDialog("check-out", schedule)}
                    className="w-full disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                    disabled={!canSubmitCheckOut}
                  >
                    Check out
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Check out: Check in first</p>
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
                      onClick={() => setDeleteTargetSchedule(schedule)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : schedule.status === "upcoming" ? (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => openTutorReschedule(schedule)}>
                    Reschedule
                  </Button>
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
              {!canManage ? <th className="w-48 px-3 py-2">Student</th> : null}
              {canManage ? <th className="w-48 px-3 py-2">Tutor</th> : null}
              {canManage ? <th className="w-48 px-3 py-2">Student</th> : null}
              <th className="w-104 px-3 py-2">Time range</th>
              <th className="w-28 px-3 py-2">Status</th>
              {!canManage ? <th className="w-28 px-3 py-2">Check In</th> : null}
              {!canManage ? <th className="w-28 px-3 py-2">Check Out</th> : null}
              <th className={canManage ? "w-64 px-3 py-2" : "w-36 px-3 py-2"}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && schedules.length === 0
              ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`schedule-table-skeleton-${index}`} className="border-t border-border">
                  {!canManage ? (
                    <td className="px-3 py-2">
                      <Skeleton className="h-4 w-11/12" />
                    </td>
                  ) : null}
                  {canManage ? (
                    <td className="px-3 py-2">
                      <Skeleton className="h-4 w-11/12" />
                    </td>
                  ) : null}
                  {canManage ? (
                    <td className="px-3 py-2">
                      <Skeleton className="h-4 w-11/12" />
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-full" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </td>
                  {!canManage ? (
                    <td className="px-3 py-2">
                      <Skeleton className="h-8 w-24" />
                    </td>
                  ) : null}
                  {!canManage ? (
                    <td className="px-3 py-2">
                      <Skeleton className="h-8 w-24" />
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-20" />
                      {canManage ? <Skeleton className="h-8 w-20" /> : null}
                    </div>
                  </td>
                </tr>
              ))
              : null}
            {schedules.map((schedule) => (
              <tr key={schedule.id} className="border-t border-border">
                {!canManage ? <td className="px-3 py-2">{displayStudentName(schedule)}</td> : null}
                {canManage ? <td className="px-3 py-2">{displayTutorName(schedule)}</td> : null}
                {canManage ? <td className="px-3 py-2">{displayStudentName(schedule)}</td> : null}
                <td className="px-3 py-2">{formatDateTimeRange(schedule.start_datetime, schedule.end_datetime)}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={getScheduleStatusPresentation(schedule).className}
                  >
                    {getScheduleStatusPresentation(schedule).label}
                  </Badge>
                </td>
                {!canManage ? (
                  <td className="px-3 py-2">
                    {schedule.check_in_detail ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDetailDialog(schedule, "check-in")}
                      >
                        View details
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => void openCaptureDialog("check-in", schedule)}
                        className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                        disabled={!schedule.can_check_in}
                      >
                        Check in
                      </Button>
                    )}
                  </td>
                ) : null}
                {!canManage ? (
                  <td className="px-3 py-2">
                    {schedule.check_out_detail ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDetailDialog(schedule, "check-out")}
                      >
                        View details
                      </Button>
                    ) : schedule.check_in_id ? (
                      <Button
                        size="sm"
                        onClick={() => void openCaptureDialog("check-out", schedule)}
                        className="disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                        disabled={!schedule.can_check_out}
                      >
                        Check out
                      </Button>
                    ) : (
                      "Check in first"
                    )}
                  </td>
                ) : null}
                {canManage ? (
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openDetailDialog(schedule, "calendar")}>
                        Details
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(schedule)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteTargetSchedule(schedule)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                ) : (
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openDetailDialog(schedule, "calendar")}>
                        See details
                      </Button>
                      {schedule.status === "upcoming" ? (
                        <Button size="sm" variant="outline" onClick={() => openTutorReschedule(schedule)}>
                          Reschedule
                        </Button>
                      ) : null}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {schedules.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={canManage ? 6 : 8}>
                  No schedules found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {!canManage && isTutorRequestOpen ? (
        <Dialog open onOpenChange={(open) => (!open ? setIsTutorRequestOpen(false) : null)}>
          <DialogContent className="max-h-[90svh] w-[95vw] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Request schedule</DialogTitle>
              <DialogDescription>
                Request a new schedule. It will stay pending until approved by admin.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitTutorScheduleRequest} className="grid gap-3">
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  Student <span className="text-destructive">*</span>
                </span>
                <StudentCombobox
                  students={students}
                  value={tutorRequestForm.student}
                  onChange={(nextStudentId) => setTutorRequestForm({ ...tutorRequestForm, student: nextStudentId })}
                  placeholder="Select student"
                />
              </label>

              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  Subject / topic <span className="text-destructive">*</span>
                </span>
                <Input
                  required
                  value={tutorRequestForm.subject_topic}
                  onChange={(event) => setTutorRequestForm({ ...tutorRequestForm, subject_topic: event.target.value })}
                  className="h-9"
                />
              </label>

              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Description</span>
                <textarea
                  value={tutorRequestForm.description}
                  onChange={(event) => setTutorRequestForm({ ...tutorRequestForm, description: event.target.value })}
                  className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>

              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  Schedule date and time <span className="text-destructive">*</span>
                </span>
                <SingleDateTimeRangePickerInput
                  dateValue={toDateInputValue(tutorRequestForm.start_datetime) || toDateInputValue(tutorRequestForm.end_datetime)}
                  startTimeValue={toTimeInputValue(tutorRequestForm.start_datetime)}
                  endTimeValue={toTimeInputValue(tutorRequestForm.end_datetime)}
                  onDateChange={(nextDate) => {
                    setTutorRequestForm((previousForm) => {
                      const startTimePart = toTimeInputValue(previousForm.start_datetime) || DEFAULT_START_TIME
                      const endTimePart = toTimeInputValue(previousForm.end_datetime) || getDefaultEndTime(startTimePart)

                      return {
                        ...previousForm,
                        start_datetime: nextDate ? toScheduledAtIso(nextDate, startTimePart) : "",
                        end_datetime: nextDate ? toScheduledAtIso(nextDate, endTimePart) : "",
                      }
                    })
                  }}
                  onStartTimeChange={(nextTime) => {
                    setTutorRequestForm((previousForm) => {
                      const datePart = toDateInputValue(previousForm.start_datetime) || toDateInputValue(previousForm.end_datetime)
                      const normalizedEndTime = nextTime ? getDefaultEndTime(nextTime) : ""
                      return {
                        ...previousForm,
                        start_datetime: datePart && nextTime ? toScheduledAtIso(datePart, nextTime) : "",
                        end_datetime: datePart && normalizedEndTime ? toScheduledAtIso(datePart, normalizedEndTime) : "",
                      }
                    })
                  }}
                  onEndTimeChange={(nextTime) => {
                    setTutorRequestForm((previousForm) => {
                      const datePart = toDateInputValue(previousForm.end_datetime) || toDateInputValue(previousForm.start_datetime)
                      return {
                        ...previousForm,
                        end_datetime: datePart && nextTime ? toScheduledAtIso(datePart, nextTime) : "",
                      }
                    })
                  }}
                  placeholder="Select schedule date"
                />
              </label>

              <DialogFooter>
                <Button type="submit" disabled={isSubmittingTutorRequest}>
                  {isSubmittingTutorRequest ? "Submitting..." : "Submit request"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsTutorRequestOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {canManage && isFormOpen ? (
        <Dialog open onOpenChange={(open) => (!open ? closeScheduleForm() : null)}>
          <DialogContent className="max-h-[90svh] w-[95vw] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit schedule" : "Create schedule"}</DialogTitle>
              <DialogDescription>
                Fill in schedule details and save changes.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={saveSchedule} className="flex flex-col space-y-4">
              <div className="grid gap-3">
                <label className="flex flex-col space-y-2 text-sm">
                  <span className="font-medium">
                    Tutor <span className="text-destructive">*</span>
                  </span>
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
                <label className="flex flex-col space-y-2 text-sm">
                  <span className="font-medium">
                    Student <span className="text-destructive">*</span>
                  </span>
                  <StudentCombobox
                    students={students}
                    value={formState.student}
                    onChange={(nextStudentId) => setFormState({ ...formState, student: nextStudentId })}
                    placeholder="Select student"
                  />
                </label>
                <label className="flex flex-col space-y-2 text-sm">
                  <span className="font-medium">
                    Subject / topic <span className="text-destructive">*</span>
                  </span>
                  <Input
                    required
                    value={formState.subject_topic}
                    onChange={(event) => setFormState({ ...formState, subject_topic: event.target.value })}
                    placeholder="Math, Science, etc"
                    className="h-9"
                  />
                </label>
                <label className="flex flex-col space-y-2 text-sm">
                  <span className="font-medium">Description</span>
                  <textarea
                    value={formState.description}
                    onChange={(event) => setFormState({ ...formState, description: event.target.value })}
                    className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col space-y-2 text-sm">
                  <span className="font-medium">
                    Schedule date and time <span className="text-destructive">*</span>
                  </span>
                  <SingleDateTimeRangePickerInput
                    dateValue={toDateInputValue(formState.start_datetime) || toDateInputValue(formState.end_datetime)}
                    startTimeValue={toTimeInputValue(formState.start_datetime)}
                    endTimeValue={toTimeInputValue(formState.end_datetime)}
                    onDateChange={(nextDate) => {
                      setFormState((previousState) => {
                        const startTimePart = toTimeInputValue(previousState.start_datetime) || DEFAULT_START_TIME
                        const endTimePart = toTimeInputValue(previousState.end_datetime) || getDefaultEndTime(startTimePart)

                        return {
                          ...previousState,
                          start_datetime: nextDate ? toScheduledAtIso(nextDate, startTimePart) : "",
                          end_datetime: nextDate ? toScheduledAtIso(nextDate, endTimePart) : "",
                        }
                      })
                    }}
                    onStartTimeChange={(nextTime) => {
                      setFormState((previousState) => {
                        const datePart = toDateInputValue(previousState.start_datetime) || toDateInputValue(previousState.end_datetime)
                        const normalizedEndTime = nextTime ? getDefaultEndTime(nextTime) : ""
                        return {
                          ...previousState,
                          start_datetime: datePart && nextTime ? toScheduledAtIso(datePart, nextTime) : "",
                          end_datetime: datePart && normalizedEndTime ? toScheduledAtIso(datePart, normalizedEndTime) : "",
                        }
                      })
                    }}
                    onEndTimeChange={(nextTime) => {
                      setFormState((previousState) => {
                        const datePart = toDateInputValue(previousState.end_datetime) || toDateInputValue(previousState.start_datetime)
                        return {
                          ...previousState,
                          end_datetime: datePart && nextTime ? toScheduledAtIso(datePart, nextTime) : "",
                        }
                      })
                    }}
                    placeholder="Select schedule date"
                  />
                </label>
                <label className="flex flex-col space-y-2 text-sm">
                  <span className="font-medium">
                    Status <span className="text-destructive">*</span>
                  </span>
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
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : editing ? "Update schedule" : "Create schedule"}
                </Button>
                <Button type="button" variant="outline" onClick={closeScheduleForm}>
                  Cancel
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {!canManage && rescheduleTarget ? (
        <Dialog open onOpenChange={(open) => (!open ? closeTutorReschedule() : null)}>
          <DialogContent className="max-h-[90svh] w-[95vw] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Reschedule</DialogTitle>
              <DialogDescription>
                Only the schedule date and time can be changed. If the start time stays the same, this becomes an extension request.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitTutorReschedule} className="grid gap-3">
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Current schedule</span>
                <Input
                  value={formatDateTimeRange(rescheduleTarget.start_datetime, rescheduleTarget.end_datetime)}
                  disabled
                  className="h-9 bg-muted"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  New schedule date and time <span className="text-destructive">*</span>
                </span>
                <SingleDateTimeRangePickerInput
                  dateValue={toDateInputValue(rescheduleStartDatetime) || toDateInputValue(rescheduleEndDatetime)}
                  startTimeValue={toTimeInputValue(rescheduleStartDatetime)}
                  endTimeValue={toTimeInputValue(rescheduleEndDatetime)}
                  onDateChange={(nextDate) => {
                    const startTimePart = toTimeInputValue(rescheduleStartDatetime) || DEFAULT_START_TIME
                    const endTimePart = toTimeInputValue(rescheduleEndDatetime) || getDefaultEndTime(startTimePart)
                    setRescheduleStartDatetime(nextDate ? toScheduledAtIso(nextDate, startTimePart) : "")
                    setRescheduleEndDatetime(nextDate ? toScheduledAtIso(nextDate, endTimePart) : "")
                  }}
                  onStartTimeChange={(nextTime) => {
                    const datePart = toDateInputValue(rescheduleStartDatetime) || toDateInputValue(rescheduleEndDatetime)
                    const normalizedEndTime = nextTime ? getDefaultEndTime(nextTime) : ""
                    setRescheduleStartDatetime(datePart && nextTime ? toScheduledAtIso(datePart, nextTime) : "")
                    setRescheduleEndDatetime(
                      datePart && normalizedEndTime ? toScheduledAtIso(datePart, normalizedEndTime) : ""
                    )
                  }}
                  onEndTimeChange={(nextTime) => {
                    const datePart = toDateInputValue(rescheduleEndDatetime) || toDateInputValue(rescheduleStartDatetime)
                    setRescheduleEndDatetime(datePart && nextTime ? toScheduledAtIso(datePart, nextTime) : "")
                  }}
                  placeholder="Select schedule date"
                />
              </label>

              <DialogFooter>
                <Button type="submit" disabled={isSubmittingReschedule}>
                  {isSubmittingReschedule ? "Submitting..." : "Submit reschedule"}
                </Button>
                <Button type="button" variant="outline" onClick={closeTutorReschedule}>
                  Cancel
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {!canManage && activeCaptureSchedule && captureMode ? (
        <Dialog open onOpenChange={(open) => (!open ? closeCaptureDialog() : null)}>
          <DialogContent className="max-h-[90svh] w-[95vw] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {getAttendanceModeLabel(captureMode)} for schedule #{activeCaptureSchedule.id}
              </DialogTitle>
              <DialogDescription>
                Capture a photo using your camera and submit attendance.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col space-y-5">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-1">Camera: {cameraStatus}</span>
                {captureMode === "check-in" ? (
                  <span className="rounded-full bg-muted px-2 py-1">Location: {locationStatus}</span>
                ) : null}
              </div>

              <section className="flex flex-col space-y-2">
                <p className="text-sm font-medium">Photo</p>
                <div className="overflow-hidden rounded-lg border border-border bg-black/80">
                  {capturedPhotoUrl ? (
                    <img
                      src={capturedPhotoUrl}
                      alt="Captured attendance"
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="aspect-video w-full object-cover"
                    />
                  )}
                </div>
                <canvas ref={canvasRef} className="hidden" />

                <div className="flex flex-wrap gap-2">
                  {capturedPhotoUrl ? (
                    <Button type="button" variant="outline" onClick={() => void retakePhoto()}>
                      Retake photo
                    </Button>
                  ) : (
                    <>
                      <Button type="button" onClick={captureFromCamera}>
                        Capture photo
                      </Button>
                      <Button type="button" variant="outline" onClick={() => void restartCamera()}>
                        Restart camera
                      </Button>
                    </>
                  )}
                </div>
              </section>

              {captureMode === "check-in" ? (
                <section className="flex flex-col space-y-4">
                  <label className="flex flex-col space-y-2 text-sm">
                    <span className="font-medium">
                      Location <span className="text-destructive">*</span>
                    </span>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        required
                        value={checkInLocation}
                        onChange={(event) => setCheckInLocation(event.target.value)}
                        placeholder="Latitude, Longitude"
                        className="h-9"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 shrink-0 px-3"
                        onClick={() => void refreshCurrentLocation()}
                      >
                        <MapPin className="size-4" />
                      </Button>
                    </div>
                  </label>
                  <label className="flex flex-col space-y-2 text-sm">
                    <span className="font-medium">Description</span>
                    <textarea
                      value={checkInDescription}
                      onChange={(event) => setCheckInDescription(event.target.value)}
                      placeholder="Short check in notes"
                      className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </section>
              ) : null}

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  disabled={isSubmittingCapture}
                  onClick={() => void submitCapturedAttendance()}
                >
                  {isSubmittingCapture ? "Submitting..." : `Submit ${getAttendanceModeLabel(captureMode)}`}
                </Button>
                <Button type="button" variant="outline" onClick={closeCaptureDialog}>
                  Cancel
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
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
              <section className="space-y-1 text-sm">
                <p>
                  <span className="font-medium">Schedule time:</span>{" "}
                  {formatDateTimeRange(detailDialogState.schedule.start_datetime, detailDialogState.schedule.end_datetime)}
                </p>
                <p>
                  <span className="font-medium">Description:</span> {detailDialogState.schedule.description || "-"}
                </p>
              </section>
            ) : null}

            {detailDialogState.mode !== "check-out" ? (
              <section className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Check in</p>
                {detailDialogState.schedule.check_in_detail ? (
                  <div className="flex flex-col space-y-2 text-sm">
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
                    <p>
                      <span className="font-medium">Description:</span>{" "}
                      {detailDialogState.schedule.check_in_detail.description || "-"}
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
                      <p className="text-muted-foreground">No check in photo available.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Check in details are not available yet.</p>
                )}
              </section>
            ) : null}

            {detailDialogState.mode !== "check-in" ? (
              <section className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Check out</p>
                {detailDialogState.schedule.check_out_detail ? (
                  <div className="flex flex-col space-y-2 text-sm">
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
                      <p className="text-muted-foreground">No check out photo available.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Check out details are not available yet.</p>
                )}
              </section>
            ) : null}

            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      ) : null}

      {canManage ? (
        <Dialog
          open={Boolean(deleteTargetSchedule)}
          onOpenChange={(open) => {
            if (!open && !isDeletingSchedule) {
              setDeleteTargetSchedule(null)
            }
          }}
        >
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader>
              <DialogTitle>Delete schedule</DialogTitle>
              <DialogDescription>
                {deleteTargetSchedule
                  ? `Delete schedule for ${displayStudentName(deleteTargetSchedule)} at ${formatDateTimeRange(deleteTargetSchedule.start_datetime, deleteTargetSchedule.end_datetime)}? This action cannot be undone.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                disabled={isDeletingSchedule}
                type="button"
                variant="outline"
                onClick={() => setDeleteTargetSchedule(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={isDeletingSchedule || !deleteTargetSchedule}
                type="button"
                variant="destructive"
                onClick={submitDeleteSchedule}
              >
                {isDeletingSchedule ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
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
      <div className="hidden xl:block">
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
      </div>
    </section>
  )
}
