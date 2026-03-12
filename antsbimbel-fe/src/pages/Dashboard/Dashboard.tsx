import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { ClockEntry } from '../../types';
import { currentTutor, mockSchedule, mockClockEntries } from '../../data/mockData';

export default function Dashboard() {
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [clockHistory, setClockHistory] = useState<ClockEntry[]>(mockClockEntries);

  const todaySchedule = mockSchedule.filter(
    (s) => s.date.toDateString() === new Date().toDateString() && s.status === 'upcoming'
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isClockedIn && clockInTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((new Date().getTime() - clockInTime.getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isClockedIn, clockInTime]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleClockIn = () => {
    const now = new Date();
    setClockInTime(now);
    setIsClockedIn(true);
    setElapsedTime(0);
  };

  const handleClockOut = () => {
    if (clockInTime) {
      const now = new Date();
      const duration = Math.floor((now.getTime() - clockInTime.getTime()) / 60000);
      const newEntry: ClockEntry = {
        id: `clock-${Date.now()}`,
        tutorId: currentTutor.id,
        clockIn: clockInTime,
        clockOut: now,
        duration,
      };
      setClockHistory([newEntry, ...clockHistory]);
    }
    setIsClockedIn(false);
    setClockInTime(null);
    setElapsedTime(0);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {currentTutor.name}!</h1>
        <p className="text-gray-600 mt-1">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Clock In/Out Card */}
      <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Time Tracker</h2>

        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 text-center">
            <div
              className={`text-6xl font-mono font-bold ${
                isClockedIn ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              {formatTime(elapsedTime)}
            </div>
            <p className="text-gray-500 mt-2">
              {isClockedIn
                ? `Clocked in at ${formatDateTime(clockInTime!)}`
                : 'Not clocked in'}
            </p>
          </div>

          <div className="flex gap-4">
            {!isClockedIn ? (
              <button
                onClick={handleClockIn}
                className="px-8 py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
              >
                🕐 Clock In
              </button>
            ) : (
              <button
                onClick={handleClockOut}
                className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
              >
                🕐 Clock Out
              </button>
            )}
          </div>
        </div>

        {/* Recent Clock History */}
        {clockHistory.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Activity</h3>
            <div className="space-y-2">
              {clockHistory.slice(0, 3).map((entry) => (
                <div
                  key={entry.id}
                  className="flex justify-between items-center text-sm bg-gray-50 rounded-lg px-4 py-2"
                >
                  <span className="text-gray-600">
                    {entry.clockIn.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-gray-900 font-medium">
                    {formatDateTime(entry.clockIn)} - {entry.clockOut && formatDateTime(entry.clockOut)}
                  </span>
                  <span className="text-amber-600 font-medium">
                    {entry.duration && `${Math.floor(entry.duration / 60)}h ${entry.duration % 60}m`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📅</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{todaySchedule.length}</p>
              <p className="text-gray-500 text-sm">Sessions Today</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {mockSchedule.filter((s) => s.status === 'completed').length}
              </p>
              <p className="text-gray-500 text-sm">Completed This Week</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📚</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{currentTutor.subjects.length}</p>
              <p className="text-gray-500 text-sm">Subjects</p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Schedule Preview */}
      <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Today's Schedule</h2>
          <Link
            to="/schedule"
            className="text-amber-600 hover:text-amber-700 font-medium text-sm"
          >
            View All →
          </Link>
        </div>

        {todaySchedule.length > 0 ? (
          <div className="space-y-3">
            {todaySchedule.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
              >
                <div className="w-16 text-center">
                  <p className="text-lg font-bold text-amber-600">{session.startTime}</p>
                  <p className="text-xs text-gray-500">{session.endTime}</p>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{session.studentName}</p>
                  <p className="text-sm text-gray-500">
                    {session.subject} • {session.location}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    session.status === 'upcoming'
                      ? 'bg-amber-100 text-amber-700'
                      : session.status === 'completed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {session.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="text-4xl mb-2">🎉</p>
            <p>No sessions scheduled for today!</p>
          </div>
        )}
      </div>
    </div>
  );
}
