import { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage, desktopCapturer } from 'electron'
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

function showCustomMenu() {
  const menu = Menu.buildFromTemplate([
    { label: '対象: PCのプロセス (.exe)', type: 'radio', checked: targetMode === 'process', click: () => { targetMode = 'process'; updateTrayMenu(); notifyRendererMode(); } },
    { label: '対象: Chromeブラウザのタブ', type: 'radio', checked: targetMode === 'browser', click: () => { targetMode = 'browser'; updateTrayMenu(); notifyRendererMode(); } },
    { type: 'separator' },
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

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  const mainWindow = new BrowserWindow({
    width: width,
    height: height - 2,
    x: 0, y: 0,
    transparent: true, frame: false, alwaysOnTop: true, resizable: false,
    type: 'toolbar',
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  });

  mainWindow.setAlwaysOnTop(true);

  mainWindow.on('minimize', (e) => {
    e.preventDefault();
    if (mainWindow.isMinimized()) mainWindow.restore();
  });

  mainWindow.hookWindowMessage(165, () => { showCustomMenu(); return true; });

  mainWindowRef = mainWindow;
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setBluetoothPairingHandler((details, callback) => callback({ initiator: true }));

  app.on('web-contents-created', (event, webContents) => {
    webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
      event.preventDefault();
      const m5Device = deviceList.find(d => d.deviceName === 'M5-TaskKill-BLE');
      if (m5Device) callback(m5Device.deviceId);
    });
  });

  let trayIcon = nativeImage.createFromPath(iconPath);
  if (!trayIcon.isEmpty()) trayIcon = trayIcon.resize({ width: 24, height: 24 });
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  updateTrayMenu();
  tray.on('click', () => { if (mainWindowRef) mainWindowRef.show(); });

  createWindow();

  // ======= プロセス取得 =======
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

  // ======= タスクキル処理（ブラウザ・デスクトップ両対応） =======
  ipcMain.handle('kill-process', async (event, name) => {

    // ★ ブラウザ（タブ）キルモード
    if (targetMode === 'browser') {
      const t = currentTabs.find(t => t.name === name);
      if (!t || !chromeWs) return { success: false };

      console.log(`⚔️ タブキル開始: ${name}`);

      return new Promise((resolve) => {
        chromeWs.send(`ACTIVATE_TAB:${t.id}`);

        setTimeout(async () => {
          try {
            const sources = await desktopCapturer.getSources({
              types: ['window'],
              thumbnailSize: { width: 1280, height: 720 }
            });

            let targetSource = sources.find(s => s.name.includes(t.name) || t.name.includes(s.name));
            if (!targetSource) {
              targetSource = sources.find(s => !s.name.includes('m5-taskkill') && (s.name.includes('Chrome') || s.name.includes('Edge')));
            }

            if (targetSource) {
              const imageUri = targetSource.thumbnail.toDataURL();
              console.log(`✅ タブキャプチャ成功: ${targetSource.name}`);
              if (mainWindowRef) mainWindowRef.webContents.send('play-slash-animation', imageUri);
            }

            setTimeout(() => {
              chromeWs.send(`KILL_TAB:${t.id}`);
              console.log(`💀 タブキル完了: ${name}`);
              resolve({ success: true });
            }, 100);

          } catch (e) {
            console.error('❌ タブキャプチャ失敗:', e);
            chromeWs.send(`KILL_TAB:${t.id}`);
            resolve({ success: true });
          }
        }, 400);
      });
    }

    // ★ デスクトップアプリキルモード
    if (isSystemProcess(name)) return { success: false };

    console.log(`⚔️ キル開始: ${name}`);
    const baseName = name.replace('.exe', '');

    return new Promise((resolve) => {
      exec(`powershell -command "(New-Object -ComObject WScript.Shell).AppActivate('${baseName}')"`);

      setTimeout(async () => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 1280, height: 720 }
          });

          const getTitleCmd = `powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Get-Process -Name '${baseName}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1).MainWindowTitle"`;

          exec(getTitleCmd, { encoding: 'utf8' }, (err, stdout) => {
            const winTitle = stdout ? stdout.trim().toLowerCase() : '';

            let targetSource = null;
            if (winTitle) {
              targetSource = sources.find(s => s.name.toLowerCase().includes(winTitle) || winTitle.includes(s.name.toLowerCase()));
            }
            if (!targetSource) {
              targetSource = sources.find(s => !s.name.toLowerCase().includes('m5-taskkill') && s.name !== 'Program Manager');
            }

            if (targetSource) {
              const imageUri = targetSource.thumbnail.toDataURL();
              console.log(`✅ キャプチャ成功: ${targetSource.name}`);
              if (mainWindowRef) mainWindowRef.webContents.send('play-slash-animation', imageUri);
            }

            exec(`taskkill /f /im ${name}`, (error) => {
              console.log(`💀 キル完了: ${name}`);
              resolve({ success: !error });
            });
          });
        } catch (e) {
          console.error('❌ キャプチャ失敗:', e);
          exec(`taskkill /f /im ${name}`, () => resolve({ success: true }));
        }
      }, 400);
    });
  });

  ipcMain.handle('show-context-menu', () => { showCustomMenu(); });
  ipcMain.handle('focus-window', () => { if (mainWindowRef) { if (mainWindowRef.isMinimized()) mainWindowRef.restore(); mainWindowRef.focus(); } });
  ipcMain.handle('minimize-window', () => { if (mainWindowRef) mainWindowRef.hide(); });
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options);
  });
});
