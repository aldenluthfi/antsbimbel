import { type ApiUser, type DateFilters, type SortOrder, type Student } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { DateRangePickerInput } from "./DatePickers"
import { StudentCombobox, TutorCombobox } from "./EntityComboboxes"

type StatusOption = { value: string; label: string; className?: string }

export function DateFilterPanel({
  value,
  onChange,
  showTutor,
  tutors,
  students,
  onTutorSearchQueryChange,
  onStudentSearchQueryChange,
  status,
  onStatusChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  statusOptions,
  sortByOptions,
}: {
  value: DateFilters
  onChange: (next: DateFilters) => void
  showTutor: boolean
  tutors: ApiUser[]
  students?: Student[]
  onTutorSearchQueryChange?: (query: string) => void
  onStudentSearchQueryChange?: (query: string) => void
  status: string[]
  onStatusChange: (next: string[]) => void
  sortBy: string
  onSortByChange: (next: string) => void
  sortOrder: SortOrder
  onSortOrderChange: (next: SortOrder) => void
  statusOptions?: StatusOption[]
  sortByOptions?: Array<{ value: string; label: string }>
}) {
  const filterGridColumnsClass = showTutor ? "md:grid-cols-4" : "md:grid-cols-3"
  const resolvedStatusOptions =
    statusOptions ?? [
      {
        value: "upcoming",
        label: "Upcoming",
        className: "bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200 hover:text-sky-900 hover:border-sky-300",
      },
      {
        value: "done",
        label: "Done",
        className: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 hover:text-emerald-900 hover:border-emerald-300",
      },
      {
        value: "missed",
        label: "Missed",
        className: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200 hover:text-red-900 hover:border-red-300",
      },
      {
        value: "cancelled",
        label: "Cancelled",
        className: "bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200 hover:text-zinc-900 hover:border-zinc-300",
      },
      {
        value: "rescheduled",
        label: "Rescheduled",
        className: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 hover:text-amber-900 hover:border-amber-300",
      },
      {
        value: "extended",
        label: "Extended",
        className: "bg-teal-100 text-teal-700 border-teal-200 hover:bg-teal-200 hover:text-teal-900 hover:border-teal-300",
      },
      {
        value: "pending",
        label: "Pending",
        className: "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200 hover:text-orange-900 hover:border-orange-300",
      },
      {
        value: "rejected",
        label: "Rejected",
        className: "bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200 hover:text-rose-900 hover:border-rose-300",
      },
    ]
  const resolvedSortByOptions =
    sortByOptions ?? [
      { value: "start_datetime", label: "Start datetime" },
      { value: "end_datetime", label: "End datetime" },
      { value: "status", label: "Status" },
    ]
  const selectedStatusOptions = resolvedStatusOptions.filter((statusOption) => status.includes(statusOption.value))
  const statusBadgeOptions = selectedStatusOptions.slice(0, 2)
  const additionalStatusCount = Math.max(selectedStatusOptions.length - statusBadgeOptions.length, 0)
  const selectedSortByOption =
    resolvedSortByOptions.find((sortOption) => sortOption.value === sortBy)?.label ?? "Select sorting"
  const selectedSortOrderLabel = sortOrder === "asc" ? "Ascending" : "Descending"

  const toggleStatus = (statusValue: string) => {
    if (status.includes(statusValue)) {
      onStatusChange(status.filter((selectedStatusValue) => selectedStatusValue !== statusValue))
      return
    }

    onStatusChange([...status, statusValue])
  }

  return (
    <>
      <p className="type-eyebrow">
        Sort and filter
      </p>
      <div className="flex flex-col space-y-3 rounded-xl border border-border bg-card p-3">
        <p className="type-eyebrow">
          Filters
        </p>
        <div className={cn("grid gap-3", filterGridColumnsClass)}>
          {showTutor ? (
            <label className="flex flex-col space-y-2 text-sm">
              <span className="font-medium">Tutor</span>
              <TutorCombobox
                tutors={tutors}
                value={value.tutorId}
                onChange={(nextTutorId) => onChange({ ...value, tutorId: nextTutorId })}
                onSearchQueryChange={onTutorSearchQueryChange}
                placeholder="Select tutor"
              />
            </label>
          ) : null}

          <label className="flex flex-col space-y-2 text-sm">
            <span className="font-medium">Student</span>
            <StudentCombobox
              students={students ?? []}
              value={value.studentId}
              onChange={(nextStudentId) => onChange({ ...value, studentId: nextStudentId })}
              onSearchQueryChange={onStudentSearchQueryChange}
              placeholder="Select student"
            />
          </label>

          <label className="min-w-0 flex flex-col space-y-2 text-sm">
            <span className="font-medium">Date range</span>
            <DateRangePickerInput
              startDate={value.startDate}
              endDate={value.endDate}
              onChange={({ startDate, endDate }) => onChange({ ...value, startDate, endDate })}
            />
          </label>

          <label className="flex flex-col space-y-2 text-sm">
            <span className="font-medium">Status</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-9 w-full justify-start gap-1 overflow-hidden font-normal">
                  {selectedStatusOptions.length === 0 ? (
                    "All status"
                  ) : (
                    <span className="flex min-w-0 items-center gap-1">
                      {statusBadgeOptions.map((statusOption) => (
                        <Badge key={statusOption.value} variant="outline" className={cn("pointer-events-none", statusOption.className)}>
                          {statusOption.label}
                        </Badge>
                      ))}
                      {additionalStatusCount > 0 ? (
                        <span className="text-xs text-muted-foreground">+{additionalStatusCount}</span>
                      ) : null}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuCheckboxItem
                  checked={status.length === 0}
                  onCheckedChange={() => onStatusChange([])}
                >
                  All status
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {resolvedStatusOptions.map((statusOption) => (
                  <DropdownMenuCheckboxItem
                    key={statusOption.value}
                    checked={status.includes(statusOption.value)}
                    onCheckedChange={() => toggleStatus(statusOption.value)}
                  >
                    {statusOption.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </label>
        </div>
      </div>

      <div className="flex flex-col space-y-3 rounded-xl border border-border bg-card p-3">
        <p className="type-eyebrow">
          Sort
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col space-y-2 text-sm">
            <span className="font-medium">Sort by</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-9 w-full justify-start font-normal">
                  {selectedSortByOption}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortByChange}>
                  {resolvedSortByOptions.map((sortOption) => (
                    <DropdownMenuRadioItem key={sortOption.value} value={sortOption.value}>
                      {sortOption.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </label>

          <label className="flex flex-col space-y-2 text-sm">
            <span className="font-medium">Order</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="h-9 w-full justify-start font-normal">
                  {selectedSortOrderLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Order</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sortOrder} onValueChange={(next) => onSortOrderChange(next as SortOrder)}>
                  <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </label>
        </div>
      </div>
    </>
  )
}
