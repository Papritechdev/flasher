# Papritech Flash Tool

A Windows desktop application for flashing ESP32 firmware and testing PCBs, built with Electron + React.

## Features

- Flash PCB firmware (Plus/Pro, Neo, Pro Extra) from a private GitHub release
- Flash USB Dongle firmware (ESP32-S3)
- BLE scan to capture device MAC address after flashing
- Save device records (MAC, firmware version, timestamp) to Firestore
- Real-time flash progress via Server-Sent Events

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 29 |
| UI | React 18 + Vite 5 + Tailwind CSS |
| API | Express 4 (embedded, port 3001) |
| Serial / flash | esptool + serialport v12 |
| BLE | Web Bluetooth API |
| Backend | Firebase Auth + Firestore |

## Development

### Prerequisites

- Node.js 20+
- Git

### Setup

```bash
npm install
```

Create a `.env` file at the project root (copy from `.env.example` if provided):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
GITHUB_TOKEN=<personal access token with repo scope>
```

### Run in development

```bash
npm run dev
```

### Build installer

```bash
npm run build
```

Output: `release/Papritech Flasher Setup 1.0.0.exe`

## Project Structure

```
electron/       Electron main process
server/         Express API server (serial flashing, GitHub firmware download)
src/            React frontend
  pages/        Flash Device, Dashboard, Login pages
  components/   DongleFlashModal, BLE step wizard, Navbar
resources/      Bundled firmware files (dongle, PCB) + esptool.exe
assets/         App icon
```

## Distribution

Send `release/Papritech Flasher Setup 1.0.0.exe` to team members. No additional setup required — the installer bundles all dependencies and firmware.

> **Note:** The `.env` file is excluded from version control. Set `GITHUB_TOKEN` in `.env` before building for production.
