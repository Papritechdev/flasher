import { useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { STEP_LABELS, RESULT_PASS, RESULT_FAIL } from '../config';
import NewSessionWizard from './wizard/NewSessionWizard';

function fmt(v, dec = 2) {
  return v == null ? '—' : Number(v).toFixed(dec);
}

function fmtCountdown(sec) {
  if (sec == null || sec <= 0) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

export default function SessionCard({ sessionId }) {
  const session = useSessionStore((s) => s.sessions[sessionId]);
  const [open, setOpen] = useState(false);

  if (!session) return null;

  const { step, port, batch, mac, liveData, countdown, duration } = session;
  const { lps27, mpu6050, battery, result } = liveData ?? {};

  const globalResult = result === RESULT_PASS ? 'PASS' : result === RESULT_FAIL ? 'FAIL' : null;

  return (
    <>
      <button
        className="card text-left w-full hover:border-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-slate-950 group"
        onClick={() => setOpen(true)}
      >
        {/* Card header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">
              {port ?? 'No port'}{batch ? ` · ${batch}` : ''}
            </p>
            {mac && <p className="text-xs font-mono text-blue-400">{mac}</p>}
          </div>
          <div>
            {globalResult === 'PASS' && <span className="badge-pass">PASS</span>}
            {globalResult === 'FAIL' && <span className="badge-fail">FAIL</span>}
            {!globalResult && (
              <span className={`badge-pending`}>{STEP_LABELS[step] ?? step}</span>
            )}
          </div>
        </div>

        {/* Step progress dots */}
        <div className="flex gap-1 mb-3">
          {['setup','flash','ble','run','result'].map((s) => {
            const idx   = ['setup','flash','ble','run','result'].indexOf(s);
            const cur   = ['setup','flash','ble','run','result'].indexOf(step);
            const done  = idx < cur;
            const active = idx === cur;
            return (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  done ? 'bg-green-600' : active ? 'bg-blue-500' : 'bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        {/* Live readings (shown during run and after) */}
        {(step === 'run' || step === 'result') && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className={`rounded p-1.5 text-center ${lps27?.pass === true ? 'bg-green-950 text-green-300' : lps27?.pass === false ? 'bg-red-950 text-red-300' : 'bg-slate-800 text-slate-400'}`}>
              <p className="text-[10px] opacity-60 mb-0.5">LPS27</p>
              <p>{fmt(lps27?.pressure)} hPa</p>
            </div>
            <div className={`rounded p-1.5 text-center ${mpu6050?.pass === true ? 'bg-green-950 text-green-300' : mpu6050?.pass === false ? 'bg-red-950 text-red-300' : 'bg-slate-800 text-slate-400'}`}>
              <p className="text-[10px] opacity-60 mb-0.5">MPU6050</p>
              <p>az {fmt(mpu6050?.az, 3)} g</p>
            </div>
            <div className={`rounded p-1.5 text-center ${battery?.pass === true ? 'bg-green-950 text-green-300' : battery?.pass === false ? 'bg-red-950 text-red-300' : 'bg-slate-800 text-slate-400'}`}>
              <p className="text-[10px] opacity-60 mb-0.5">Battery</p>
              <p>{battery?.level != null ? `${battery.level}%` : '—'}</p>
            </div>
          </div>
        )}

        {/* Countdown during run */}
        {step === 'run' && countdown > 0 && (
          <p className="text-xs text-amber-400 mt-2 text-right">{fmtCountdown(countdown)} remaining</p>
        )}

        <p className="text-xs text-slate-600 mt-2 group-hover:text-slate-400 transition-colors text-right">
          Click to {step === 'result' ? 'view results' : 'continue'} →
        </p>
      </button>

      {open && (
        <NewSessionWizard sessionId={sessionId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
