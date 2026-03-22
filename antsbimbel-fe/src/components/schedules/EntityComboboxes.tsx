import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { type ApiUser, type Student } from "@/lib/api"
import { getStudentFullName, getUserFullName } from "@/lib/helpers/schedule"

export function TutorCombobox({
  tutors,
  value,
  onChange,
  onSearchQueryChange,
  disabled,
  placeholder,
}: {
  tutors: ApiUser[]
  value: string
  onChange: (value: string) => void
  onSearchQueryChange?: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selectedTutor = tutors.find((tutor) => String(tutor.id) === value)
  const filteredTutors = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return tutors
    }

    return tutors.filter((tutor) => {
      return (
        String(tutor.id).includes(normalized) ||
        tutor.username.toLowerCase().includes(normalized) ||
        getUserFullName(tutor).toLowerCase().includes(normalized) ||
        tutor.email.toLowerCase().includes(normalized)
      )
    })
  }, [query, tutors])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery("")
          onSearchQueryChange?.("")
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between"
        >
          <span className="truncate text-left">
            {selectedTutor
              ? `${getUserFullName(selectedTutor)} (#${selectedTutor.id})`
              : (placeholder ?? "Select tutor")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
        <Input
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value
            setQuery(nextQuery)
            onSearchQueryChange?.(nextQuery)
          }}
          placeholder="Search by ID or name"
          className="h-9"
        />
        <div
          className="mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-md border border-border"
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          {filteredTutors.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No tutor found.</p>
          ) : (
            filteredTutors.map((tutor) => {
              const isSelected = String(tutor.id) === value

              return (
                <button
                  key={tutor.id}
                  type="button"
                  onClick={() => {
                    onChange(String(tutor.id))
                    setOpen(false)
                    setQuery("")
                    onSearchQueryChange?.("")
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{getUserFullName(tutor)}</span>
                    <span className="block truncate text-xs text-muted-foreground">ID {tutor.id} • {tutor.email}</span>
                  </span>
                  {isSelected ? <Check className="size-4" /> : null}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StudentCombobox({
  students,
  value,
  onChange,
  onSearchQueryChange,
  disabled,
  placeholder,
}: {
  students: Student[]
  value: string
  onChange: (value: string) => void
  onSearchQueryChange?: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selectedStudent = students.find((student) => String(student.id) === value)
  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return students
    }

    return students.filter((student) => {
      return (
        String(student.id).includes(normalized) ||
        getStudentFullName(student).toLowerCase().includes(normalized)
      )
    })
  }, [query, students])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery("")
          onSearchQueryChange?.("")
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between"
        >
          <span className="truncate text-left">
            {selectedStudent
              ? `${getStudentFullName(selectedStudent)} (#${selectedStudent.id})`
              : (placeholder ?? "Select student")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
        <Input
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value
            setQuery(nextQuery)
            onSearchQueryChange?.(nextQuery)
          }}
          placeholder="Search by ID or name"
          className="h-9"
        />
        <div
          className="mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-md border border-border"
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          {filteredStudents.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No student found.</p>
          ) : (
            filteredStudents.map((student) => {
              const isSelected = String(student.id) === value

              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => {
                    onChange(String(student.id))
                    setOpen(false)
                    setQuery("")
                    onSearchQueryChange?.("")
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{getStudentFullName(student)}</span>
                    <span className="block truncate text-xs text-muted-foreground">ID {student.id} • {student.email}</span>
                  </span>
                  {isSelected ? <Check className="size-4" /> : null}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
