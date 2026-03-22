import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"

import { CalendarBoard, DateFilterPanel, Pagination } from "@/components/schedules"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DEFAULT_FILTERS,
  type DateFilters,
  parseApiError,
  type RequestSortBy,
  type RequestStatus,
  type RequestStatusFilter,
  requestsApi,
  type ScheduleRequest,
  type SortOrder,
  studentsApi,
  type Student,
  usersApi,
  type ApiUser,
} from "@/lib/api"
import {
  displayStudentName,
  displayTutorName,
  formatDateTime,
  formatTimeRange,
  getCurrentWibDate,
  toWibCalendarDate,
  type CalendarItem,
  type CalendarMode,
} from "@/lib/helpers/schedule"

function getRequestStatusPresentation(status: RequestStatus): { label: string; className: string } {
  if (status === "resolved") {
    return {
      label: "Resolved",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 hover:text-emerald-900 hover:border-emerald-300",
    }
  }

  return {
    label: "Pending",
    className: "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200 hover:text-orange-900 hover:border-orange-300",
  }
}

function getEffectiveRequestSchedule(requestItem: ScheduleRequest) {
  return requestItem.new_schedule_detail ?? requestItem.old_schedule_detail
}

function getRequestTypePresentation(requestItem: ScheduleRequest): { label: string; className: string } {
  if (requestItem.old_schedule && requestItem.new_schedule) {
    return {
      label: "Reschedule",
      className: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 hover:text-amber-900 hover:border-amber-300",
    }
  }

  if (requestItem.old_schedule && !requestItem.new_schedule) {
    return {
      label: "Extension",
      className: "bg-teal-100 text-teal-700 border-teal-200 hover:bg-teal-200 hover:text-teal-900 hover:border-teal-300",
    }
  }

  return {
    label: "New schedule",
    className: "bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200 hover:text-sky-900 hover:border-sky-300",
  }
}

export function RequestsSection({ token }: { token: string }) {
  const [filters, setFilters] = useState<DateFilters>(DEFAULT_FILTERS)
  const [tutorSearchQuery, setTutorSearchQuery] = useState("")
  const [studentSearchQuery, setStudentSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("pending")
  const [sortBy, setSortBy] = useState<RequestSortBy>("created_at")
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc")
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month")
  const [calendarCursorDate, setCalendarCursorDate] = useState(getCurrentWibDate())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [requests, setRequests] = useState<ScheduleRequest[]>([])
  const [calendarRequests, setCalendarRequests] = useState<ScheduleRequest[]>([])
  const [tutors, setTutors] = useState<ApiUser[]>([])
  const [students, setStudents] = useState<Student[]>([])

  const fetchRequests = async () => {
    setLoading(true)
    setError("")

    try {
      const listResponse = await requestsApi.list(
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

      const calendarResponse = await requestsApi.calendarPagination(
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

      setRequests(listResponse.results)
      setTotal(listResponse.count)
      setCalendarRequests(calendarResponse.results)
    } catch (fetchError) {
      setError(parseApiError(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters, statusFilter, sortBy, sortOrder, calendarMode, calendarCursorDate])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [nextTutors, nextStudents] = await Promise.all([
          (async () => {
            const items: ApiUser[] = []
            let nextPage = 1
            let hasNext = true

            while (hasNext && nextPage <= 50) {
              const response = await usersApi.list(token, nextPage, 50, tutorSearchQuery)
              items.push(...response.results)
              hasNext = Boolean(response.next)
              nextPage += 1
            }

            return items
          })(),
          (async () => {
            const items: Student[] = []
            let nextPage = 1
            let hasNext = true

            while (hasNext && nextPage <= 50) {
              const response = await studentsApi.list(token, nextPage, 50, studentSearchQuery)
              items.push(...response.results)
              hasNext = Boolean(response.next)
              nextPage += 1
            }

            return items
          })(),
        ])

        setTutors(nextTutors)
        setStudents(nextStudents)
      } catch {
        setTutors([])
        setStudents([])
      }
    }

    void fetchData()
  }, [token, tutorSearchQuery, studentSearchQuery])

  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  const runAction = async (requestItem: ScheduleRequest, action: "approve" | "reject") => {
    if (requestItem.status !== "pending") {
      setError("Only pending requests can be processed.")
      return
    }

    try {
      if (action === "approve") {
        await requestsApi.approve(requestItem.id, token)
        toast.success("Request approved")
      } else {
        await requestsApi.reject(requestItem.id, token)
        toast.success("Request rejected")
      }
      await fetchRequests()
    } catch (actionError) {
      setError(parseApiError(actionError))
    }
  }

  const calendarItems = useMemo<CalendarItem[]>(
    () =>
      calendarRequests.flatMap((requestItem) => {
        const schedule = getEffectiveRequestSchedule(requestItem)
        if (!schedule) {
          return []
        }
        const statusPresentation = getRequestStatusPresentation(requestItem.status)

        return [
          {
            id: `request-${requestItem.id}`,
            studentName: displayStudentName(schedule),
            tutorName: displayTutorName(schedule),
            scheduleHourLabel: formatTimeRange(schedule.start_datetime, schedule.end_datetime),
            statusLabel: statusPresentation.label,
            statusDotClassName: statusPresentation.className,
            date: toWibCalendarDate(schedule.start_datetime),
            schedule,
          },
        ]
      }),
    [calendarRequests]
  )

  const renderActions = (requestItem: ScheduleRequest) => {
    const pending = requestItem.status === "pending"

    return (
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void runAction(requestItem, "approve")} disabled={!pending}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void runAction(requestItem, "reject")}
          disabled={!pending}
        >
          Reject
        </Button>
      </div>
    )
  }

  return (
    <section className="flex flex-col space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3>Requests</h3>
        <Button
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => {
            setFilters(DEFAULT_FILTERS)
            setStatusFilter("pending")
            setSortBy("created_at")
            setSortOrder("asc")
            setPage(1)
          }}
        >
          Reset filters
        </Button>
      </div>

      <section className="flex flex-col space-y-3 rounded-2xl border border-border bg-background p-3">
        <DateFilterPanel
          value={filters}
          onChange={(next) => {
            setPage(1)
            setFilters(next)
          }}
          showTutor
          tutors={tutors}
          students={students}
          onTutorSearchQueryChange={setTutorSearchQuery}
          onStudentSearchQueryChange={setStudentSearchQuery}
          status={statusFilter}
          statusOptions={[
            { value: "pending", label: "Pending" },
            { value: "resolved", label: "Resolved" },
          ]}
          onStatusChange={(next) => {
            setPage(1)
            setStatusFilter(next as RequestStatusFilter)
          }}
          sortBy={sortBy}
          sortByOptions={[
            { value: "created_at", label: "Created time" },
            { value: "start_datetime", label: "Start datetime" },
            { value: "end_datetime", label: "End datetime" },
            { value: "status", label: "Status" },
          ]}
          onSortByChange={(next) => {
            setPage(1)
            setSortBy(next as RequestSortBy)
          }}
          sortOrder={sortOrder}
          onSortOrderChange={(next) => {
            setPage(1)
            setSortOrder(next)
          }}
        />
      </section>

      <div className="flex flex-col space-y-3 md:hidden">
        {loading && requests.length === 0
          ? Array.from({ length: 2 }).map((_, index) => (
            <article key={`request-mobile-skeleton-${index}`} className="rounded-xl border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-36" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-1 h-4 w-2/3" />
              <Skeleton className="mt-1 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-full" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </article>
          ))
          : null}
        {requests.map((requestItem) => {
          const schedule = getEffectiveRequestSchedule(requestItem)
          const statusPresentation = getRequestStatusPresentation(requestItem.status)
          const requestType = getRequestTypePresentation(requestItem)

          return (
            <article key={requestItem.id} className="rounded-xl border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Request</p>
                  <p className="text-sm text-muted-foreground">Created: {formatDateTime(requestItem.created_at)}</p>
                </div>
                <Badge variant="outline" className={statusPresentation.className}>
                  {statusPresentation.label}
                </Badge>
              </div>

              <p className="mt-2 text-muted-foreground">Tutor: {schedule ? displayTutorName(schedule) : "-"}</p>
              <p className="text-muted-foreground">Student: {schedule ? displayStudentName(schedule) : "-"}</p>
              <p className="text-muted-foreground">
                Type: <Badge variant="outline" className={requestType.className}>{requestType.label}</Badge>
              </p>

              <div className="mt-3">{renderActions(requestItem)}</div>
            </article>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="w-48 px-3 py-2">Tutor</th>
              <th className="w-48 px-3 py-2">Student</th>
              <th className="px-3 py-2">Type</th>
              <th className="w-28 px-3 py-2">Status</th>
              <th className="w-64 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && requests.length === 0
              ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`request-table-skeleton-${index}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-11/12" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-11/12" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-full" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </td>
                </tr>
              ))
              : null}
            {requests.map((requestItem) => {
              const schedule = getEffectiveRequestSchedule(requestItem)
              const statusPresentation = getRequestStatusPresentation(requestItem.status)
              const requestType = getRequestTypePresentation(requestItem)

              return (
                <tr key={requestItem.id} className="border-t border-border">
                  <td className="px-3 py-2">{schedule ? displayTutorName(schedule) : "-"}</td>
                  <td className="px-3 py-2">{schedule ? displayStudentName(schedule) : "-"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={requestType.className}>
                      {requestType.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={statusPresentation.className}>
                      {statusPresentation.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{renderActions(requestItem)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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
          title="Requests Calendar"
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
          onItemClick={() => {
            // List view already includes all request details and actions.
          }}
        />
      </div>
    </section>
  )
}
