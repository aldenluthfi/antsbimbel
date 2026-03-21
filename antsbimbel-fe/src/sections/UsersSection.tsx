import { useEffect, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Pagination } from "@/components/schedules"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type ApiUser, parseApiError, usersApi } from "@/lib/api"
import { notifySubmitError } from "@/lib/helpers/notifications"

export function UsersSection({ token }: { token: string }) {
  const [users, setUsers] = useState<ApiUser[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [, setError] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [createForm, setCreateForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    is_active: true,
  })

  const fetchUsers = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await usersApi.list(token, page, pageSize, searchQuery)
      setUsers(response.results)
      setTotal(response.count)
    } catch (fetchError) {
      setError(parseApiError(fetchError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, searchQuery])

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      await usersApi.create(createForm, token)
      toast.success("Tutor created")
      setIsCreateOpen(false)
      setCreateForm({
        username: "",
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        is_active: true,
      })
      await fetchUsers()
    } catch (createError) {
      setError(parseApiError(createError))
      notifySubmitError(createError, "Create tutor failed")
    } finally {
      setCreating(false)
    }
  }

  const openEditUser = (user: ApiUser) => {
    setEditingUserId(user.id)
    setEditForm({
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      password: "",
      is_active: user.is_active,
    })
  }

  const cancelEditUser = () => {
    setEditingUserId(null)
    setEditForm({
      username: "",
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      is_active: true,
    })
  }

  const updateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingUserId) {
      return
    }

    setIsEditing(true)
    setError("")

    const payload: Record<string, string | boolean> = {
      username: editForm.username,
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      email: editForm.email,
      is_active: editForm.is_active,
    }

    const password = editForm.password.trim()
    if (password) {
      payload.password = password
    }

    try {
      await usersApi.update(editingUserId, payload, token)
      toast.success("Tutor updated")
      cancelEditUser()
      await fetchUsers()
    } catch (updateError) {
      setError(parseApiError(updateError))
      notifySubmitError(updateError, "Update tutor failed")
    } finally {
      setIsEditing(false)
    }
  }

  const deleteUser = async (user: ApiUser) => {
    const shouldDelete = window.confirm(`Delete tutor ${user.username}?`)
    if (!shouldDelete) {
      return
    }

    setError("")
    try {
      await usersApi.remove(user.id, token)
      toast.success("Tutor deleted")
      if (editingUserId === user.id) {
        cancelEditUser()
      }
      await fetchUsers()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
      notifySubmitError(deleteError, "Delete tutor failed")
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Users</h3>
        <Button size="sm" onClick={() => setIsCreateOpen((open) => !open)}>
          {isCreateOpen ? "Close" : "Create tutor"}
        </Button>
      </div>

      <Input
        value={searchQuery}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setPage(1)
        }}
        placeholder="Search by ID or name"
        className="h-9 w-full"
      />

      {isCreateOpen ? (
        <form onSubmit={createUser} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-3">
          <input
            required
            value={createForm.username}
            onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })}
            placeholder="Username"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            value={createForm.first_name}
            onChange={(event) => setCreateForm({ ...createForm, first_name: event.target.value })}
            placeholder="First name"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            value={createForm.last_name}
            onChange={(event) => setCreateForm({ ...createForm, last_name: event.target.value })}
            placeholder="Last name"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            type="email"
            value={createForm.email}
            onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
            placeholder="Email"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <input
            required
            type="password"
            value={createForm.password}
            onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
            placeholder="Password"
            className="h-9 rounded-lg border border-border px-3 text-sm"
          />
          <label className="col-span-full flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.checked })}
            />
            Active user
          </label>
          <Button className="md:col-span-1" disabled={creating} type="submit">
            {creating ? "Creating..." : "Save new user"}
          </Button>
        </form>
      ) : null}

      {editingUserId ? (
        <form onSubmit={updateUser} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-3">
          <Input
            required
            value={editForm.username}
            onChange={(event) => setEditForm({ ...editForm, username: event.target.value })}
            placeholder="Username"
            className="h-9"
          />
          <Input
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
          <Input
            type="email"
            value={editForm.email}
            onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
            placeholder="Email"
            className="h-9"
          />
          <Input
            type="password"
            value={editForm.password}
            onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
            placeholder="New password (optional)"
            className="h-9"
          />
          <label className="col-span-full flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
            />
            Active user
          </label>
          <div className="col-span-full flex gap-2">
            <Button disabled={isEditing} type="submit">
              {isEditing ? "Saving..." : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={cancelEditUser}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading users...</p> : null}

      <div className="space-y-3 md:hidden">
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border border-border bg-background p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{user.username}</p>
                <p className="text-xs text-muted-foreground">#{user.id}</p>
              </div>
              <Badge variant="outline" className="capitalize">
                {user.role}
              </Badge>
            </div>
            <p className="mt-2 text-muted-foreground">{user.first_name} {user.last_name}</p>
            <p className="mt-1 break-all text-muted-foreground">{user.email || "-"}</p>
            <p className="mt-1 text-muted-foreground">Active: {user.is_active ? "Yes" : "No"}</p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" size="sm" variant="outline" onClick={() => openEditUser(user)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button className="flex-1" size="sm" variant="destructive" onClick={() => deleteUser(user)}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </article>
        ))}
        {users.length === 0 && !loading ? (
          <p className="rounded-xl border border-border px-3 py-5 text-center text-sm text-muted-foreground">
            No users found.
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="w-16 px-3 py-2">ID</th>
              <th className="w-40 px-3 py-2">Username</th>
              <th className="w-44 px-3 py-2">Name</th>
              <th className="w-28 px-3 py-2">Role</th>
              <th className="px-3 py-2">Email</th>
              <th className="w-20 px-3 py-2">Active</th>
              <th className="w-52 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border">
                <td className="px-3 py-2">{user.id}</td>
                <td className="px-3 py-2">{user.username}</td>
                <td className="px-3 py-2">
                  {user.first_name} {user.last_name}
                </td>
                <td className="px-3 py-2 capitalize">{user.role}</td>
                <td className="px-3 py-2">{user.email || "-"}</td>
                <td className="px-3 py-2">{user.is_active ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditUser(user)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteUser(user)}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={7}>
                  No users found.
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
