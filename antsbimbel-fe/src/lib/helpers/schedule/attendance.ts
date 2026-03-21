function resolveApiBase(): string {
  const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  const isBrowser = typeof window !== "undefined"

  if (!configuredBase) {
    if (isBrowser && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return "/api"
    }
    return "http://127.0.0.1:8000/api"
  }

  const normalizedBase = configuredBase.replace(/\/+$/, "")
  if (isBrowser && window.location.protocol === "https:" && normalizedBase.startsWith("http://")) {
    return normalizedBase.replace(/^http:\/\//, "https://")
  }

  return normalizedBase
}

const API_BASE = resolveApiBase()

export function buildAttendancePhotoUrl(checkInId: number, photoKind: "check-in" | "check-out"): string {
  return `${API_BASE}/attendance/${checkInId}/photo/${photoKind}/`
}
