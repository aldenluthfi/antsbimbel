import { useState } from 'react';
import { mockSchedule } from '../../data/mockData';
import type { ScheduleEntry } from '../../types';

type FilterType = 'all' | 'upcoming' | 'completed' | 'cancelled';

export default function Schedule() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');

  const filteredSchedule = mockSchedule
    .filter((s) => filter === 'all' || s.status === filter)
    .filter((s) => !selectedDate || s.date.toISOString().split('T')[0] === selectedDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.startTime.localeCompare(b.startTime));

  const groupedSchedule = filteredSchedule.reduce((groups, session) => {
    const dateKey = session.date.toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(session);
    return groups;
  }, {} as Record<string, ScheduleEntry[]>);

  const getStatusBadge = (status: ScheduleEntry['status']) => {
    const styles = {
      upcoming: 'bg-amber-100 text-amber-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return styles[status];
  };

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return 'Today';
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tutoring Schedule</h1>
          <p className="text-gray-600 mt-1">View and manage your upcoming sessions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex gap-2">
            {(['all', 'upcoming', 'completed', 'cancelled'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors capitalize ${
                  filter === f
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1 sm:max-w-xs">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Clear Date
            </button>
          )}
        </div>
      </div>

      {/* Schedule List */}
      <div className="space-y-6">
        {Object.keys(groupedSchedule).length > 0 ? (
          Object.entries(groupedSchedule).map(([dateStr, sessions]) => (
            <div key={dateStr}>
              <h2
                className={`text-lg font-semibold mb-3 ${
                  isToday(new Date(dateStr)) ? 'text-amber-600' : 'text-gray-700'
                }`}
              >
                {formatDateHeader(dateStr)}
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({sessions.length} session{sessions.length > 1 ? 's' : ''})
                </span>
              </h2>

              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-white rounded-xl shadow p-5 border border-gray-100 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Time */}
                      <div className="md:w-32 shrink-0">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-amber-600">{session.startTime}</p>
                          <p className="text-sm text-gray-500">to {session.endTime}</p>
                        </div>
                      </div>

                      {/* Main Content */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {session.studentName}
                            </h3>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                                📚 {session.subject}
                              </span>
                              <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                                📍 {session.location}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadge(
                              session.status
                            )}`}
                          >
                            {session.status}
                          </span>
                        </div>

                        {session.notes && (
                          <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                            <p className="text-sm text-amber-800">
                              <span className="font-medium">Notes:</span> {session.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-xl shadow p-12 text-center border border-gray-100">
            <p className="text-5xl mb-4">📅</p>
            <p className="text-gray-500 text-lg">No sessions found</p>
            <p className="text-gray-400 text-sm mt-1">
              Try adjusting your filters or date selection
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{mockSchedule.length}</p>
            <p className="text-sm text-gray-500">Total Sessions</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-600">
              {mockSchedule.filter((s) => s.status === 'upcoming').length}
            </p>
            <p className="text-sm text-gray-500">Upcoming</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {mockSchedule.filter((s) => s.status === 'completed').length}
            </p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">
              {mockSchedule.filter((s) => s.status === 'cancelled').length}
            </p>
            <p className="text-sm text-gray-500">Cancelled</p>
          </div>
        </div>
      </div>
    </div>
  );
}
