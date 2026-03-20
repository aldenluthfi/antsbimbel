import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { authApi, parseApiError, type Session } from "@/lib/api"
import { notifySubmitError } from "@/lib/helpers/notifications"

export function LoginPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
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
    <main className="relative flex min-h-svh items-center justify-center bg-[radial-gradient(circle_at_15%_20%,rgba(240,210,120,0.26),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(42,132,122,0.28),transparent_55%)] p-4 md:p-10">
      <section className="w-full max-w-md rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg backdrop-blur md:p-8">
        <p className="mb-2 text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
          ANTS BIMBEL
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Staff Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in using your admin or tutor account to access schedules and attendance.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Username</span>
            <input
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
            />
          </label>

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  )
}
