import { useState } from "react"
import { CalendarCheck, CalendarClock, LogOut, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type Session } from "@/lib/api"
import { RequestsSection } from "@/sections/RequestsSection"
import { SchedulesSection } from "@/sections/SchedulesSection"
import { StudentsSection } from "@/sections/StudentsSection"
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

          <Button variant="outline" className="w-full sm:w-auto" onClick={onLogout}>
            <LogOut className="size-4" />
            Logout
          </Button>
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
