/**
 * Papritech Flasher — Embedded Local Server
 *
 * Endpoints:
 *   GET  /api/health               — liveness check
 *   GET  /api/ports                — list available serial ports
 *   GET  /api/flash?port=COM14     — flash PCB test firmware (SSE)
 *   GET  /api/flash-auto           — auto-detect port + flash PCB (SSE)
 *   GET  /api/flash-dongle?port=   — flash dongle firmware (SSE)
 *   GET  /api/flash-dongle-auto    — auto-detect port + flash dongle (SSE)
 *   GET  /api/serial-auto?exclude= — read serial test results (SSE)
 *   GET  /api/firmware-versions    — fetch versions.txt from GitHub
 *   GET  /api/flash-device?model=  — download from GitHub + flash (SSE)
 *   static /                       — serves ../dist in production
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { spawn }  = require('child_process');
const { SerialPort } = require('serialport');
const https      = require('https');
const fs         = require('fs');
const os         = require('os');

const app  = express();
const PORT = 3001;

// ---------------------------------------------------------------------------
// Path resolution — works in both dev (node server.js) and packaged Electron
// ---------------------------------------------------------------------------
// When running inside a packaged Electron app, process.env.ELECTRON_IS_PACKAGED
// is set to '1' by the Electron main process before requiring this file.
const IS_PACKAGED = process.env.ELECTRON_IS_PACKAGED === '1';

// Resources directory (esptool.exe + firmware bins)
//   Dev:  <project_root>/resources/
//   Prod: <install>/resources/   (electron-builder extraResources → "to": ".")
const RESOURCES_DIR = IS_PACKAGED
  ? process.resourcesPath
  : path.join(__dirname, '../resources');

// Built React frontend
//   Dev:  <project_root>/dist/  (not used — Vite serves it)
//   Prod: <install>/resources/app/dist/
const DIST_DIR = path.join(__dirname, '../dist');

const ESPTOOL_PATH = path.join(RESOURCES_DIR, 'esptool.exe');

// PCB firmware (test firmware flashed during QA)
const PCB_DIR        = path.join(RESOURCES_DIR, 'pcb firmware test');
const BOOTLOADER_BIN = path.join(PCB_DIR, 'bootloader.bin');
const PARTITION_BIN  = path.join(PCB_DIR, 'partition-table.bin');
const FIRMWARE_BIN   = path.join(PCB_DIR, 'pcb_test_firmware.bin');

// Dongle firmware (ESP32-S3 T-Dongle-S3)
const DONGLE_DIR            = path.join(RESOURCES_DIR, 'dongle firmware test');
const DONGLE_BOOTLOADER_BIN = path.join(DONGLE_DIR, 'bootloader.bin');
const DONGLE_PARTITION_BIN  = path.join(DONGLE_DIR, 'partition-table.bin');
const DONGLE_FIRMWARE_BIN   = path.join(DONGLE_DIR, 'tdongle_s3_test_firmware.bin');

// ---------------------------------------------------------------------------
// GitHub firmware repository (production firmware)
// ---------------------------------------------------------------------------
const GITHUB_REPO   = 'chaabanihoussem/QAhajeQ9G';
const GITHUB_BRANCH = 'main';

const FIRMWARE_MODELS = {
  plus:   { label: 'Plus / Pro',  appPath: 'deviceS3/ota.bin',       bootPath: 'deviceS3/airmotion_S3_boot.bin', partPath: 'deviceS3/airmotion_S3_part.bin', dongle: false },
  neo:    { label: 'Neo',         appPath: 'deviceS3/neo.bin',       bootPath: 'deviceS3/airmotion_S3_boot.bin', partPath: 'deviceS3/airmotion_S3_part.bin', dongle: false },
  proex:  { label: 'Pro Extra',   appPath: 'deviceS3/pro_extra.bin', bootPath: 'deviceS3/airmotion_S3_boot.bin', partPath: 'deviceS3/airmotion_S3_part.bin', dongle: false },
  dongle: { label: 'USB Dongle',  appPath: 'dongle/ota.bin',         bootPath: 'dongle/dongle_boot.bin',         partPath: 'dongle/dongle_part.bin',         dongle: true  },
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({
  origin: (_origin, cb) => cb(null, true),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Chrome Private Network Access preflight
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.use(express.json());

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------
function downloadGithubFile(githubPath, destPath) {
  return new Promise((resolve, reject) => {
    const token  = process.env.GITHUB_TOKEN;
    // Use the Contents API so Git-LFS tracked files are resolved correctly.
    // The Accept header makes GitHub return raw bytes instead of JSON metadata.
    // On LFS files GitHub redirects to the actual storage URL (CDN); we strip
    // the Authorization header on those redirects to avoid CDN rejections.
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${githubPath}?ref=${GITHUB_BRANCH}`;

    function tryFetch(url, redirectCount = 0) {
      if (redirectCount > 5) { reject(new Error('Too many redirects')); return; }
      const parsed      = new URL(url);
      const isGitHubHost = parsed.hostname === 'api.github.com' ||
                           parsed.hostname.endsWith('.githubusercontent.com');
      const reqOpts = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'papritech-flash-tool/1.0',
          'Accept':     'application/vnd.github.raw+json',
          ...(token && isGitHubHost ? { Authorization: `token ${token}` } : {}),
        },
      };
      const req = https.get(reqOpts, (resp) => {
        if (resp.statusCode === 301 || resp.statusCode === 302 ||
            resp.statusCode === 307 || resp.statusCode === 308) {
          resp.resume();
          tryFetch(resp.headers.location, redirectCount + 1);
          return;
        }
        if (resp.statusCode !== 200) {
          resp.resume();
          reject(new Error(`GitHub returned HTTP ${resp.statusCode} for ${githubPath}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        resp.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error',  (err) => { fs.unlink(destPath, () => {}); reject(err); });
        resp.on('error',  (err) => { fs.unlink(destPath, () => {}); reject(err); });
      });
      req.on('error', reject);
    }

    tryFetch(apiUrl);
  });
}

function fetchGithubText(githubPath) {
  return new Promise((resolve, reject) => {
    const token   = process.env.GITHUB_TOKEN;
    const apiUrl  = `https://api.github.com/repos/${GITHUB_REPO}/contents/${githubPath}?ref=${GITHUB_BRANCH}`;
    const parsed  = new URL(apiUrl);
    const reqOpts = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'papritech-flash-tool/1.0',
        'Accept':     'application/vnd.github.raw+json',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    };
    const req = https.get(reqOpts, (resp) => {
      if (resp.statusCode === 301 || resp.statusCode === 302 ||
          resp.statusCode === 307 || resp.statusCode === 308) {
        resp.resume();
        // Follow redirect without auth (CDN pre-signed URL)
        const loc    = resp.headers.location;
        const p2     = new URL(loc);
        const isGH   = p2.hostname === 'api.github.com' || p2.hostname.endsWith('.githubusercontent.com');
        https.get({
          hostname: p2.hostname,
          path:     p2.pathname + p2.search,
          headers: {
            'User-Agent': 'papritech-flash-tool/1.0',
            'Accept':     'application/vnd.github.raw+json',
            ...(token && isGH ? { Authorization: `token ${token}` } : {}),
          },
        }, (resp2) => {
          if (resp2.statusCode !== 200) { resp2.resume(); reject(new Error(`GitHub returned HTTP ${resp2.statusCode}`)); return; }
          let data = '';
          resp2.on('data', (c) => { data += c; });
          resp2.on('end',  () => resolve(data));
          resp2.on('error', reject);
        }).on('error', reject);
        return;
      }
      if (resp.statusCode !== 200) {
        resp.resume();
        reject(new Error(`GitHub returned HTTP ${resp.statusCode}`));
        return;
      }
      let data = '';
      resp.on('data',  (chunk) => { data += chunk; });
      resp.on('end',   () => resolve(data));
      resp.on('error', reject);
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// SSE helper
// ---------------------------------------------------------------------------
function makeSend(res) {
  return (line) => {
    const clean = line
      .replace(/\x1B\[[0-9;]*[mGKF]/g, '')
      .replace(/\r/g, '')
      .trim();
    if (clean.length === 0) return;
    res.write(`data: ${clean}\n\n`);
  };
}

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ---------------------------------------------------------------------------
// GET /api/ports
// ---------------------------------------------------------------------------
app.get('/api/ports', async (_req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json(ports);
  } catch (err) {
    console.error('Failed to list ports:', err);
    res.status(500).json({ error: 'Failed to list serial ports', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/flash?port=COM14   — flash PCB test firmware (SSE)
// ---------------------------------------------------------------------------
app.get('/api/flash', (req, res) => {
  const { port } = req.query;
  if (!port || typeof port !== 'string' || !/^(COM\d+|\/dev\/tty\S+)$/.test(port)) {
    return res.status(400).json({ error: 'Invalid or missing port parameter' });
  }

  sseHeaders(res);
  const send = makeSend(res);

  const args = [
    '--chip', 'esp32s3',
    '-p', port,
    '--baud', '921600',
    '--before', 'default_reset',
    '--after',  'hard_reset',
    'write_flash', '-e', '-z',
    '--flash_mode', 'dio',
    '--flash_freq', '80m',
    '--flash_size', '8MB',
    '0x0',     BOOTLOADER_BIN,
    '0x10000', FIRMWARE_BIN,
    '0x8000',  PARTITION_BIN,
  ];

  console.log(`[flash] ${port}`);
  send(`Starting flash on ${port}...`);

  let child;
  try {
    child = spawn(ESPTOOL_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (spawnErr) {
    send(`ERROR: Failed to launch esptool: ${spawnErr.message}`);
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  const handleData = (chunk) => chunk.toString().split('\n').forEach(send);
  child.stdout.on('data', handleData);
  child.stderr.on('data', handleData);
  child.on('error', (err) => { send(`ERROR: ${err.message}`); res.write('data: EXIT:1\n\n'); res.end(); });
  child.on('close', (code) => {
    const ec = code ?? 1;
    send(ec === 0 ? 'Flash completed successfully.' : `Flash failed with exit code ${ec}.`);
    res.write(`data: EXIT:${ec}\n\n`);
    res.end();
  });
  req.on('close', () => { if (child && !child.killed) child.kill(); });
});

// ---------------------------------------------------------------------------
// GET /api/flash-auto   — auto-detect port + flash PCB (SSE)
// ---------------------------------------------------------------------------
app.get('/api/flash-auto', async (req, res) => {
  sseHeaders(res);
  const send = makeSend(res);

  let aborted = false;
  req.on('close', () => { aborted = true; });

  let ports;
  try {
    ports = await SerialPort.list();
  } catch (err) {
    send(`ERROR: Failed to list ports: ${err.message}`);
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  if (ports.length === 0) {
    send('ERROR: No serial ports found. Connect the PCB and try again.');
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  send(`Found ${ports.length} port(s): ${ports.map((p) => p.path).join(', ')}`);

  for (const portInfo of ports) {
    if (aborted) break;
    const port = portInfo.path;
    send(`--- Trying ${port}${portInfo.manufacturer ? ` (${portInfo.manufacturer})` : ''} ---`);

    const args = [
      '--chip', 'esp32s3',
      '-p', port,
      '--baud', '921600',
      '--before', 'default_reset',
      '--after',  'hard_reset',
      '--connect-attempts', '3',
      'write_flash', '-e', '-z',
      '--flash_mode', 'dio',
      '--flash_freq', '80m',
      '--flash_size', '8MB',
      '0x0',     BOOTLOADER_BIN,
      '0x10000', FIRMWARE_BIN,
      '0x8000',  PARTITION_BIN,
    ];

    const exitCode = await new Promise((resolve) => {
      let child;
      try {
        child = spawn(ESPTOOL_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (spawnErr) {
        send(`ERROR: Failed to launch esptool: ${spawnErr.message}`);
        resolve(1);
        return;
      }
      const handleData = (chunk) => chunk.toString().split('\n').forEach(send);
      child.stdout.on('data', handleData);
      child.stderr.on('data', handleData);
      child.on('error', (err) => { send(`ERROR: ${err.message}`); resolve(1); });
      child.on('close', (code) => resolve(code ?? 1));
      req.on('close', () => { if (child && !child.killed) child.kill(); });
    });

    if (exitCode === 0) {
      send(`Flash completed successfully on ${port}.`);
      res.write('data: EXIT:0\n\n');
      return res.end();
    }
    send(`Failed on ${port}, trying next port...`);
  }

  if (!aborted) {
    send('ERROR: Flash failed on all available ports.');
    res.write('data: EXIT:1\n\n');
    res.end();
  }
});

// ---------------------------------------------------------------------------
// GET /api/flash-dongle?port=   — flash dongle firmware (SSE)
// ---------------------------------------------------------------------------
app.get('/api/flash-dongle', (req, res) => {
  const { port } = req.query;
  if (!port || typeof port !== 'string' || !/^(COM\d+|\/dev\/tty\S+)$/.test(port)) {
    return res.status(400).json({ error: 'Invalid or missing port parameter' });
  }

  sseHeaders(res);
  const send = makeSend(res);

  const args = [
    '--chip', 'esp32s3',
    '-p', port,
    '--baud', '115200',
    '--before', 'no_reset',
    '--after',  'hard_reset',
    '--no-stub',
    '--connect-attempts', '5',
    'write_flash', '-z',
    '--flash_mode', 'dio',
    '--flash_freq', '80m',
    '--flash_size', '8MB',
    '0x0',     DONGLE_BOOTLOADER_BIN,
    '0x10000', DONGLE_FIRMWARE_BIN,
    '0x8000',  DONGLE_PARTITION_BIN,
  ];

  send(`Starting dongle flash on ${port}...`);

  let child;
  try {
    child = spawn(ESPTOOL_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (spawnErr) {
    send(`ERROR: Failed to launch esptool: ${spawnErr.message}`);
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  const handleData = (chunk) => chunk.toString().split('\n').forEach(send);
  child.stdout.on('data', handleData);
  child.stderr.on('data', handleData);
  child.on('error', (err) => { send(`ERROR: ${err.message}`); res.write('data: EXIT:1\n\n'); res.end(); });
  child.on('close', (code) => {
    const ec = code ?? 1;
    send(ec === 0 ? 'Dongle flash completed successfully.' : `Flash failed with exit code ${ec}.`);
    res.write(`data: EXIT:${ec}\n\n`);
    res.end();
  });
  req.on('close', () => { if (child && !child.killed) child.kill(); });
});

// ---------------------------------------------------------------------------
// GET /api/flash-dongle-auto   — auto-detect port + flash dongle (SSE)
// ---------------------------------------------------------------------------
app.get('/api/flash-dongle-auto', async (req, res) => {
  sseHeaders(res);
  const send = makeSend(res);

  let aborted = false;
  req.on('close', () => { aborted = true; });

  let ports;
  try {
    ports = await SerialPort.list();
  } catch (err) {
    send(`ERROR: Failed to list ports: ${err.message}`);
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  if (ports.length === 0) {
    send('ERROR: No serial ports found. Connect the dongle and try again.');
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  send(`Found ${ports.length} port(s): ${ports.map((p) => p.path).join(', ')}`);

  for (const portInfo of ports) {
    if (aborted) break;
    const port = portInfo.path;
    send(`--- Trying ${port}${portInfo.manufacturer ? ` (${portInfo.manufacturer})` : ''} ---`);

    const args = [
      '--chip', 'esp32s3',
      '-p', port,
      '--baud', '115200',
      '--before', 'no_reset',
      '--after',  'hard_reset',
      '--no-stub',
      '--connect-attempts', '3',
      'write_flash', '-z',
      '--flash_mode', 'dio',
      '--flash_freq', '80m',
      '--flash_size', '8MB',
      '0x0',     DONGLE_BOOTLOADER_BIN,
      '0x10000', DONGLE_FIRMWARE_BIN,
      '0x8000',  DONGLE_PARTITION_BIN,
    ];

    const exitCode = await new Promise((resolve) => {
      let child;
      try {
        child = spawn(ESPTOOL_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (spawnErr) {
        send(`ERROR: Failed to launch esptool: ${spawnErr.message}`);
        resolve(1);
        return;
      }
      const handleData = (chunk) => chunk.toString().split('\n').forEach(send);
      child.stdout.on('data', handleData);
      child.stderr.on('data', handleData);
      child.on('error', (err) => { send(`ERROR: ${err.message}`); resolve(1); });
      child.on('close', (code) => resolve(code ?? 1));
      req.on('close', () => { if (child && !child.killed) child.kill(); });
    });

    if (exitCode === 0) {
      send(`Dongle flash completed successfully on ${port}.`);
      res.write('data: EXIT:0\n\n');
      return res.end();
    }
    send(`Failed on ${port}, trying next port...`);
  }

  if (!aborted) {
    send('ERROR: Flash failed on all available ports.');
    res.write('data: EXIT:1\n\n');
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Serial port helper — try one port for up to timeoutMs
// ---------------------------------------------------------------------------
function trySerialPort(portPath, timeoutMs, onLine, onAbort) {
  return new Promise((resolve) => {
    const sp     = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: false });
    let buffer   = '';
    let done     = false;

    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      setTimeout(() => { try { sp.close(); } catch {} resolve(r); }, 200);
    };

    const timer = setTimeout(() => finish('TIMEOUT'), timeoutMs);

    sp.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach((line) => {
        const trimmed = line
          .replace(/\r/g, '')
          .replace(/\x1B\[[0-9;]*[mGKF]/g, '')
          .trim();
        if (!trimmed) return;
        onLine(trimmed);
        if (trimmed.startsWith('FINAL RESULT:')) {
          finish(trimmed.includes('PASS') ? 'PASS' : 'FAIL');
        }
      });
    });

    sp.on('error', (err) => {
      onLine(`Serial error on ${portPath}: ${err.message}`);
      finish('ERROR');
    });

    sp.open((openErr) => {
      if (openErr) {
        onLine(`Cannot open ${portPath}: ${openErr.message}`);
        finish('ERROR');
      } else {
        sp.set({ dtr: true, rts: false }, (setErr) => {
          if (setErr) onLine(`DTR warning on ${portPath}: ${setErr.message}`);
        });
      }
    });

    onAbort(() => finish('ABORT'));
  });
}

// ---------------------------------------------------------------------------
// GET /api/serial-auto?exclude=COM3,COM4   — read serial test results (SSE)
// ---------------------------------------------------------------------------
app.get('/api/serial-auto', async (req, res) => {
  sseHeaders(res);
  const send = makeSend(res);

  const excludeParam = req.query.exclude ?? '';
  const excludePorts = new Set(
    excludeParam ? excludeParam.split(',').map((p) => p.trim()).filter(Boolean) : []
  );

  let aborted = false;
  const abortCallbacks = [];
  req.on('close', () => { aborted = true; abortCallbacks.forEach((cb) => cb()); });
  const onAbort = (cb) => abortCallbacks.push(cb);

  send('Waiting for device to enumerate...');
  const POLL       = 300;
  const waitUntil  = (ms, condition) => new Promise((resolve) => {
    const start = Date.now();
    const tick  = async () => {
      if (aborted || Date.now() - start >= ms) { resolve(null); return; }
      const r = await condition();
      if (r) { resolve(r); return; }
      await new Promise((t) => setTimeout(t, POLL));
      tick();
    };
    tick();
  });

  let preferredPort = await waitUntil(2000, async () => {
    const ports = await SerialPort.list();
    const p = ports.find((p) => !excludePorts.has(p.path));
    return p ? p.path : null;
  });

  if (!preferredPort && !aborted) {
    preferredPort = await waitUntil(3000, async () => {
      const ports = await SerialPort.list();
      return ports.length > 0 ? ports[0].path : null;
    });
  }

  if (aborted) return res.end();

  const allPorts = await SerialPort.list();
  if (allPorts.length === 0) {
    send('ERROR: No serial ports found. Make sure the dongle is plugged in.');
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  const portsToTry = [
    ...allPorts.filter((p) => p.path === preferredPort),
    ...allPorts.filter((p) => p.path !== preferredPort),
  ].map((p) => p.path);

  send(`Ports available: ${portsToTry.join(', ')}`);

  let finalResult = null;
  for (const portPath of portsToTry) {
    if (aborted) break;
    send(`Trying ${portPath}...`);
    const r = await trySerialPort(portPath, 6000, send, onAbort);
    if (r === 'PASS' || r === 'FAIL') { finalResult = r; break; }
  }

  if (finalResult === 'PASS') {
    res.write('data: RESULT:PASS\n\n');
    res.write('data: EXIT:0\n\n');
  } else if (finalResult === 'FAIL') {
    res.write('data: RESULT:FAIL\n\n');
    res.write('data: EXIT:1\n\n');
  } else {
    send('No test output received from any port. Make sure the dongle was flashed and is plugged in.');
    res.write('data: EXIT:1\n\n');
  }
  res.end();
});

// ---------------------------------------------------------------------------
// GET /api/firmware-versions
// ---------------------------------------------------------------------------
app.get('/api/firmware-versions', async (_req, res) => {
  try {
    const raw = await fetchGithubText('versions.txt');
    res.json({ raw, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('firmware-versions error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dongle-version
// ---------------------------------------------------------------------------
app.get('/api/dongle-version', async (_req, res) => {
  try {
    const raw = await fetchGithubText('dongle/version.txt');
    res.json({ raw: raw.trim(), fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('dongle-version error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/flash-device?model=plus|neo|proex|dongle   — download + flash (SSE)
// ---------------------------------------------------------------------------
app.get('/api/flash-device', async (req, res) => {
  const { model } = req.query;
  const modelInfo = FIRMWARE_MODELS[model];
  if (!modelInfo) {
    return res.status(400).json({ error: 'Invalid model. Use: plus, neo, proex, dongle' });
  }

  sseHeaders(res);
  const send = makeSend(res);

  let aborted = false;
  req.on('close', () => { aborted = true; });

  let ports;
  try {
    ports = await SerialPort.list();
  } catch (err) {
    send(`ERROR: Failed to list serial ports: ${err.message}`);
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  if (ports.length === 0) {
    send('ERROR: No serial ports detected. Connect the device and try again.');
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  const ts       = Date.now();
  const tempApp  = path.join(os.tmpdir(), `fw_${model}_app_${ts}.bin`);
  const tempBoot = path.join(os.tmpdir(), `fw_${model}_boot_${ts}.bin`);
  const tempPart = path.join(os.tmpdir(), `fw_${model}_part_${ts}.bin`);
  const cleanup  = () => [tempApp, tempBoot, tempPart].forEach((f) => fs.unlink(f, () => {}));

  send(`Downloading ${modelInfo.label} firmware from GitHub…`);
  try {
    await Promise.all([
      downloadGithubFile(modelInfo.appPath,  tempApp),
      downloadGithubFile(modelInfo.bootPath, tempBoot),
      downloadGithubFile(modelInfo.partPath, tempPart),
    ]);
    send('All firmware files downloaded successfully.');
  } catch (err) {
    send(`ERROR: Download failed — ${err.message}`);
    cleanup();
    res.write('data: EXIT:1\n\n');
    return res.end();
  }

  if (aborted) { cleanup(); return res.end(); }

  const baud        = modelInfo.dongle ? '115200' : '921600';
  const beforeReset = modelInfo.dongle ? 'no_reset' : 'default_reset';

  send(`Found ${ports.length} port(s): ${ports.map((p) => p.path).join(', ')}`);

  for (const portInfo of ports) {
    if (aborted) break;
    const portPath = portInfo.path;
    const mfr      = portInfo.manufacturer ? ` (${portInfo.manufacturer})` : '';
    send(`--- Trying ${portPath}${mfr} ---`);

    const args = [
      '--chip', 'esp32s3',
      '-p', portPath,
      '--baud', baud,
      '--before', beforeReset,
      '--after',  'hard_reset',
      '--connect-attempts', '3',
      'write_flash', '-z',
      '--flash_mode', 'dio',
      '--flash_freq', '80m',
      '--flash_size', '8MB',
      '0x0',     tempBoot,
      '0x8000',  tempPart,
      '0x10000', tempApp,
    ];

    const exitCode = await new Promise((resolve) => {
      let child;
      try {
        child = spawn(ESPTOOL_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (spawnErr) {
        send(`ERROR: Failed to launch esptool: ${spawnErr.message}`);
        resolve(1);
        return;
      }
      const handleData = (chunk) => chunk.toString().split('\n').forEach(send);
      child.stdout.on('data', handleData);
      child.stderr.on('data', handleData);
      child.on('error', (err) => { send(`ERROR: ${err.message}`); resolve(1); });
      child.on('close', (code) => resolve(code ?? 1));
      req.on('close', () => { if (child && !child.killed) child.kill(); });
    });

    if (exitCode === 0) {
      cleanup();
      send(`Flash completed successfully on ${portPath}.`);
      res.write('data: EXIT:0\n\n');
      return res.end();
    }
    send(`Failed on ${portPath}, trying next…`);
  }

  cleanup();
  if (!aborted) {
    send('ERROR: Flash failed on all available ports. Check device connection and try again.');
    res.write('data: EXIT:1\n\n');
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Static — serve built React app (production / packaged Electron)
// ---------------------------------------------------------------------------
app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => {
  const index = path.join(DIST_DIR, 'index.html');
  res.sendFile(index, (err) => {
    if (err) {
      res.status(404).json({ error: 'Web app not built. Run: npm run build:renderer' });
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] Papritech Flasher server on http://127.0.0.1:${PORT}`);
  console.log(`[server]   esptool    : ${ESPTOOL_PATH}`);
  console.log(`[server]   pcb fw     : ${FIRMWARE_BIN}`);
  console.log(`[server]   dongle fw  : ${DONGLE_FIRMWARE_BIN}`);
  console.log(`[server]   dist       : ${DIST_DIR}`);
});
