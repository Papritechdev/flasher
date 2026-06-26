import { useState, useEffect } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { SESSION_DEFAULT_SEC, DURATION_PRESETS } from '../../config';
import { fetchBatchList } from '../../utils/firestore';

export default function SetupStep({ sessionId }) {
  const session       = useSessionStore((s) => s.sessions[sessionId]);
  const allSessions   = useSessionStore((s) => s.sessions);
  const updateSession = useSessionStore((s) => s.updateSession);

  const [batch,    setBatch]    = useState(session?.batch ?? '');
  const [duration, setDuration] = useState(session?.duration ?? SESSION_DEFAULT_SEC);
  const [batchOptions, setBatchOptions] = useState([]);

  // Batches used in this app session (other sessions, newest first by id)
  const inSessionBatches = Object.entries(allSessions)
    .filter(([id]) => id !== sessionId)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([, s]) => s.batch)
    .filter(Boolean)
    .filter((b, i, arr) => arr.indexOf(b) === i);

  useEffect(() => {
    fetchBatchList()
      .then((firebaseBatches) => {
        // In-session batches first, then Firebase batches not already listed
        const merged = [
          ...inSessionBatches,
          ...firebaseBatches.filter((b) => !inSessionBatches.includes(b)),
        ];
        setBatchOptions(merged);
      })
      .catch(() => {
        setBatchOptions(inSessionBatches);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          list="batch-options"
          placeholder="e.g. BATCH-2026-001"
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
        />
        <datalist id="batch-options">
          {batchOptions.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
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
