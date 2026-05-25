/**
 * DataView-based parsers for all GATT characteristic payloads.
 * All multi-byte fields use little-endian byte order (firmware uses LE).
 */

import { RESULT_PASS, RESULT_FAIL, RESULT_NOT_RUN } from '../config';

// ============================================================
//  LPS27_DATA  — 9 bytes
//  [0-3]  float32  pressure_hpa  (LE)
//  [4-7]  float32  temperature_c (LE)
//  [8]    uint8    pass_fail      (0=PASS, 1=FAIL)
// ============================================================
export function parseLps27(event) {
  const view = event.target.value; // DataView
  const pressure    = view.getFloat32(0, true);
  const temperature = view.getFloat32(4, true);
  const rawPass     = view.getUint8(8);
  const pass        = rawPass === RESULT_PASS ? true : rawPass === RESULT_FAIL ? false : null;
  return { pressure, temperature, pass };
}

// ============================================================
//  MPU6050_DATA  — 25 bytes
//  [0-3]   float32  accel_x  (LE)  g
//  [4-7]   float32  accel_y  (LE)  g
//  [8-11]  float32  accel_z  (LE)  g
//  [12-15] float32  gyro_x   (LE)  °/s
//  [16-19] float32  gyro_y   (LE)  °/s
//  [20-23] float32  gyro_z   (LE)  °/s
//  [24]    uint8    pass_fail
// ============================================================
export function parseMpu6050(event) {
  const view = event.target.value;
  const ax = view.getFloat32(0,  true);
  const ay = view.getFloat32(4,  true);
  const az = view.getFloat32(8,  true);
  const gx = view.getFloat32(12, true);
  const gy = view.getFloat32(16, true);
  const gz = view.getFloat32(20, true);
  const rawPass = view.getUint8(24);
  const pass = rawPass === RESULT_PASS ? true : rawPass === RESULT_FAIL ? false : null;
  return { ax, ay, az, gx, gy, gz, pass };
}

// ============================================================
//  BATTERY_DATA  — 5 bytes
//  [0]   uint8   charge_status   (0xFF = unknown)
//  [1]   uint8   charge_level    (0-100 %)
//  [2-3] uint16  adc_raw         (LE)
//  [4]   uint8   pass_fail
// ============================================================
export function parseBattery(event) {
  const view   = event.target.value;
  const status = view.getUint8(0);
  const level  = view.getUint8(1);
  const adcRaw = view.getUint16(2, true);
  const rawPass = view.getUint8(4);
  const pass = rawPass === RESULT_PASS ? true : rawPass === RESULT_FAIL ? false : null;
  return { status, level, adcRaw, pass };
}

// ============================================================
//  TEST_RESULT  — 1 byte
//  [0]  uint8  result  (0=PASS, 1=FAIL, 0xFF=not run)
// ============================================================
export function parseResult(event) {
  const view = event.target.value;
  return view.getUint8(0);
}

// ============================================================
//  Helpers
// ============================================================
export function resultLabel(byte) {
  if (byte === RESULT_PASS)    return 'PASS';
  if (byte === RESULT_FAIL)    return 'FAIL';
  if (byte === RESULT_NOT_RUN) return 'NOT RUN';
  return '—';
}

export function passBool(byte) {
  if (byte === RESULT_PASS) return true;
  if (byte === RESULT_FAIL) return false;
  return null;
}

export function batteryStatusLabel(status) {
  if (status === 0xff) return 'Unknown';
  if (status === 0x00) return 'Not Charging';
  if (status === 0x01) return 'Charging';
  return `0x${status.toString(16).padStart(2, '0')}`;
}
