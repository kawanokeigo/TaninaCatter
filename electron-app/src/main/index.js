import { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage, desktopCapturer } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { execFile } from 'child_process'
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
let chromeConnectionId = 0;
let processCatalog = new Map();
let preparedCapture = null;
let prepareJob = null;
let prepareGeneration = 0;
let nextActivationRequestId = 1;
let nextKillRequestId = 1;
let processQueryGeneration = 0;

const pendingTabActivations = new Map();
const pendingTabKills = new Map();
const killsInFlight = new Set();
const CAPTURE_SIZE = { width: 1280, height: 720 };
const JPEG_QUALITY = 85;
const PREPARED_CAPTURE_TTL_MS = 5000;
const CAPTURE_FALLBACK_BUDGET_MS = 150;

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

function targetKey(mode, target) {
  const id = mode === 'browser'
    ? `${target?.connectionId ?? 'unknown'}:${target?.id ?? 'unknown'}`
    : target?.pid;
  return `${mode}:${id ?? target?.name ?? ''}`;
}

function clearPreparedCapture(expectedKey = null) {
  if (expectedKey) {
    const hasForeignState = (preparedCapture && preparedCapture.key !== expectedKey)
      || (prepareJob && prepareJob.key !== expectedKey);
    const hasOwnedState = preparedCapture?.key === expectedKey || prepareJob?.key === expectedKey;
    if (hasForeignState || !hasOwnedState) return;
  }

  prepareGeneration++;
  preparedCapture = null;
  prepareJob = null;
}

function resolveTarget(mode, target) {
  const input = typeof target === 'string' ? { name: target } : (target || {});
  if (!input.name) return null;

  if (mode === 'browser') {
    const liveTab = input.id != null && input.connectionId != null
      ? currentTabs.find(tab => tab.id === input.id && tab.connectionId === input.connectionId)
      : currentTabs.find(tab => tab.name === input.name);
    return liveTab ? { ...liveTab } : null;
  }

  if (input.pid != null) {
    const liveProcess = processCatalog.get(Number(input.pid));
    if (liveProcess?.name === input.name) return { ...liveProcess };
  }

  const liveProcess = Array.from(processCatalog.values()).find(process => process.name === input.name);
  return liveProcess ? { ...liveProcess } : null;
}

function sendSlashAnimation(image, targetName) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send('play-slash-animation', { image, targetName });
}

function encodeThumbnail(thumbnail) {
  if (!thumbnail || thumbnail.isEmpty()) return null;
  return {
    mimeType: 'image/jpeg',
    bytes: thumbnail.toJPEG(JPEG_QUALITY)
  };
}

function findTargetSource(sources, mode, target) {
  const normalized = sources
    .map(source => ({ source, name: source.name.trim().toLowerCase() }))
    .filter(({ name }) => name && !name.includes('m5-taskkill') && name !== 'program manager');

  const findByTitle = (title) => {
    if (!title) return null;
    return normalized.find(({ name }) => name === title)?.source
      || normalized.find(({ name }) => name.includes(title) || title.includes(name))?.source
      || null;
  };

  if (mode === 'browser') {
    const title = target.name.trim().toLowerCase();
    return findByTitle(title);
  }

  const title = (target.title || '').trim().toLowerCase();
  return findByTitle(title);
}

function activateDesktopTarget(target) {
  const numericPid = Number.isInteger(target.pid) && target.pid > 0 ? target.pid : null;
  const fallbackName = target.name.replace(/\.exe$/i, '').replace(/'/g, "''");
  const activationTarget = numericPid ?? `'${fallbackName}'`;
  const command = `$shell = New-Object -ComObject WScript.Shell; if (-not $shell.AppActivate(${activationTarget})) { exit 1 }`;

  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 750 },
      () => resolve()
    );
  });
}

function activateBrowserTab(tabId) {
  if (!chromeWs || chromeWs.readyState !== 1) return Promise.resolve(false);

  const requestId = `${Date.now()}-${nextActivationRequestId++}`;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pendingTabActivations.delete(requestId);
      resolve(false);
    }, 350);

    pendingTabActivations.set(requestId, { resolve, timer });
    try {
      // The optional request id keeps compatibility with the previously installed extension.
      chromeWs.send(`ACTIVATE_TAB:${tabId}:${requestId}`);
    } catch {
      clearTimeout(timer);
      pendingTabActivations.delete(requestId);
      resolve(false);
    }
  });
}

async function captureTarget(mode, target) {
  if (mode === 'browser') await activateBrowserTab(target.id);
  else await activateDesktopTarget(target);

  // Allow one or two compositor frames after the foreground switch.
  await sleep(40);

  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: CAPTURE_SIZE
  });
  const targetSource = findTargetSource(sources, mode, target);
  if (!targetSource) return null;

  console.log(`✅ キャプチャ成功: ${targetSource.name}`);
  return encodeThumbnail(targetSource.thumbnail);
}

function beginPrepareCapture(mode, target) {
  const key = targetKey(mode, target);
  if (prepareJob?.key === key) return prepareJob.promise;
  if (preparedCapture?.key === key && Date.now() - preparedCapture.createdAt <= PREPARED_CAPTURE_TTL_MS) {
    return Promise.resolve(preparedCapture.image);
  }

  const generation = ++prepareGeneration;
  const promise = captureTarget(mode, target)
    .then(image => {
      if (generation === prepareGeneration && image) {
        preparedCapture = { key, image, createdAt: Date.now() };
      }
      return image;
    })
    .catch(error => {
      console.error('❌ 事前キャプチャ失敗:', error);
      return null;
    })
    .finally(() => {
      if (prepareJob?.generation === generation) prepareJob = null;
    });

  prepareJob = { key, generation, promise };
  return promise;
}

async function getCaptureForKill(mode, target) {
  const key = targetKey(mode, target);
  if (preparedCapture?.key === key && Date.now() - preparedCapture.createdAt <= PREPARED_CAPTURE_TTL_MS) {
    return preparedCapture.image;
  }

  const staleImage = preparedCapture?.key === key ? preparedCapture.image : null;
  const capturePromise = prepareJob?.key === key
    ? prepareJob.promise
    : beginPrepareCapture(mode, target);

  const image = await Promise.race([
    capturePromise,
    sleep(CAPTURE_FALLBACK_BUDGET_MS).then(() => null)
  ]);
  return image || staleImage;
}

function killDesktopTarget(target) {
  return new Promise(resolve => {
    // Keep the original app-name semantics while avoiding shell interpolation.
    execFile('taskkill.exe', ['/IM', target.name, '/F'], { windowsHide: true }, error => {
      console.log(`💀 キル完了: ${target.name}`);
      resolve({ success: !error });
    });
  });
}

function killBrowserTarget(target) {
  if (!chromeWs || chromeWs.readyState !== 1) return { success: false };
  const liveTab = currentTabs.find(tab =>
    tab.id === target.id && tab.connectionId === target.connectionId
  );
  if (!liveTab) return { success: false };

  const requestId = `${Date.now()}-${nextKillRequestId++}`;
  return new Promise(resolve => {
    const settle = (result) => {
      const pending = pendingTabKills.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingTabKills.delete(requestId);
      pending.resolve(result);
    };
    const timer = setTimeout(
      () => settle({ success: true, confirmed: false }),
      400
    );

    pendingTabKills.set(requestId, { resolve, timer });
    chromeWs.send(`KILL_TAB:${target.id}:${requestId}`, error => {
      if (error) settle({ success: false, confirmed: false });
    });
    console.log(`💀 タブキル要求送信: ${target.name}`);
  });
}

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
  for (const { resolve, timer } of pendingTabActivations.values()) {
    clearTimeout(timer);
    resolve(false);
  }
  pendingTabActivations.clear();
  for (const { resolve, timer } of pendingTabKills.values()) {
    clearTimeout(timer);
    resolve({ success: false, confirmed: false });
  }
  pendingTabKills.clear();

  const connectionId = ++chromeConnectionId;
  chromeWs = ws;
  currentTabs = [];
  ws.on('message', (message) => {
    try {
      if (chromeWs !== ws) return;
      const data = JSON.parse(message.toString());
      if (data.type === 'TABS_UPDATE') {
        currentTabs = data.tabs.map(t => ({ name: t.title, id: t.id, connectionId }));
      }
      else if (data.type === 'TAB_ACTIVATED' && data.requestId) {
        const pending = pendingTabActivations.get(data.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingTabActivations.delete(data.requestId);
          pending.resolve(Boolean(data.ok));
        }
      }
      else if (data.type === 'TAB_KILLED' && data.requestId) {
        const pending = pendingTabKills.get(data.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingTabKills.delete(data.requestId);
          pending.resolve({ success: Boolean(data.ok), confirmed: true });
        }
      }
    } catch (e) { console.error(e); }
  });
  ws.on('close', () => {
    if (chromeWs === ws) {
      chromeWs = null;
      currentTabs = [];
      for (const { resolve, timer } of pendingTabActivations.values()) {
        clearTimeout(timer);
        resolve(false);
      }
      pendingTabActivations.clear();
      for (const { resolve, timer } of pendingTabKills.values()) {
        clearTimeout(timer);
        resolve({ success: false, confirmed: false });
      }
      pendingTabKills.clear();
    }
  });
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
    const queryGeneration = ++processQueryGeneration;
    return new Promise((resolve, reject) => {
      const psCommand = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | Select-Object Name, Id, MainWindowTitle) | ConvertTo-Json -Compress`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], { windowsHide: true, encoding: 'utf8', timeout: 5000 }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        if (!stdout.trim()) {
          if (queryGeneration === processQueryGeneration) processCatalog = new Map();
          return resolve([]);
        }
        try {
          const psOutput = JSON.parse(stdout);
          const rows = Array.isArray(psOutput) ? psOutput : [psOutput];
          let processes = rows.map(p => ({
            name: p.Name + '.exe',
            pid: Number(p.Id),
            title: p.MainWindowTitle || ''
          }));
          processes = processes.filter(p => !isSystemProcess(p.name));

          const nextCatalog = new Map();
          for (const process of processes) {
            nextCatalog.set(process.pid, process);
          }
          if (queryGeneration === processQueryGeneration) processCatalog = nextCatalog;
          resolve(processes);
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  });

  ipcMain.handle('get-current-mode', () => targetMode);
  ipcMain.handle('set-target-mode', (event, mode) => {
    targetMode = mode;
    clearPreparedCapture();
    updateTrayMenu();
    notifyRendererMode();
  });

  ipcMain.handle('prepare-kill', (event, target) => {
    const mode = targetMode;
    const resolvedTarget = resolveTarget(mode, target);
    if (!resolvedTarget || (mode === 'process' && isSystemProcess(resolvedTarget.name))) {
      return { success: false };
    }

    void beginPrepareCapture(mode, resolvedTarget);
    return { success: true };
  });

  ipcMain.handle('clear-prepared-kill', () => {
    clearPreparedCapture();
    return { success: true };
  });

  // ======= タスクキル処理（ブラウザ・デスクトップ両対応） =======
  ipcMain.handle('kill-process', async (event, target) => {
    const mode = targetMode;
    const resolvedTarget = resolveTarget(mode, target);
    if (!resolvedTarget || (mode === 'process' && isSystemProcess(resolvedTarget.name))) {
      return { success: false };
    }

    const key = targetKey(mode, resolvedTarget);
    if (killsInFlight.has(key)) return { success: false, busy: true };
    killsInFlight.add(key);

    try {
      console.log(`⚔️ ${mode === 'browser' ? 'タブ' : 'プロセス'}キル開始: ${resolvedTarget.name}`);
      const image = await getCaptureForKill(mode, resolvedTarget);
      sendSlashAnimation(image, resolvedTarget.name);

      return mode === 'browser'
        ? killBrowserTarget(resolvedTarget)
        : await killDesktopTarget(resolvedTarget);
    } finally {
      killsInFlight.delete(key);
      clearPreparedCapture(key);
    }
  });

  ipcMain.handle('show-context-menu', () => { showCustomMenu(); });
  ipcMain.handle('focus-window', () => { if (mainWindowRef) { if (mainWindowRef.isMinimized()) mainWindowRef.restore(); mainWindowRef.focus(); } });
  ipcMain.handle('minimize-window', () => { if (mainWindowRef) mainWindowRef.hide(); });
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options);
  });
});
