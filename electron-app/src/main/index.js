import { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { exec } from 'child_process'
import { WebSocketServer } from 'ws'
import iconPath from '../renderer/src/assets/sword.png?asset'

const systemProcesses = [
  'svchost.exe', 'conhost.exe', 'runtimebroker.exe', 'smss.exe',
  'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'lsm.exe',
  'winlogon.exe', 'explorer.exe', 'spoolsv.exe', 'taskmgr.exe',
  'dwm.exe', 'fontdrvhost.exe', 'sihost.exe', 'ctfmon.exe',
  'dllhost.exe', 'wuauclt.exe', 'searchui.exe', 'shellexperiencehost.exe',
  'audiodg.exe', 'system', 'registry', 'system idle process',
  'applicationframehost.exe', 'textinputhost.exe', 'startmenuexperiencehost.exe',
  'searchapp.exe', 'searchhost.exe', 'systemsettings.exe', 'lockapp.exe', 'rtkuwp.exe'
];
const isSystemProcess = (name) => name ? systemProcesses.includes(name.toLowerCase()) : false;

let mainWindowRef = null;
let tray = null;
let targetMode = 'process';
let currentTabs = [];
let chromeWs = null;

function notifyRendererMode() {
  if (mainWindowRef && mainWindowRef.webContents) {
    mainWindowRef.webContents.send('target-mode-changed', targetMode);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: '対象: PCのプロセス (.exe)', type: 'radio', checked: targetMode === 'process', click: () => { targetMode = 'process'; updateTrayMenu(); notifyRendererMode(); } },
    { label: '対象: Chromeブラウザのタブ', type: 'radio', checked: targetMode === 'browser', click: () => { targetMode = 'browser'; updateTrayMenu(); notifyRendererMode(); } },
    { type: 'separator' },
    { label: 'アプリを表示', click: () => { if(mainWindowRef) mainWindowRef.show() } },
    { label: '完全終了', click: () => { app.quit() } }
  ]);
  tray.setContextMenu(contextMenu);
}

// ★ 共通のカスタムメニュー（ブラックリスト編集を追加）
function showCustomMenu() {
  const menu = Menu.buildFromTemplate([
    { label: '対象: PCのプロセス (.exe)', type: 'radio', checked: targetMode === 'process', click: () => { targetMode = 'process'; updateTrayMenu(); notifyRendererMode(); } },
    { label: '対象: Chromeブラウザのタブ', type: 'radio', checked: targetMode === 'browser', click: () => { targetMode = 'browser'; updateTrayMenu(); notifyRendererMode(); } },
    { type: 'separator' },
    // ↓ 新しく追加！
    { label: 'ブラックリストの編集', click: () => { if(mainWindowRef) mainWindowRef.webContents.send('open-blacklist'); } },
    { type: 'separator' },
    { label: '最小化', click: () => { if(mainWindowRef) mainWindowRef.hide() } },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() }
  ]);
  if (mainWindowRef) menu.popup({ window: mainWindowRef });
}

const wss = new WebSocketServer({ port: 8088 });
wss.on('connection', (ws) => {
  console.log('🔗 Chrome拡張機能と接続しました！');
  chromeWs = ws;
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'TABS_UPDATE') currentTabs = data.tabs.map(t => ({ name: t.title, id: t.id }));
    } catch (e) { console.error(e); }
  });
  ws.on('close', () => { chromeWs = null; currentTabs = []; });
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => true);
  session.defaultSession.setBluetoothPairingHandler((details, callback) => callback({ initiator: true }));

  app.on('web-contents-created', (event, webContents) => {
    webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
      event.preventDefault();
      const m5Device = deviceList.find(d => d.deviceName === 'M5-TaskKill-BLE');
      // 見つかった時だけ接続する。見つからない場合は callback を呼ばずに探し続ける！
      if (m5Device) {
        callback(m5Device.deviceId);
      }
    });
  });

  let trayIcon = nativeImage.createFromPath(iconPath);
  if (!trayIcon.isEmpty()) trayIcon = trayIcon.resize({ width: 24, height: 24 });
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  updateTrayMenu();
  tray.on('click', () => { if (mainWindowRef) mainWindowRef.show(); });
});

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const mainWindow = new BrowserWindow({
    width: 450, height: 550,
    x: width - 470, y: height - 570,
    transparent: true, frame: false, alwaysOnTop: true, resizable: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  });

  mainWindow.hookWindowMessage(278, () => { mainWindow.setEnabled(false); setTimeout(() => mainWindow.setEnabled(true), 100); return true; });

  // ドラッグ領域での右クリックを検知して自作メニューを表示
  mainWindow.hookWindowMessage(165, () => {
    showCustomMenu();
    return true;
  });

  mainWindowRef = mainWindow;
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('get-processes', async () => {
    if (targetMode === 'browser') return currentTabs;
    return new Promise((resolve) => {
      const psCommand = `powershell -NoProfile -Command "@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | Select-Object Name, Id, MainWindowTitle) | ConvertTo-Json"`;
      exec(psCommand, (error, stdout) => {
        if (error || !stdout.trim()) return resolve([]);
        try {
          const psOutput = JSON.parse(stdout);
          let processes = psOutput.map(p => ({ name: p.Name + '.exe', pid: p.Id }));
          processes = processes.filter(p => !isSystemProcess(p.name));
          resolve(processes);
        } catch (e) { resolve([]); }
      });
    });
  });

  ipcMain.handle('get-current-mode', () => targetMode);
  ipcMain.handle('set-target-mode', (event, mode) => { targetMode = mode; updateTrayMenu(); notifyRendererMode(); });

  ipcMain.handle('kill-process', async (event, name) => {
    if (targetMode === 'browser') {
      const t = currentTabs.find(t => t.name === name);
      if (t && chromeWs) { chromeWs.send(`KILL_TAB:${t.id}`); return { success: true }; }
      return { success: false };
    }
    if (isSystemProcess(name)) return { success: false };
    return new Promise((resolve) => {
      exec(`taskkill /f /im ${name}`, (error) => resolve({ success: !error }));
    });
  });

  ipcMain.handle('show-context-menu', () => { showCustomMenu(); });
  ipcMain.handle('focus-window', () => { if (mainWindowRef) { if (mainWindowRef.isMinimized()) mainWindowRef.restore(); mainWindowRef.focus(); } });
  ipcMain.handle('minimize-window', () => { if (mainWindowRef) mainWindowRef.hide(); });

  createWindow();
});
