import { type ApiUser, type Schedule, type Student } from "@/lib/api"

export function displayStudentName(schedule: Schedule): string {
  return schedule.student_name?.trim() || `#${schedule.student}`
}

export function displayUserName(schedule: Schedule): string {
  return schedule.tutor_name?.trim() || `#${schedule.tutor}`
}

function composeDisplayName(firstName?: string, lastName?: string): string {
  const first = (firstName ?? "").trim()
  const last = (lastName ?? "").trim()
  if (first && last) {
    return `${first} — ${last}`
  }
  return first || last
}

export function getUserFullName(tutor: Pick<ApiUser, "id" | "username" | "first_name" | "last_name">): string {
  return composeDisplayName(tutor.first_name, tutor.last_name) || tutor.username || `#${tutor.id}`
}

export function getStudentFullName(student: Pick<Student, "id" | "first_name" | "last_name">): string {
  return composeDisplayName(student.first_name, student.last_name) || `#${student.id}`
}
