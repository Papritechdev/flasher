'use strict';

// Minimal preload — the renderer communicates with the embedded Express server
// via HTTP and does not require direct Node.js access.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Expose a flag so renderer code can detect it's running inside Electron
  isElectron: true,
  platform: process.platform,
});
