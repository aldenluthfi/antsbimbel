import { useState } from 'react';
import { mockLogs } from '../../data/mockData';
import type { LogEntry } from '../../types';

export default function Log() {
  const [logs, setLogs] = useState<LogEntry[]>(mockLogs);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLog, setNewLog] = useState({
    studentName: '',
    subject: '',
    duration: 60,
    topics: '',
    notes: '',
    homework: '',
    rating: 5,
  });

  const subjects = [...new Set(logs.map((l) => l.subject))];

  const filteredLogs = logs
    .filter(
      (log) =>
        log.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.topics.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .filter((log) => !selectedSubject || log.subject === selectedSubject)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const renderStars = (rating: number) => {
    return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    const log: LogEntry = {
      id: `log-${Date.now()}`,
      tutorId: 'tutor-1',
      studentName: newLog.studentName,
      subject: newLog.subject,
      date: new Date(),
      duration: newLog.duration,
      topics: newLog.topics.split(',').map((t) => t.trim()),
      notes: newLog.notes,
      homework: newLog.homework,
      rating: newLog.rating,
    };
    setLogs([log, ...logs]);
    setShowAddForm(false);
    setNewLog({
      studentName: '',
      subject: '',
      duration: 60,
      topics: '',
      notes: '',
      homework: '',
      rating: 5,
    });
  };

  // Calculate stats
  const totalHours = logs.reduce((sum, log) => sum + log.duration, 0) / 60;
  const avgRating = logs.length
    ? logs.reduce((sum, log) => sum + (log.rating || 0), 0) / logs.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tutoring Log</h1>
          <p className="text-gray-600 mt-1">Track and review your tutoring sessions</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
        >
          + Add Log Entry
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
          <p className="text-sm text-gray-500">Total Sessions</p>
          <p className="text-2xl font-bold text-gray-900">{logs.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
          <p className="text-sm text-gray-500">Total Hours</p>
          <p className="text-2xl font-bold text-amber-600">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
          <p className="text-sm text-gray-500">Unique Students</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Set(logs.map((l) => l.studentName)).size}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
          <p className="text-sm text-gray-500">Avg. Rating</p>
          <p className="text-2xl font-bold text-green-600">{avgRating.toFixed(1)} ⭐</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by student name or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Subjects</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Add Log Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Log Entry</h2>
            <form onSubmit={handleAddLog} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Student Name
                </label>
                <input
                  type="text"
                  required
                  value={newLog.studentName}
                  onChange={(e) => setNewLog({ ...newLog, studentName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Enter student name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select
                    required
                    value={newLog.subject}
                    onChange={(e) => setNewLog({ ...newLog, subject: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Select subject</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="Biology">Biology</option>
                    <option value="English">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    required
                    min="15"
                    step="15"
                    value={newLog.duration}
                    onChange={(e) => setNewLog({ ...newLog, duration: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Topics Covered (comma-separated)
                </label>
                <input
                  type="text"
                  required
                  value={newLog.topics}
                  onChange={(e) => setNewLog({ ...newLog, topics: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="e.g., Algebra, Quadratic Equations"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Notes
                </label>
                <textarea
                  required
                  rows={3}
                  value={newLog.notes}
                  onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Describe what was covered and student progress..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Homework Assigned
                </label>
                <input
                  type="text"
                  value={newLog.homework}
                  onChange={(e) => setNewLog({ ...newLog, homework: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Optional: homework or practice tasks"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Rating
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewLog({ ...newLog, rating: star })}
                      className={`text-2xl transition-transform hover:scale-110 ${
                        star <= newLog.rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors"
                >
                  Save Log Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Entries */}
      <div className="space-y-4">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden"
            >
              <div
                className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-lg">
                      {log.studentName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{log.studentName}</h3>
                      <p className="text-sm text-gray-500">
                        {log.subject} • {formatDate(log.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                      {formatDuration(log.duration)}
                    </span>
                    <span className="text-yellow-400">{renderStars(log.rating || 0)}</span>
                    <span className="text-gray-400">
                      {expandedLog === log.id ? '▲' : '▼'}
                    </span>
                  </div>
                </div>
              </div>

              {expandedLog === log.id && (
                <div className="px-5 pb-5 pt-0 border-t border-gray-100">
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Topics Covered</h4>
                      <div className="flex flex-wrap gap-2">
                        {log.topics.map((topic, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                    {log.homework && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Homework Assigned
                        </h4>
                        <p className="text-gray-600 text-sm">{log.homework}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Session Notes</h4>
                    <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg">{log.notes}</p>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="bg-white rounded-xl shadow p-12 text-center border border-gray-100">
            <p className="text-5xl mb-4">📝</p>
            <p className="text-gray-500 text-lg">No log entries found</p>
            <p className="text-gray-400 text-sm mt-1">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
