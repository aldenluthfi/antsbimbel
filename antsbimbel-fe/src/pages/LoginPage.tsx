import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { authApi, parseApiError, type Session } from "@/lib/api"
import { notifySubmitError } from "@/lib/helpers/notifications"

export function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [, setError] = useState("")

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)
    try {
      const payload = await authApi.login(username, password)
      toast.success("Login successful")
      onLogin(payload)
    } catch (submissionError) {
      setError(parseApiError(submissionError))
      notifySubmitError(submissionError, "Login failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-background p-4 md:p-10">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
        <p className="type-eyebrow mb-2">
          ANTS BIMBEL
        </p>
        <h1>Staff Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in using your admin or tutor account to access schedules and attendance.
        </p>

        <form className="mt-6 flex flex-col space-y-4" onSubmit={submit}>
          <label className="flex flex-col space-y-2">
            <span className="text-sm font-medium">Username</span>
            <input
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>

          <label className="flex flex-col space-y-2">
            <span className="text-sm font-medium">Password</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-10 text-sm outline-none transition focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground transition hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  )
}
