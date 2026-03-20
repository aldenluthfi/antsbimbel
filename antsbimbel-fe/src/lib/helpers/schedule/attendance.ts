const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000/api"

export function buildAttendancePhotoUrl(checkInId: number, photoKind: "check-in" | "check-out"): string {
  return `${API_BASE}/attendance/${checkInId}/photo/${photoKind}/`
}
