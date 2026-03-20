import { useEffect, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Pagination } from "@/components/schedules"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
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
      is_active: student.is_active,
    })
  }

  const cancelEditStudent = () => {
    setEditingStudentId(null)
    setEditForm({
      first_name: "",
      last_name: "",
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

  const deleteStudent = async (student: Student) => {
    const shouldDelete = window.confirm(`Delete student #${student.id}?`)
    if (!shouldDelete) {
      return
    }

    setError("")
    try {
      await studentsApi.remove(student.id, token)
      toast.success("Student deleted")
      if (editingStudentId === student.id) {
        cancelEditStudent()
      }
      await fetchStudents()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
      notifySubmitError(deleteError, "Delete student failed")
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Students</h3>
        <Button size="sm" onClick={() => setIsCreateOpen((open) => !open)}>
          {isCreateOpen ? "Close" : "Create student"}
        </Button>
      </div>

      <Input
        value={searchQuery}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setPage(1)
        }}
        placeholder="Search by ID or name"
        className="h-9 md:max-w-sm"
      />

      {isCreateOpen ? (
        <form onSubmit={createStudent} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <Input
            required
            value={createForm.first_name}
            onChange={(event) => setCreateForm({ ...createForm, first_name: event.target.value })}
            placeholder="First name"
            className="h-9"
          />
          <Input
            value={createForm.last_name}
            onChange={(event) => setCreateForm({ ...createForm, last_name: event.target.value })}
            placeholder="Last name"
            className="h-9"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.checked })}
            />
            Active student
          </label>
          <Button className="md:col-span-1" disabled={creating} type="submit">
            {creating ? "Creating..." : "Save new student"}
          </Button>
        </form>
      ) : null}

      {editingStudentId ? (
        <form onSubmit={updateStudent} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-2">
          <Input
            required
            value={editForm.first_name}
            onChange={(event) => setEditForm({ ...editForm, first_name: event.target.value })}
            placeholder="First name"
            className="h-9"
          />
          <Input
            value={editForm.last_name}
            onChange={(event) => setEditForm({ ...editForm, last_name: event.target.value })}
            placeholder="Last name"
            className="h-9"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
            />
            Active student
          </label>
          <div className="col-span-full flex gap-2">
            <Button disabled={isEditing} type="submit">
              {isEditing ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={cancelEditStudent}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading students...</p> : null}

      <div className="space-y-3 md:hidden">
        {students.map((student) => (
          <article key={student.id} className="rounded-xl border border-border bg-background p-3 text-sm">
            <p className="font-semibold">{getStudentFullName(student)}</p>
            <p className="text-xs text-muted-foreground">#{student.id}</p>
            <p className="mt-2 text-muted-foreground">Active: {student.is_active ? "Yes" : "No"}</p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" size="sm" variant="outline" onClick={() => openEditStudent(student)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button className="flex-1" size="sm" variant="destructive" onClick={() => deleteStudent(student)}>
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
        <table className="min-w-full text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-t border-border">
                <td className="px-3 py-2">{student.id}</td>
                <td className="px-3 py-2">{getStudentFullName(student)}</td>
                <td className="px-3 py-2">{student.is_active ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditStudent(student)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteStudent(student)}>
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
    </section>
  )
}
