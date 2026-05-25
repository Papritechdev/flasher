import { create } from 'zustand';
import { STEPS, RESULT_FAIL } from '../config';

// Module-level map so intervals survive wizard open/close (not React state)
const _countdownIntervals = new Map();

/**
 * Session shape:
 * {
 *   id:           string           — uuid
 *   step:         'setup'|'flash'|'ble'|'run'|'result'
 *   port:         string|null      — e.g. "COM14"
 *   batch:        string           — batch number entered by tester
 *   duration:     number           — seconds
 *   mac:          string|null      — e.g. "10:20:BA:17:88:12"
 *   deviceName:   string|null      — BLE advertised name
 *   // BLE handles (non-serialisable — stored as refs, not persisted)
 *   bleDevice:    BluetoothDevice|null
 *   bleChars: {
 *     lps27:   BluetoothRemoteGATTCharacteristic|null
 *     mpu6050: BluetoothRemoteGATTCharacteristic|null
 *     battery: BluetoothRemoteGATTCharacteristic|null
 *     result:  BluetoothRemoteGATTCharacteristic|null
 *     control: BluetoothRemoteGATTCharacteristic|null
 *   }
 *   flashLog:     string[]         — lines from esptool SSE
 *   flashProgress: number          — 0-100
 *   liveData: {
 *     lps27:   { pressure: number, temperature: number, pass: boolean|null }
 *     mpu6050: { ax, ay, az, gx, gy, gz: number, pass: boolean|null }
 *     battery: { status: number, level: number, adcRaw: number, pass: boolean|null }
 *     result:  0x00|0x01|0xFF|null
 *   }
 *   countdown:    number           — seconds remaining
 *   error:        string|null
 *   savedReportId: string|null
 * }
 */

function makeSession(id) {
  return {
    id,
    step:          STEPS[0],
    port:          null,
    batch:         '',
    duration:      30,
    mac:           null,
    deviceName:    null,
    bleDevice:     null,
    bleChars:      { lps27: null, mpu6050: null, battery: null, result: null, control: null },
    flashLog:      [],
    flashProgress: 0,
    liveData: {
      lps27:   { pressure: null, temperature: null, pass: null },
      mpu6050: { ax: null, ay: null, az: null, gx: null, gy: null, gz: null, pass: null },
      battery: { status: null, level: null, adcRaw: null, pass: null },
      result:  null,
    },
    startedAt:     null,
    disconnectReason: null,
    countdown:     0,
    error:         null,
    savedReportId: null,
  };
}

let _nextId = 1;

export const useSessionStore = create((set, get) => ({
  // Map: id -> session
  sessions: {},

  addSession() {
    const id = String(_nextId++);
    set((s) => ({
      sessions: { ...s.sessions, [id]: makeSession(id) },
    }));
    return id;
  },

  updateSession(id, patch) {
    set((s) => {
      const existing = s.sessions[id];
      if (!existing) return s;
      return {
        sessions: {
          ...s.sessions,
          [id]: { ...existing, ...patch },
        },
      };
    });
  },

  updateLiveData(id, key, data) {
    set((s) => {
      const existing = s.sessions[id];
      if (!existing) return s;
      return {
        sessions: {
          ...s.sessions,
          [id]: {
            ...existing,
            liveData: {
              ...existing.liveData,
              [key]: { ...existing.liveData[key], ...data },
            },
          },
        },
      };
    });
  },

  appendFlashLog(id, line) {
    set((s) => {
      const existing = s.sessions[id];
      if (!existing) return s;
      return {
        sessions: {
          ...s.sessions,
          [id]: {
            ...existing,
            flashLog: [...existing.flashLog, line],
          },
        },
      };
    });
  },

  removeSession(id) {
    set((s) => {
      const next = { ...s.sessions };
      delete next[id];
      return { sessions: next };
    });
    // Clean up any running interval
    if (_countdownIntervals.has(id)) {
      clearInterval(_countdownIntervals.get(id));
      _countdownIntervals.delete(id);
    }
  },

  startCountdown(id) {
    // Stop any existing interval for this session
    if (_countdownIntervals.has(id)) {
      clearInterval(_countdownIntervals.get(id));
      _countdownIntervals.delete(id);
    }
    const handle = setInterval(() => {
      const s = get().sessions[id];
      if (!s) { clearInterval(handle); _countdownIntervals.delete(id); return; }
      const next = (s.countdown ?? 0) - 1;
      if (next <= 0) {
        clearInterval(handle);
        _countdownIntervals.delete(id);
        get().updateSession(id, { countdown: 0, step: 'result' });
      } else {
        get().updateSession(id, { countdown: next });
      }
    }, 1000);
    _countdownIntervals.set(id, handle);
  },

  stopCountdown(id) {
    if (_countdownIntervals.has(id)) {
      clearInterval(_countdownIntervals.get(id));
      _countdownIntervals.delete(id);
    }
  },

  failSession(id, reason) {
    get().stopCountdown(id);
    const s = get().sessions[id];
    if (!s) return;
    get().updateSession(id, {
      liveData: { ...s.liveData, result: RESULT_FAIL },
      disconnectReason: reason,
      step: 'result',
    });
  },

  getSession(id) {
    return get().sessions[id] ?? null;
  },
}));
