import { type ApiUser, type Schedule, type Student } from "@/lib/api"

export function displayStudentName(schedule: Schedule): string {
  return schedule.student_name?.trim() || `#${schedule.student}`
}

export function displayTutorName(schedule: Schedule): string {
  return schedule.tutor_name?.trim() || `#${schedule.tutor}`
}

export function getTutorFullName(tutor: Pick<ApiUser, "id" | "username" | "first_name" | "last_name">): string {
  const fullName = `${tutor.first_name ?? ""} ${tutor.last_name ?? ""}`.trim()
  return fullName || tutor.username || `#${tutor.id}`
}

export function getStudentFullName(student: Pick<Student, "id" | "first_name" | "last_name">): string {
  const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()
  return fullName || `#${student.id}`
}
