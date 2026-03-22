import { type Schedule } from "@/lib/api"

export type CalendarMode = "month" | "week"

export type CalendarItem = {
  id: string
  studentName: string
  tutorName: string
  scheduleHourLabel: string
  statusLabel: string
  statusDotClassName: string
  date: Date
  schedule?: Schedule
}
