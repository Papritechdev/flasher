// ============================================================
//  GATT UUIDs (128-bit, standard string form)
// ============================================================
export const SVC_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234560000';

export const CHAR_UUID = {
    LPS27: 'a1b2c3d4-e5f6-7890-abcd-ef1234560001',
    MPU6050: 'a1b2c3d4-e5f6-7890-abcd-ef1234560002',
    BATTERY: 'a1b2c3d4-e5f6-7890-abcd-ef1234560003',
    RESULT: 'a1b2c3d4-e5f6-7890-abcd-ef1234560004',
    CONTROL: 'a1b2c3d4-e5f6-7890-abcd-ef1234560005',
};

// ============================================================
//  BLE
// ============================================================
export const BLE_DEVICE_NAME_PREFIX = 'PCB_TEST_';
export const DONGLE_BLE_NAME_PREFIX = 'Dongle ';

// ============================================================
//  Pass/Fail byte values (firmware-defined)
// ============================================================
export const RESULT_PASS = 0x00;
export const RESULT_FAIL = 0x01;
export const RESULT_NOT_RUN = 0xff;

// ============================================================
//  Test session constraints
// ============================================================
export const SESSION_MIN_SEC = 1;
export const SESSION_MAX_SEC = 86400;

// Preset durations shown in the Setup step dropdown
export const DURATION_PRESETS = [
    { label: '5 minutes', seconds: 300 },
    { label: '10 minutes', seconds: 600 },
    { label: '20 minutes', seconds: 1200 },
    { label: '30 minutes', seconds: 1800 },
    { label: '1 hour', seconds: 3600 },
    { label: '2 hours', seconds: 7200 },
    { label: '3 hours', seconds: 10800 },
    { label: '4 hours', seconds: 14400 },
    { label: '5 hours', seconds: 18000 },
    { label: '6 hours', seconds: 21600 },
    { label: '8 hours', seconds: 28800 },
    { label: '10 hours', seconds: 36000 },
    { label: '12 hours', seconds: 43200 },
    { label: '24 hours', seconds: 86400 },
];
export const SESSION_DEFAULT_SEC = 1800; // 30 minutes

// ============================================================
//  Local helper server (bypass Vite proxy for streaming SSE)
// ============================================================
export const SERVER_URL = 'http://127.0.0.1:3001';

// ============================================================
//  Wizard steps (ordered)
// ============================================================
export const STEPS = ['setup', 'flash', 'ble', 'run', 'result'];

export const STEP_LABELS = {
    setup: 'Setup',
    flash: 'Flash',
    ble: 'BLE Scan',
    run: 'Test Run',
    result: 'Results',
};
