import { useState } from "react"
import { CalendarCheck, CalendarClock, LogOut, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type Session } from "@/lib/api"
import { SchedulesSection } from "@/sections/SchedulesSection"
import { StudentsSection } from "@/sections/StudentsSection"
import { UsersSection } from "@/sections/UsersSection"

type DashboardTab = "users" | "students" | "schedules"

export function DashboardPage({
  session,
  onLogout,
}: {
  session: Session
  onLogout: () => void
}) {
  const isAdmin = session.user.role === "admin"
  const [activeTab, setActiveTab] = useState<DashboardTab>(isAdmin ? "users" : "schedules")

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_8%_15%,rgba(60,120,230,0.16),transparent_36%),radial-gradient(circle_at_85%_5%,rgba(219,129,66,0.2),transparent_44%),radial-gradient(circle_at_90%_85%,rgba(39,172,130,0.14),transparent_38%)] p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
              ANTS BIMBEL PORTAL
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold md:text-2xl">
              <CalendarClock className="size-5" />
              {isAdmin ? "Admin Dashboard" : "Tutor Dashboard"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Logged in as {session.user.username} ({session.user.role})
            </p>
          </div>

          <Button variant="outline" className="w-full sm:w-auto" onClick={onLogout}>
            <LogOut className="size-4" />
            Logout
          </Button>
        </header>

        {isAdmin ? (
          <nav className="grid grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-card/70 p-3 sm:grid-cols-3">
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
      </div>
    </main>
  )
}
