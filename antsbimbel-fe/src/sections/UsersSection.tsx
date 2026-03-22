import { useEffect, useState } from "react"
import { KeyRound, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Pagination } from "@/components/schedules"
import { Badge } from "@/components/ui/badge"
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
import { authApi, type ApiUser, parseApiError, usersApi } from "@/lib/api"
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
  const [deleteTargetUser, setDeleteTargetUser] = useState<ApiUser | null>(null)
  const [isDeletingUser, setIsDeletingUser] = useState(false)
  const [resetTargetUser, setResetTargetUser] = useState<ApiUser | null>(null)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    is_active: true,
  })
  const [editForm, setEditForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    is_active: true,
  })
  const editingUser = editingUserId ? users.find((user) => user.id === editingUserId) ?? null : null

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

  const submitDeleteUser = async () => {
    if (!deleteTargetUser) {
      return
    }

    setIsDeletingUser(true)
    setError("")
    try {
      await usersApi.remove(deleteTargetUser.id, token)
      toast.success("Tutor deleted")
      if (editingUserId === deleteTargetUser.id) {
        cancelEditUser()
      }
      setDeleteTargetUser(null)
      await fetchUsers()
    } catch (deleteError) {
      setError(parseApiError(deleteError))
      notifySubmitError(deleteError, "Delete tutor failed")
    } finally {
      setIsDeletingUser(false)
    }
  }

  const submitResetUserPassword = async () => {
    if (!resetTargetUser) {
      return
    }

    setIsResettingPassword(true)
    setError("")
    try {
      const response = await authApi.resetPassword({ user_id: resetTargetUser.id }, token)
      toast.success(response.detail)
      setResetTargetUser(null)
    } catch (resetError) {
      setError(parseApiError(resetError))
      notifySubmitError(resetError, "Reset tutor password failed")
    } finally {
      setIsResettingPassword(false)
    }
  }

  return (
    <section className="flex flex-col space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3>Users</h3>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          Create tutor
        </Button>
      </div>

      <Input
        value={searchQuery}
        onChange={(event) => {
          setSearchQuery(event.target.value)
          setPage(1)
        }}
        placeholder="Search by username, name, or email"
        className="h-9 w-full"
      />

      <div className="flex flex-col space-y-3 md:hidden">
        {loading && users.length === 0
          ? Array.from({ length: 2 }).map((_, index) => (
            <article key={`user-mobile-skeleton-${index}`} className="rounded-xl border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-1 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-24" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </article>
          ))
          : null}
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border border-border bg-background p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{user.username}</p>
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
              <Button className="flex-1" size="sm" variant="destructive" onClick={() => setDeleteTargetUser(user)}>
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
              <th className="w-56 px-3 py-2">Name</th>
              <th className="w-40 px-3 py-2">Username</th>
              <th className="px-3 py-2">Email</th>
              <th className="w-56 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0
              ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`user-table-skeleton-${index}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-5/6" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-3 py-2">
                    <Skeleton className="h-4 w-11/12" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-28" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </td>
                </tr>
              ))
              : null}
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {user.first_name} {user.last_name}
                </td>
                <td className="px-3 py-2">{user.username}</td>
                <td className="px-3 py-2">{user.email || "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditUser(user)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTargetUser(user)}>
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={4}>
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90svh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create tutor</DialogTitle>
            <DialogDescription>
              Fill in the tutor account details below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createUser} className="flex flex-col space-y-4">
            <div className="grid gap-3">
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  Username <span className="text-destructive">*</span>
                </span>
                <Input
                  required
                  value={createForm.username}
                  onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })}
                  placeholder="username"
                  className="h-9"
                />
              </label>
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
                <span className="font-medium">
                  Last name <span className="text-destructive">*</span>
                </span>
                <Input
                  required
                  value={createForm.last_name}
                  onChange={(event) => setCreateForm({ ...createForm, last_name: event.target.value })}
                  placeholder="Last name"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  Email <span className="text-destructive">*</span>
                </span>
                <Input
                  required
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
                  placeholder="name@example.com"
                  className="h-9"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.is_active}
                  onChange={(event) => setCreateForm({ ...createForm, is_active: event.target.checked })}
                />
                Active user
              </label>
            </div>
            <DialogFooter>
              <Button disabled={creating} type="submit">
                {creating ? "Creating..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingUserId)} onOpenChange={(open) => (!open ? cancelEditUser() : null)}>
        <DialogContent className="max-h-[90svh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit tutor</DialogTitle>
            <DialogDescription>
              Update tutor account details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={updateUser} className="flex flex-col space-y-4">
            <div className="grid gap-3">
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">
                  Username <span className="text-destructive">*</span>
                </span>
                <Input
                  required
                  value={editForm.username}
                  onChange={(event) => setEditForm({ ...editForm, username: event.target.value })}
                  placeholder="username"
                  className="h-9"
                />
              </label>
              <label className="flex flex-col space-y-2 text-sm">
                <span className="font-medium">First name</span>
                <Input
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
                  placeholder="name@example.com"
                  className="h-9"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })}
                />
                Active user
              </label>
            </div>
            <DialogFooter>
              <Button disabled={isEditing} type="submit">
                {isEditing ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEditUser}>
                Cancel
              </Button>
              <Button
                disabled={isResettingPassword || !editingUser}
                type="button"
                variant="outline"
                onClick={() => {
                  if (editingUser) {
                    setResetTargetUser(editingUser)
                  }
                }}
              >
                <KeyRound className="size-4" />
                Reset password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTargetUser)}
        onOpenChange={(open) => {
          if (!open && !isDeletingUser) {
            setDeleteTargetUser(null)
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Delete tutor</DialogTitle>
            <DialogDescription>
              {deleteTargetUser ? `Delete tutor ${deleteTargetUser.username}? This action cannot be undone.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={isDeletingUser} type="button" variant="outline" onClick={() => setDeleteTargetUser(null)}>
              Cancel
            </Button>
            <Button
              disabled={isDeletingUser || !deleteTargetUser}
              type="button"
              variant="destructive"
              onClick={submitDeleteUser}
            >
              {isDeletingUser ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetTargetUser)}
        onOpenChange={(open) => {
          if (!open && !isResettingPassword) {
            setResetTargetUser(null)
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {resetTargetUser
                ? `Reset password for ${resetTargetUser.username}? New password will be set to ${resetTargetUser.first_name.toLowerCase()}.${resetTargetUser.last_name.toLowerCase()} and sent to the tutor email.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={isResettingPassword} type="button" variant="outline" onClick={() => setResetTargetUser(null)}>
              Cancel
            </Button>
            <Button disabled={isResettingPassword || !resetTargetUser} type="button" onClick={submitResetUserPassword}>
              {isResettingPassword ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
