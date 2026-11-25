const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure preload bridge for Arka POS Electron (Server & Client Editions).
 * Enforces contextIsolation: true and nodeIntegration: false.
 * Exposes ONLY explicit, validated IPC methods — never raw fs/shell/ipcRenderer.
 */
contextBridge.exposeInMainWorld('arkaElectron', {
  isElectron: true,
  platform: process.platform,

  getEdition: () => ipcRenderer.invoke('arka:get-edition'),
  getInstallerConfig: () => ipcRenderer.invoke('arka:get-installer-config'),
  getServerPort: () => ipcRenderer.invoke('arka:get-server-port'),
  getBackgroundServerStatus: () => ipcRenderer.invoke('arka:get-bg-status'),
  restartBackgroundServer: (port) => ipcRenderer.invoke('arka:restart-bg-server', port),

  saveLocalBackupFile: (fileName, content) =>
    ipcRenderer.invoke('arka:save-local-backup', { fileName, content }),

  openExternal: (url) => ipcRenderer.invoke('arka:open-external', url),

  getAutostartStatus: () => ipcRenderer.invoke('arka:get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('arka:set-autostart', Boolean(enabled))
});
