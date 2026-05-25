'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');

// ── Enable Web Bluetooth ────────────────────────────────────────────────────
app.commandLine.appendSwitch('enable-features', 'WebBluetooth,WebBluetoothGetDevices');

// ── Environment ─────────────────────────────────────────────────────────────
const isDev = process.env.ELECTRON_DEV === '1' || !app.isPackaged;

// Load .env files for GITHUB_TOKEN and other runtime config.
// Priority (highest last, so later writes win):
//   system env  <  bundled .env  <  userData .env
// We never let a stale system env variable override the packaged token.
function loadDotenv() {
  const fs = require('fs');
  const candidates = [
    path.join(__dirname, '../.env'),           // bundled with installer
    path.join(app.getPath('userData'), '.env'), // user override, survives updates
  ];
  for (const envPath of candidates) {
    try {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m) {
          const val = m[2].trim();
          if (val) process.env[m[1]] = val; // always override system env
        }
      }
    } catch (_) {}
  }
}

// ── Server ───────────────────────────────────────────────────────────────────
let serverStarted = false;

function startServer() {
  if (serverStarted) return;
  serverStarted = true;

  // Tell server.js whether the app is packaged so it resolves firmware paths
  process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? '1' : '0';

  try {
    require('../server/server.js');
  } catch (err) {
    console.error('[main] Failed to start embedded server:', err);
  }
}

function waitForServer(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(1000);
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error('Embedded server did not start in time'));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.on('timeout', () => req.destroy());
    }

    attempt();
  });
}

// ── BrowserWindow ─────────────────────────────────────────────────────────────
let mainWindow = null;
let selectBluetoothCallback = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Papritech Flasher',
    backgroundColor: '#020617', // slate-950
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Allow loading local resources and the embedded server
      webSecurity: true,
    },
  });

  // Show window gracefully once content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // ── Web Bluetooth: device picker ──────────────────────────────────────────
  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();

    if (deviceList.length === 0) {
      // No devices found yet — keep listening; callback will be invoked later
      // when the user presses the OS picker or a device appears.
      // Store callback so we can invoke it from IPC if needed.
      selectBluetoothCallback = callback;
      return;
    }

    if (deviceList.length === 1) {
      // Auto-select when there's exactly one matching device
      callback(deviceList[0].deviceId);
      return;
    }

    // Multiple devices — show a native selection dialog
    const buttons = [
      ...deviceList.map((d) => d.deviceName || d.deviceId),
      'Cancel',
    ];
    dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        title: 'Select Bluetooth Device',
        message: 'Multiple devices found. Choose one:',
        buttons,
        cancelId: deviceList.length,
      })
      .then(({ response }) => {
        if (response < deviceList.length) {
          callback(deviceList[response].deviceId);
        } else {
          callback(''); // cancelled
        }
      });
  });

  // ── Bluetooth: bypass all user-gesture & permission checks ─────────────────
  // When setDevicePermissionHandler is registered AND returns true for
  // 'bluetooth', Electron's C++ BluetoothDelegate tells Blink to skip the
  // HasTransientUserActivation check inside requestDevice() — so scans
  // triggered programmatically (auto-scan after serial test) work without
  // a real click event.
  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'bluetooth') return true;
    return false;
  });

  // Pre-grant Bluetooth permission so no permission dialog ever appears
  // (a dialog would also require user gesture — this eliminates the need).
  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => {
      if (permission === 'bluetooth') return true;
      return null; // default for everything else
    }
  );
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(true); // grant all — this is a trusted internal desktop app
    }
  );

  // ── Bluetooth pairing (PIN) — auto-confirm for BLE devices ───────────────
  mainWindow.webContents.session.setBluetoothPairingHandler((_details, callback) => {
    callback({ confirmed: true });
  });

  // ── Load the app ──────────────────────────────────────────────────────────
  if (isDev) {
    // In dev, Vite serves the frontend at :5173 (with proxy to :3001 for API)
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    try {
      await waitForServer('http://127.0.0.1:3001/api/health');
      mainWindow.loadURL('http://127.0.0.1:3001');
    } catch (err) {
      dialog.showErrorBox(
        'Startup Error',
        `Could not start the embedded server:\n\n${err.message}\n\nPlease restart the application.`
      );
      app.quit();
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  loadDotenv();
  startServer(); // start server in both dev and prod
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    startServer();
    createWindow();
  }
});
