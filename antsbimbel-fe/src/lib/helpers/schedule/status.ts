import { type Schedule } from "@/lib/api"

function isSchedulePast(schedule: Schedule): boolean {
  const scheduledTime = new Date(schedule.scheduled_at)
  if (Number.isNaN(scheduledTime.getTime())) {
    return false
  }

  return scheduledTime.getTime() < Date.now()
}

export function getScheduleStatusPresentation(schedule: Schedule): {
  label: string
  className: string
} {
  if (schedule.status === "upcoming" && !schedule.check_in_detail) {
    const isPast = isSchedulePast(schedule)

    return {
      label: isPast ? "Need check in" : "Upcoming",
      className: isPast
        ? "bg-red-100 text-red-700 border-red-200 hover:bg-red-200 hover:text-red-900 hover:border-red-300"
        : "bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200 hover:text-sky-900 hover:border-sky-300",
    }
  }

  if (schedule.status === "upcoming" && !schedule.check_out_detail) {
    const isPast = isSchedulePast(schedule)

    return {
      label: isPast ? "Need check out" : "Upcoming",
      className: isPast
        ? "bg-red-100 text-red-700 border-red-200 hover:bg-red-200 hover:text-red-900 hover:border-red-300"
        : "bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200 hover:text-sky-900 hover:border-sky-300",
    }
  }

  if (schedule.status === "cancelled") {
    return {
      label: "Cancelled",
      className: "bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200 hover:text-zinc-900 hover:border-zinc-300",
    }
  }

  if (schedule.status === "rescheduled") {
    return {
      label: "Rescheduled",
      className: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 hover:text-amber-900 hover:border-amber-300",
    }
  }

  if (schedule.status === "done") {
    return {
      label: "Done",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 hover:text-emerald-900 hover:border-emerald-300",
    }
  }

  return {
    label: "Upcoming",
    className: "bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200 hover:text-sky-900 hover:border-sky-300",
  }
}
