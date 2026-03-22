import { useEffect, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Pagination } from "@/components/schedules"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { parseApiError, studentsApi, type Student } from "@/lib/api"
import { notifySubmitError } from "@/lib/helpers/notifications"
import { getStudentFullName } from "@/lib/helpers/schedule"

export function StudentsSection({ token }: { token: string }) {
  const [students, setStudents] = useState<Student[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [, setError] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null)
  const [deleteTargetStudent, setDeleteTargetStudent] = useState<Student | null>(null)
  const [isDeletingStudent, setIsDeletingStudent] = useState(false)
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    level: "SD" as Student["level"],
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    level: "SD" as Student["level"],
    is_active: true,
  })

  const fetchStudents = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await studentsApi.list(token, page, pageSize, searchQuery)
      setStudents(response.results)
      setTotal(response.count)
    } catch (fetchError) {
      setError(parseApiError(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, searchQuery])

  const createStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      await studentsApi.create(createForm, token)
      toast.success("Student created")
      setIsCreateOpen(false)
      setCreateForm({
        first_name: "",
        last_name: "",
        email: "",
        level: "SD",
        is_active: true,
      })
      await fetchStudents()
    } catch (createError) {
      setError(parseApiError(createError))
      notifySubmitError(createError, "Create student failed")
    } finally {
      setCreating(false)
    }
  }

  const openEditStudent = (student: Student) => {
    setEditingStudentId(student.id)
    setEditForm({
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      level: student.level,
      is_active: student.is_active,
    })
  }

  const cancelEditStudent = () => {
    setEditingStudentId(null)
    setEditForm({
      first_name: "",
      last_name: "",
      email: "",
      level: "SD",
      is_active: true,
    })
  }

  const updateStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingStudentId) {
      return
    }

    setIsEditing(true)
    setError("")

    try {
      await studentsApi.update(editingStudentId, editForm, token)
      toast.success("Student updated")
      cancelEditStudent()
      await fetchStudents()
    } catch (updateError) {
      setError(parseApiError(updateError))
      notifySubmitError(updateError, "Update student failed")
    } finally {
      setIsEditing(false)
    }
  }

  const submitDeleteStudent = async () => {
    if (!deleteTargetStudent) {
      return
    }

    setIsDeletingStudent(true)
    setError("")
    try {
      await studentsApi.remove(deleteTargetStudent.id, token)
      toast.success("Student deleted")
      if (editingStudentId === deleteTargetStudent.id) {
        cancelEditStudent()
      }
      setDeleteTargetStudent(null)
      await fetchStudents()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
      notifySubmitError(deleteError, "Delete student failed")
    } finally {
      setIsDeletingStudent(false)
    }
  }

  return (
    <section className="flex flex-col space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3>Students</h3>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          Create student
        </Button>
      </div>

      <Input
        value={searchQuery}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setPage(1)
        }}
        placeholder="Search by name, email, or level"
        className="h-9 w-full"
      />

      <div className="flex flex-col space-y-3 md:hidden">
        {loading && students.length === 0
          ? Array.from({ length: 2 }).map((_, index) => (
            <article key={`student-mobile-skeleton-${index}`} className="rounded-xl border border-border bg-background p-3 text-sm">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-4 w-16" />
              <Skeleton className="mt-1 h-4 w-3/5" />
              <Skeleton className="mt-1 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-24" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </article>
          ))
          : null}
        {students.map((student) => (
          <article key={student.id} className="rounded-xl border border-border bg-background p-3 text-sm">
            <p className="font-semibold">{getStudentFullName(student)}</p>
            <p className="mt-2 text-muted-foreground">Level: {student.level}</p>
            <p className="text-muted-foreground">Email: {student.email || "-"}</p>
            <p className="mt-2 text-muted-foreground">Active: {student.is_active ? "Yes" : "No"}</p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" size="sm" variant="outline" onClick={() => openEditStudent(student)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button className="flex-1" size="sm" variant="destructive" onClick={() => setDeleteTargetStudent(student)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </article>
        ))}
        {students.length === 0 && !loading ? (
          <p className="rounded-xl border border-border px-3 py-5 text-center text-sm text-muted-foreground">
            No students found.
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="w-56 px-3 py-2">Name</th>
              <th className="w-40 px-3 py-2">Level</th>
              <th className="px-3 py-2">Email</th>
              <th className="w-48 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && students.length === 0
              ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`student-table-skeleton-${index}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-5/6" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-10" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-11/12" />
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
            {students.map((student) => (
              <tr key={student.id} className="border-t border-border">
                <td className="px-3 py-2">{getStudentFullName(student)}</td>
                <td className="px-3 py-2">{student.level}</td>
                <td className="px-3 py-2">{student.email || "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditStudent(student)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTargetStudent(student)}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={4}>
                  No students found.
                </td>
              </tr>
            ) : null}
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90svh] w-[95vw] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create student</DialogTitle>
            <DialogDescription>
              Fill in the student profile details below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createStudent} className="flex flex-col space-y-4">
            <div className="grid gap-3">
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  First name <span className="text-destructive">*</span>
                </span>
                <Input
                  required
                  value={createForm.first_name}
                  onChange={(event) => setCreateForm({ ...createForm, first_name: event.target.value })}
                  placeholder="First name"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Last name</span>
                <Input
                  value={createForm.last_name}
                  onChange={(event) => setCreateForm({ ...createForm, last_name: event.target.value })}
                  placeholder="Last name"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Email</span>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
                  placeholder="student@example.com"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Level</span>
                <select
                  value={createForm.level}
                  onChange={(event) => setCreateForm({ ...createForm, level: event.target.value as Student["level"] })}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                  <option value="SMA">SMA</option>
                </select>
              </label>
              <label className="col-span-full flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.is_active}
                  onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.checked })}
                />
                Active student
              </label>
            </div>
            <DialogFooter>
              <Button disabled={creating} type="submit">
                {creating ? "Creating..." : "Save new student"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingStudentId)} onOpenChange={(open) => (!open ? cancelEditStudent() : null)}>
        <DialogContent className="max-h-[90svh] w-[95vw] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
            <DialogDescription>
              Update student profile details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={updateStudent} className="flex flex-col space-y-4">
            <div className="grid gap-3">
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  First name <span className="text-destructive">*</span>
                </span>
                <Input
                  required
                  value={editForm.first_name}
                  onChange={(event) => setEditForm({ ...editForm, first_name: event.target.value })}
                  placeholder="First name"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Last name</span>
                <Input
                  value={editForm.last_name}
                  onChange={(event) => setEditForm({ ...editForm, last_name: event.target.value })}
                  placeholder="Last name"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Email</span>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                  placeholder="student@example.com"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">Level</span>
                <select
                  value={editForm.level}
                  onChange={(event) => setEditForm({ ...editForm, level: event.target.value as Student["level"] })}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                  <option value="SMA">SMA</option>
                </select>
              </label>
              <label className="col-span-full flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
                />
                Active student
              </label>
            </div>
            <DialogFooter>
              <Button disabled={isEditing} type="submit">
                {isEditing ? "Saving..." : "Save changes"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEditStudent}>
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTargetStudent)}
        onOpenChange={(open) => {
          if (!open && !isDeletingStudent) {
            setDeleteTargetStudent(null)
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Delete student</DialogTitle>
            <DialogDescription>
              {deleteTargetStudent
                ? `Delete student #${deleteTargetStudent.id} (${getStudentFullName(deleteTargetStudent)})? This action cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isDeletingStudent}
              type="button"
              variant="outline"
              onClick={() => setDeleteTargetStudent(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={isDeletingStudent || !deleteTargetStudent}
              type="button"
              variant="destructive"
              onClick={submitDeleteStudent}
            >
              {isDeletingStudent ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
