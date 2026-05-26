import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

function normalizeBatchId(batch) {
  const batchId = typeof batch === 'string' ? batch.trim() : '';

  if (!batchId) {
    throw new Error('Batch number is required to save a batch report');
  }

  if (batchId.includes('/')) {
    throw new Error('Batch number cannot contain "/"');
  }

  return batchId;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDeviceRecord(session, testerEmail) {
  const { mac, batch, port, duration, liveData, startedAt, disconnectReason, id } = session;
  const { lps27, mpu6050, battery, result } = liveData;

  return {
    record_id: id ?? `${mac ?? 'UNKNOWN'}-${Date.now()}`,
    mac: mac ?? 'UNKNOWN',
    port: port ?? null,
    batch: batch ?? '',
    tester_email: testerEmail,
    test_date: new Date(),
    started_at: startedAt ? new Date(startedAt) : null,
    duration_seconds: duration ?? null,
    disconnect_reason: disconnectReason ?? null,
    lps27: {
      pressure: lps27.pressure ?? null,
      temperature: lps27.temperature ?? null,
      pass: lps27.pass ?? null,
    },
    mpu6050: {
      accel_xyz: [mpu6050.ax ?? null, mpu6050.ay ?? null, mpu6050.az ?? null],
      gyro_xyz: [mpu6050.gx ?? null, mpu6050.gy ?? null, mpu6050.gz ?? null],
      pass: mpu6050.pass ?? null,
    },
    battery: {
      status: battery.status ?? null,
      level: battery.level ?? null,
      adc_raw: battery.adcRaw ?? null,
      pass: battery.pass ?? null,
    },
    global_result: result === 0x00 ? 'PASS' : result === 0x01 ? 'FAIL' : 'NOT_RUN',
  };
}

function summarizeBatchDevices(devices) {
  const passCount = devices.filter((device) => device.global_result === 'PASS').length;
  const failCount = devices.filter((device) => device.global_result === 'FAIL').length;

  let globalResult = 'NOT_RUN';
  if (failCount > 0) {
    globalResult = 'FAIL';
  } else if (passCount > 0) {
    globalResult = 'PASS';
  }

  return {
    device_count: devices.length,
    pass_count: passCount,
    fail_count: failCount,
    global_result: globalResult,
  };
}

function mergeBatchDevices(existingDevices, nextDevice) {
  const nextDevices = existingDevices.filter((device) => device.record_id !== nextDevice.record_id);
  nextDevices.push(nextDevice);
  nextDevices.sort((left, right) => {
    const leftTime = toDate(left.test_date)?.getTime?.() ?? 0;
    const rightTime = toDate(right.test_date)?.getTime?.() ?? 0;
    return leftTime - rightTime;
  });
  return nextDevices;
}

function normalizeDeviceRecord(device, fallbackId, batchId) {
  return {
    record_id: device.record_id ?? `${fallbackId}-${device.mac ?? 'UNKNOWN'}-${device.test_date ?? 'legacy'}`,
    mac: device.mac ?? 'UNKNOWN',
    port: device.port ?? null,
    batch: device.batch ?? batchId,
    tester_email: device.tester_email ?? '',
    test_date: toDate(device.test_date),
    started_at: toDate(device.started_at),
    duration_seconds: device.duration_seconds ?? null,
    disconnect_reason: device.disconnect_reason ?? null,
    lps27: {
      pressure: device.lps27?.pressure ?? null,
      temperature: device.lps27?.temperature ?? null,
      pass: device.lps27?.pass ?? null,
    },
    mpu6050: {
      accel_xyz: Array.isArray(device.mpu6050?.accel_xyz)
        ? device.mpu6050.accel_xyz
        : [null, null, null],
      gyro_xyz: Array.isArray(device.mpu6050?.gyro_xyz)
        ? device.mpu6050.gyro_xyz
        : [null, null, null],
      pass: device.mpu6050?.pass ?? null,
    },
    battery: {
      status: device.battery?.status ?? null,
      level: device.battery?.level ?? null,
      adc_raw: device.battery?.adc_raw ?? null,
      pass: device.battery?.pass ?? null,
    },
    global_result: device.global_result ?? 'NOT_RUN',
  };
}

// ============================================================
//  devices_mac collection
// ============================================================

/**
 * Upsert a device record.
 * - If MAC is seen for the first time: set first_seen.
 * - Always update last_tested and tester_email.
 */
export async function saveDevice(mac, batch, testerEmail) {
  const ref  = doc(db, 'devices', mac);
  const snap = await getDoc(ref);

  const data = {
    macAddress: mac,
    batch,
    tester_email: testerEmail,
    last_tested: serverTimestamp(),
  };

  if (!snap.exists()) {
    data.first_seen = serverTimestamp();
    await setDoc(ref, data);
  } else {
    await setDoc(ref, data, { merge: true });
  }
}

// ============================================================
//  dongle_devices collection
// ============================================================

/**
 * Upsert a dongle device record keyed by MAC address.
 * Stores port (the COM port used when flashing) and tester info.
 */
export async function saveDongleDevice(mac, port, testerEmail) {
  const ref  = doc(db, 'devices', mac);
  const snap = await getDoc(ref);

  const data = {
    macAddress: mac,
    port: port ?? null,
    tester_email: testerEmail,
    last_tested: serverTimestamp(),
  };

  if (!snap.exists()) {
    data.first_seen = serverTimestamp();
    await setDoc(ref, data);
  } else {
    await setDoc(ref, data, { merge: true });
  }
}

// ============================================================
//  test_reports collection
// ============================================================

/**
 * Save a completed test report and return the auto-generated document ID.
 */
export async function saveReport(session, testerEmail) {
  const batchId = normalizeBatchId(session?.batch);
  const docRef = doc(db, 'test_reports', batchId);
  const nextDevice = buildDeviceRecord(session, testerEmail);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);
    const existing = snap.exists() ? snap.data() : {};
    const existingDevices = Array.isArray(existing.devices) ? existing.devices : [];
    const nextDevices = mergeBatchDevices(existingDevices, nextDevice);
    const summary = summarizeBatchDevices(nextDevices);

    transaction.set(docRef, {
      batch: batchId,
      devices: nextDevices,
      tester_emails: Array.from(new Set(nextDevices.map((device) => device.tester_email).filter(Boolean))),
      created_at: existing.created_at ?? nextDevice.test_date,
      latest_test_date: nextDevice.test_date,
      updated_at: nextDevice.test_date,
      started_at: existing.started_at ?? nextDevice.started_at,
      ...summary,
    });
  });

  return batchId;
}

// ============================================================
//  Fetch history
// ============================================================

/**
 * Fetch test_reports with optional filters.
 * @param {{ batch?: string, result?: 'PASS'|'FAIL', dateFrom?: Date, dateTo?: Date }} filters
 * @returns {Promise<Array>}
 */
export async function fetchReports(filters = {}) {
  const snap = await getDocs(collection(db, 'test_reports'));
  const batches = new Map();

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const batchId = String(data.batch ?? docSnap.id ?? '').trim();

    if (!batchId) {
      return;
    }

    const batchEntry = batches.get(batchId) ?? {
      id: batchId,
      batch: batchId,
      devices: [],
      testerEmails: new Set(),
      firstSeenAt: null,
      latestTestDate: null,
    };

    const sourceDevices = Array.isArray(data.devices) && data.devices.length > 0
      ? data.devices.map((device) => normalizeDeviceRecord(device, docSnap.id, batchId))
      : [normalizeDeviceRecord(data, docSnap.id, batchId)];

    sourceDevices.forEach((device) => {
      batchEntry.devices.push(device);

      if (device.tester_email) {
        batchEntry.testerEmails.add(device.tester_email);
      }

      const deviceTime = toDate(device.test_date)?.getTime?.() ?? 0;
      const firstSeenTime = batchEntry.firstSeenAt?.getTime?.() ?? Number.POSITIVE_INFINITY;
      const latestSeenTime = batchEntry.latestTestDate?.getTime?.() ?? 0;

      if (deviceTime > 0 && deviceTime < firstSeenTime) {
        batchEntry.firstSeenAt = toDate(device.test_date);
      }
      if (deviceTime > latestSeenTime) {
        batchEntry.latestTestDate = toDate(device.test_date);
      }
    });

    batches.set(batchId, batchEntry);
  });

  let reports = Array.from(batches.values()).map((batchEntry) => {
    const devices = batchEntry.devices.sort((left, right) => {
      const leftTime = toDate(left.test_date)?.getTime?.() ?? 0;
      const rightTime = toDate(right.test_date)?.getTime?.() ?? 0;
      return leftTime - rightTime;
    });
    const summary = summarizeBatchDevices(devices);

    return {
      id: batchEntry.id,
      batch: batchEntry.batch,
      devices,
      tester_emails: Array.from(batchEntry.testerEmails),
      test_date: batchEntry.latestTestDate,
      latest_test_date: batchEntry.latestTestDate,
      started_at: batchEntry.firstSeenAt,
      ...summary,
    };
  });

  if (filters.batch) {
    reports = reports.filter((report) => report.batch === filters.batch);
  }

  if (filters.result) {
    reports = reports.filter((report) => report.global_result === filters.result);
  }

  if (filters.dateFrom) {
    const fromTime = filters.dateFrom.getTime();
    reports = reports.filter((report) => (toDate(report.test_date)?.getTime?.() ?? 0) >= fromTime);
  }

  if (filters.dateTo) {
    const toTime = filters.dateTo.getTime();
    reports = reports.filter((report) => (toDate(report.test_date)?.getTime?.() ?? 0) <= toTime);
  }

  return reports.sort((left, right) => {
    const leftTime = toDate(left.test_date)?.getTime?.() ?? 0;
    const rightTime = toDate(right.test_date)?.getTime?.() ?? 0;
    return rightTime - leftTime;
  });
}
