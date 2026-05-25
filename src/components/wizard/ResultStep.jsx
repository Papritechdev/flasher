import { useState, useEffect } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { useAuth } from '../../hooks/useAuth';
import { saveDevice, saveReport } from '../../utils/firestore';
import { downloadExcelReport } from '../../utils/report';
import { RESULT_PASS, RESULT_FAIL } from '../../config';

function SensorRow({ label, pass, children }) {
  return (
    <tr className="border-t border-slate-700">
      <td className="py-2 pr-4 text-sm text-slate-300 font-medium">{label}</td>
      <td className="py-2 text-xs text-slate-400 space-y-0.5">{children}</td>
      <td className="py-2 pl-4 text-right">
        {pass === true  && <span className="badge-pass">PASS</span>}
        {pass === false && <span className="badge-fail">FAIL</span>}
        {pass === null  && <span className="badge-idle">N/A</span>}
      </td>
    </tr>
  );
}

export default function ResultStep({ sessionId }) {
  const session       = useSessionStore((s) => s.sessions[sessionId]);
  const updateSession = useSessionStore((s) => s.updateSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const { user }      = useAuth();

  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(!!session?.savedReportId);
  const [saveErr, setSaveErr] = useState(null);

  const { liveData, mac, batch, duration, startedAt, disconnectReason } = session ?? {};
  const { lps27, mpu6050, battery, result } = liveData ?? {};

  const globalResult = result === RESULT_PASS ? 'PASS' : result === RESULT_FAIL ? 'FAIL' : 'NOT RUN';
  const isPass = globalResult === 'PASS';

  const startedLabel = startedAt
    ? new Date(startedAt).toLocaleString()
    : null;

  // Auto-save only on PASS
  useEffect(() => {
    if (isPass && !saved && !saving && user) {
      handleSave();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!isPass) return; // Never save failed tests to Firebase
    setSaving(true);
    setSaveErr(null);
    try {
      await saveDevice(mac, batch, user?.email ?? 'unknown');
      const docId = await saveReport(session, user?.email ?? 'unknown');
      updateSession(sessionId, { savedReportId: docId });
      setSaved(true);
    } catch (err) {
      setSaveErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDownload() {
    downloadExcelReport(session, user?.email ?? '');
  }

  function handleNewSession() {
    removeSession(sessionId);
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Step 5 — Results</h3>

      {/* Global result banner */}
      <div
        className={`rounded-lg p-5 text-center border-2 ${
          isPass
            ? 'bg-green-950 border-green-600'
            : globalResult === 'FAIL'
            ? 'bg-red-950 border-red-600'
            : 'bg-slate-800 border-slate-600'
        }`}
      >
        <p className="text-xs text-slate-400 mb-1">Global Test Result</p>
        <p
          className={`text-4xl font-bold tracking-widest ${
            isPass ? 'text-green-400' : globalResult === 'FAIL' ? 'text-red-400' : 'text-slate-400'
          }`}
        >
          {globalResult}
        </p>
        <p className="text-xs text-slate-500 mt-2">
          {mac ?? 'Unknown MAC'} · Batch: {batch} · {duration}s test
          {startedLabel && <> · Started: {startedLabel}</>}
        </p>
        {disconnectReason && (
          <p className="text-xs text-red-400 mt-1">⚠ {disconnectReason}</p>
        )}
      </div>

      {/* Per-sensor breakdown */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-xs text-slate-500 uppercase tracking-wider pb-2">Sensor</th>
              <th className="text-left text-xs text-slate-500 uppercase tracking-wider pb-2">Readings</th>
              <th className="text-right text-xs text-slate-500 uppercase tracking-wider pb-2">Result</th>
            </tr>
          </thead>
          <tbody>
            <SensorRow label="LPS27HHW" pass={lps27?.pass ?? null}>
              <p>Pressure: {lps27?.pressure != null ? `${lps27.pressure.toFixed(2)} hPa` : '—'}</p>
              <p>Temp: {lps27?.temperature != null ? `${lps27.temperature.toFixed(2)} °C` : '—'}</p>
            </SensorRow>

            <SensorRow label="MPU6050" pass={mpu6050?.pass ?? null}>
              <p>Accel: {mpu6050?.ax != null ? `${mpu6050.ax.toFixed(3)}, ${mpu6050.ay.toFixed(3)}, ${mpu6050.az.toFixed(3)} g` : '—'}</p>
              <p>Gyro: {mpu6050?.gx != null ? `${mpu6050.gx.toFixed(1)}, ${mpu6050.gy.toFixed(1)}, ${mpu6050.gz.toFixed(1)} °/s` : '—'}</p>
            </SensorRow>

            <SensorRow label="Battery" pass={battery?.pass ?? null}>
              <p>Level: {battery?.level != null ? `${battery.level}%` : '—'}</p>
              <p>ADC raw: {battery?.adcRaw ?? '—'}</p>
            </SensorRow>
          </tbody>
        </table>
      </div>

      {/* Save status */}
      <div className="text-xs text-slate-500">
        {!isPass && globalResult === 'FAIL' && (
          <span className="text-slate-500">Failed tests are not saved to Firebase.</span>
        )}
        {isPass && saving && <span className="text-amber-400">Saving to Firebase…</span>}
        {isPass && saved  && <span className="text-green-400">✓ Saved to Firebase (Batch: {session?.savedReportId})</span>}
        {isPass && saveErr && (
          <div className="flex items-center gap-2">
            <span className="text-red-400">Save failed: {saveErr}</span>
            <button className="btn-danger text-xs px-2 py-0.5" onClick={handleSave}>Retry</button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-1 flex-wrap">
        <button className="btn-ghost" onClick={handleDownload}>
          ⬇ Download .xlsx
        </button>
        <button className="btn-primary" onClick={handleNewSession}>
          + New Session
        </button>
      </div>
    </div>
  );
}
