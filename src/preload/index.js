import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  killProcess: (name) => ipcRenderer.invoke('kill-process', name),
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  getCurrentMode: () => ipcRenderer.invoke('get-current-mode'),
  setTargetMode: (mode) => ipcRenderer.invoke('set-target-mode', mode),
  onTargetModeChanged: (callback) => ipcRenderer.on('target-mode-changed', (_, mode) => callback(mode)),
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),

  // ★ 追加：裏側からメニューをクリックされた通知を受け取る
  onOpenBlacklist: (callback) => ipcRenderer.on('open-blacklist', () => callback()),

  onBtStatus: (callback) => ipcRenderer.on('bt-status', (_, status) => callback(status)),
  onBtMode: (callback) => ipcRenderer.on('bt-mode', (_, mode) => callback(mode)),
  onBtCommand: (callback) => ipcRenderer.on('bt-command', (_, cmd) => callback(cmd))
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron.setAppNotifier(contextBridge)
}
