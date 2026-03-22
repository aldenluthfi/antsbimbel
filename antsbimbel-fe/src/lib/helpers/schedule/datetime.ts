import { format } from "date-fns"

const WIB_TIMEZONE = "Asia/Jakarta"
const WIB_OFFSET_HOURS = 7
export const MIN_SCHEDULE_DURATION_MINUTES = 120

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

function toWibDisplayDate(parts: {
  year: string
  month: string
  day: string
  hour: string
  minute: string
}): string {
  const displayDate = new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute)
  )

  if (Number.isNaN(displayDate.getTime())) {
    return "-"
  }

  return format(displayDate, "MMMM do, yyyy")
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  const parts = getWibDateTimeParts(date)
  const displayDate = toWibDisplayDate(parts)
  return `${displayDate} ${parts.hour}:${parts.minute} WIB`
}

export function formatDateTimeRange(startIsoDate: string, endIsoDate: string): string {
  const startDate = new Date(startIsoDate)
  const endDate = new Date(endIsoDate)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "-"
  }

  const start = getWibDateTimeParts(startDate)
  const end = getWibDateTimeParts(endDate)
  const startDisplayDate = toWibDisplayDate(start)
  const endDisplayDate = toWibDisplayDate(end)

  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return `${startDisplayDate} ${start.hour}:${start.minute}-${end.hour}:${end.minute} WIB`
  }

  return `${startDisplayDate} ${start.hour}:${start.minute} - ${endDisplayDate} ${end.hour}:${end.minute} WIB`
}

export function formatTimeRange(startIsoDate: string, endIsoDate: string): string {
  const startTime = toTimeInputValue(startIsoDate)
  const endTime = toTimeInputValue(endIsoDate)

  if (!startTime || !endTime) {
    return "-"
  }

  return `${startTime}-${endTime} WIB`
}

export function toDateInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const { year, month, day } = getWibDateTimeParts(date)
  return `${year}-${month}-${day}`
}

export function toTimeInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const { hour, minute } = getWibDateTimeParts(date)
  return `${hour}:${minute}`
}

export function toScheduledAtIso(datePart: string, timePart: string): string {
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

export function toWibCalendarDate(isoDate: string): Date {
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) {
    return new Date()
  }

  const { year, month, day } = getWibDateTimeParts(parsed)
  return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
}

export function validateScheduleRange(startIsoDate: string, endIsoDate: string): string | null {
  if (!startIsoDate || !endIsoDate) {
    return "Please select both start and end date/time."
  }

  const startDate = new Date(startIsoDate)
  const endDate = new Date(endIsoDate)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "Invalid schedule date or time."
  }

  const startDateValue = toDateInputValue(startIsoDate)
  const endDateValue = toDateInputValue(endIsoDate)
  if (!startDateValue || !endDateValue) {
    return "Invalid schedule date or time."
  }

  if (startDateValue !== endDateValue) {
    return "Start date and end date must be the same day."
  }

  if (startDate.getTime() >= endDate.getTime()) {
    return "End time must be after start time."
  }

  const durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60)
  if (durationMinutes < MIN_SCHEDULE_DURATION_MINUTES) {
    return "Schedule duration must be at least 2 hours."
  }

  return null
}

export function addMinutesToTimeValue(timeValue: string, minutesToAdd: number): string {
  const timeMatch = timeValue.match(/^(\d{2}):(\d{2})$/)
  if (!timeMatch) {
    return ""
  }

  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  if ([hours, minutes].some((value) => Number.isNaN(value))) {
    return ""
  }

  const totalMinutes = (hours * 60 + minutes + minutesToAdd) % (24 * 60)
  const normalizedMinutes = totalMinutes >= 0 ? totalMinutes : totalMinutes + 24 * 60
  const nextHours = String(Math.floor(normalizedMinutes / 60)).padStart(2, "0")
  const nextMinutes = String(normalizedMinutes % 60).padStart(2, "0")
  return `${nextHours}:${nextMinutes}`
}

export function getCurrentWibDate(): Date {
  return toWibCalendarDate(new Date().toISOString())
}
