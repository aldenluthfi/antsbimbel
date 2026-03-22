import { useState } from "react"
import { toast } from "sonner"
import { KeyRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { authApi } from "@/lib/api"
import { notifySubmitError } from "@/lib/helpers/notifications"

export function TutorPasswordSection({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const resetForm = () => {
    setOldPassword("")
    setNewPassword("")
    setConfirmNewPassword("")
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)

    try {
      const response = await authApi.resetPassword(
        {
          old_password: oldPassword,
          new_password: newPassword,
          confirm_new_password: confirmNewPassword,
        },
        token
      )

      toast.success(response.detail)
      resetForm()
      setOpen(false)
    } catch (error) {
      notifySubmitError(error, "Change password failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <KeyRound className="size-4" />
          Change password
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90svh] w-[95vw] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password, then set a new password.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={submit}>
          <label className="flex flex-col space-y-2 text-sm">
            <span className="font-medium">Current password <span className="text-destructive">*</span></span>
            <Input
              required
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              placeholder="Enter current password"
              className="h-9"
            />
          </label>

          <label className="flex flex-col space-y-2 text-sm">
            <span className="font-medium">New password <span className="text-destructive">*</span></span>
            <Input
              required
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Enter new password"
              className="h-9"
            />
          </label>

          <label className="flex flex-col space-y-2 text-sm">
            <span className="font-medium">Confirm new password <span className="text-destructive">*</span></span>
            <Input
              required
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              placeholder="Repeat new password"
              className="h-9"
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={submitting} type="submit">
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
