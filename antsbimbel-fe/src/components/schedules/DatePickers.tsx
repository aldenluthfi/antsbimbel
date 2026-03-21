import { useEffect, useState } from "react"
import { CalendarDays } from "lucide-react"
import { format } from "date-fns"
import { type DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function DateTimePickerInput({
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

export function DateRangePickerInput({
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
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
