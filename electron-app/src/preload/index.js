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
  // DEBUG-M5 ここから: 仮想M5の状態取得と変更通知。完成後はコメントアウト。
  getDebugMode: () => ipcRenderer.invoke('get-debug-mode'),
  onDebugModeChanged: (callback) => {
    const listener = (_, enabled) => callback(enabled)
    ipcRenderer.on('debug-mode-changed', listener)
    return () => ipcRenderer.removeListener('debug-mode-changed', listener)
  },
  // DEBUG-M5 ここまで
  setTargetMode: (mode) => ipcRenderer.invoke('set-target-mode', mode),
  onTargetModeChanged: (callback) => {
    const listener = (_, mode) => callback(mode)
    ipcRenderer.on('target-mode-changed', listener)
    return () => ipcRenderer.removeListener('target-mode-changed', listener)
  },
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),
  onPlaySlashAnimation: (callback) => {
    const listener = (_, payload) => {
      const image = payload && Object.prototype.hasOwnProperty.call(payload, 'image') ? payload.image : payload
      const imageUri = typeof image === 'string'
        ? image
        : image?.bytes?.length
          ? `data:${image.mimeType || 'image/jpeg'};base64,${Buffer.from(image.bytes).toString('base64')}`
          : null
      callback({ imageUri, targetName: payload?.targetName || 'TARGET' })
    }
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
