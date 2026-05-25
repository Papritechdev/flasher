import * as XLSX from 'xlsx';
import { batteryStatusLabel } from './parsers';

function formatDateValue(value) {
  if (!value) return 'N/A';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
  return String(value);
}

function buildBatchDeviceRows(batchReport) {
  return (batchReport.devices ?? []).map((device, index) => [
    index + 1,
    device.mac ?? 'UNKNOWN',
    device.port ?? 'N/A',
    formatDateValue(device.started_at),
    formatDateValue(device.test_date),
    device.tester_email ?? '',
    device.duration_seconds ?? '',
    device.global_result ?? 'N/A',
    device.lps27?.pressure != null ? Number(device.lps27.pressure).toFixed(2) : 'N/A',
    device.lps27?.temperature != null ? Number(device.lps27.temperature).toFixed(2) : 'N/A',
    device.lps27?.pass === true ? 'PASS' : device.lps27?.pass === false ? 'FAIL' : 'N/A',
    device.mpu6050?.accel_xyz?.[0] != null ? Number(device.mpu6050.accel_xyz[0]).toFixed(4) : 'N/A',
    device.mpu6050?.accel_xyz?.[1] != null ? Number(device.mpu6050.accel_xyz[1]).toFixed(4) : 'N/A',
    device.mpu6050?.accel_xyz?.[2] != null ? Number(device.mpu6050.accel_xyz[2]).toFixed(4) : 'N/A',
    device.mpu6050?.gyro_xyz?.[0] != null ? Number(device.mpu6050.gyro_xyz[0]).toFixed(4) : 'N/A',
    device.mpu6050?.gyro_xyz?.[1] != null ? Number(device.mpu6050.gyro_xyz[1]).toFixed(4) : 'N/A',
    device.mpu6050?.gyro_xyz?.[2] != null ? Number(device.mpu6050.gyro_xyz[2]).toFixed(4) : 'N/A',
    device.mpu6050?.pass === true ? 'PASS' : device.mpu6050?.pass === false ? 'FAIL' : 'N/A',
    device.battery?.status != null ? batteryStatusLabel(device.battery.status) : 'N/A',
    device.battery?.level ?? 'N/A',
    device.battery?.adc_raw ?? 'N/A',
    device.battery?.pass === true ? 'PASS' : device.battery?.pass === false ? 'FAIL' : 'N/A',
    device.disconnect_reason ?? '',
  ]);
}

/**
 * Build and trigger download of an Excel report for a completed test session.
 * @param {object} session — session object from sessionStore
 * @param {string} testerEmail
 */
export function downloadExcelReport(session, testerEmail) {
  const { mac, batch, duration, liveData } = session;
  const { lps27, mpu6050, battery, result } = liveData;
  const dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const startedStr = session.startedAt
    ? new Date(session.startedAt).toLocaleString()
    : 'N/A';

  const globalResult = result === 0x00 ? 'PASS' : result === 0x01 ? 'FAIL' : 'NOT RUN';

  // ── Summary sheet ──────────────────────────────────────────────────
  const summaryRows = [
    ['PCB Test Report'],
    [],
    ['Batch Number',   batch  ?? ''],
    ['MAC Address',    mac    ?? ''],
    ['Test Started',   startedStr],
    ['Test Date',      dateStr],
    ['Tester',         testerEmail],
    ['Duration (s)',   duration],
    ['Global Result',  globalResult],
  ];

  // ── LPS27 sheet ────────────────────────────────────────────
  const lps27Rows = [
    ['LPS27HHW Sensor'],
    [],
    ['Field',       'Value',             'Unit'],
    ['Pressure',    lps27.pressure?.toFixed(2) ?? 'N/A', 'hPa'],
    ['Temperature', lps27.temperature?.toFixed(2) ?? 'N/A', '°C'],
    ['Result',      lps27.pass === true ? 'PASS' : lps27.pass === false ? 'FAIL' : 'N/A', ''],
  ];

  // ── MPU6050 sheet ──────────────────────────────────────────
  const mpu6050Rows = [
    ['MPU6050 IMU'],
    [],
    ['Field',     'Value',  'Unit'],
    ['Accel X',   mpu6050.ax?.toFixed(4) ?? 'N/A', 'g'],
    ['Accel Y',   mpu6050.ay?.toFixed(4) ?? 'N/A', 'g'],
    ['Accel Z',   mpu6050.az?.toFixed(4) ?? 'N/A', 'g'],
    ['Gyro X',    mpu6050.gx?.toFixed(4) ?? 'N/A', '°/s'],
    ['Gyro Y',    mpu6050.gy?.toFixed(4) ?? 'N/A', '°/s'],
    ['Gyro Z',    mpu6050.gz?.toFixed(4) ?? 'N/A', '°/s'],
    ['Result',    mpu6050.pass === true ? 'PASS' : mpu6050.pass === false ? 'FAIL' : 'N/A', ''],
  ];

  // ── Battery sheet ──────────────────────────────────────────
  const batteryRows = [
    ['Battery Monitor'],
    [],
    ['Field',         'Value', 'Unit'],
    ['Charge Status', batteryStatusLabel(battery.status ?? 0xff), ''],
    ['Charge Level',  battery.level ?? 'N/A', '%'],
    ['ADC Raw',       battery.adcRaw ?? 'N/A', 'counts'],
    ['Result',        battery.pass === true ? 'PASS' : battery.pass === false ? 'FAIL' : 'N/A', ''],
  ];

  // ── Build workbook ─────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  const wsLps27   = XLSX.utils.aoa_to_sheet(lps27Rows);
  const wsMpu     = XLSX.utils.aoa_to_sheet(mpu6050Rows);
  const wsBat     = XLSX.utils.aoa_to_sheet(batteryRows);

  // Column widths
  [wsSummary, wsLps27, wsMpu, wsBat].forEach((ws) => {
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 8 }];
  });

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsLps27,   'LPS27');
  XLSX.utils.book_append_sheet(wb, wsMpu,     'MPU6050');
  XLSX.utils.book_append_sheet(wb, wsBat,     'Battery');

  const filename = `PCB_Test_${(mac ?? 'UNKNOWN').replace(/:/g, '')}_${dateStr.replace(/[: ]/g, '-')}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Build and trigger download of a report from raw Firestore data
 * (used on the History page where we don't have the full session object).
 */
export function downloadReportFromFirestore(report) {
  return downloadBatchReportFromFirestore(report);
}

/**
 * Build and trigger download of a batch-level report from Firestore data.
 */
export function downloadBatchReportFromFirestore(report) {
  const dateStr = formatDateValue(report.latest_test_date ?? report.test_date);
  const testerEmails = Array.isArray(report.tester_emails) ? report.tester_emails.join(', ') : '';

  const summaryRows = [
    ['PCB Test Report'],
    [],
    ['Batch Number',      report.batch ?? ''],
    ['Device Count',      report.device_count ?? (report.devices?.length ?? 0)],
    ['PASS Count',        report.pass_count ?? ''],
    ['FAIL Count',        report.fail_count ?? ''],
    ['Test Date',         dateStr],
    ['Tester(s)',         testerEmails],
    ['Global Result',     report.global_result ?? ''],
    [],
  ];

  const deviceHeader = [
    'No.',
    'MAC Address',
    'Port',
    'Started At',
    'Test Date',
    'Tester',
    'Duration (s)',
    'Global Result',
    'LPS27 Pressure (hPa)',
    'LPS27 Temperature (°C)',
    'LPS27 Result',
    'MPU Accel X (g)',
    'MPU Accel Y (g)',
    'MPU Accel Z (g)',
    'MPU Gyro X (°/s)',
    'MPU Gyro Y (°/s)',
    'MPU Gyro Z (°/s)',
    'MPU Result',
    'Battery Status',
    'Battery Level (%)',
    'Battery ADC Raw',
    'Battery Result',
    'Disconnect Reason',
  ];

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  const wsDevices = XLSX.utils.aoa_to_sheet([deviceHeader, ...buildBatchDeviceRows(report)]);
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 18 }];
  wsDevices['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 12 },
    { wch: 20 },
    { wch: 20 },
    { wch: 28 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsDevices, 'Devices');

  const filename = `PCB_Batch_${report.batch ?? 'UNKNOWN'}_${String(dateStr).replace(/[: ]/g, '-')}.xlsx`;
  XLSX.writeFile(wb, filename);
}
