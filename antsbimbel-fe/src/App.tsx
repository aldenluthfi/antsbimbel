import { useEffect, useState } from "react"

import { authApi, type Session } from "@/lib/api"
import { DashboardPage } from "@/pages/DashboardPage"
import { LoginPage } from "@/pages/LoginPage"

const SESSION_STORAGE_KEY = "antsbimbel_session"

export function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const cached = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!cached) {
      return null
    }

    try {
      return JSON.parse(cached) as Session
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [session])

  const logout = async () => {
    if (session?.token) {
      try {
        await authApi.logout(session.token)
      } catch {
        // Ignore logout API failures and clear local state anyway.
      }
    }
    setSession(null)
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />
  }

  return <DashboardPage session={session} onLogout={logout} />
}

export default App
