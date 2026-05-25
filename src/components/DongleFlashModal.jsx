import { useState, useEffect, useRef } from 'react';
import { DONGLE_BLE_NAME_PREFIX } from '../config';
import { saveDevice } from '../utils/firestore';
import { useAuth } from '../hooks/useAuth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Extract MAC address directly from the device name.
 * Firmware sets name as "Dongle XX:XX:XX:XX:XX:XX:" (trailing colon).
 * Returns "AA:BB:CC:DD:EE:FF" or null if not parseable.
 */
function parseMacFromName(name) {
  if (!name) return null;
  const match = name.match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/);
  return match ? match[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DongleFlashModal({ onClose }) {
  const { user } = useAuth();

  // flash phase state
  const [flashStatus,  setFlashStatus]  = useState('idle'); // idle|flashing|done|error
  const [progress,     setProgress]     = useState(0);
  const [log,          setLog]          = useState([]);

  // phase: 'flash' | 'replug' | 'ble' | 'saving' | 'saved'
  const [phase, setPhase] = useState('flash');

  // known ports before flash (used to detect replug)
  const [knownPorts, setKnownPorts] = useState([]);

  // ble phase state
  const [bleScanning,  setBleScanning]  = useState(false);
  const [bleDevice,    setBleDevice]    = useState(null); // { name, mac }
  const [bleError,     setBleError]     = useState(null);

  // save phase state
  const [saveError, setSaveError] = useState(null);

  const logRef        = useRef(null);
  const esRef         = useRef(null);
  const replugPollRef = useRef(null);

  // Auto-scroll flash log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Cleanup on unmount
  useEffect(() => () => {
    esRef.current?.close?.();
    if (replugPollRef.current) clearInterval(replugPollRef.current);
  }, []);

  // Auto-save as soon as BLE device is found
  useEffect(() => {
    if (bleDevice && phase === 'ble') handleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bleDevice]);

  // -------------------------------------------------------------------------
  // Port helpers
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Flash
  // -------------------------------------------------------------------------
  function startFlash() {
    setFlashStatus('flashing');
    setProgress(0);
    setLog([]);

    // Use the GitHub production firmware for the dongle (same as Flash Device page)
    const url = `/api/flash-device?model=dongle`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      const line = e.data.trim();
      if (!line) return;
      if (line.startsWith('EXIT:')) {
        const code = parseInt(line.split(':')[1], 10);
        es.close();
        if (code === 0) {
          setFlashStatus('done');
          setProgress(100);
          fetch('/api/ports').then(r => r.json()).then(data => {
            const ports = data.map(p => p.path);
            setKnownPorts(ports);
            startReplugDetection(ports);
          }).catch(() => { startReplugDetection([]); });
          setPhase('replug');
        } else {
          setFlashStatus('error');
        }
      } else {
        const m = line.match(/\((\d+)\s*%\)/);
        if (m) setProgress(parseInt(m[1], 10));
        setLog((prev) => [...prev, line]);
      }
    };

    es.onerror = () => {
      es.close();
      setFlashStatus((prev) => (prev === 'flashing' ? 'error' : prev));
    };
  }

  function handleRetryFlash() {
    if (replugPollRef.current) { clearInterval(replugPollRef.current); replugPollRef.current = null; }
    setFlashStatus('idle');
    setProgress(0);
    setLog([]);
    setPhase('flash');
  }

  function startReplugDetection(existingPorts) {
    if (replugPollRef.current) clearInterval(replugPollRef.current);

    // Two-phase detection:
    //  Phase 1 — wait for the dongle's port to DISAPPEAR (user unplugged)
    //  Phase 2 — wait for any port to APPEAR again (user replugged)
    // This handles the common case where the dongle re-enumerates on the
    // exact same COM port after flashing, so a simple "new port" check fails.
    let unplugged = existingPorts.length === 0; // if nothing was connected, skip phase 1

    replugPollRef.current = setInterval(async () => {
      try {
        const ports = await fetch('/api/ports').then(r => r.json());
        const currentPaths = ports.map(p => p.path);

        if (!unplugged) {
          // Phase 1: wait until at least one of the known ports disappears
          const anyGone = existingPorts.some(ep => !currentPaths.includes(ep));
          if (anyGone) unplugged = true;
        } else {
          // Phase 2: wait for any port to come back
          if (currentPaths.length > 0) {
            clearInterval(replugPollRef.current);
            replugPollRef.current = null;
            setPhase('ble');
            handleBleScan();
          }
        }
      } catch {}
    }, 800);
  }

  // -------------------------------------------------------------------------
  // BLE scan
  // -------------------------------------------------------------------------
  async function handleBleScan() {
    setBleScanning(true);
    setBleError(null);
    setBleDevice(null);

    try {
      if (!navigator.bluetooth) {
        throw new Error(
          'Web Bluetooth is not available. Use Chrome or Edge.'
        );
      }
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: DONGLE_BLE_NAME_PREFIX }],
      });
      // MAC is embedded in the device name: "Dongle XX:XX:XX:XX:XX:XX:"
      const mac = parseMacFromName(device.name);
      setBleDevice({ name: device.name, mac: mac ?? device.id });
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setBleError('No device selected. Press Scan and pick the dongle from the list.');
      } else {
        setBleError(err.message);
      }
    } finally {
      setBleScanning(false);
    }
  }

  // -------------------------------------------------------------------------
  // Save to Firestore
  // -------------------------------------------------------------------------
  async function handleSave() {
    setSaveError(null);
    setPhase('saving');
    try {
      await saveDevice(bleDevice.mac, '', user?.email ?? '');
      setPhase('saved');
    } catch (err) {
      setSaveError(err.message);
      setPhase('ble');
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const isFlashDone  = flashStatus === 'done';
  const isFlashError = flashStatus === 'error';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">USB Dongle Test</p>
            <p className="text-sm text-slate-300 mt-0.5">ESP32-S3 T-Dongle-S3</p>
          </div>
          <button
            className="text-slate-400 hover:text-slate-100 text-xl leading-none focus:outline-none"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 pt-4 gap-0">
          {[['flash', 'Flash'], ['ble', 'BLE Scan'], ['saved', 'Done']].map(([key, label], idx) => {
            const phaseOrder = { flash: 0, replug: 0, ble: 1, saving: 1, saved: 2 };
            const currentIdx = phaseOrder[phase] ?? 0;
            const done   = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <div key={key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                    done   ? 'bg-green-700 border-green-600 text-green-200'
                    : active ? 'bg-blue-700 border-blue-500 text-blue-100'
                    : 'bg-slate-800 border-slate-600 text-slate-500'
                  }`}>
                    {done ? '✓' : idx + 1}
                  </div>
                  <span className={`text-[10px] mt-0.5 ${active ? 'text-blue-400' : done ? 'text-green-500' : 'text-slate-600'}`}>
                    {label}
                  </span>
                </div>
                {idx < 2 && (
                  <div className={`flex-1 h-px mx-1 mb-4 ${done ? 'bg-green-700' : 'bg-slate-700'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── FLASH PHASE ── */}
          {(phase === 'flash') && (
            <>
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>
                    {flashStatus === 'idle'     && 'Ready to flash'}
                    {flashStatus === 'flashing' && (progress === 0 ? 'Downloading firmware…' : 'Flashing…')}
                    {isFlashDone                && 'Flash complete ✓'}
                    {isFlashError               && 'Flash failed ✗'}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isFlashError ? 'bg-red-500' : isFlashDone ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Log output */}
              <div
                ref={logRef}
                className="bg-black border border-slate-700 rounded p-3 h-44 overflow-y-auto font-mono text-xs text-green-300 whitespace-pre-wrap"
              >
                {log.length === 0 && (
                  <span className="text-slate-600">Flash output will appear here…</span>
                )}
                {log.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </>
          )}

          {/* ── REPLUG PHASE ── */}
          {phase === 'replug' && (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 text-blue-400">
                <line x1="12" y1="3" x2="12" y2="13"/>
                <polyline points="12,5 7,8"/>
                <circle cx="7" cy="10" r="2"/>
                <polyline points="12,5 17,8"/>
                <rect x="15.5" y="8.5" width="3" height="3" rx="0.5"/>
                <polygon points="12,5 10.5,8.5 13.5,8.5" fill="currentColor" stroke="none"/>
                <rect x="8" y="13" width="8" height="5" rx="1"/>
                <line x1="12" y1="18" x2="12" y2="21"/>
              </svg>
              <div className="space-y-1">
                <p className="text-slate-100 font-semibold">Production firmware flashed!</p>
                <p className="text-slate-400 text-sm">
                  Unplug the dongle, then plug it back in — it will boot and start advertising over BLE.
                </p>
              </div>
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
                </svg>
                <span>Waiting for dongle to reconnect…</span>
              </div>
            </div>
          )}

          {/* ── BLE PHASE ── */}
          {(phase === 'ble' || phase === 'saving') && (
            <>
              {bleError && (
                <div className="bg-red-950 border border-red-700 rounded p-3 text-red-300 text-xs">
                  {bleError}
                </div>
              )}
              {saveError && (
                <div className="bg-red-950 border border-red-700 rounded p-3 text-red-300 text-xs">
                  Save failed: {saveError}
                </div>
              )}

              {bleDevice ? (
                <div className="card border-blue-700 space-y-2">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Device Found</p>
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-blue-300">{bleDevice.name}</p>
                      <p className="text-xs text-slate-400 font-mono">MAC: {bleDevice.mac}</p>
                    </div>
                  </div>
                </div>
              ) : bleScanning ? (
                <div className="card text-sm text-slate-400 flex items-center gap-3">
                  <svg className="animate-spin w-4 h-4 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
                  </svg>
                  <span>Scanning for <span className="text-blue-400">{DONGLE_BLE_NAME_PREFIX}…</span>…</span>
                </div>
              ) : (
                <div className="card text-sm text-slate-400">
                  Press <span className="text-blue-400">Scan Again</span> to retry scanning for <span className="text-blue-400">{DONGLE_BLE_NAME_PREFIX}…</span>.
                </div>
              )}
            </>
          )}

          {/* ── SAVED PHASE ── */}
          {phase === 'saved' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="text-5xl">✅</div>
              <div className="space-y-1">
                <p className="text-slate-100 font-semibold">Dongle registered successfully</p>
                <p className="text-xs text-slate-400 font-mono">{bleDevice?.mac}</p>
                <p className="text-slate-500 text-xs mt-1">Saved to Firestore <span className="text-slate-400">devices_mac</span></p>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="flex gap-3 justify-end px-5 py-4 border-t border-slate-700">

          {/* Flash phase */}
          {phase === 'flash' && flashStatus === 'idle' && (
            <>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={startFlash}>
                ⚡ Flash Dongle
              </button>
            </>
          )}
          {phase === 'flash' && flashStatus === 'flashing' && (
            <button className="btn-ghost" disabled>Flashing…</button>
          )}
          {phase === 'flash' && isFlashError && (
            <>
              <button className="btn-ghost" onClick={onClose}>Close</button>
              <button className="btn-danger" onClick={handleRetryFlash}>↺ Retry</button>
            </>
          )}

          {/* Replug phase */}
          {phase === 'replug' && (
            <button className="btn-ghost" onClick={onClose}>Close</button>
          )}

          {/* BLE phase */}
          {phase === 'ble' && (
            <button className="btn-ghost" onClick={handleBleScan} disabled={bleScanning}>
              {bleScanning ? '🔍 Scanning…' : '🔍 Scan Again'}
            </button>
          )}
          {phase === 'saving' && (
            <button className="btn-ghost" disabled>Saving…</button>
          )}

          {/* Saved phase */}
          {phase === 'saved' && (
            <button className="btn-success" onClick={onClose}>Done ✓</button>
          )}

        </div>
      </div>
    </div>
  );
}

