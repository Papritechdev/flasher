import { useState, useEffect, useRef } from 'react';
import DongleFlashModal from '../components/DongleFlashModal';

const MODELS = [
  { id: 'plus',   label: 'Plus / Pro',  desc: 'Standard Plus and Pro variants' },
  { id: 'neo',    label: 'Neo',         desc: 'Neo model' },
  { id: 'proex',  label: 'Pro Extra',   desc: 'Pro Extra model' },
];

export default function FlashDevicePage() {
  const [selectedModel, setSelectedModel] = useState('plus');
  const [versions, setVersions]           = useState(null);
  const [versionsError, setVersionsError] = useState(null);
  const [status, setStatus]               = useState('idle'); // idle | flashing | done | error
  const [progress, setProgress]           = useState(0);
  const [log, setLog]                     = useState([]);
  const [showDongle, setShowDongle]       = useState(false);

  const logRef = useRef(null);
  const esRef  = useRef(null);

  useEffect(() => { fetchVersions(); }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  useEffect(() => () => esRef.current?.close?.(), []);

  async function fetchVersions() {
    setVersionsError(null);
    setVersions(null);
    try {
      const res = await fetch('/api/firmware-versions');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setVersions(await res.json());
    } catch (err) {
      setVersionsError(err.message);
    }
  }

  // Parse dongle-related lines from versions.raw (case-insensitive match on 'dongle')
  const dongleVersionText = versions?.raw
    ? versions.raw.split('\n').filter(l => /dongle/i.test(l)).join('\n').trim() || versions.raw.trim()
    : null;

  // PCB versions: exclude dongle lines
  const pcbVersionText = versions?.raw
    ? versions.raw.split('\n').filter(l => !/dongle/i.test(l)).join('\n').trim()
    : null;

  function startFlash() {
    esRef.current?.close?.();
    setStatus('flashing');
    setProgress(0);
    setLog([]);

    const es = new EventSource(`/api/flash-device?model=${selectedModel}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const line = e.data.trim();
      if (!line) return;

      if (line.startsWith('EXIT:')) {
        es.close();
        const code = parseInt(line.split(':')[1], 10);
        setStatus(code === 0 ? 'done' : 'error');
        if (code === 0) setProgress(100);
        return;
      }

      const pct = line.match(/\((\d+)\s*%\)/);
      if (pct) setProgress(parseInt(pct[1], 10));

      setLog(prev => [...prev, line]);
    };

    es.onerror = () => {
      es.close();
      setStatus(prev => (prev === 'flashing' ? 'error' : prev));
    };
  }

  function handleReset() {
    esRef.current?.close?.();
    setStatus('idle');
    setProgress(0);
    setLog([]);
  }

  const isFlashing = status === 'flashing';
  const isDone     = status === 'done';
  const isError    = status === 'error';

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Flash Device</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Download production firmware from GitHub and flash to a connected device
        </p>
      </div>

      {/* ── Flash USB Dongle ────────────────────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-100">Flash USB Dongle</h2>
            <p className="text-xs text-slate-400 mt-0.5">Papritech ESP32-S3 dongle</p>
          </div>
          <button className="btn-primary" onClick={() => setShowDongle(true)}>
            ⚡ Flash USB Dongle
          </button>
        </div>

        {/* Dongle firmware version */}
        <div className="border-t border-slate-700 pt-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
              Firmware Version
            </span>
            <button
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-700 transition-colors"
              onClick={fetchVersions}
            >
              ↺ Refresh
            </button>
          </div>
          {dongleVersionText ? (
            <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
              {dongleVersionText}
            </pre>
          ) : versionsError ? (
            <p className="text-red-400 text-xs">{versionsError}</p>
          ) : (
            <p className="text-slate-500 text-xs animate-pulse">Loading…</p>
          )}
          {versions?.fetchedAt && (
            <p className="text-slate-600 text-[10px]">
              Fetched {new Date(versions.fetchedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* ── Flash PCB Device ────────────────────────────────────────── */}
      <div className="space-y-6">
        <div>
          <h2 className="font-semibold text-slate-100">Flash PCB Device</h2>
          <p className="text-xs text-slate-400 mt-0.5">Plus / Pro, Neo, and Pro Extra models</p>
        </div>

        {/* Firmware versions card */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
              Firmware Versions
            </span>
            <button
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-700 transition-colors"
              onClick={fetchVersions}
            >
              ↺ Refresh
            </button>
          </div>
          {pcbVersionText ? (
            <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
              {pcbVersionText}
            </pre>
          ) : versionsError ? (
            <p className="text-red-400 text-xs">{versionsError}</p>
          ) : (
            <p className="text-slate-500 text-xs animate-pulse">Loading…</p>
          )}
          {versions?.fetchedAt && (
            <p className="text-slate-600 text-[10px]">
              Fetched {new Date(versions.fetchedAt).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <label className="text-xs text-slate-400 uppercase tracking-wider font-medium">
            Select Model
          </label>
          <div className="grid grid-cols-3 gap-3">
            {MODELS.map(model => (
              <button
                key={model.id}
                disabled={isFlashing}
                onClick={() => setSelectedModel(model.id)}
                className={`p-3 rounded-lg border text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedModel === model.id
                    ? 'border-blue-500 bg-blue-950 text-blue-200'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                <p className="font-semibold text-sm leading-tight">{model.label}</p>
                <p className="text-[10px] mt-1 opacity-60 leading-tight">{model.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>
              {status === 'idle'  && 'Ready to flash'}
              {isFlashing         && 'Flashing…'}
              {isDone             && 'Flash complete ✓'}
              {isError            && 'Flash failed ✗'}
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
          className="bg-black border border-slate-700 rounded p-3 h-56 overflow-y-auto font-mono text-xs whitespace-pre-wrap"
        >
          {log.length === 0 ? (
            <span className="text-slate-600">Flash output will appear here…</span>
          ) : (
            log.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('ERROR')   ? 'text-red-400'   :
                  line.startsWith('---')     ? 'text-amber-400' :
                  line.startsWith('Flash c') ? 'text-green-400' :
                  'text-green-300'
                }
              >
                {line}
              </div>
            ))
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          {status === 'idle' && (
            <button className="btn-primary" onClick={startFlash}>
              ⚡ Flash {MODELS.find(m => m.id === selectedModel)?.label}
            </button>
          )}
          {isFlashing && (
            <button className="btn-ghost" disabled>Flashing…</button>
          )}
          {isError && (
            <button className="btn-danger" onClick={handleReset}>↺ Retry</button>
          )}
          {isDone && (
            <button className="btn-success" onClick={handleReset}>Flash Another</button>
          )}
        </div>
      </div>

      {/* USB Dongle flash modal */}
      {showDongle && (
        <DongleFlashModal onClose={() => setShowDongle(false)} />
      )}

    </div>
  );
}
