let ws = null;
let heartbeatTimer = null;

function connect() {
  // すでに繋がっている、または接続中なら二重で作らない
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket('ws://localhost:8088');

  ws.onopen = () => {
    console.log('🔗 Electronサーバーに接続しました！');
    sendTabs(); // 接続できたら今のタブ一覧を送る

    // ★ 追加：拡張機能がスリープするのを防ぐため、20秒おきに空のメッセージ（Ping）を送って起き続けさせる
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 20000);
  };

  // Electron側からタブの前面化・終了命令が来た時の処理
  ws.onmessage = (event) => {
    const message = event.data;

    if (message.startsWith('ACTIVATE_TAB:')) {
      const [, rawTabId, requestId] = message.split(':');
      const tabId = Number.parseInt(rawTabId, 10);

      const acknowledge = (ok) => {
        if (!requestId || !ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'TAB_ACTIVATED', requestId, tabId, ok }));
      };

      chrome.tabs.update(tabId, { active: true }, (tab) => {
        const tabError = chrome.runtime.lastError;
        if (tabError || !tab || tab.windowId == null) {
          acknowledge(false);
          return;
        }

        chrome.windows.update(tab.windowId, { focused: true }, () => {
          const windowError = chrome.runtime.lastError;
          acknowledge(!windowError);
        });
      });
    }
    else if (message.startsWith('KILL_TAB:')) {
      const [, rawTabId, requestId] = message.split(':');
      const tabId = Number.parseInt(rawTabId, 10);
      chrome.tabs.remove(tabId, () => {
        const removeError = chrome.runtime.lastError;
        if (requestId && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'TAB_KILLED',
            requestId,
            tabId,
            ok: !removeError
          }));
        }
      });
    }
  };

  ws.onclose = () => {
    console.log('❌ 切断されました。3秒後に再接続します...');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    ws = null;
    setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocketエラー:', err);
    if (ws) ws.close();
  };
}

// 今開いているタブの一覧をElectronに送る関数
function sendTabs() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    chrome.tabs.query({}, (tabs) => {
      const tabData = tabs.map(t => ({ id: t.id, title: t.title }));
      ws.send(JSON.stringify({ type: 'TABS_UPDATE', tabs: tabData }));
    });
  }
}

// ブラウザのタブ操作やウィンドウの切り替え時にタブ一覧を更新
chrome.tabs.onUpdated.addListener(sendTabs);
chrome.tabs.onRemoved.addListener(sendTabs);
chrome.tabs.onCreated.addListener(sendTabs);
chrome.tabs.onActivated.addListener(sendTabs); // ★ 追加：タブを切り替えたときにも確実に同期させる

// ★ 追加：Chromeの拡張機能自体がアクティブになったときにも再接続をチェック
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

// 起動時に接続スタート
connect();
