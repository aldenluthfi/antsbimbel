const WIB_TIMEZONE = "Asia/Jakarta"
const WIB_OFFSET_HOURS = 7

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

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  const { year, month, day, hour, minute } = getWibDateTimeParts(date)
  return `${year}-${month}-${day} ${hour}:${minute} WIB`
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

export function getCurrentWibDate(): Date {
  return toWibCalendarDate(new Date().toISOString())
}
