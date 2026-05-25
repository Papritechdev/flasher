import { useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { SESSION_DEFAULT_SEC, DURATION_PRESETS } from '../../config';

export default function SetupStep({ sessionId }) {
  const session      = useSessionStore((s) => s.sessions[sessionId]);
  const updateSession = useSessionStore((s) => s.updateSession);

  const [batch,    setBatch]    = useState(session?.batch ?? '');
  const [duration, setDuration] = useState(session?.duration ?? SESSION_DEFAULT_SEC);

  function handleNext() {
    updateSession(sessionId, { batch, duration: Number(duration), step: 'flash' });
  }

  const canProceed = batch.trim() && DURATION_PRESETS.some((p) => p.seconds === duration);

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Step 1 — Setup</h3>

      {/* Batch Number */}
      <div>
        <label className="label">Batch Number</label>
        <input
          className="input"
          type="text"
          placeholder="e.g. BATCH-2026-001"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
        />
      </div>

      {/* Duration */}
      <div>
        <label className="label">Test Duration</label>
        <select
          className="input"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        >
          {DURATION_PRESETS.map((p) => (
            <option key={p.seconds} value={p.seconds}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end pt-2">
        <button className="btn-primary" onClick={handleNext} disabled={!canProceed}>
          Flash Firmware →
        </button>
      </div>
    </div>
  );
}
