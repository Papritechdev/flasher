import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { SVC_UUID, CHAR_UUID, RESULT_PASS, RESULT_FAIL, RESULT_NOT_RUN } from '../../config';
import { parseLps27, parseMpu6050, parseBattery, parseResult } from '../../utils/parsers';

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

function PassBadge({ pass }) {
  if (pass === true)  return <span className="badge-pass">PASS</span>;
  if (pass === false) return <span className="badge-fail">FAIL</span>;
  return <span className="badge-pending">WAIT</span>;
}

export default function RunStep({ sessionId }) {
  const session        = useSessionStore((s) => s.sessions[sessionId]);
  const updateSession  = useSessionStore((s) => s.updateSession);
  const updateLiveData = useSessionStore((s) => s.updateLiveData);
  const startCountdown = useSessionStore((s) => s.startCountdown);
  const stopCountdown  = useSessionStore((s) => s.stopCountdown);

  const [connStatus, setConnStatus] = useState('connecting'); // connecting | connected | error | disconnected
  const [error, setError]           = useState(null);
  const [readError, setReadError]   = useState(null);
  const [readCount, setReadCount]   = useState(0);

  // started / countdown come from the store so they survive wizard close
  const started   = session?.startedAt != null;
  const countdown = session?.countdown ?? session?.duration ?? 0;

  const mountedRef = useRef(true);
  const charsRef   = useRef(null); // { server, lps27, mpu6050, battery, result, control }

  // ── Subscribe to notifications (called during connect) ────
  //
  // The firmware sends notifications every 500 ms after TEST_CONTROL is written.
  // We call startNotifications() so Chrome registers the characteristic for
  // incoming notification PDUs. On Windows/WinRT the CCCD write may fail
  // (firmware has no CCCD descriptor) — we catch and ignore that error; the
  // browser still fires characteristicvaluechanged for unsolicited notifications
  // on this platform.  readValue() is avoided entirely to prevent ATT collisions.
  async function subscribeNotifications(chars) {
    const makeEvent = (dv) => ({ target: { value: dv } });

    const setup = async (char, key, parser) => {
      try { await char.startNotifications(); } catch (_) { /* no CCCD — ignore */ }
      char.addEventListener('characteristicvaluechanged', (e) => {
        const parsed = parser(e);
        updateLiveData(sessionId, key, parsed);
        setReadCount((n) => n + 1);
        setReadError(null);
        console.log(`[notify] ${key}`, parsed);
      });
    };

    const setupResult = async (char) => {
      try { await char.startNotifications(); } catch (_) {}
      char.addEventListener('characteristicvaluechanged', (e) => {
        const snap = useSessionStore.getState().sessions[sessionId]?.liveData;
        updateSession(sessionId, { liveData: { ...snap, result: e.target.value.getUint8(0) } });
        console.log('[notify] result', e.target.value.getUint8(0));
      });
    };

    await setup(chars.lps27,   'lps27',   parseLps27);
    await setup(chars.mpu6050, 'mpu6050', parseMpu6050);
    await setup(chars.battery, 'battery', parseBattery);
    await setupResult(chars.result);
    console.log('[ble] notification listeners registered');
  }

  // ── Connect ────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setConnStatus('connecting');
    setError(null);

    const device = session?.bleDevice;
    if (!device) {
      setError('No BLE device in session. Go back to BLE scan step.');
      setConnStatus('error');
      return;
    }

    try {
      const server  = await device.gatt.connect();
      const service = await server.getPrimaryService(SVC_UUID);

      // Get characteristics sequentially — less strain on the BLE stack
      const charLps27   = await service.getCharacteristic(CHAR_UUID.LPS27);
      const charMpu6050 = await service.getCharacteristic(CHAR_UUID.MPU6050);
      const charBattery = await service.getCharacteristic(CHAR_UUID.BATTERY);
      const charResult  = await service.getCharacteristic(CHAR_UUID.RESULT);
      const charControl = await service.getCharacteristic(CHAR_UUID.CONTROL);

      charsRef.current = { server, lps27: charLps27, mpu6050: charMpu6050, battery: charBattery, result: charResult, control: charControl };
      updateSession(sessionId, { bleChars: charsRef.current });

      // Register notification listeners now so Chrome is ready when
      // the firmware starts sending after TEST_CONTROL is written.
      await subscribeNotifications(charsRef.current);

      device.addEventListener('gattserverdisconnected', () => {
        // If a test was running, mark it as FAIL and advance to results
        const st = useSessionStore.getState().sessions[sessionId];
        if (st?.startedAt) {
          useSessionStore.getState().failSession(sessionId, 'BLE disconnected during test');
        }
        if (mountedRef.current) setConnStatus('disconnected');
      });

      setConnStatus('connected');
    } catch (err) {
      setError(err.message);
      setConnStatus('error');
    }
  }, [session?.bleDevice, sessionId, updateSession, updateLiveData]);

  useEffect(() => {
    mountedRef.current = true;
    // If test already started (e.g. wizard was closed and reopened), skip reconnect
    if (session?.startedAt) {
      const device = session?.bleDevice;
      setConnStatus(device?.gatt?.connected ? 'connected' : 'disconnected');
      return () => { mountedRef.current = false; };
    }
    connect();
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start test as soon as BLE connects
  useEffect(() => {
    if (connStatus === 'connected' && !started) {
      handleStartTest();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connStatus]);

  // ── Start test session ──────────────────────────────────────
  async function handleStartTest() {
    const chars = charsRef.current;
    if (!chars?.control) return;
    if (!chars.server?.connected) {
      setError('Device is not connected. Please reconnect first.');
      return;
    }
    setError(null);
    try {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setUint16(0, session.duration, true); // little-endian
      await chars.control.writeValue(buf);
      console.log('[start] CONTROL written, duration=', session.duration);

      // Record start time and hand off countdown management to the store
      // so it continues even when this wizard tab is closed
      updateSession(sessionId, {
        startedAt: new Date().toISOString(),
        countdown: session.duration,
      });
      startCountdown(sessionId);
    } catch (err) {
      setError(`Failed to write TEST_CONTROL: ${err.message}`);
    }
  }

  const { liveData } = session ?? {};
  const lps27   = liveData?.lps27   ?? {};
  const mpu6050 = liveData?.mpu6050 ?? {};
  const battery = liveData?.battery ?? {};

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Step 4 — Test Run</h3>

      {/* Connection status */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            connStatus === 'connected'    ? 'bg-green-400'
            : connStatus === 'connecting' ? 'bg-amber-400 animate-pulse'
            : 'bg-red-500'
          }`}
        />
        <span className="text-slate-400">
          {connStatus === 'connecting'  && 'Connecting to device…'}
          {connStatus === 'connected'   && `Connected — ${session?.deviceName ?? session?.mac}`}
          {connStatus === 'error'       && `Connection failed`}
          {connStatus === 'disconnected' && 'Device disconnected'}
        </span>
        {connStatus === 'error' || connStatus === 'disconnected' ? (
          <button className="btn-ghost text-xs px-2 py-0.5 ml-auto" onClick={connect}>
            Reconnect
          </button>
        ) : null}
      </div>

      {error && (
        <div className="bg-red-950 border border-red-700 rounded p-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      {readError && (
        <div className="bg-amber-950 border border-amber-700 rounded p-2 text-amber-300 text-xs">
          Read error: {readError}
        </div>
      )}

      {started && (
        <p className="text-xs text-slate-500">Reads completed: {readCount}</p>
      )}

      {/* Countdown */}
      {started && (
        <div className="card flex items-center justify-between">
          <span className="text-slate-400 text-xs">Time Remaining</span>
          <span className={`text-2xl font-bold font-mono ${countdown <= 10 ? 'text-red-400' : 'text-amber-400'}`}>
            {fmtCountdown(countdown)}
          </span>
        </div>
      )}

      {/* Live sensor readings */}
      <div className="grid grid-cols-1 gap-3">
        {/* LPS27 */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">LPS27HHW</span>
            <PassBadge pass={lps27.pass} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Pressure</p>
              <p className="text-slate-100 font-mono">{fmt(lps27.pressure)} hPa</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Temperature</p>
              <p className="text-slate-100 font-mono">{fmt(lps27.temperature)} °C</p>
            </div>
          </div>
        </div>

        {/* MPU6050 */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">MPU6050 IMU</span>
            <PassBadge pass={mpu6050.pass} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {['ax','ay','az'].map((k) => (
              <div key={k}>
                <p className="text-slate-500">Accel {k.slice(1).toUpperCase()}</p>
                <p className="text-slate-100 font-mono">{fmt(mpu6050[k], 3)} g</p>
              </div>
            ))}
            {['gx','gy','gz'].map((k) => (
              <div key={k}>
                <p className="text-slate-500">Gyro {k.slice(1).toUpperCase()}</p>
                <p className="text-slate-100 font-mono">{fmt(mpu6050[k], 1)}°/s</p>
              </div>
            ))}
          </div>
        </div>

        {/* Battery */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Battery</span>
            <PassBadge pass={battery.pass} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Level</p>
              <p className="text-slate-100 font-mono">{battery.level != null ? `${battery.level}%` : '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">ADC Raw</p>
              <p className="text-slate-100 font-mono">{battery.adcRaw ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Status</p>
              <p className="text-slate-100 font-mono">{battery.status != null ? `0x${battery.status.toString(16).padStart(2,'0')}` : '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Start button */}
      {!started && connStatus === 'connected' && (
        <div className="flex justify-end pt-1">
          <button className="btn-primary" onClick={handleStartTest}>
            ▶ Start Test ({fmtCountdown(session?.duration)})
          </button>
        </div>
      )}
    </div>
  );
}
