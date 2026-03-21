import { useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type CalendarItem, type CalendarMode, endOfWeek, sameDate, startOfWeek } from "@/lib/helpers/schedule"
import { cn } from "@/lib/utils"

export function CalendarBoard({
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

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-background p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="font-semibold">{title}</h4>
      </div>

      <div className="flex w-full flex-col justify-x-between gap-2 sm:flex-row">
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap justify-start">
          <Button size="sm" variant={mode === "month" ? "default" : "outline"} onClick={() => onModeChange("month")}>
            Month
          </Button>
          <Button size="sm" variant={mode === "week" ? "default" : "outline"} onClick={() => onModeChange("week")}>
            Week
          </Button>
        </div>

        <div className="mx-auto flex w-max items-center gap-2 sm:w-full justify-end">
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
            {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, index) => (
              <div
                key={`empty-${index}`}
                aria-hidden="true"
                className="min-h-24 rounded-lg border border-dashed border-border bg-transparent"
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
                          "w-full rounded-md border border-muted/70 bg-muted/60 px-1.5 py-1 text-left text-[11px] leading-tight",
                          onItemClick ? "cursor-pointer" : "cursor-default",
                          item.statusDotClassName
                        )}
                      >
                        <p className="font-medium">{item.studentName}</p>
                        <p>{item.tutorName}</p>
                      </button>
                    ))}
                    {dayItems.length > 3 ? (
                      <p className="text-[11px] text-muted-foreground">+{dayItems.length - 3} more</p>
                    ) : null}
                  </div>
                </div>
              )
            })}
            {Array.from({ length: (7 - monthEnd.getDay()) % 7 }).map((_, index) => (
              <div
                key={`empty-${index}`}
                aria-hidden="true"
                className="min-h-24 rounded-lg border border-dashed border-border bg-transparent"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-180 grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, index) => {
              const day = new Date(visibleRange.start)
              day.setDate(day.getDate() + index)
              const dayItems = visibleItems.filter((item) => sameDate(item.date, day))

              return (
                <div key={day.toISOString()} className="min-h-24 rounded-lg border border-border bg-card p-2">
                  <p className="mb-1 text-xs font-semibold">
                    {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  <div className="space-y-1">
                    {dayItems.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No events</p>
                    ) : null}
                    {dayItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onItemClick?.(item)}
                        className={cn(
                          "w-full rounded-md border border-muted/70 bg-muted/60 px-1.5 py-1 text-left text-[11px] leading-tight",
                          onItemClick ? "cursor-pointer" : "cursor-default",
                          item.statusDotClassName
                        )}
                      >
                        <p className="font-medium">{item.studentName}</p>
                        <p>{item.tutorName}</p>
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
      )}
    </section>
  )
}
