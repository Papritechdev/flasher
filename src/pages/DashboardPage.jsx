import { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import SessionCard from '../components/SessionCard';
import NewSessionWizard from '../components/wizard/NewSessionWizard';

export default function DashboardPage() {
  const sessions    = useSessionStore((s) => s.sessions);
  const addSession  = useSessionStore((s) => s.addSession);

  const [newSessionId, setNewSessionId] = useState(null);

  const sessionIds = Object.keys(sessions);

  function handleNewSession() {
    const id = addSession();
    setNewSessionId(id);
  }

  function handleWizardClose() {
    setNewSessionId(null);
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Active Sessions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {sessionIds.length === 0
              ? 'No active sessions'
              : `${sessionIds.length} session${sessionIds.length !== 1 ? 's' : ''} running`}
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={handleNewSession}>
            + New PCB Test Session
          </button>
        </div>
      </div>

      {/* Empty state */}
      {sessionIds.length === 0 && (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center">
          <p className="text-slate-500 text-4xl mb-4">⬡</p>
          <p className="text-slate-400 font-medium">No active test sessions</p>
          <p className="text-slate-600 text-sm mt-1 mb-6">
            Connect a device and start a new session to begin testing.
          </p>
          <button className="btn-primary" onClick={handleNewSession}>
            + New PCB Test Session
          </button>
        </div>
      )}

      {/* Session cards grid */}
      {sessionIds.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessionIds.map((id) => (
            <SessionCard key={id} sessionId={id} />
          ))}
        </div>
      )}

      {/* New session wizard */}
      {newSessionId && (
        <NewSessionWizard sessionId={newSessionId} onClose={handleWizardClose} />
      )}

    </div>
  );
}
