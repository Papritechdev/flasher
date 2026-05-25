import { useState, useEffect } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { SVC_UUID, BLE_DEVICE_NAME_PREFIX } from '../../config';

/**
 * Extract MAC address from a BluetoothDevice.
 * Web Bluetooth does not expose the MAC directly. We derive it from the
 * advertised device name: "PCB_TEST_XXXXXX" → last 3 bytes.
 * We return a placeholder if the name does not match the pattern.
 */
function extractMacFromName(name) {
  if (!name) return null;
  const prefix = BLE_DEVICE_NAME_PREFIX;
  if (!name.startsWith(prefix)) return null;
  const hex = name.slice(prefix.length);
  // Full MAC: 12 hex chars e.g. "1020BA178812"
  if (/^[0-9A-Fa-f]{12}$/.test(hex)) {
    return hex.match(/.{2}/g).join(':').toUpperCase();
  }
  // Partial (last 3 bytes): 6 hex chars e.g. "178812"
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return `??:??:??:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`.toUpperCase();
  }
  return null;
}

export default function BleStep({ sessionId }) {
  const session        = useSessionStore((s) => s.sessions[sessionId]);
  const updateSession  = useSessionStore((s) => s.updateSession);

  const [scanning,     setScanning]     = useState(false);
  const [device,       setDevice]       = useState(null);
  const [error,        setError]        = useState(null);
  const [autoDetected, setAutoDetected] = useState(false);

  // On mount: check for a previously granted PCB_TEST_ device and auto-advance
  useEffect(() => {
    if (!navigator.bluetooth?.getDevices) return;
    navigator.bluetooth.getDevices().then((devices) => {
      const found = devices.find((d) => d.name?.startsWith(BLE_DEVICE_NAME_PREFIX));
      if (found) {
        const mac = extractMacFromName(found.name);
        setDevice({ name: found.name, mac, raw: found });
        setAutoDetected(true);
        updateSession(sessionId, {
          mac,
          deviceName: found.name,
          bleDevice:  found,
          step:       'run',
        });
      }
    }).catch(() => {});
  }, []);

  async function handleScan() {
    setScanning(true);
    setError(null);
    setDevice(null);

    try {
      if (!navigator.bluetooth) {
        throw new Error(
          'Web Bluetooth API is not available. Use Chrome or Edge and enable the flag: chrome://flags/#enable-web-bluetooth'
        );
      }

      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: BLE_DEVICE_NAME_PREFIX }],
        optionalServices: [SVC_UUID],
      });

      console.log('BLE device name:', bleDevice.name);
      const mac  = extractMacFromName(bleDevice.name);
      console.log('Extracted MAC:', mac);
      setAutoDetected(false);
      setDevice({ name: bleDevice.name, mac, raw: bleDevice });
      // Auto-advance to run step — no need to click Confirm
      updateSession(sessionId, {
        mac,
        deviceName: bleDevice.name,
        bleDevice:  bleDevice,
        step:       'run',
      });
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setError('No device selected. Press Scan and choose a PCB_TEST_* device from the list.');
      } else {
        setError(err.message);
      }
    } finally {
      setScanning(false);
    }
  }

  function handleConfirm() {
    if (!device) return;
    updateSession(sessionId, {
      mac:        device.mac,
      deviceName: device.name,
      bleDevice:  device.raw,
      step:       'run',
    });
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Step 3 — BLE Scan</h3>

      <div className="card text-sm text-slate-300 space-y-1">
        <p className="text-slate-400 text-xs">
          Power-cycle the device after flashing, then press Scan. Select the{' '}
          <span className="text-blue-400">PCB_TEST_*</span> device from your browser's Bluetooth picker.
        </p>
      </div>

      {/* Replug reminder */}
      <div className="flex items-start gap-3 bg-amber-950 border border-amber-700 rounded-lg p-3">
        <span className="text-amber-400 text-base leading-none mt-0.5">⚠</span>
        <div className="text-xs text-amber-200 space-y-1">
          <p className="font-semibold">Unplug then replug the device before scanning.</p>
          <p className="text-amber-400">The device must be freshly powered on for BLE to be discoverable. Once replugged, press <span className="font-semibold">Scan for Devices</span>.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-700 rounded p-3 text-red-300 text-xs">
          {error}
        </div>
      )}

      {device && (
        <div className="card border-blue-700 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 uppercase tracking-wider">Device Found</p>
            {autoDetected && (
              <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">Auto-detected</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-300">{device.name}</p>
              <p className="text-xs text-slate-400">MAC: {device.mac ?? device.name}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-end pt-1">
        <button
          className="btn-ghost"
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning…' : device ? '🔍 Scan Again' : '🔍 Scan for Devices'}
        </button>
      </div>
    </div>
  );
}
