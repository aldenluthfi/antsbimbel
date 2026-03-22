import { type ApiUser, type DateFilters, type SortOrder, type Student } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  statusOptions?: Array<{ value: string; label: string }>
  sortByOptions?: Array<{ value: string; label: string }>
}) {
  const filterGridColumnsClass = showTutor ? "md:grid-cols-4" : "md:grid-cols-3"
  const resolvedStatusOptions =
    statusOptions ?? [
      { value: "upcoming", label: "Upcoming" },
      { value: "done", label: "Done" },
      { value: "missed", label: "Missed" },
      { value: "cancelled", label: "Cancelled" },
      { value: "rescheduled", label: "Rescheduled" },
      { value: "extended", label: "Extended" },
      { value: "pending", label: "Pending" },
      { value: "rejected", label: "Rejected" },
    ]
  const resolvedSortByOptions =
    sortByOptions ?? [
      { value: "start_datetime", label: "Start datetime" },
      { value: "end_datetime", label: "End datetime" },
      { value: "status", label: "Status" },
    ]
  const selectedStatusLabels = resolvedStatusOptions
    .filter((statusOption) => status.includes(statusOption.value))
    .map((statusOption) => statusOption.label)

  const statusButtonLabel =
    selectedStatusLabels.length === 0
      ? "All status"
      : selectedStatusLabels.length <= 2
        ? selectedStatusLabels.join(", ")
        : `${selectedStatusLabels.length} selected`

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
                <Button type="button" variant="outline" className="h-9 w-full justify-start font-normal">
                  {statusButtonLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Status filters</DropdownMenuLabel>
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
            <Select value={sortBy} onValueChange={onSortByChange}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select sorting" />
              </SelectTrigger>
              <SelectContent>
                {resolvedSortByOptions.map((sortOption) => (
                  <SelectItem key={sortOption.value} value={sortOption.value}>
                    {sortOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col space-y-2 text-sm">
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
