import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../../store/sessionStore';

export default function FlashStep({ sessionId }) {
  const session       = useSessionStore((s) => s.sessions[sessionId]);
  const updateSession  = useSessionStore((s) => s.updateSession);
  const appendFlashLog = useSessionStore((s) => s.appendFlashLog);

  const [status,   setStatus]   = useState('idle'); // idle | flashing | done | error
  const [progress, setProgress] = useState(0);
  const logRef = useRef(null);
  const abortRef = useRef(null);

  // Clean up EventSource if component unmounts mid-flash
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.close?.();
    };
  }, []);

  // Auto-start flash when step mounts
  useEffect(() => {
    startFlash();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [session?.flashLog]);

  function startFlash() {
    setStatus('flashing');
    setProgress(0);
    updateSession(sessionId, { flashLog: [], flashProgress: 0, error: null });

    const url = `/api/flash-auto`;
    const es = new EventSource(url);
    abortRef.current = es;

    es.onmessage = (e) => {
      const line = e.data.trim();
      if (!line) return;

      if (line.startsWith('EXIT:')) {
        const code = parseInt(line.split(':')[1], 10);
        es.close();
        if (code === 0) {
          setStatus('done');
          setProgress(100);
          updateSession(sessionId, { flashProgress: 100 });
        } else {
          setStatus('error');
          updateSession(sessionId, { error: `esptool exited with code ${code}` });
        }
      } else {
        const pct = parseProgressPercent(line);
        if (pct !== null) {
          setProgress(pct);
          updateSession(sessionId, { flashProgress: pct });
        }
        appendFlashLog(sessionId, line);
      }
    };

    es.onerror = () => {
      es.close();
      // Only show error if we haven't already finished
      setStatus((prev) => {
        if (prev === 'flashing') {
          updateSession(sessionId, { error: 'Connection to flash server lost' });
          return 'error';
        }
        return prev;
      });
    };
  }

  function parseProgressPercent(line) {
    // esptool outputs: "Writing at 0x000xxx... (XX %)"
    const m = line.match(/\((\d+)\s*%\)/);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  function handleRetry() {
    setStatus('idle');
    setProgress(0);
    updateSession(sessionId, { flashLog: [], flashProgress: 0, error: null });
    // Re-trigger flash immediately
    setTimeout(() => startFlash(), 0);
  }

  function handleNext() {
    updateSession(sessionId, { step: 'ble' });
  }

  const isDone  = status === 'done';
  const isError = status === 'error';

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Step 2 — Flash Firmware</h3>

      <div className="card text-xs text-slate-400 space-y-0.5">
        <p>Batch: <span className="text-slate-200">{session?.batch}</span></p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>
            {status === 'idle'     && 'Ready to flash'}
            {status === 'flashing' && 'Flashing…'}
            {isDone                && 'Flash complete ✓'}
            {isError               && 'Flash failed ✗'}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Log output */}
      <div
        ref={logRef}
        className="bg-black border border-slate-700 rounded p-3 h-48 overflow-y-auto font-mono text-xs text-green-300 whitespace-pre-wrap"
      >
        {session?.flashLog?.length === 0 && (
          <span className="text-slate-600">Flash output will appear here…</span>
        )}
        {session?.flashLog?.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-1">
        {status === 'flashing' && (
          <button className="btn-ghost" disabled>
            Flashing…
          </button>
        )}
        {isError && (
          <button className="btn-danger" onClick={handleRetry}>
            ↺ Retry
          </button>
        )}
        {isDone && (
          <button className="btn-success" onClick={handleNext}>
            BLE Scan →
          </button>
        )}
      </div>
    </div>
  );
}
