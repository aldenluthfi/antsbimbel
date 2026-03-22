import { useEffect, useState } from "react"
import { CalendarCheck, CalendarClock, LogOut, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { type EmailBlastMode, parseApiError, schedulesApi, type Session } from "@/lib/api"
import { RequestsSection } from "@/sections/RequestsSection"
import { SchedulesSection } from "@/sections/SchedulesSection"
import { StudentsSection } from "@/sections/StudentsSection"
import { TutorPasswordSection } from "@/sections/TutorPasswordSection"
import { UsersSection } from "@/sections/UsersSection"

type DashboardTab = "users" | "students" | "schedules" | "requests"

export function DashboardPage({
  session,
  onLogout,
}: {
  session: Session
  onLogout: () => void
}) {
  const isAdmin = session.user.role === "admin"
  const [activeTab, setActiveTab] = useState<DashboardTab>(isAdmin ? "users" : "schedules")
  const [blastPermission, setBlastPermission] = useState({ can_daily: false, can_weekly: false })
  const [loadingPermission, setLoadingPermission] = useState(false)
  const [sendingBlastMode, setSendingBlastMode] = useState<EmailBlastMode | null>(null)

  useEffect(() => {
    if (!isAdmin) {
      return
    }

    const fetchBlastPermission = async () => {
      setLoadingPermission(true)
      try {
        const permission = await schedulesApi.getEmailBlastPermission(session.token)
        setBlastPermission(permission)
      } catch {
        setBlastPermission({ can_daily: false, can_weekly: false })
      } finally {
        setLoadingPermission(false)
      }
    }

    void fetchBlastPermission()
  }, [isAdmin, session.token])

  const triggerBlast = async (mode: EmailBlastMode) => {
    if (!isAdmin) {
      return
    }

    setSendingBlastMode(mode)
    try {
      const response = await schedulesApi.sendEmailBlast(mode, session.token)
      setBlastPermission(response.permission)
      toast.success(`${mode === "daily" ? "Daily" : "Weekly"} blast sent`, {
        description: `Success: ${response.sent_count}, Failed: ${response.failed_count}`,
      })
    } catch (error) {
      toast.error(`${mode === "daily" ? "Daily" : "Weekly"} blast failed`, {
        description: parseApiError(error),
      })
    } finally {
      setSendingBlastMode(null)
    }
  }

  return (
    <main className="min-h-svh bg-background p-3 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="type-eyebrow">
              ANTS BIMBEL PORTAL
            </p>
            <h1 className="mt-1 flex items-center gap-2">
              <CalendarClock className="size-8" />
              {isAdmin ? "Admin Dashboard" : "Tutor Dashboard"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Logged in as {session.user.username} ({session.user.role})
            </p>
          </div>

          <div className="flex flex-col w-full gap-2 sm:flex-row sm:w-auto">
            {isAdmin ? (
              <>
                <Button
                  className="w-full sm:w-auto"
                  disabled={loadingPermission || sendingBlastMode !== null || !blastPermission.can_daily}
                  onClick={() => void triggerBlast("daily")}
                >
                  Daily Blast
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  disabled={loadingPermission || sendingBlastMode !== null || !blastPermission.can_weekly}
                  onClick={() => void triggerBlast("weekly")}
                >
                  Weekly Blast
                </Button>
              </>
            ) : null}
            {!isAdmin ? <TutorPasswordSection token={session.token} /> : null}
            <Button variant="outline" className="w-full sm:w-auto" onClick={onLogout}>
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </header>

        {isAdmin ? (
          <nav className="grid grid-cols-1 gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm sm:grid-cols-4">
            <Button
              variant={activeTab === "users" ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setActiveTab("users")}
            >
              <UserRound className="size-4" />
              Tutors
            </Button>
            <Button
              variant={activeTab === "students" ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setActiveTab("students")}
            >
              <UserRound className="size-4" />
              Students
            </Button>
            <Button
              variant={activeTab === "schedules" ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setActiveTab("schedules")}
            >
              <CalendarCheck className="size-4" />
              Schedules
            </Button>
            <Button
              variant={activeTab === "requests" ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => setActiveTab("requests")}
            >
              <CalendarCheck className="size-4" />
              Requests
            </Button>
          </nav>
        ) : null}

        {activeTab === "users" && isAdmin ? <UsersSection token={session.token} /> : null}
        {activeTab === "students" && isAdmin ? <StudentsSection token={session.token} /> : null}
        {activeTab === "schedules" ? (
          <SchedulesSection
            token={session.token}
            canManage={isAdmin}
            tutorId={isAdmin ? undefined : session.user.id}
          />
        ) : null}
        {activeTab === "requests" && isAdmin ? <RequestsSection token={session.token} /> : null}
      </div>
    </main>
  )
}
