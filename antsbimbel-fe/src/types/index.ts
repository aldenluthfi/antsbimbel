export interface Tutor {
  id: string;
  name: string;
  email: string;
  subjects: string[];
  avatar?: string;
}

export interface ClockEntry {
  id: string;
  tutorId: string;
  clockIn: Date;
  clockOut?: Date;
  duration?: number; // in minutes
}

export interface ScheduleEntry {
  id: string;
  tutorId: string;
  studentName: string;
  subject: string;
  date: Date;
  startTime: string;
  endTime: string;
  location: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  notes?: string;
}

export interface LogEntry {
  id: string;
  tutorId: string;
  studentName: string;
  subject: string;
  date: Date;
  duration: number; // in minutes
  topics: string[];
  notes: string;
  homework?: string;
  rating?: number;
}
