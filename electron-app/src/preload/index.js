import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  prepareKill: (target) => ipcRenderer.invoke('prepare-kill', target),
  clearPreparedKill: () => ipcRenderer.invoke('clear-prepared-kill'),
  killProcess: (target) => ipcRenderer.invoke('kill-process', target),
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  getCurrentMode: () => ipcRenderer.invoke('get-current-mode'),
  setTargetMode: (mode) => ipcRenderer.invoke('set-target-mode', mode),
  onTargetModeChanged: (callback) => {
    const listener = (_, mode) => callback(mode)
    ipcRenderer.on('target-mode-changed', listener)
    return () => ipcRenderer.removeListener('target-mode-changed', listener)
  },
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),
  onPlaySlashAnimation: (callback) => {
    const listener = (_, image) => callback(image)
    ipcRenderer.on('play-slash-animation', listener)
    return () => ipcRenderer.removeListener('play-slash-animation', listener)
  },

  // 裏側からメニューをクリックされた通知を受け取る
  onOpenBlacklist: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('open-blacklist', listener)
    return () => ipcRenderer.removeListener('open-blacklist', listener)
  },

  onBtStatus: (callback) => ipcRenderer.on('bt-status', (_, status) => callback(status)),
  onBtMode: (callback) => ipcRenderer.on('bt-mode', (_, mode) => callback(mode)),
  onBtCommand: (callback) => ipcRenderer.on('bt-command', (_, cmd) => callback(cmd)),

  // ★ 追加：マウスイベントの透過（クリックスルー）を切り替えるAPI
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options)
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
