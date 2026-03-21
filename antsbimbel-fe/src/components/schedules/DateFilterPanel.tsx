import { type ApiUser, type DateFilters, type ScheduleSortBy, type ScheduleStatusFilter, type SortOrder, type Student } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { DateRangePickerInput } from "./DatePickers"
import { StudentCombobox, TutorCombobox } from "./EntityComboboxes"

export function DateFilterPanel({
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
    <>
      <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        Sort and filter
      </p>
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
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

      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
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
    </>
  )
}
